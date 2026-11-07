/**
 * DIGI DIGI — Official Backend Server (Telegram Mini App + Data Persistence + 1-Week Block + Webhook)
 * Domain: https://digi-digi.livops.app/
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun (1 hafta)

const BOT_TOKEN = process.env.BOT_TOKEN || "9299427859:AAHPfHEA_Ze5r_ulGYaAprh3Gp7-EznE3Zs";
const APP_URL = "https://digi-digi.livops.app";

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Doimiy JSON Baza (data/players_db.json)
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'players_db.json');

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
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.players) db.players = parsed.players;
      if (Array.isArray(parsed.friendRequests)) db.friendRequests = parsed.friendRequests;
    }
  } catch (err) {
    console.error('DB Load error:', err.message);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('DB Save error:', err.message);
  }
}

loadDb();

// 1) O'yinchi profilini va o'yin ma'lumotlarini (tangalar, skinlar, ELO, bloklar) saqlash va olish
app.post('/api/tg/sync', (req, res) => {
  const { myProfile, userStats, blockedUsersMap, savedFriends } = req.body || {};
  if (!myProfile || !myProfile.id) {
    return res.status(400).json({ ok: false, error: 'INVALID_PROFILE' });
  }

  const pid = String(myProfile.id).trim().toUpperCase();
  const existing = db.players[pid] || {
    id: pid,
    tgId: myProfile.tgId || null,
    name: myProfile.name || 'Player',
    username: myProfile.username || '',
    userStats: { coins: 12500, elo: 1000, botLevel: 1, ownedSkins: ['classic'], equippedSkinId: 'classic' },
    blockedUsersMap: {},
    savedFriends: [],
    createdAt: Date.now()
  };

  existing.name = myProfile.name || existing.name;
  existing.tgId = myProfile.tgId || existing.tgId;
  existing.username = myProfile.username || existing.username;
  if (userStats && typeof userStats === 'object') {
    existing.userStats = Object.assign({}, existing.userStats, userStats);
  }
  if (blockedUsersMap && typeof blockedUsersMap === 'object') {
    existing.blockedUsersMap = Object.assign({}, existing.blockedUsersMap, blockedUsersMap);
  }
  if (Array.isArray(savedFriends)) {
    // Mavjud do'stlarni birlashtirish
    const map = {};
    (existing.savedFriends || []).forEach(f => { if (f && f.id) map[f.id] = f; });
    savedFriends.forEach(f => { if (f && f.id) map[f.id] = f; });
    existing.savedFriends = Object.values(map);
  }
  existing.updatedAt = Date.now();

  db.players[pid] = existing;
  saveDb();

  return res.json({ ok: true, player: existing });
});

// 2) Do'st taklif havolasi orqali kirilganda o'yinchi profilini ko'rsatish
app.get('/api/tg/profile/:id', (req, res) => {
  const rawId = String(req.params.id || '').trim().toUpperCase();
  const player = db.players[rawId] || Object.values(db.players).find(p => String(p.tgId) === rawId);
  if (!player) {
    return res.json({
      id: rawId.startsWith('DOOM-') ? rawId : `DOOM-${rawId.slice(-4)}`,
      name: `@Player_${rawId.slice(-4)}`,
      elo: 1100
    });
  }
  return res.json({
    id: player.id,
    name: player.name,
    elo: (player.userStats && player.userStats.elo) ? player.userStats.elo : 1000
  });
});

// 3) Do'stlashish so'rovini yuborish (1 HAFTALIK BLOK TEKSHIRUVI BILAN!)
app.post('/api/tg/friend-request', (req, res) => {
  const { fromId, fromName, fromElo, toId } = req.body || {};
  if (!fromId || !toId) {
    return res.status(400).json({ ok: false, error: 'MISSING_IDS' });
  }

  const cleanFrom = String(fromId).trim().toUpperCase();
  const cleanTo = String(toId).trim().toUpperCase();

  if (cleanFrom === cleanTo) {
    return res.status(400).json({ ok: false, error: 'SELF_REQUEST' });
  }

  // Qabul qiluvchi ushbu yuboruvchini 1 haftaga bloklaganmi?
  const targetPlayer = db.players[cleanTo];
  if (targetPlayer && targetPlayer.blockedUsersMap) {
    const blockedUntil = targetPlayer.blockedUsersMap[cleanFrom];
    if (blockedUntil && blockedUntil > Date.now()) {
      const remDays = Math.ceil((blockedUntil - Date.now()) / (24 * 60 * 60 * 1000));
      return res.json({
        ok: false,
        error: 'BLOCKED_1_WEEK',
        blockedUntil,
        remDays,
        message: `Siz ushbu o'yinchi tomonidan 1 haftaga bloklangansiz (${remDays} kun qoldi).`
      });
    }
  }

  // Agar allaqachon kutilayotgan so'rov bo'lsa qayta ko'paytirmaymiz
  const alreadyPending = db.friendRequests.find(
    r => r.fromId === cleanFrom && r.toId === cleanTo && r.status === 'pending'
  );
  if (!alreadyPending) {
    db.friendRequests.push({
      id: 'REQ_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      fromId: cleanFrom,
      fromName: fromName || cleanFrom,
      fromElo: fromElo || 1000,
      toId: cleanTo,
      createdAt: Date.now(),
      status: 'pending'
    });
    saveDb();
  }

  return res.json({ ok: true });
});

// 4) O'yinchiga kelgan yangi do'stlashish bildirishnomalarini olish
app.get('/api/tg/notifications', (req, res) => {
  const myId = String(req.query.myId || '').trim().toUpperCase();
  if (!myId) return res.json({ requests: [] });

  const myPlayer = db.players[myId];
  const blockedMap = (myPlayer && myPlayer.blockedUsersMap) ? myPlayer.blockedUsersMap : {};
  const now = Date.now();

  const pending = db.friendRequests.filter(r => {
    if (r.toId !== myId || r.status !== 'pending') return false;
    // Agar 1 haftalik blokda bo'lsa ko'rsatmaymiz
    if (blockedMap[r.fromId] && blockedMap[r.fromId] > now) return false;
    return true;
  });

  return res.json({ requests: pending });
});

// 5) Bildirishnomaga javob berish: 'accept' (Do'stlashish) | 'reject' (Rad etish) | 'block_1_week' (1 haftaga bloklash)
app.post('/api/tg/friend-respond', (req, res) => {
  const { myId, senderId, action } = req.body || {};
  const cleanMy = String(myId || '').trim().toUpperCase();
  const cleanSender = String(senderId || '').trim().toUpperCase();

  if (!cleanMy || !cleanSender) {
    return res.status(400).json({ ok: false });
  }

  // Pending so'rovlarni yopish
  db.friendRequests.forEach(r => {
    if (r.toId === cleanMy && r.fromId === cleanSender && r.status === 'pending') {
      r.status = action || 'resolved';
    }
  });

  if (!db.players[cleanMy]) {
    db.players[cleanMy] = { id: cleanMy, name: cleanMy, userStats: {}, blockedUsersMap: {}, savedFriends: [] };
  }

  if (action === 'block_1_week') {
    // 1 HAFTAGA (7 kun = 604,800,000 ms) BLOKLASH!
    if (!db.players[cleanMy].blockedUsersMap) db.players[cleanMy].blockedUsersMap = {};
    db.players[cleanMy].blockedUsersMap[cleanSender] = Date.now() + ONE_WEEK_MS;
  } else if (action === 'accept') {
    // Ikki o'yinchini bir-birining do'stlar ro'yxatiga qo'shish
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
app.post('/api/tg/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const update = req.body;
    if (!update || !update.message) return;
    const msg = update.message;
    const chatId = msg.chat && msg.chat.id;
    const text = (msg.text || '').trim();

    if (text.startsWith('/start') && chatId) {
      const firstName = (msg.from && msg.from.first_name) || "Jangchi";
      const parts = text.split(/\s+/);
      const startPayload = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';

      const webAppUrl = startPayload
        ? `${APP_URL}/?friend_ref=${encodeURIComponent(startPayload)}`
        : `${APP_URL}/`;

      const welcomeText = `🪖 <b>Salom, ${firstName}!</b>\n\n🔥 <b>DIGI DIGI — Global Offensive</b> taktik 3D labirint jangiga xush kelibsiz!\n\n🎯 <b>Sizni nimalar kutmoqda?</b>\n• 🔫 <b>5v5 va 1v1 Duel:</b> Do'stlaringiz yoki aqlli botlarga qarshi shiddatli otishmalar\n• 🧰 <b>Oltin Harbiy Sandiq:</b> Bepul sandiq ochib, minglab tilla tangalar yutib oling\n• 🎨 <b>Eksklyuziv Skinlar:</b> Oltin Ajdar, Kiberpank Neon va Zumrad qurollar\n• 🏆 <b>Reyting:</b> TOP jangchilar ro'yxatida 1-o'ringa chiqing!\n\n👇 <b>Qurolingizni o'qlang! Labirintga kirish uchun pastdagi tugmani bosing:</b>`;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔥 O'YINNI BOSHLASH (DIGI DIGI) 🎮",
                  web_app: { url: webAppUrl }
                }
              ]
            ]
          }
        })
      });
    }
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
  }
});

app.listen(PORT, async () => {
  console.log(`DIGI DIGI Server running on port ${PORT}`);

  // Telegram Webhook va Menu tugmasini avtomatik sozlash
  try {
    const webhookRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(APP_URL + '/api/tg/webhook')}`);
    const webhookData = await webhookRes.json();
    console.log('Telegram setWebhook result:', webhookData);

    const menuRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: { type: 'default' }
      })
    });
    const menuData = await menuRes.json();
    console.log('Telegram setChatMenuButton (default) result:', menuData);
  } catch (err) {
    console.error('Telegram init error:', err.message);
  }
});
