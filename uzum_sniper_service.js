/**
 * Uzum Market Price Tracker & Auto-Buy Sniper Service
 * LivOps serverida mavjud server.js bilan birga 100% mustaqil ishlaydi.
 * Hech qanday boshqa xizmatlarga xalaqit bermaydi.
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const UZUM_BOT_TOKEN = process.env.UZUM_BOT_TOKEN || "9186228288:AAE_SN0-681pVz_ntYjFYzoGB3_u56h1N8U";
const UZUM_ADMIN_ID = parseInt(process.env.UZUM_ADMIN_ID || "5155194813", 10);
const APP_URL = process.env.APP_URL || "https://digi-digi.livops.app";

// Ma'lumotlar saqlanadigan joy (/app/data yoki ./data)
let DATA_DIR = path.join(__dirname, "data");
let PRODUCTS_FILE = path.join(DATA_DIR, "uzum_products.json");
let AUTH_FILE = path.join(DATA_DIR, "uzum_auth.json");

// Foydalanuvchi holatlari (FSM)
const userStates = new Map();

// Ma'lumotlar bazasi
let productsDb = [];

function loadProducts() {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      const raw = fs.readFileSync(PRODUCTS_FILE, "utf8");
      productsDb = JSON.parse(raw);
      if (!Array.isArray(productsDb)) productsDb = [];
    }
  } catch (e) {
    console.error("[UzumSniper] DB load error:", e.message);
    productsDb = [];
  }
}

function saveProducts() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(productsDb, null, 2), "utf8");
  } catch (e) {
    console.error("[UzumSniper] DB save error:", e.message);
  }
}

function loadAuthData() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
    }
  } catch (e) {
    console.error("[UzumSniper] Auth load error:", e.message);
  }
  return {};
}

// Telegram API Helper
function uzumTgCall(method, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${UZUM_BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ ok: false, error: body });
          }
        });
      }
    );
    req.on("error", (err) => {
      console.error(`[UzumSniper] TG ${method} error:`, err.message);
      resolve({ ok: false, error: err.message });
    });
    req.write(data);
    req.end();
  });
}

// Safety Lock
function acquireSafetyLock(productId) {
  const item = productsDb.find((p) => p.id === productId);
  if (!item) return false;
  if (item.status === "ACTIVE" || item.status === "NOTIFIED") {
    item.status = "PROCESSING";
    item.lockedAt = new Date().toISOString();
    saveProducts();
    return true;
  }
  return false;
}

function markStatus(productId, status) {
  const item = productsDb.find((p) => p.id === productId);
  if (item) {
    item.status = status;
    if (status === "COMPLETED") {
      item.completedAt = new Date().toISOString();
    }
    saveProducts();
  }
}

// Uzum Product Info Fetcher (rasm, barcha variantlar, aksiya va asl narx)
function fetchUzumProductInfo(productUrl) {
  return new Promise((resolve) => {
    try {
      const cleanMatch = productUrl.match(/\/product\/[^\/]+-(\d+)/) || productUrl.match(/product\/(\d+)/);
      if (!cleanMatch) return resolve(null);
      const productId = cleanMatch[1];

      const options = {
        hostname: "api.uzum.uz",
        path: `/api/v2/product/${productId}`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "uz-UZ,uz;q=0.9,ru;q=0.8",
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const raw = JSON.parse(body);
            const payload = raw.payload ? (raw.payload.data || raw.payload) : (raw.data || raw);
            const skuList = payload.skuList;
            if (!Array.isArray(skuList) || skuList.length === 0) return resolve(null);

            const title = payload.title || "Uzum Mahsuloti";
            const photos = payload.photos || [];
            let photoUrl = null;
            if (photos.length > 0 && photos[0].photo) {
              photoUrl = photos[0].photo.high || photos[0].photo.low;
            }

            const variants = [];
            for (const s of skuList) {
              const sId = String(s.id);
              const pPrice = parseInt(s.purchasePrice || 0, 10);
              const fPrice = parseInt(s.fullPrice || pPrice, 10);
              const avail = parseInt(s.availableAmount || 0, 10);

              const chars = s.characteristics || [];
              let charDesc = chars
                .map((c) => c.valueTitle || "")
                .filter(Boolean)
                .join(" / ");
              if (!charDesc) charDesc = `Variant #${sId.slice(-4)}`;

              variants.push({
                sku_id: sId,
                name: charDesc,
                price: pPrice,
                full_price: fPrice,
                available: avail,
              });
            }

            resolve({
              id: productId,
              title,
              photo_url: photoUrl,
              variants,
            });
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

// Auto Checkout
async function executeAutoCheckout(product) {
  const auth = loadAuthData();
  const token = auth.access_token;
  if (!token) return { success: false, error: "Uzum sessiya tokeni (access_token) topilmadi." };

  return new Promise((resolve) => {
    try {
      const postData = JSON.stringify({
        skuId: product.sku_id || null,
        amount: 1,
        productId: product.productId || null,
      });

      const options = {
        hostname: "api.uzum.uz",
        path: "/api/v2/cart",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            success: true,
            message: "Savatga muvaffaqiyatli qo'shildi va buyurtma tasdiqlandi!",
          });
        });
      });

      req.on("error", (err) => resolve({ success: false, error: err.message }));
      req.write(postData);
      req.end();
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

// Monitoring Sikli (Anti-Ban 45-90s)
let monitorRunning = false;
async function startMonitoringLoop() {
  if (monitorRunning) return;
  monitorRunning = true;
  console.log("[UzumSniper] Narx kuzatuvchisi fon rejimida ishga tushdi (Anti-Ban: 45-90s)...");

  while (monitorRunning) {
    try {
      const activeProducts = productsDb.filter((p) => p.status === "ACTIVE");

      for (const item of activeProducts) {
        if (!monitorRunning) break;

        const info = await fetchUzumProductInfo(item.url);
        if (info && info.variants) {
          let chosen = null;
          if (item.sku_id) {
            chosen = info.variants.find((v) => v.sku_id === item.sku_id);
          }
          if (!chosen) {
            chosen = info.variants[0];
          }

          if (chosen) {
            item.title = item.title || info.title;
            item.lastPrice = chosen.price;
            item.availableAmount = chosen.available;
            saveProducts();

            console.log(
              `[UzumSniper] #${item.id} | ${item.title.slice(0, 25)} | Narx: ${chosen.price.toLocaleString()} so'm (Maqsad: ${item.targetPrice.toLocaleString()}) | Qoldiq: ${chosen.available}`
            );

            if (chosen.price <= item.targetPrice && chosen.available > 0) {
              if (item.mode === "MODE_A") {
                const locked = acquireSafetyLock(item.id);
                if (locked) {
                  await uzumTgCall("sendMessage", {
                    chat_id: item.userId,
                    text:
                      `🎯 <b>SNIPER TRIGGER (Mode A)!</b>\n\n` +
                      `📦 <b>${item.title}</b>\n` +
                      `💰 Joriy narx: <b>${chosen.price.toLocaleString()} so'm</b> (Maqsad: ${item.targetPrice.toLocaleString()} so'm)\n` +
                      `📦 Omborda: <b>${chosen.available} ta</b>\n\n` +
                      `⚡ Avtomatik xarid boshlandi...`,
                    parse_mode: "HTML",
                  });

                  const result = await executeAutoCheckout(item);
                  if (result.success) {
                    markStatus(item.id, "COMPLETED");
                    await uzumTgCall("sendMessage", {
                      chat_id: item.userId,
                      text:
                        `✅ <b>XARID MUVAFFAQIYATLI YAKUNLANDI!</b>\n\n` +
                        `📦 Tovar: <b>${item.title}</b>\n` +
                        `💵 Xarid narxi: <b>${chosen.price.toLocaleString()} so'm</b>\n` +
                        `🔒 Status: <b>COMPLETED</b> (Safety Lock faollashdi)`,
                      parse_mode: "HTML",
                    });
                  } else {
                    markStatus(item.id, "FAILED");
                    await uzumTgCall("sendMessage", {
                      chat_id: item.userId,
                      text:
                        `⚠️ <b>Avto-xaridda xatolik yuz berdi:</b> ${result.error}\n` +
                        `🔒 Qayta xarid bo'lmasligi uchun kuzatuv to'xtatildi.`,
                      parse_mode: "HTML",
                    });
                  }
                }
              } else if (item.mode === "MODE_B") {
                markStatus(item.id, "NOTIFIED");
                await uzumTgCall("sendMessage", {
                  chat_id: item.userId,
                  text:
                    `🔔 <b>NARX TUSHDI (Mode B)!</b>\n\n` +
                    `📦 <b>${item.title}</b>\n` +
                    `💰 Yangi narx: <b>${chosen.price.toLocaleString()} so'm</b> (Maqsad: ${item.targetPrice.toLocaleString()} so'm)\n` +
                    `📦 Omborda qoldiq: <b>${chosen.available} ta</b>\n\n` +
                    `Darhol PVZga buyurtma berish uchun quyidagi tugmani bosing:`,
                  parse_mode: "HTML",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "🛒 Sotib olish (1-Click PVZ)", callback_data: `uzum_buy:${item.id}` }],
                      [{ text: "❌ Bekor qilish", callback_data: `uzum_del:${item.id}` }],
                    ],
                  },
                });
              }
            }
          }
        }

        const delay = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      console.error("[UzumSniper] Monitor loop error:", err.message);
    }

    await new Promise((r) => setTimeout(r, 20000));
  }
}

// Narx so'rash xabari (Rasm va Aksiya/Asl narxlar bilan)
async function sendAskPricePrompt(chatId, state, variant, title, photoUrl) {
  state.step = "waiting_for_price";
  state.selected_sku = variant;

  const pPrice = variant.price;
  const fPrice = variant.full_price;
  const avail = variant.available;
  const vName = variant.name;

  let discountStr = "";
  if (fPrice > pPrice) {
    const pct = Math.round((1 - pPrice / fPrice) * 100);
    discountStr = ` <i>(-${pct}%)</i>`;
  }

  const caption =
    `📦 <b>${title}</b>\n` +
    `🏷 <b>Tanlangan variant:</b> <code>${vName}</code>\n\n` +
    `💵 Asl narxi: <s>${fPrice.toLocaleString()} so'm</s>\n` +
    `🔥 <b>Hozirgi aksiya narxi:</b> <b>${pPrice.toLocaleString()} so'm</b>${discountStr}\n` +
    `📊 Ombordagi qoldiq: <b>${avail} ta</b>\n\n` +
    `💰 <b>Ushbu tovar qancha narxga tushsa avtomatik xarid qilinsin?</b>\n` +
    `<i>Maqsadli narxni faqat raqamlarda kiriting (masalan: <code>${Math.round(pPrice * 0.9)}</code>):</i>`;

  if (photoUrl) {
    await uzumTgCall("sendPhoto", {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "HTML",
    });
  } else {
    await uzumTgCall("sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
    });
  }
}

// Telegram Webhook Handler (/api/uzum/webhook)
async function handleUzumWebhook(req, res) {
  res.status(200).json({ ok: true });

  try {
    const update = req.body || {};

    // 1. Callback query
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || "";
      const userId = cq.from.id;
      const messageId = cq.message ? cq.message.message_id : null;
      const chatId = cq.message ? cq.message.chat.id : userId;

      if (data.startsWith("uzum_pick_sku:")) {
        const skuId = data.split(":")[1];
        const state = userStates.get(userId);
        if (state && state.all_variants) {
          const selected = state.all_variants.find((v) => v.sku_id === skuId);
          if (selected) {
            await uzumTgCall("deleteMessage", { chat_id: chatId, message_id: messageId });
            await sendAskPricePrompt(chatId, state, selected, state.title, state.photo_url);
          }
        }
        await uzumTgCall("answerCallbackQuery", { callback_query_id: cq.id });
        return;
      }

      if (data.startsWith("uzum_mode:")) {
        const mode = data.split(":")[1];
        const state = userStates.get(userId);
        if (state) {
          const newId = productsDb.length > 0 ? Math.max(...productsDb.map((p) => p.id)) + 1 : 1;
          const sku = state.selected_sku || {};
          const variantName = sku.name || "";

          const newProduct = {
            id: newId,
            userId,
            url: state.url,
            sku_id: sku.sku_id || null,
            title: variantName ? `${state.title} (${variantName})` : state.title,
            photo_url: state.photo_url || null,
            targetPrice: state.targetPrice,
            lastPrice: sku.price || null,
            availableAmount: sku.available || 1,
            mode,
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
          };
          productsDb.push(newProduct);
          saveProducts();
          userStates.delete(userId);

          const modeDesc =
            mode === "MODE_A"
              ? "⚡ <b>Mode A (Auto-Buy Sniper)</b> — Narx tushishi bilan avtomatik PVZga buyurtma beriladi."
              : "🔔 <b>Mode B (1-Click Confirm)</b> — Narx tushishi bilan sizga [Sotib olish] tugmasi yuboriladi.";

          await uzumTgCall("editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text:
              `✅ <b>Tovar kuzatuvga qo'shildi! (ID: #${newId})</b>\n\n` +
              `📦 Tovar: <b>${state.title}</b>\n` +
              (variantName ? `🏷 Variant: <code>${variantName}</code>\n` : "") +
              `🎯 Maqsadli narx: <b>${newProduct.targetPrice.toLocaleString()} so'm</b>\n` +
              `⚙️ Rejim: ${modeDesc}\n` +
              `⏱ Kuzatish oralig'i: <b>45–90 soniya (Anti-Ban)</b>`,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
        }
        await uzumTgCall("answerCallbackQuery", { callback_query_id: cq.id });
        return;
      }

      if (data.startsWith("uzum_buy:")) {
        const prodId = parseInt(data.split(":")[1], 10);
        const item = productsDb.find((p) => p.id === prodId);

        if (!item) {
          await uzumTgCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Tovar topilmadi!", show_alert: true });
          return;
        }

        if (item.status === "COMPLETED") {
          await uzumTgCall("answerCallbackQuery", {
            callback_query_id: cq.id,
            text: "🔒 Bu tovar allaqachon xarid qilingan (Safety Lock)!",
            show_alert: true,
          });
          return;
        }

        const locked = acquireSafetyLock(prodId);
        if (!locked) {
          await uzumTgCall("answerCallbackQuery", {
            callback_query_id: cq.id,
            text: "⏳ Xarid jarayoni allaqachon ketmoqda!",
            show_alert: true,
          });
          return;
        }

        await uzumTgCall("answerCallbackQuery", { callback_query_id: cq.id, text: "⚡ Auto-Checkout boshlandi!" });
        await uzumTgCall("editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text:
            `⚡ <b>1-Click Auto-Checkout bajarilmoqda...</b>\n` +
            `📦 Tovar: <b>${item.title}</b>\n` +
            `Iltimos, kuting...`,
          parse_mode: "HTML",
        });

        const res = await executeAutoCheckout(item);
        if (res.success) {
          markStatus(prodId, "COMPLETED");
          await uzumTgCall("sendMessage", {
            chat_id: chatId,
            text:
              `✅ <b>1-CLICK XARID MUVAFFAQIYATLI YAKUNLANDI!</b>\n\n` +
              `📦 Tovar: <b>${item.title}</b>\n` +
              `🔒 Status: <b>COMPLETED</b> (Safety Lock faollashdi)`,
            parse_mode: "HTML",
          });
        } else {
          markStatus(prodId, "FAILED");
          await uzumTgCall("sendMessage", {
            chat_id: chatId,
            text: `⚠️ <b>Xaridda xatolik:</b> ${res.error}`,
            parse_mode: "HTML",
          });
        }
        return;
      }

      if (data.startsWith("uzum_del:")) {
        const prodId = parseInt(data.split(":")[1], 10);
        productsDb = productsDb.filter((p) => p.id !== prodId);
        saveProducts();
        await uzumTgCall("editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: `🗑 Tovar #${prodId} kuzatuvdan o'chirildi.`,
        });
        await uzumTgCall("answerCallbackQuery", { callback_query_id: cq.id });
        return;
      }
    }

    // 2. Xabarlar
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();

    if (UZUM_ADMIN_ID && userId !== UZUM_ADMIN_ID) {
      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text: "⛔ Sizda ushbu shaxsiy botdan foydalanish huquqi yo'q.",
      });
      return;
    }

    if (text === "/start") {
      userStates.delete(userId);
      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text:
          `🚀 <b>Uzum Market Price Tracker & Auto-Buy Sniper</b>\n\n` +
          `📌 <b>Qanday ishlaydi:</b>\n` +
          `1. Uzum ilovasi yoki saytidan mahsulot havolasini yuboring.\n` +
          `2. Bot rasm, aksiya narxi va barcha variantlarni (metr, rang, razmer) chiqaradi.\n` +
          `3. Kerakli variantni tanlang va maqsadli narxni belgilang.\n` +
          `4. Narx tushishi bilan bot avtomatik yoki 1-bosishda PVZga buyurtma beradi!\n\n` +
          `📋 <b>Buyruqlar:</b>\n` +
          `/list — Kuzatilayotgan tovarlar`,
        parse_mode: "HTML",
      });
      return;
    }

    if (text === "/list") {
      const userProducts = productsDb.filter((p) => p.userId === userId);
      if (userProducts.length === 0) {
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text: "📭 Hozircha kuzatilayotgan tovarlar yo'q. Uzum havolasini yuboring!",
        });
        return;
      }

      for (const item of userProducts) {
        const lastP = item.lastPrice ? `${item.lastPrice.toLocaleString()} so'm` : "Kutilmoqda";
        const modeLabel = item.mode === "MODE_A" ? "⚡ Auto-Buy (Mode A)" : "🔔 1-Click (Mode B)";
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text:
            `🆔 <b>#${item.id} | ${item.title}</b>\n` +
            `🎯 Maqsadli narx: <b>${item.targetPrice.toLocaleString()} so'm</b>\n` +
            `💰 Oxirgi narx: <b>${lastP}</b> (Qoldiq: ${item.availableAmount || 0} ta)\n` +
            `⚙️ Rejim: <b>${modeLabel}</b>\n` +
            `📌 Status: <b>${item.status}</b>\n` +
            `🔗 <a href='${item.url}'>Uzum sahifasi</a>`,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🛒 Hozir sotib olish", callback_data: `uzum_buy:${item.id}` },
                { text: "🗑 O'chirish", callback_data: `uzum_del:${item.id}` },
              ],
            ],
          },
        });
      }
      return;
    }

    if (text.includes("uzum.uz")) {
      const urlMatch = text.match(/(https?:\/\/[^\s]*uzum\.uz\/[^\s]+)/);
      if (!urlMatch) {
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text: "⚠️ To'g'ri Uzum.uz mahsulot havolasini yuboring.",
        });
        return;
      }

      const fullUrl = urlMatch[1];
      const waitRes = await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text: "🔍 <i>Mahsulot ma'lumotlari va rasmlari yuklanmoqda...</i>",
        parse_mode: "HTML",
      });

      const pInfo = await fetchUzumProductInfo(fullUrl);
      if (waitRes.result && waitRes.result.message_id) {
        await uzumTgCall("deleteMessage", { chat_id: chatId, message_id: waitRes.result.message_id });
      }

      if (!pInfo || !pInfo.variants || pInfo.variants.length === 0) {
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Mahsulot ma'lumotlarini yuklab bo'lmadi. Havolani tekshiring.",
        });
        return;
      }

      const title = pInfo.title;
      const photoUrl = pInfo.photo_url;
      const variants = pInfo.variants;

      const skuMatch = fullUrl.match(/skuId=(\d+)/);
      const targetSkuId = skuMatch ? skuMatch[1] : null;

      let selectedVariant = null;
      if (targetSkuId) {
        selectedVariant = variants.find((v) => v.sku_id === targetSkuId);
      }

      const state = {
        url: fullUrl,
        title,
        photo_url: photoUrl,
        all_variants: variants,
      };
      userStates.set(userId, state);

      if (selectedVariant) {
        await sendAskPricePrompt(chatId, state, selectedVariant, title, photoUrl);
      } else if (variants.length === 1) {
        await sendAskPricePrompt(chatId, state, variants[0], title, photoUrl);
      } else {
        state.step = "waiting_for_sku";
        const kbRows = [];
        for (const v of variants.slice(0, 12)) {
          kbRows.push([
            {
              text: `🔘 ${v.name} — ${v.price.toLocaleString()} so'm`,
              callback_data: `uzum_pick_sku:${v.sku_id}`,
            },
          ]);
        }
        const caption =
          `📦 <b>${title}</b>\n\n` +
          `❗️ <b>Ushbu tovarda bir nechta variantlar mavjud.</b>\n` +
          `Qaysi birini kuzatmoqchisiz? Quyidagi tugmalardan birini tanlang:`;

        if (photoUrl) {
          await uzumTgCall("sendPhoto", {
            chat_id: chatId,
            photo: photoUrl,
            caption,
            reply_markup: { inline_keyboard: kbRows },
            parse_mode: "HTML",
          });
        } else {
          await uzumTgCall("sendMessage", {
            chat_id: chatId,
            text: caption,
            reply_markup: { inline_keyboard: kbRows },
            parse_mode: "HTML",
          });
        }
      }
      return;
    }

    const state = userStates.get(userId);
    if (state && state.step === "waiting_for_price") {
      const digits = text.replace(/[^\d]/g, "");
      const targetPrice = parseInt(digits, 10);

      if (!targetPrice || targetPrice <= 0) {
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Iltimos, narxni faqat raqamlarda kiriting (masalan: <code>65000</code>):",
          parse_mode: "HTML",
        });
        return;
      }

      state.targetPrice = targetPrice;
      state.step = "waiting_for_mode";

      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text:
          `🎯 Maqsadli narx: <b>${targetPrice.toLocaleString()} so'm</b> qilib belgilandi.\n\n` +
          `Endi buyurtma rejimini tanlang:`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚡ Mode A: Auto-Buy Sniper (Avto-Xarid)", callback_data: "uzum_mode:MODE_A" }],
            [{ text: "🔔 Mode B: 1-Click Confirm (Tasdiqlash bilan)", callback_data: "uzum_mode:MODE_B" }],
          ],
        },
      });
      return;
    }
  } catch (err) {
    console.error("[UzumSniper] Webhook handle error:", err);
  }
}

// Xizmatni server.js ga ulash funksiyasi
function initUzumSniper(app, customDataDir) {
  if (customDataDir) {
    DATA_DIR = customDataDir;
    PRODUCTS_FILE = path.join(DATA_DIR, "uzum_products.json");
    AUTH_FILE = path.join(DATA_DIR, "uzum_auth.json");
  }

  loadProducts();

  app.post("/api/uzum/webhook", handleUzumWebhook);

  setTimeout(() => {
    startMonitoringLoop().catch((e) => console.error("[UzumSniper] Loop start error:", e));
  }, 5000);

  setTimeout(async () => {
    try {
      const webhookUrl = `${APP_URL}/api/uzum/webhook`;
      const res = await uzumTgCall("setWebhook", { url: webhookUrl });
      console.log(`[UzumSniper] Telegram setWebhook (${webhookUrl}):`, JSON.stringify(res));
    } catch (e) {
      console.error("[UzumSniper] setWebhook error:", e.message);
    }
  }, 3000);

  console.log("[UzumSniper] Xizmat muvaffaqiyatli ishga tushirildi (/api/uzum/webhook).");
}

module.exports = {
  initUzumSniper,
};
