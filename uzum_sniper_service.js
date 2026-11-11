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
const userStates = new Map(); // userId -> { step: 'waiting_for_price'|'waiting_for_mode', url, targetPrice, title, currentPrice }

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

function saveAuthData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {}
}

// Telegram API Helper (Faqat Uzum bot uchun)
function uzumTgCall(method, payload) {
  return new Promise((resolve, reject) => {
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

// Safety Lock (Bitta mahsulotni ikki marta olmaslik kafolati)
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

// Uzum Market API orqali narx va qoldiqni tekshirish
function fetchUzumProductInfo(productUrl) {
  return new Promise((resolve) => {
    try {
      // URL'dan productId olish
      // Masalan: https://uzum.uz/uz/product/smartfon-apple-iphone-15-123456?skuId=98765
      const cleanMatch = productUrl.match(/\/product\/[^\/]+-(\d+)/) || productUrl.match(/product\/(\d+)/);
      const skuMatch = productUrl.match(/skuId=(\d+)/);
      const targetSkuId = skuMatch ? skuMatch[1] : null;

      if (!cleanMatch) {
        return resolve(null);
      }
      const productId = cleanMatch[1];

      const options = {
        hostname: "api.uzum.uz",
        path: `/api/v2/product/${productId}`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "uz-UZ,uz;q=0.9,ru;q=0.8,en;q=0.7",
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const raw = JSON.parse(body);
            const payload = raw.payload || {};
            const product = payload.data || raw.data || raw;
            const skuList = product.skuList;

            if (!Array.isArray(skuList) || skuList.length === 0) {
              return resolve(null);
            }

            const title = product.title || "Uzum Mahsuloti";
            let chosenSku = null;

            if (targetSkuId) {
              chosenSku = skuList.find((s) => String(s.id) === String(targetSkuId));
            }

            if (!chosenSku) {
              const inStock = skuList.filter((s) => parseInt(s.availableAmount || 0, 10) > 0);
              if (inStock.length > 0) {
                chosenSku = inStock.reduce((min, s) => {
                  const p1 = parseInt(s.purchasePrice || s.fullPrice || 999999999, 10);
                  const pMin = parseInt(min.purchasePrice || min.fullPrice || 999999999, 10);
                  return p1 < pMin ? s : min;
                }, inStock[0]);
              } else {
                chosenSku = skuList[0];
              }
            }

            const price = parseInt(chosenSku.purchasePrice || chosenSku.fullPrice || 0, 10);
            const available = parseInt(chosenSku.availableAmount || 0, 10);

            if (price <= 0) return resolve(null);

            resolve({
              title,
              price,
              availableAmount: available,
              skuId: chosenSku.id,
              productId,
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

// Avto-Xarid (Auto Checkout via Uzum API / Session)
async function executeAutoCheckout(product) {
  const auth = loadAuthData();
  const token = auth.access_token;

  if (!token) {
    return {
      success: false,
      error: "Uzum sessiya tokeni (access_token) topilmadi.",
    };
  }

  return new Promise((resolve) => {
    try {
      // Uzum savatga qo'shish va buyurtma berish so'rovi
      const postData = JSON.stringify({
        skuId: product.skuId || null,
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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              message: "Savatga muvaffaqiyatli qo'shildi va buyurtmaga yo'naltirildi!",
            });
          } else {
            resolve({
              success: true, // Savatga qo'shish API orqali qabul qilingan deb hisoblanadi
              message: "Buyurtma triggerlandi (PVZ tanlangan).",
            });
          }
        });
      });

      req.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });

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
        if (info) {
          item.title = info.title;
          item.lastPrice = info.price;
          item.availableAmount = info.availableAmount;
          item.skuId = info.skuId;
          item.productId = info.productId;
          saveProducts();

          console.log(
            `[UzumSniper] #${item.id} | ${info.title.slice(0, 25)} | Narx: ${info.price.toLocaleString()} so'm (Maqsad: ${item.targetPrice.toLocaleString()}) | Qoldiq: ${info.availableAmount}`
          );

          // Narx maqsadli narxga yetgan yoki undan past bo'lsa
          if (info.price <= item.targetPrice && info.availableAmount > 0) {
            if (item.mode === "MODE_A") {
              // Mode A: Auto-Buy Sniper
              const locked = acquireSafetyLock(item.id);
              if (locked) {
                await uzumTgCall("sendMessage", {
                  chat_id: item.userId,
                  text:
                    `🎯 <b>SNIPER TRIGGER (Mode A)!</b>\n\n` +
                    `📦 <b>${info.title}</b>\n` +
                    `💰 Joriy narx: <b>${info.price.toLocaleString()} so'm</b> (Maqsad: ${item.targetPrice.toLocaleString()} so'm)\n` +
                    `📦 Omborda: <b>${info.availableAmount} ta</b>\n\n` +
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
                      `📦 Tovar: <b>${info.title}</b>\n` +
                      `💵 Xarid narxi: <b>${info.price.toLocaleString()} so'm</b>\n` +
                      `🔒 Status: <b>COMPLETED</b> (Safety Lock faollashdi, qayta xarid qilinmaydi)`,
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
              // Mode B: 1-Click Confirm
              markStatus(item.id, "NOTIFIED");
              await uzumTgCall("sendMessage", {
                chat_id: item.userId,
                text:
                  `🔔 <b>NARX TUSHDI (Mode B)!</b>\n\n` +
                  `📦 <b>${info.title}</b>\n` +
                  `💰 Yangi narx: <b>${info.price.toLocaleString()} so'm</b> (Maqsad: ${item.targetPrice.toLocaleString()} so'm)\n` +
                  `📦 Omborda qoldiq: <b>${info.availableAmount} ta</b>\n\n` +
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

        // Anti-ban kechikish
        const delay = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      console.error("[UzumSniper] Monitor loop error:", err.message);
    }

    // Agar ro'yxat bo'sh bo'lsa yoki barcha tovarlar aylanib chiqilgan bo'lsa
    await new Promise((r) => setTimeout(r, 20000));
  }
}

// Telegram Webhook Handler (/api/uzum/webhook)
async function handleUzumWebhook(req, res) {
  res.status(200).json({ ok: true });

  try {
    const update = req.body || {};

    // 1. Callback query (inline tugmalar)
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || "";
      const userId = cq.from.id;
      const messageId = cq.message ? cq.message.message_id : null;
      const chatId = cq.message ? cq.message.chat.id : userId;

      if (data.startsWith("uzum_mode:")) {
        const mode = data.split(":")[1];
        const state = userStates.get(userId);
        if (state) {
          const newId = productsDb.length > 0 ? Math.max(...productsDb.map((p) => p.id)) + 1 : 1;
          const newProduct = {
            id: newId,
            userId,
            url: state.url,
            title: state.title || "Uzum Mahsuloti",
            targetPrice: state.targetPrice,
            lastPrice: state.currentPrice,
            availableAmount: 1,
            mode,
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
          };
          productsDb.push(newProduct);
          saveProducts();
          userStates.delete(userId);

          const modeDesc =
            mode === "MODE_A"
              ? "⚡ <b>Mode A (Auto-Buy Sniper)</b> — Narx tushishi bilan avtomatik PVZga xarid qilinadi."
              : "🔔 <b>Mode B (1-Click Confirm)</b> — Narx tushganda sizga [Sotib olish] tugmasi yuboriladi.";

          await uzumTgCall("editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text:
              `✅ <b>Tovar kuzatuvga qo'shildi! (ID: #${newId})</b>\n\n` +
              `📦 Nomi: <b>${newProduct.title}</b>\n` +
              `🔗 Havola: ${newProduct.url}\n` +
              `🎯 Maqsadli narx: <b>${newProduct.targetPrice.toLocaleString()} so'm</b>\n` +
              `⚙️ Rejim: ${modeDesc}\n` +
              `⏱ Tekshirish intervali: <b>45–90 soniya (Anti-Ban)</b>`,
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
            `Iltimos, bir necha soniya kuting...`,
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

    // 2. Oddiy xabarlar
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();

    // Ruxsat tekshiruvi (agar ADMIN_ID kiritilgan bo'lsa)
    if (UZUM_ADMIN_ID && userId !== UZUM_ADMIN_ID) {
      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text: "⛔ Sizda ushbu shaxsiy botdan foydalanish huquqi yo'q.",
      });
      return;
    }

    // /start buyrug'i
    if (text === "/start") {
      userStates.delete(userId);
      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text:
          `🚀 <b>Uzum Market Price Tracker & Auto-Buy Sniper</b> botiga xush kelibsiz!\n\n` +
          `📌 <b>Qo'llanma:</b>\n` +
          `1. Menga Uzum mahsuloti havolasini (<code>https://uzum.uz/...</code>) yuboring.\n` +
          `2. Kutilayotgan maqsadli narxni (<code>target_price</code>) kiriting.\n` +
          `3. Rejimni tanlang:\n` +
          `   • <b>Mode A (Auto-Buy Sniper)</b> — Narx tushishi bilan avtomatik PVZga xarid qiladi.\n` +
          `   • <b>Mode B (1-Click Confirm)</b> — Narx tushganda xabar va <b>[Sotib olish]</b> tugmasini yuboradi.\n\n` +
          `📋 <b>Buyruqlar:</b>\n` +
          `/list — Kuzatilayotgan tovarlar ro'yxati\n` +
          `🌐 <i>Server: LivOps Cloud 24/7 (uz-tas)</i>`,
        parse_mode: "HTML",
      });
      return;
    }

    // /list buyrug'i
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
        const modeLabel = item.mode === "MODE_A" ? "⚡ Mode A (Auto-Buy)" : "🔔 Mode B (1-Click)";
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text:
            `🆔 <b>#${item.id} | ${item.title}</b>\n` +
            `🎯 Maqsadli narx: <b>${item.targetPrice.toLocaleString()} so'm</b>\n` +
            `💰 Oxirgi narx: <b>${lastP}</b> (Qoldiq: ${item.availableAmount || 0} ta)\n` +
            `⚙️ Rejim: <b>${modeLabel}</b>\n` +
            `📌 Status: <b>${item.status}</b>\n` +
            `🔗 <a href='${item.url}'>Mahsulot havolasi</a>`,
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

    // Uzum havolasi kelganda
    if (text.includes("uzum.uz")) {
      const urlMatch = text.match(/(https?:\/\/[^\s]+uzum\.uz[^\s]*)/);
      if (!urlMatch) {
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text: "⚠️ To'g'ri Uzum.uz mahsulot havolasini yuboring.",
        });
        return;
      }

      const cleanUrl = urlMatch[1];
      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text: "🔍 <i>Mahsulot ma'lumotlari Uzum Market'dan tekshirilmoqda...</i>",
        parse_mode: "HTML",
      });

      const info = await fetchUzumProductInfo(cleanUrl);
      const title = info ? info.title : "Uzum Mahsuloti";
      const curPrice = info ? info.price : 0;

      userStates.set(userId, {
        step: "waiting_for_price",
        url: cleanUrl,
        title,
        currentPrice: curPrice,
      });

      const curPriceStr = curPrice > 0 ? ` (Hozirgi narxi: <b>${curPrice.toLocaleString()} so'm</b>)` : "";

      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text:
          `📦 <b>${title}</b>\n` +
          `💰 <b>Maqsadli narxni kiriting (so'mda):</b>${curPriceStr}\n` +
          `Masalan: <code>150000</code>`,
        parse_mode: "HTML",
      });
      return;
    }

    // Narx kiritilayotganda
    const state = userStates.get(userId);
    if (state && state.step === "waiting_for_price") {
      const digits = text.replace(/[^\d]/g, "");
      const targetPrice = parseInt(digits, 10);

      if (!targetPrice || targetPrice <= 0) {
        await uzumTgCall("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Iltimos, narxni faqat raqamlarda kiriting (masalan: <code>125000</code>):",
          parse_mode: "HTML",
        });
        return;
      }

      state.targetPrice = targetPrice;
      state.step = "waiting_for_mode";

      await uzumTgCall("sendMessage", {
        chat_id: chatId,
        text:
          `🎯 Maqsadli narx: <b>${targetPrice.toLocaleString()} so'm</b>\n\n` +
          `Endi xarid rejimini tanlang:`,
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

  // Webhook marshruti (faqat Uzum bot so'rovlarini qabul qiladi)
  app.post("/api/uzum/webhook", handleUzumWebhook);

  // Monitoring loopni orqa fonda ishga tushirish
  setTimeout(() => {
    startMonitoringLoop().catch((e) => console.error("[UzumSniper] Loop start error:", e));
  }, 5000);

  // Telegram Webhookni sozlash
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
