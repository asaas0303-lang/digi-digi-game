/**
 * DIGI DIGI — Official Backend Server (Telegram Mini App + Data Persistence + 1-Week Block + Webhook)
 * Domain: https://digi-digi.livops.app/
 */
const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun (1 hafta)

const BOT_TOKEN = process.env.BOT_TOKEN || "9299427859:AAHPfHEA_Ze5r_ulGYaAprh3Gp7-EznE3Zs";
const APP_URL = "https://digi-digi.livops.app";

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".js")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

// Doimiy JSON Baza (data/players_db.json)
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "players_db.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {
  players: {},        // { [doomId]: { id, tgId, name, username, coins, elo, userStats, blockedUsersMap, savedFriends, updatedAt } }
  friendRequests: []  // [ { id, fromId, fromName, fromElo, toId, createdAt, status: 'pending' } ]
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.players) db.players = parsed.players;
      if (Array.isArray(parsed.friendRequests)) db.friendRequests = parsed.friendRequests;
    }
  } catch (err) {
    console.error("DB Load error:", err.message);
  }
}

let _saveTimer = null;
function saveDb() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    fs.promises.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8").catch(err => {
      console.error("DB save error:", err);
    });
  }, 300);
}

loadDb();

// Telegram Native HTTPS Helper
function tgApiCall(method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// 0) Tezkor Ping o'lchash endpointi
app.get("/api/tg/ping", (req, res) => {
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("1");
});

// 1) O'yinchi profilini va o'yin ma'lumotlarini (tangalar, skinlar, ELO, bloklar) saqlash va olish
app.post("/api/tg/sync", (req, res) => {
  const { myProfile, userStats, blockedUsersMap, savedFriends, initLoad } = req.body || {};
  if (!myProfile || !myProfile.id) {
    return res.status(400).json({ ok: false, error: "INVALID_PROFILE" });
  }

  const pid = String(myProfile.id).trim().toUpperCase();
  const existing = db.players[pid];

  if (!existing) {
    // Yangi o'yinchi: boshlang'ich tangalar: 0!
    const newPlayer = {
      id: pid,
      tgId: myProfile.tgId || null,
      name: myProfile.name || "Player",
      username: myProfile.username || "",
      userStats: {
        coins: 0,
        elo: 1000,
        botLevel: 1,
        kills: 0,
        headshots: 0,
        matches5v5: 0,
        matchesOnline: 0,
        ownedSkins: ["classic"],
        equippedSkinId: "classic"
      },
      blockedUsersMap: {},
      savedFriends: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (userStats && typeof userStats === "object" && !initLoad) {
      newPlayer.userStats = Object.assign({}, newPlayer.userStats, userStats);
    }
    db.players[pid] = newPlayer;
    saveDb();
    return res.json({ ok: true, player: newPlayer });
  }

  // Mavjud o'yinchi
  existing.name = myProfile.name || existing.name;
  existing.tgId = myProfile.tgId || existing.tgId;
  existing.username = myProfile.username || existing.username;

  // Agar initLoad === true bo'lsa, bazadagi saqlangan statistikani 0 bilan ezib yubormaymiz!
  if (!initLoad && userStats && typeof userStats === "object") {
    existing.userStats = Object.assign({}, existing.userStats, userStats);
    existing.updatedAt = Date.now();
  }

  if (blockedUsersMap && typeof blockedUsersMap === "object") {
    existing.blockedUsersMap = Object.assign({}, existing.blockedUsersMap, blockedUsersMap);
  }
  if (Array.isArray(savedFriends)) {
    const map = {};
    (existing.savedFriends || []).forEach(f => { if (f && f.id) map[f.id] = f; });
    savedFriends.forEach(f => { if (f && f.id) map[f.id] = f; });
    existing.savedFriends = Object.values(map);
  }

  saveDb();
  return res.json({ ok: true, player: existing });
});

// 2) Do'st taklif havolasi orqali kirilganda o'yinchi profilini ko'rsatish
app.get("/api/tg/profile/:id", (req, res) => {
  const rawId = String(req.params.id || "").trim().toUpperCase();
  const player = db.players[rawId] || Object.values(db.players).find(p => String(p.tgId) === rawId);
  if (!player) {
    return res.json({
      id: rawId.startsWith("DOOM-") ? rawId : `DOOM-${rawId.slice(-4)}`,
      name: `@Player_${rawId.slice(-4)}`,
      elo: 1000,
      coins: 0
    });
  }
  return res.json({
    id: player.id,
    name: player.name,
    elo: (player.userStats && player.userStats.elo) ? player.userStats.elo : 1000,
    coins: (player.userStats && typeof player.userStats.coins === 'number') ? player.userStats.coins : 0
  });
});

// 3) Do'stlashish so'rovini yuborish (1 HAFTALIK BLOK TEKSHIRUVI BILAN!)
app.post("/api/tg/friend-request", (req, res) => {
  const { fromId, fromName, fromElo, toId } = req.body || {};
  if (!fromId || !toId) {
    return res.status(400).json({ ok: false, error: "MISSING_IDS" });
  }

  const cleanFrom = String(fromId).trim().toUpperCase();
  const cleanTo = String(toId).trim().toUpperCase();

  if (cleanFrom === cleanTo) {
    return res.status(400).json({ ok: false, error: "SELF_REQUEST" });
  }

  const targetPlayer = db.players[cleanTo];
  if (targetPlayer && targetPlayer.blockedUsersMap) {
    const blockedUntil = targetPlayer.blockedUsersMap[cleanFrom];
    if (blockedUntil && blockedUntil > Date.now()) {
      const remDays = Math.ceil((blockedUntil - Date.now()) / (24 * 60 * 60 * 1000));
      return res.json({
        ok: false,
        error: "BLOCKED_1_WEEK",
        blockedUntil,
        remDays,
        message: `Siz ushbu o'yinchi tomonidan 1 haftaga bloklangansiz (${remDays} kun qoldi).`
      });
    }
  }

  const alreadyPending = db.friendRequests.find(
    r => r.fromId === cleanFrom && r.toId === cleanTo && r.status === "pending"
  );
  if (!alreadyPending) {
    db.friendRequests.push({
      id: "REQ_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      fromId: cleanFrom,
      fromName: fromName || cleanFrom,
      fromElo: fromElo || 1000,
      toId: cleanTo,
      createdAt: Date.now(),
      status: "pending"
    });
    saveDb();
  }

  return res.json({ ok: true });
});

// 4) O'yinchiga kelgan yangi do'stlashish bildirishnomalarini olish
app.get("/api/tg/notifications", (req, res) => {
  const myId = String(req.query.myId || "").trim().toUpperCase();
  if (!myId) return res.json({ requests: [] });

  const myPlayer = db.players[myId];
  const blockedMap = (myPlayer && myPlayer.blockedUsersMap) ? myPlayer.blockedUsersMap : {};
  const now = Date.now();

  const pending = db.friendRequests.filter(r => {
    if (r.toId !== myId || r.status !== "pending") return false;
    if (blockedMap[r.fromId] && blockedMap[r.fromId] > now) return false;
    return true;
  });

  return res.json({ requests: pending });
});

// 5) Bildirishnomaga javob berish
app.post("/api/tg/friend-respond", (req, res) => {
  const { myId, senderId, action } = req.body || {};
  const cleanMy = String(myId || "").trim().toUpperCase();
  const cleanSender = String(senderId || "").trim().toUpperCase();

  if (!cleanMy || !cleanSender) {
    return res.status(400).json({ ok: false });
  }

  db.friendRequests.forEach(r => {
    if (r.toId === cleanMy && r.fromId === cleanSender && r.status === "pending") {
      r.status = action || "resolved";
    }
  });

  if (!db.players[cleanMy]) {
    db.players[cleanMy] = { id: cleanMy, name: cleanMy, userStats: {}, blockedUsersMap: {}, savedFriends: [] };
  }

  if (action === "block_1_week") {
    if (!db.players[cleanMy].blockedUsersMap) db.players[cleanMy].blockedUsersMap = {};
    db.players[cleanMy].blockedUsersMap[cleanSender] = Date.now() + ONE_WEEK_MS;
  } else if (action === "accept") {
    const senderObj = db.players[cleanSender] || { id: cleanSender, name: cleanSender, userStats: { elo: 1050 } };
    const myObj = db.players[cleanMy];

    if (!Array.isArray(myObj.savedFriends)) myObj.savedFriends = [];
    if (!myObj.savedFriends.some(f => f.id === cleanSender)) {
      myObj.savedFriends.push({
        id: cleanSender,
        name: senderObj.name || cleanSender,
        elo: (senderObj.userStats && senderObj.userStats.elo) || 1050
      });
    }

    if (db.players[cleanSender]) {
      if (!Array.isArray(db.players[cleanSender].savedFriends)) db.players[cleanSender].savedFriends = [];
      if (!db.players[cleanSender].savedFriends.some(f => f.id === cleanMy)) {
        db.players[cleanSender].savedFriends.push({
          id: cleanMy,
          name: myObj.name || cleanMy,
          elo: (myObj.userStats && myObj.userStats.elo) || 1050
        });
      }
    }
  }

  saveDb();
  return res.json({ ok: true, action });
});

// 6) Telegram Bot Webhook (/api/tg/webhook)
app.post("/api/tg/webhook", async (req, res) => {
  try {
    const update = req.body || {};
    const msg = update.message;
    if (msg && msg.text && msg.text.startsWith("/start")) {
      const chatId = msg.chat.id;
      const firstName = (msg.from && msg.from.first_name) ? msg.from.first_name : "Jangchi";
      const parts = msg.text.trim().split(/\s+/);
      const rawRef = parts[1] || "";
      // "friend_DOOM-XXXX" formatida kelsa "friend_" prefiksi olib tashlanadi
      const cleanRef = rawRef.startsWith("friend_") ? rawRef.replace("friend_", "") : rawRef;
      const webAppUrl = cleanRef ? `${APP_URL}/?friend_ref=${encodeURIComponent(cleanRef)}` : `${APP_URL}/`;

      const welcomeText =
        `🪖 <b>Salom, ${firstName}!</b>\n\n` +
        `🔥 <b>DIGI DIGI — Global Offensive</b> taktik 3D labirint jangiga xush kelibsiz!\n\n` +
        `🎯 <b>Sizni nimalar kutmoqda?</b>\n` +
        `• 🔫 <b>5v5 va 1v1 Duel:</b> Do'stlaringiz yoki aqlli botlarga qarshi shiddatli otishmalar\n` +
        `• 🧰 <b>Oltin Harbiy Sandiq:</b> Bepul sandiq ochib, minglab tilla tangalar yutib oling\n` +
        `• 🎨 <b>Eksklyuziv Skinlar:</b> Oltin Ajdar, Kiberpank Neon va Zumrad qurollar\n` +
        `• 🏆 <b>Reyting:</b> TOP jangchilar ro'yxatida 1-o'ringa chiqing!\n\n` +
        `👇 <b>Qurolingizni o'qlang! Labirintga kirish uchun pastdagi tugmani bosing:</b>`;

      await tgApiCall("sendMessage", {
        chat_id: chatId,
        text: welcomeText,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔥 O'YINNI BOSHLASH (DIGI DIGI) 🎮", web_app: { url: webAppUrl } }]
          ]
        }
      });
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).json({ ok: true });
  }
});

app.listen(PORT, async () => {
  console.log(`DIGI DIGI Server running on port ${PORT}`);

  try {
    const webhookRes = await tgApiCall("setWebhook", {
      url: `${APP_URL}/api/tg/webhook`
    });
    console.log("Telegram setWebhook result:", webhookRes);

    const menuRes = await tgApiCall("setChatMenuButton", {
      menu_button: { type: "default" }
    });
    console.log("Telegram setChatMenuButton (default) result:", menuRes);
  } catch (err) {
    console.error("Telegram init error:", err.message);
  }
});
