/**
 * DIGI DIGI — Official Backend Server (Telegram Mini App + Data Persistence + 1-Week Block + Webhook)
 * Domain: https://digi-digi.livops.app/
 */
const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

// 0) Ultra-tezkor Zero-Overhead Ping endpointi (static/json middleware dan OLDIN - 0 disk I/O, 0 ETag, 0 bayt)
app.get("/api/tg/ping", (req, res) => {
  res.writeHead(204, {
    "Cache-Control": "no-store",
    "Connection": "keep-alive"
  });
  res.end();
});
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun (1 hafta)

const BOT_TOKEN = process.env.BOT_TOKEN || "9299427859:AAHPfHEA_Ze5r_ulGYaAprh3Gp7-EznE3Zs";
const APP_URL = "https://digi-digi.livops.app";

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".js")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  } else if (req.path.startsWith("/sfx/") && (req.path.endsWith(".mp3") || req.path.endsWith(".ogg"))) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
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
    fs.promises.writeFile(DB_FILE, JSON.stringify(db), "utf8").catch(err => {
      console.error("DB save error:", err);
    });
  }, 1000);
}

loadDb();

function computePlayerPowerScore(player) {
  const s = (player && player.userStats) || {};
  const elo = Number(s.elo) || 1000;
  const totalMatches = (Number(s.matches5v5) || 0) + (Number(s.matchesOnline) || 0);
  const kills = Number(s.kills) || 0;
  const headshots = Number(s.headshots) || 0;
  const botLevel = Number(s.botLevel) || 1;
  const powerScore = Math.round(elo + (totalMatches * 30) + (kills * 4) + (headshots * 10) + Math.max(0, botLevel - 1) * 15);
  const level = Math.max(1, Math.floor((elo - 800) / 25) + 1);
  const isOnline = (Date.now() - Number((player && (player.lastSeenAt || player.updatedAt)) || 0)) < 90000;
  return { elo, level, totalMatches, kills, headshots, powerScore, isOnline };
}

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

// (Eski ping endpointi yuqoriga ko'chirildi - bu blok o'chirildi)

// 1) O'yinchi profilini va o'yin ma'lumotlarini (tangalar, skinlar, ELO, bloklar) saqlash va olish
app.post("/api/tg/sync", (req, res) => {
  const { myProfile, userStats, blockedUsersMap, savedFriends, initLoad } = req.body || {};
  if (!myProfile || !myProfile.id) {
    return res.status(400).json({ ok: false, error: "INVALID_PROFILE" });
  }

  const pid = String(myProfile.id).trim().toUpperCase();
  let existing = db.players[pid];

  if (!existing) {
    let oldKey = null;
    if (myProfile.tgId) {
      oldKey = Object.keys(db.players).find(k => String(db.players[k].tgId) === String(myProfile.tgId));
    }
    if (oldKey && db.players[oldKey]) {
      const oldP = db.players[oldKey];
      delete db.players[oldKey];
      db.friendRequests.forEach(r => {
        if (r.fromId === oldKey) r.fromId = pid;
        if (r.toId === oldKey) r.toId = pid;
      });
      const merged = {
        id: pid,
        tgId: myProfile.tgId || oldP.tgId || null,
        name: myProfile.name || oldP.name || "Player",
        username: myProfile.username || oldP.username || "",
        photoUrl: myProfile.photoUrl || oldP.photoUrl || "",
        userStats: Object.assign({
          coins: 0,
          elo: 1000,
          botLevel: 1,
          kills: 0,
          headshots: 0,
          matches5v5: 0,
          matchesOnline: 0,
          ownedSkins: ["classic"],
          equippedSkinId: "classic"
        }, oldP.userStats || {}, (userStats && !initLoad) ? userStats : {}),
        blockedUsersMap: Object.assign({}, oldP.blockedUsersMap || {}, blockedUsersMap || {}),
        savedFriends: Array.isArray(savedFriends) ? savedFriends : (oldP.savedFriends || []),
        createdAt: oldP.createdAt || Date.now(),
        updatedAt: Date.now(),
        lastSeenAt: Date.now()
      };
      db.players[pid] = merged;
      saveDb();
      return res.json({ ok: true, player: merged });
    }

    // Yangi o'yinchi: boshlang'ich tangalar: 0!
    const newPlayer = {
      id: pid,
      tgId: myProfile.tgId || null,
      name: myProfile.name || "Player",
      username: myProfile.username || "",
      photoUrl: myProfile.photoUrl || "",
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
      updatedAt: Date.now(),
      lastSeenAt: Date.now()
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
  if (myProfile.photoUrl) existing.photoUrl = myProfile.photoUrl;
  existing.lastSeenAt = Date.now();

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

  // O'zaro avto-qabul tekshiruvi: cleanTo allaqachon cleanFrom ga pending so'rov yuborgan bo'lsa
  const reversePending = db.friendRequests.find(
    r => r.fromId === cleanTo && r.toId === cleanFrom && r.status === "pending"
  );
  if (reversePending) {
    reversePending.status = "accept";
    const fromObj = db.players[cleanFrom] || { id: cleanFrom, name: fromName || cleanFrom, userStats: { elo: fromElo || 1000 } };
    const toObj = db.players[cleanTo] || { id: cleanTo, name: cleanTo, userStats: { elo: 1000 } };

    if (!db.players[cleanFrom]) db.players[cleanFrom] = fromObj;
    if (!db.players[cleanTo]) db.players[cleanTo] = toObj;

    if (!Array.isArray(db.players[cleanFrom].savedFriends)) db.players[cleanFrom].savedFriends = [];
    if (!db.players[cleanFrom].savedFriends.some(f => f.id === cleanTo)) {
      db.players[cleanFrom].savedFriends.push({
        id: cleanTo,
        name: toObj.name || cleanTo,
        username: toObj.username || "",
        tgId: toObj.tgId || null,
        elo: (toObj.userStats && toObj.userStats.elo) || 1000
      });
    }

    if (!Array.isArray(db.players[cleanTo].savedFriends)) db.players[cleanTo].savedFriends = [];
    if (!db.players[cleanTo].savedFriends.some(f => f.id === cleanFrom)) {
      db.players[cleanTo].savedFriends.push({
        id: cleanFrom,
        name: fromObj.name || cleanFrom,
        username: fromObj.username || "",
        tgId: fromObj.tgId || null,
        elo: (fromObj.userStats && fromObj.userStats.elo) || (fromElo || 1000)
      });
    }

    saveDb();
    return res.json({ ok: true, autoAccepted: true });
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
        username: senderObj.username || "",
        tgId: senderObj.tgId || null,
        elo: (senderObj.userStats && senderObj.userStats.elo) || 1050
      });
    }

    if (db.players[cleanSender]) {
      if (!Array.isArray(db.players[cleanSender].savedFriends)) db.players[cleanSender].savedFriends = [];
      if (!db.players[cleanSender].savedFriends.some(f => f.id === cleanMy)) {
        db.players[cleanSender].savedFriends.push({
          id: cleanMy,
          name: myObj.name || cleanMy,
          username: myObj.username || "",
          tgId: myObj.tgId || null,
          elo: (myObj.userStats && myObj.userStats.elo) || 1050
        });
      }
    }
  }

  saveDb();
  return res.json({ ok: true, action });
});

// 5B) Barcha o'yinchilar va do'stlar katalogi (Directory & Ranking)
app.get("/api/tg/directory", (req, res) => {
  const myId = String(req.query.myId || "").trim().toUpperCase();
  const q = String(req.query.q || "").trim().toLowerCase();
  const myObj = db.players[myId] || null;
  const myFriendIds = new Set(((myObj && myObj.savedFriends) || []).map(f => String(f.id || "").toUpperCase()));
  const blockedMap = (myObj && myObj.blockedUsersMap) ? myObj.blockedUsersMap : {};
  const now = Date.now();

  const incomingSet = new Set(
    db.friendRequests
      .filter(r => r.toId === myId && r.status === "pending" && !(blockedMap[r.fromId] && blockedMap[r.fromId] > now))
      .map(r => r.fromId)
  );
  const outgoingSet = new Set(
    db.friendRequests
      .filter(r => r.fromId === myId && r.status === "pending")
      .map(r => r.toId)
  );

  const allSorted = Object.values(db.players).map(p => {
    const score = computePlayerPowerScore(p);
    return {
      id: p.id,
      name: p.name || p.id,
      username: p.username || "",
      photoUrl: p.photoUrl || "",
      elo: score.elo,
      level: score.level,
      totalMatches: score.totalMatches,
      kills: score.kills,
      headshots: score.headshots,
      powerScore: score.powerScore,
      isOnline: score.isOnline,
      lastSeenAt: p.lastSeenAt || p.updatedAt || p.createdAt || 0
    };
  });

  // 1) powerScore kamayish bo'yicha
  // 2) totalMatches kamayish bo'yicha
  // 3) elo kamayish bo'yicha
  // 4) lastSeenAt kamayish bo'yicha
  allSorted.sort((a, b) => {
    if (b.powerScore !== a.powerScore) return b.powerScore - a.powerScore;
    if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches;
    if (b.elo !== a.elo) return b.elo - a.elo;
    return b.lastSeenAt - a.lastSeenAt;
  });

  allSorted.forEach((p, idx) => {
    p.rank = idx + 1;
    p.relation = (p.id === myId) ? "self" :
                 (myFriendIds.has(p.id) ? "friend" :
                 (incomingSet.has(p.id) ? "incoming" :
                 (outgoingSet.has(p.id) ? "outgoing" : "none")));
    if (p.relation === "friend") {
      p.tgId = (db.players[p.id] && db.players[p.id].tgId) || null;
    }
  });

  let filtered = allSorted;
  if (q) {
    filtered = allSorted.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.username && p.username.toLowerCase().includes(q)) ||
      (p.id && p.id.toLowerCase().includes(q))
    );
  }

  // myFriends ro'yxati
  const myFriends = Array.from(myFriendIds).map(fid => {
    const p = db.players[fid];
    if (p) {
      const score = computePlayerPowerScore(p);
      return {
        id: p.id,
        name: p.name || p.id,
        username: p.username || "",
        tgId: p.tgId || null,
        photoUrl: p.photoUrl || "",
        elo: score.elo,
        level: score.level,
        totalMatches: score.totalMatches,
        kills: score.kills,
        headshots: score.headshots,
        powerScore: score.powerScore,
        isOnline: score.isOnline,
        lastSeenAt: p.lastSeenAt || p.updatedAt || 0
      };
    }
    const sf = ((myObj && myObj.savedFriends) || []).find(f => String(f.id).toUpperCase() === fid);
    return {
      id: fid,
      name: (sf && sf.name) || fid,
      username: (sf && sf.username) || "",
      tgId: (sf && sf.tgId) || null,
      photoUrl: "",
      elo: (sf && sf.elo) || 1000,
      level: 1,
      totalMatches: 0,
      kills: 0,
      headshots: 0,
      powerScore: (sf && sf.elo) || 1000,
      isOnline: false,
      lastSeenAt: 0
    };
  });

  myFriends.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return b.powerScore - a.powerScore;
  });

  const incomingRequests = db.friendRequests
    .filter(r => r.toId === myId && r.status === "pending" && !(blockedMap[r.fromId] && blockedMap[r.fromId] > now))
    .map(r => {
      const p = db.players[r.fromId];
      const score = p ? computePlayerPowerScore(p) : { elo: r.fromElo || 1000, level: 1, totalMatches: 0, kills: 0, powerScore: r.fromElo || 1000 };
      return {
        requestId: r.id,
        id: r.fromId,
        name: (p && p.name) || r.fromName || r.fromId,
        photoUrl: (p && p.photoUrl) || "",
        elo: score.elo,
        level: score.level,
        totalMatches: score.totalMatches,
        powerScore: score.powerScore,
        createdAt: r.createdAt
      };
    });

  const outgoingRequests = db.friendRequests
    .filter(r => r.fromId === myId && r.status === "pending")
    .map(r => {
      const p = db.players[r.toId];
      const score = p ? computePlayerPowerScore(p) : { elo: 1000, level: 1, totalMatches: 0, kills: 0, powerScore: 1000 };
      return {
        requestId: r.id,
        id: r.toId,
        name: (p && p.name) || r.toId,
        photoUrl: (p && p.photoUrl) || "",
        elo: score.elo,
        level: score.level,
        totalMatches: score.totalMatches,
        powerScore: score.powerScore,
        createdAt: r.createdAt
      };
    });

  return res.json({
    ok: true,
    totalPlayers: allSorted.length,
    onlineCount: allSorted.filter(x => x.isOnline).length,
    allPlayers: filtered.slice(0, 150),
    myFriends,
    incomingRequests,
    outgoingRequests
  });
});

// 5C) Do'stlikni bekor qilish / do'stlar ro'yxatidan o'chirish
app.post("/api/tg/friend-remove", (req, res) => {
  const { myId, targetId } = req.body || {};
  const cleanMy = String(myId || "").trim().toUpperCase();
  const cleanTarget = String(targetId || "").trim().toUpperCase();
  if (!cleanMy || !cleanTarget) {
    return res.status(400).json({ ok: false, error: "MISSING_IDS" });
  }

  if (db.players[cleanMy] && Array.isArray(db.players[cleanMy].savedFriends)) {
    db.players[cleanMy].savedFriends = db.players[cleanMy].savedFriends.filter(f => String(f.id).toUpperCase() !== cleanTarget);
  }
  if (db.players[cleanTarget] && Array.isArray(db.players[cleanTarget].savedFriends)) {
    db.players[cleanTarget].savedFriends = db.players[cleanTarget].savedFriends.filter(f => String(f.id).toUpperCase() !== cleanMy);
  }

  db.friendRequests.forEach(r => {
    if (((r.fromId === cleanMy && r.toId === cleanTarget) || (r.fromId === cleanTarget && r.toId === cleanMy)) && r.status === "pending") {
      r.status = "cancelled";
    }
  });

  saveDb();
  return res.json({ ok: true });
});

// 6) Telegram Bot Webhook (/api/tg/webhook)
app.post("/api/tg/webhook", async (req, res) => {
  try {
    const update = req.body || {};
    const msg = update.message;
    if (msg && msg.text && msg.text.startsWith("/start")) {
      const chatId = msg.chat.id;
      const firstName = (msg.from && msg.from.first_name) ? msg.from.first_name : "Jangchi";

      if (msg.from && msg.from.id) {
        const tgId = msg.from.id;
        const fullName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ").trim() || msg.from.username || ("Jangchi_" + String(tgId).slice(-4));
        const username = msg.from.username || "";
        const existingKey = Object.keys(db.players).find(k => String(db.players[k].tgId) === String(tgId));
        if (existingKey && db.players[existingKey]) {
          const ex = db.players[existingKey];
          ex.name = ex.name || fullName;
          ex.username = username || ex.username;
          ex.lastSeenAt = Date.now();
          saveDb();
        } else {
          const newId = "TG-" + String(tgId);
          db.players[newId] = {
            id: newId,
            tgId,
            name: fullName,
            username,
            photoUrl: "",
            userStats: { coins: 0, elo: 1000, botLevel: 1, kills: 0, headshots: 0, matches5v5: 0, matchesOnline: 0, ownedSkins: ["classic"], equippedSkinId: "classic" },
            blockedUsersMap: {},
            savedFriends: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastSeenAt: Date.now()
          };
          saveDb();
        }
      }
      const parts = msg.text.trim().split(/\s+/);
      const rawRef = parts[1] || "";
      let webAppUrl = `${APP_URL}/`;
      if (rawRef.startsWith("room_")) {
        const roomCode = rawRef.replace("room_", "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
        if (roomCode) webAppUrl = `${APP_URL}/?room_code=${encodeURIComponent(roomCode)}`;
      } else if (rawRef) {
        const cleanRef = rawRef.startsWith("friend_") ? rawRef.replace("friend_", "") : rawRef;
        webAppUrl = `${APP_URL}/?friend_ref=${encodeURIComponent(cleanRef)}`;
      }

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

// Uzum Market Price Tracker & Auto-Buy Sniper xizmati (To'liq mustaqil modul)
try {
  const { initUzumSniper } = require("./uzum_sniper_service");
  initUzumSniper(app, DATA_DIR);
} catch (uzumErr) {
  console.error("[UzumSniper] Init error:", uzumErr);
}

// Real-Time Multiplayer Room Engine (1v1 Duel & 4v4 TDM — SSE + Keep-Alive HTTP)
try {
  const { initMultiplayer } = require("./mp_engine");
  initMultiplayer(app);
} catch (mpErr) {
  console.error("[Multiplayer] Init error:", mpErr);
}

const httpServer = app.listen(PORT, async () => {
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

httpServer.keepAliveTimeout = 65000;
httpServer.headersTimeout = 66000;

// TCP Nagle buferlashini o'chirish (0ms paket ushlanishi)
httpServer.on("connection", (socket) => {
  socket.setNoDelay(true);
});

// Ultra-yengil 3-baytli Native WebSocket Ping tunneli (/ws/ping) - HTTP/Express ustamasisiz
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const WS_PONG_FRAME = Buffer.from([0x81, 0x01, 0x70]); // FIN=1, Text, 1 bayt: "p"
const WS_CTRL_PONG = Buffer.from([0x8a, 0x00]);

httpServer.on("upgrade", (req, socket, head) => {
  try {
    if (!req.url || !req.url.startsWith("/ws/ping")) {
      socket.destroy();
      return;
    }
    const wsKey = req.headers["sec-websocket-key"];
    if (!wsKey) {
      socket.destroy();
      return;
    }
    const acceptKey = crypto.createHash("sha1").update(wsKey + WS_GUID).digest("base64");
    socket.setNoDelay(true);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n"
    );

    const onData = (buf) => {
      try {
        if (!buf || buf.length < 2) return;
        const opcode = buf[0] & 0x0f;
        if (opcode === 0x8) {
          socket.end();
        } else if (opcode === 0x9) {
          socket.write(WS_CTRL_PONG);
        } else if (opcode === 0x1 || opcode === 0x2) {
          socket.write(WS_PONG_FRAME);
        }
      } catch (e) {}
    };

    socket.on("data", onData);
    if (head && head.length > 0) onData(head);

    socket.on("error", () => {});
  } catch (e) {
    try { socket.destroy(); } catch (_) {}
  }
});
