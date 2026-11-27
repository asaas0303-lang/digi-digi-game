/**
 * DIGI DIGI — Official Backend Server (Telegram Mini App + Data Persistence + 1-Week Block + Webhook)
 * Domain: https://digi-digi.livops.app/
 */
const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { GEMS_CONFIG, GIFTS_CATALOG, getGiftById, computePrestigeFromGifts, summarizeGifts } = require("./gifts-catalog.js");
const ADMIN_TG_ID = "5155194813";

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

// 0B) Zero-Dep RAM-Keshli Gzip Middleware (faqat issiq matnli frontend fayllari uchun)
const HOT_TEXT_ASSETS = {
  "/": { fileName: "index.html", contentType: "text/html; charset=UTF-8" },
  "/index.html": { fileName: "index.html", contentType: "text/html; charset=UTF-8" },
  "/weekly-champion.js": { fileName: "weekly-champion.js", contentType: "application/javascript; charset=UTF-8" },
  "/gifts-ui.js": { fileName: "gifts-ui.js", contentType: "application/javascript; charset=UTF-8" },
  "/telegram-bridge.js": { fileName: "telegram-bridge.js", contentType: "application/javascript; charset=UTF-8" },
  "/mp-client.js": { fileName: "mp-client.js", contentType: "application/javascript; charset=UTF-8" },
  "/sfx-engine.js": { fileName: "sfx-engine.js", contentType: "application/javascript; charset=UTF-8" },
  "/gifts-catalog.js": { fileName: "gifts-catalog.js", contentType: "application/javascript; charset=UTF-8" }
};
const hotAssetCache = new Map();

function resolveHotAssetPath(fileName) {
  const pubPath = path.join(__dirname, "public", fileName);
  if (fs.existsSync(pubPath)) return pubPath;
  const rootPath = path.join(__dirname, fileName);
  if (fs.existsSync(rootPath)) return rootPath;
  return null;
}

function getHotAsset(urlPath) {
  const spec = HOT_TEXT_ASSETS[urlPath];
  if (!spec) return null;
  const fullPath = resolveHotAssetPath(spec.fileName);
  if (!fullPath) return null;
  try {
    const stat = fs.statSync(fullPath);
    const cached = hotAssetCache.get(spec.fileName);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached;
    }
    const raw = fs.readFileSync(fullPath);
    const gzip = zlib.gzipSync(raw, { level: 6 });
    const entry = { mtimeMs: stat.mtimeMs, raw, gzip, contentType: spec.contentType };
    hotAssetCache.set(spec.fileName, entry);
    return entry;
  } catch (_) {
    return null;
  }
}

function warmHotAssetCache() {
  const loaded = new Map();
  for (const urlPath of Object.keys(HOT_TEXT_ASSETS)) {
    const spec = HOT_TEXT_ASSETS[urlPath];
    const entry = getHotAsset(urlPath);
    if (entry && !loaded.has(spec.fileName)) {
      loaded.set(spec.fileName, entry);
    }
  }
  let rawBytes = 0;
  let gzBytes = 0;
  for (const e of loaded.values()) {
    rawBytes += e.raw.length;
    gzBytes += e.gzip.length;
  }
  console.log(
    `Hot Gzip RAM-Cache ready: ${loaded.size} files (${Math.round(rawBytes / 1024)} KB -> ${Math.round(gzBytes / 1024)} KB gzip)`
  );
}

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const entry = getHotAsset(req.path);
  if (!entry) return next();

  res.setHeader("Content-Type", entry.contentType);
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const acceptsGzip = /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));
  if (acceptsGzip) {
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", entry.gzip.length);
    return req.method === "HEAD" ? res.end() : res.end(entry.gzip);
  }
  res.setHeader("Content-Length", entry.raw.length);
  return req.method === "HEAD" ? res.end() : res.end(entry.raw);
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
  friendRequests: [], // [ { id, fromId, fromName, fromElo, toId, createdAt, status: 'pending' } ]
  meta: {},
  giftEvents: [],
  monthlyBonusPool: {},
  weeklyChampion: null
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.players && typeof parsed.players === "object") db.players = parsed.players;
      if (Array.isArray(parsed.friendRequests)) db.friendRequests = parsed.friendRequests;
      if (parsed.meta && typeof parsed.meta === "object") db.meta = parsed.meta;
      if (Array.isArray(parsed.giftEvents)) db.giftEvents = parsed.giftEvents;
      if (parsed.monthlyBonusPool && typeof parsed.monthlyBonusPool === "object") db.monthlyBonusPool = parsed.monthlyBonusPool;
      if (parsed.weeklyChampion && typeof parsed.weeklyChampion === "object") db.weeklyChampion = parsed.weeklyChampion;
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

if (!db.meta || typeof db.meta !== "object") db.meta = {};
if (!Array.isArray(db.giftEvents)) db.giftEvents = [];
if (!db.monthlyBonusPool || typeof db.monthlyBonusPool !== "object") db.monthlyBonusPool = {};
if (db.weeklyChampion === undefined) db.weeklyChampion = null;

// Toshkent vaqti (UTC+5) bo'yicha oylik kalit (YYYY-MM)
function getTashkentMonthKey(nowMs = Date.now()) {
  const d = new Date(nowMs + (5 * 60 * 60 * 1000));
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// Oylik 5-Sovg'a Global Fondi (db.monthlyBonusPool)
function getMonthlyBonusPool(nowMs = Date.now()) {
  if (!db.monthlyBonusPool || typeof db.monthlyBonusPool !== "object") {
    db.monthlyBonusPool = {};
  }
  const monthKey = getTashkentMonthKey(nowMs);
  let pool = db.monthlyBonusPool[monthKey];
  if (!pool) {
    const [yearStr, monthStr] = monthKey.split("-");
    const year = parseInt(yearStr, 10);
    const monthIdx = parseInt(monthStr, 10) - 1; // 0..11
    const days = [1, 7, 13, 19, 25];
    // 5 ta slotReleaseTimes oyning 1-, 7-, 13-, 19-, 25-kunlari (UTC+5 00:00 + 0..6 soat tasodifiy siljish)
    const slotReleaseTimes = days.map(d => {
      const baseUtcMs = Date.UTC(year, monthIdx, d, 0, 0, 0) - (5 * 60 * 60 * 1000);
      const jitterMs = Math.floor(Math.random() * (6 * 60 * 60 * 1000));
      return baseUtcMs + jitterMs;
    });

    pool = {
      monthKey,
      maxGifts: 5,
      claimedCount: 0,
      winners: [], // [{ playerId, name, giftId, uid, wonAt }]
      totalSpins: 0,
      slotReleaseTimes
    };
    db.monthlyBonusPool[monthKey] = pool;
    saveDb();
  }
  if (!Array.isArray(pool.winners)) pool.winners = [];
  if (!Array.isArray(pool.slotReleaseTimes)) pool.slotReleaseTimes = [];
  if (typeof pool.claimedCount !== "number") pool.claimedCount = pool.winners.length;
  if (typeof pool.totalSpins !== "number") pool.totalSpins = 0;
  return pool;
}

if (!db.meta.gemsResetV1) {
  Object.values(db.players || {}).forEach(p => {
    if (!p.userStats) p.userStats = {};
    p.userStats.gems = 0;
    if (!Array.isArray(p.userStats.gifts)) p.userStats.gifts = [];
    p.userStats.prestige = computePrestigeFromGifts(p.userStats.gifts);
  });
  db.meta.gemsResetV1 = true;
  saveDb();
  console.log("[MIGRATION] gemsResetV1: Barcha oyinchilar kristali 0 ga tushirildi.");
}

if (!db.meta.cleanGhostSardorV1) {
  const ghostP = db.players["DOOM-4886"];
  const isGhost = !ghostP || !ghostP.tgId;
  if (isGhost) {
    Object.values(db.players || {}).forEach(p => {
      if (Array.isArray(p.savedFriends)) {
        p.savedFriends = p.savedFriends.filter(f => String(f.id || '').toUpperCase() !== "DOOM-4886");
      }
    });
  }
  db.meta.cleanGhostSardorV1 = true;
  saveDb();
  console.log("[MIGRATION] cleanGhostSardorV1: DOOM-4886 barcha savedFriends dan tozalandi.");
}

function ensurePlayerEconomy(p) {
  if (!p) return;
  if (!p.userStats || typeof p.userStats !== "object") p.userStats = {};
  p.userStats.gems = Math.max(0, Math.floor(Number(p.userStats.gems) || 0));
  if (!Array.isArray(p.userStats.gifts)) p.userStats.gifts = [];
  p.userStats.gifts.forEach(g => {
    if (g && typeof g === "object" && !g.uid) {
      g.uid = makeGiftUid();
    }
  });
  if (p.userStats.gifts.length > 500) p.userStats.gifts = p.userStats.gifts.slice(-500);
  p.userStats.prestige = computePrestigeFromGifts(p.userStats.gifts);
}

function findPlayerByAnyQuery(rawQuery) {
  if (!rawQuery) return null;
  const q = String(rawQuery).trim();
  if (!q) return null;

  const up = q.toUpperCase();
  if (db.players[up]) return db.players[up];

  const playersList = Object.values(db.players || {});

  const byTgId = playersList.find(p => String(p.tgId || "") === q);
  if (byTgId) return byTgId;

  const cleanUser = q.replace(/^@/, "").toLowerCase();
  if (cleanUser) {
    const byUser = playersList.find(p => String(p.username || "").replace(/^@/, "").toLowerCase() === cleanUser);
    if (byUser) return byUser;
  }

  if (/^\d{4}$/.test(q)) {
    if (db.players["DOOM-" + q]) return db.players["DOOM-" + q];
    const byLast4 = playersList.find(p => String(p.id || "").toUpperCase().endsWith("-" + q));
    if (byLast4) return byLast4;
  }

  const byId = playersList.find(p => String(p.id || "").toLowerCase() === q.toLowerCase());
  if (byId) return byId;

  return null;
}

function makeGiftUid() {
  return "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTashkentWeekKey(ts = Date.now()) {
  const d = new Date(ts + 5 * 3600 * 1000);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getTashkentMonthKey(ts = Date.now()) {
  const d = new Date(ts + 5 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeUserStats(s) {
  const st = (s && typeof s === 'object') ? s : {};
  const matches5v5 = Math.max(Number(st.matches5v5) || 0, Number(st.botMatches) || 0);
  const matchesOnline = Math.max(Number(st.matchesOnline) || 0, Number(st.lobbyMatches) || 0);
  const kills = Math.max(Number(st.kills) || 0, Number(st.totalKills) || 0);
  const headshots = Math.max(Number(st.headshots) || 0, Number(st.totalHS) || 0);
  const elo = Number(st.elo) || 1000;
  const botLevel = Number(st.botLevel) || 1;
  return {
    elo,
    botLevel,
    matches5v5,
    matchesOnline,
    totalMatches: matches5v5 + matchesOnline,
    kills,
    headshots
  };
}

function getLeagueInfo(elo) {
  const e = Number(elo) || 1000;
  if (e >= 2300) return { id: 'legend', name: 'Afsona', icon: '👑', min: 2300, next: null };
  if (e >= 1950) return { id: 'master', name: 'Master', icon: '🔥', min: 1950, next: 2300 };
  if (e >= 1650) return { id: 'diamond', name: 'Olmos', icon: '💎', min: 1650, next: 1950 };
  if (e >= 1400) return { id: 'platinum', name: 'Platina', icon: '💠', min: 1400, next: 1650 };
  if (e >= 1200) return { id: 'gold', name: 'Oltin', icon: '🥇', min: 1200, next: 1400 };
  if (e >= 1050) return { id: 'silver', name: 'Kumush', icon: '🥈', min: 1050, next: 1200 };
  return { id: 'bronze', name: 'Bronza', icon: '🥉', min: 800, next: 1050 };
}

function computePlayerPowerScore(player) {
  const n = normalizeUserStats(player && player.userStats);
  const hsRate = n.kills > 0 ? Math.min(100, Math.round((n.headshots / n.kills) * 100)) : 0;
  const kpm = n.totalMatches > 0 ? Number((n.kills / n.totalMatches).toFixed(1)) : 0;
  const powerScore = Math.round(n.elo + (n.totalMatches * 30) + (n.kills * 4) + (n.headshots * 10) + Math.max(0, n.botLevel - 1) * 15);
  const level = Math.max(1, Math.floor((n.elo - 800) / 25) + 1);
  const isOnline = (Date.now() - Number((player && (player.lastSeenAt || player.updatedAt)) || 0)) < 90000;
  const league = getLeagueInfo(n.elo);
  return {
    elo: n.elo,
    level,
    matches5v5: n.matches5v5,
    matchesOnline: n.matchesOnline,
    totalMatches: n.totalMatches,
    kills: n.kills,
    headshots: n.headshots,
    hsRate,
    kpm,
    powerScore,
    isOnline,
    league
  };
}

function getTashkentNextMondayMs(now = Date.now()) {
  const tzOffset = 5 * 3600 * 1000;
  const d = new Date(now + tzOffset);
  const day = d.getUTCDay(); // 0=Yak, 1=Dush..6=Shan
  const daysUntilMon = day === 0 ? 1 : (8 - day);
  const nextMonUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMon, 0, 0, 0, 0);
  return nextMonUtc - tzOffset;
}

function sanitizeWeaponStatsMap(ws) {
  const out = {};
  if (!ws || typeof ws !== "object") return out;
  const keys = Object.keys(ws).slice(0, 8);
  for (const k of keys) {
    const cleanName = String(k || "").trim().slice(0, 40);
    if (!cleanName) continue;
    const v = ws[k];
    if (!v || typeof v !== "object") continue;
    const shots = Math.max(0, Math.floor(Number(v.shots) || 0));
    const kills = Math.max(0, Math.floor(Number(v.kills) || 0));
    if (shots > 0 || kills > 0) {
      out[cleanName] = { shots, kills };
    }
  }
  return out;
}

function mergeWeaponStats(oldWs, newWs) {
  const prev = sanitizeWeaponStatsMap(oldWs);
  const next = sanitizeWeaponStatsMap(newWs);
  const merged = Object.assign({}, prev);
  for (const [k, v] of Object.entries(next)) {
    if (!merged[k]) {
      merged[k] = { shots: v.shots, kills: v.kills };
    } else {
      merged[k] = {
        shots: Math.max(merged[k].shots || 0, v.shots || 0),
        kills: Math.max(merged[k].kills || 0, v.kills || 0)
      };
    }
  }
  const entries = Object.entries(merged)
    .sort((a, b) => ((b[1].kills * 25 + b[1].shots) - (a[1].kills * 25 + a[1].shots)))
    .slice(0, 8);
  return Object.fromEntries(entries);
}

function getPlayerFavoriteWeapon(player) {
  const ws = player && player.userStats && player.userStats.weaponStats;
  if (!ws || typeof ws !== "object") {
    return { name: "M4A1-S AVTOMAT", kills: 0, shots: 0 };
  }
  let best = null;
  let bestScore = -1;
  for (const [name, stat] of Object.entries(ws)) {
    if (!stat || typeof stat !== "object") continue;
    const kills = Math.max(0, Math.floor(Number(stat.kills) || 0));
    const shots = Math.max(0, Math.floor(Number(stat.shots) || 0));
    if (kills === 0 && shots === 0) continue;
    const score = (kills * 25) + shots;
    if (score > bestScore) {
      bestScore = score;
      best = { name, kills, shots };
    }
  }
  return best || { name: "M4A1-S AVTOMAT", kills: 0, shots: 0 };
}

function ensureWeeklyChampionLocked(now = Date.now()) {
  const currentWeekKey = getTashkentWeekKey(now);
  const prevWeekKey = getTashkentWeekKey(now - 7 * 24 * 3600 * 1000);

  if (
    db.weeklyChampion &&
    db.weeklyChampion.displayWeekKey === currentWeekKey &&
    db.weeklyChampion.playerId &&
    db.players[db.weeklyChampion.playerId]
  ) {
    return db.weeklyChampion;
  }

  const allPlayers = Object.values(db.players || {});
  if (allPlayers.length === 0) return null;

  const getPrestige = (p) => Number((p.userStats && p.userStats.prestige) || computePrestigeFromGifts(p.userStats && p.userStats.gifts) || 0);

  // 1-ustuvorlik: yakunlangan hafta (prevWeekKey)
  const prevCandidates = [];
  for (const p of allPlayers) {
    const ps = p.periodStats || {};
    let ws = null;
    if (ps.weekKey === prevWeekKey && ps.week) ws = ps.week;
    else if (ps.lastWeekKey === prevWeekKey && ps.lastWeek) ws = ps.lastWeek;
    if (ws && Number(ws.power) > 0) {
      prevCandidates.push({ p, ws, all: computePlayerPowerScore(p), prestige: getPrestige(p) });
    }
  }

  let winnerEntry = null;
  let earnedWeekKey = currentWeekKey;
  let mode = "overall_fallback";
  let weekStats = { matches: 0, kills: 0, headshots: 0, eloGain: 0, power: 0 };

  if (prevCandidates.length > 0) {
    prevCandidates.sort((a, b) =>
      ((Number(b.ws.power) || 0) - (Number(a.ws.power) || 0)) ||
      ((Number(b.ws.kills) || 0) - (Number(a.ws.kills) || 0)) ||
      ((Number(b.ws.headshots) || 0) - (Number(a.ws.headshots) || 0)) ||
      (b.all.elo - a.all.elo) ||
      (b.prestige - a.prestige)
    );
    winnerEntry = prevCandidates[0];
    earnedWeekKey = prevWeekKey;
    mode = "prev_week";
    weekStats = {
      matches: Number(winnerEntry.ws.matches) || 0,
      kills: Number(winnerEntry.ws.kills) || 0,
      headshots: Number(winnerEntry.ws.headshots) || 0,
      eloGain: Number(winnerEntry.ws.eloGain) || 0,
      power: Number(winnerEntry.ws.power) || 0
    };
  } else {
    // 2-ustuvorlik: joriy hafta (currentWeekKey)
    const curCandidates = [];
    for (const p of allPlayers) {
      const ps = p.periodStats || {};
      if (ps.weekKey === currentWeekKey && ps.week && Number(ps.week.power) > 0) {
        curCandidates.push({ p, ws: ps.week, all: computePlayerPowerScore(p), prestige: getPrestige(p) });
      }
    }
    if (curCandidates.length > 0) {
      curCandidates.sort((a, b) =>
        ((Number(b.ws.power) || 0) - (Number(a.ws.power) || 0)) ||
        ((Number(b.ws.kills) || 0) - (Number(a.ws.kills) || 0)) ||
        ((Number(b.ws.headshots) || 0) - (Number(a.ws.headshots) || 0)) ||
        (b.all.elo - a.all.elo) ||
        (b.prestige - a.prestige)
      );
      winnerEntry = curCandidates[0];
      earnedWeekKey = currentWeekKey;
      mode = "current_week";
      weekStats = {
        matches: Number(winnerEntry.ws.matches) || 0,
        kills: Number(winnerEntry.ws.kills) || 0,
        headshots: Number(winnerEntry.ws.headshots) || 0,
        eloGain: Number(winnerEntry.ws.eloGain) || 0,
        power: Number(winnerEntry.ws.power) || 0
      };
    } else {
      // 3-ustuvorlik: umumiy eng kuchli o'yinchi
      const overallCandidates = allPlayers.map(p => ({
        p,
        all: computePlayerPowerScore(p),
        prestige: getPrestige(p)
      }));
      overallCandidates.sort((a, b) =>
        (b.all.powerScore - a.all.powerScore) ||
        (b.all.elo - a.all.elo) ||
        (b.prestige - a.prestige) ||
        (b.all.kills - a.all.kills)
      );
      winnerEntry = overallCandidates[0];
      earnedWeekKey = currentWeekKey;
      mode = "overall_fallback";
      weekStats = {
        matches: winnerEntry.all.totalMatches,
        kills: winnerEntry.all.kills,
        headshots: winnerEntry.all.headshots,
        eloGain: 0,
        power: winnerEntry.all.powerScore
      };
    }
  }

  db.weeklyChampion = {
    displayWeekKey: currentWeekKey,
    earnedWeekKey,
    mode,
    playerId: winnerEntry.p.id,
    weekStats,
    lockedAt: now,
    nextResetAt: getTashkentNextMondayMs(now)
  };
  saveDb();
  return db.weeklyChampion;
}

function updatePlayerPeriodStats(player, prevNorm, nextNorm) {
  if (!player) return;
  const now = Date.now();
  const wk = getTashkentWeekKey(now);
  const mk = getTashkentMonthKey(now);
  if (!player.periodStats || typeof player.periodStats !== 'object') {
    player.periodStats = {};
  }
  const ps = player.periodStats;
  if (ps.weekKey && ps.weekKey !== wk && ps.week) {
    ps.lastWeekKey = ps.weekKey;
    ps.lastWeek = { ...ps.week };
    ensureWeeklyChampionLocked(now);
    ps.weekKey = wk;
    ps.week = { matches: 0, kills: 0, headshots: 0, eloGain: 0, power: 0 };
  } else if (ps.weekKey !== wk || !ps.week) {
    ps.weekKey = wk;
    ps.week = { matches: 0, kills: 0, headshots: 0, eloGain: 0, power: 0 };
  }
  if (ps.monthKey !== mk || !ps.month) {
    ps.monthKey = mk;
    ps.month = { matches: 0, kills: 0, headshots: 0, eloGain: 0, power: 0 };
  }

  const dMatches = Math.max(0, nextNorm.totalMatches - prevNorm.totalMatches);
  const dKills = Math.max(0, nextNorm.kills - prevNorm.kills);
  const dHs = Math.max(0, nextNorm.headshots - prevNorm.headshots);
  const dElo = Math.max(0, nextNorm.elo - prevNorm.elo);

  if (dMatches > 0 || dKills > 0 || dHs > 0 || dElo > 0) {
    const dPower = Math.round((dElo * 2) + (dMatches * 30) + (dKills * 5) + (dHs * 12));
    ps.week.matches += dMatches;
    ps.week.kills += dKills;
    ps.week.headshots += dHs;
    ps.week.eloGain += dElo;
    ps.week.power += dPower;

    ps.month.matches += dMatches;
    ps.month.kills += dKills;
    ps.month.headshots += dHs;
    ps.month.eloGain += dElo;
    ps.month.power += dPower;
  }
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

  // SERVER-AUTHORITATIVE KRISTAL VA SOVG'ALAR HIMOYA QALQONI:
  const safeClientStats = (userStats && typeof userStats === "object") ? Object.assign({}, userStats) : null;
  if (safeClientStats) {
    delete safeClientStats.gems;
    delete safeClientStats.gifts;
    delete safeClientStats.prestige;
    delete safeClientStats.giftSummary;
  }

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
          gems: 0,
          prestige: 0,
          gifts: [],
          elo: 1000,
          botLevel: 1,
          kills: 0,
          headshots: 0,
          matches5v5: 0,
          matchesOnline: 0,
          ownedSkins: ["classic"],
          equippedSkinId: "classic",
          weaponStats: {}
        }, oldP.userStats || {}, (safeClientStats && !initLoad) ? safeClientStats : {}),
        blockedUsersMap: Object.assign({}, oldP.blockedUsersMap || {}, blockedUsersMap || {}),
        savedFriends: Array.isArray(savedFriends) ? savedFriends : (oldP.savedFriends || []),
        createdAt: oldP.createdAt || Date.now(),
        updatedAt: Date.now(),
        lastSeenAt: Date.now()
      };
      merged.userStats.weaponStats = mergeWeaponStats(oldP.userStats && oldP.userStats.weaponStats, (safeClientStats && !initLoad) ? safeClientStats.weaponStats : null);
      ensurePlayerEconomy(merged);
      db.players[pid] = merged;
      saveDb();
      return res.json({ ok: true, player: merged, giftSummary: summarizeGifts(merged.userStats.gifts) });
    }

    // Yangi o'yinchi: boshlang'ich tangalar va kristallar: 0!
    const newPlayer = {
      id: pid,
      tgId: myProfile.tgId || null,
      name: myProfile.name || "Player",
      username: myProfile.username || "",
      photoUrl: myProfile.photoUrl || "",
      userStats: {
        coins: 0,
        gems: 0,
        prestige: 0,
        gifts: [],
        elo: 1000,
        botLevel: 1,
        kills: 0,
        headshots: 0,
        matches5v5: 0,
        matchesOnline: 0,
        ownedSkins: ["classic"],
        equippedSkinId: "classic",
        weaponStats: {}
      },
      blockedUsersMap: {},
      savedFriends: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSeenAt: Date.now()
    };
    if (safeClientStats && !initLoad) {
      newPlayer.userStats = Object.assign({}, newPlayer.userStats, safeClientStats);
    }
    newPlayer.userStats.weaponStats = mergeWeaponStats(null, (safeClientStats && !initLoad) ? safeClientStats.weaponStats : null);
    ensurePlayerEconomy(newPlayer);
    db.players[pid] = newPlayer;
    saveDb();
    return res.json({ ok: true, player: newPlayer, giftSummary: summarizeGifts(newPlayer.userStats.gifts) });
  }

  // Mavjud o'yinchi
  existing.name = myProfile.name || existing.name;
  existing.username = myProfile.username || existing.username || "";
  existing.tgId = myProfile.tgId || existing.tgId || null;
  existing.photoUrl = myProfile.photoUrl || existing.photoUrl || "";
  existing.lastSeenAt = Date.now();

  // Agar initLoad === true bo'lsa, bazadagi saqlangan statistikani 0 bilan ezib yubormaymiz!
  if (!initLoad && safeClientStats) {
    const prevNorm = normalizeUserStats(existing.userStats);
    const prevWeaponStats = existing.userStats && existing.userStats.weaponStats;
    existing.userStats = Object.assign({}, existing.userStats, safeClientStats);
    existing.userStats.weaponStats = mergeWeaponStats(prevWeaponStats, safeClientStats.weaponStats);
    const nextNorm = normalizeUserStats(existing.userStats);
    existing.userStats.kills = nextNorm.kills;
    existing.userStats.totalKills = nextNorm.kills;
    existing.userStats.headshots = nextNorm.headshots;
    existing.userStats.totalHS = nextNorm.headshots;
    existing.userStats.matches5v5 = nextNorm.matches5v5;
    existing.userStats.botMatches = nextNorm.matches5v5;
    existing.userStats.matchesOnline = nextNorm.matchesOnline;
    existing.userStats.lobbyMatches = nextNorm.matchesOnline;
    existing.updatedAt = Date.now();
    updatePlayerPeriodStats(existing, prevNorm, nextNorm);
  } else if (existing.userStats) {
    existing.userStats.weaponStats = sanitizeWeaponStatsMap(existing.userStats.weaponStats);
  }

  if (blockedUsersMap && typeof blockedUsersMap === "object") {
    existing.blockedUsersMap = Object.assign({}, existing.blockedUsersMap, blockedUsersMap);
  }
  // savedFriends 100% server-authoritative — klientdan kelgan savedFriends mavjud o'yinchiga qo'shilmaydi!

  ensurePlayerEconomy(existing);
  saveDb();
  return res.json({ ok: true, player: existing, giftSummary: summarizeGifts(existing.userStats.gifts) });
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
  if (!myId) return res.json({ requests: [], giftEvents: [] });

  const myPlayer = db.players[myId];
  const blockedMap = (myPlayer && myPlayer.blockedUsersMap) ? myPlayer.blockedUsersMap : {};
  const now = Date.now();

  const pending = db.friendRequests.filter(r => {
    if (r.toId !== myId || r.status !== "pending") return false;
    if (blockedMap[r.fromId] && blockedMap[r.fromId] > now) return false;
    return true;
  });

  const enriched = pending.map(r => {
    const sp = db.players[String(r.fromId || "").trim().toUpperCase()] || null;
    const st = (sp && sp.userStats) || {};
    const totalKills = Number(st.kills || st.totalKills || 0);
    const totalMatches = Number(st.matches5v5 || st.botMatches || 0) + Number(st.matchesOnline || st.lobbyMatches || 0);
    const calcLv = Math.max(1, Number((sp && sp.level) || st.level || (Math.floor(totalKills / 4) + Math.floor(totalMatches / 2) + 1)));
    const photoUrl = (sp && (sp.photoUrl || st.photoUrl)) || r.fromPhotoUrl || "";
    const realName = (sp && sp.name) || r.fromName || "O'yinchi";
    return Object.assign({}, r, {
      fromName: realName,
      fromPhotoUrl: photoUrl,
      fromLevel: calcLv,
      fromElo: Number((sp && sp.elo) || st.elo || r.fromElo || 1000)
    });
  });

  const unDeliveredGifts = (db.giftEvents || []).filter(e => e.toId === myId && !e.delivered);
  unDeliveredGifts.forEach(e => { e.delivered = true; });
  if (unDeliveredGifts.length > 0) saveDb();

  return res.json({ requests: enriched, giftEvents: unDeliveredGifts });
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
    ensurePlayerEconomy(p);
    const score = computePlayerPowerScore(p);
    const gList = Array.isArray(p.userStats && p.userStats.gifts) ? p.userStats.gifts : [];
    const gSum = summarizeGifts(gList);
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
      prestige: Number((p.userStats && p.userStats.prestige) || computePrestigeFromGifts(gList) || 0),
      giftTotalCount: gSum.totalCount,
      topGifts: gSum.topGifts,
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
      ensurePlayerEconomy(p);
      const score = computePlayerPowerScore(p);
      const gList = Array.isArray(p.userStats && p.userStats.gifts) ? p.userStats.gifts : [];
      const gSum = summarizeGifts(gList);
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
        prestige: Number((p.userStats && p.userStats.prestige) || computePrestigeFromGifts(gList) || 0),
        giftTotalCount: gSum.totalCount,
        topGifts: gSum.topGifts,
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
      prestige: (sf && sf.prestige) || 0,
      giftTotalCount: (sf && sf.giftTotalCount) || 0,
      topGifts: (sf && sf.topGifts) || [],
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

// 5D) 3D iOS Glass Jonli Reyting va Chempionlar (/api/tg/leaderboard)
app.get('/api/tg/leaderboard', (req, res) => {
  const myId = String(req.query.myId || '').trim().toUpperCase();
  const period = String(req.query.period || 'all').trim().toLowerCase();
  const category = String(req.query.category || 'overall').trim().toLowerCase();

  const now = Date.now();
  const wk = getTashkentWeekKey(now);
  const mk = getTashkentMonthKey(now);
  const myObj = db.players[myId] || null;
  const myFriendIds = new Set(((myObj && myObj.savedFriends) || []).map(f => String(f.id || '').toUpperCase()));

  const allPlayers = Object.values(db.players).map(p => {
    const all = computePlayerPowerScore(p);
    const ps = (p.periodStats && typeof p.periodStats === 'object') ? p.periodStats : {};
    const hasLiveWeek = (ps.weekKey === wk && ps.week && Number(ps.week.power) > 0);
    const hasLiveMonth = (ps.monthKey === mk && ps.month && Number(ps.month.power) > 0);
    const lastAct = Number(p.lastSeenAt || p.updatedAt || p.createdAt || 0);
    const active7d = (now - lastAct) <= 7 * 24 * 3600 * 1000;
    const active30d = (now - lastAct) <= 30 * 24 * 3600 * 1000;
    const w = hasLiveWeek ? ps.week : null;
    const m = hasLiveMonth ? ps.month : null;
    const isSelf = (p.id === myId);
    const isFriend = myFriendIds.has(p.id);

    return {
      id: p.id,
      name: p.name || p.id,
      username: p.username || '',
      photoUrl: p.photoUrl || '',
      all,
      ps,
      w,
      m,
      hasLiveWeek,
      hasLiveMonth,
      active7d,
      active30d,
      isSelf,
      isFriend,
      lastAct
    };
  });

  const anyLiveWeek = allPlayers.some(p => p.hasLiveWeek);
  const anyLiveMonth = allPlayers.some(p => p.hasLiveMonth);
  const weeklyMode = anyLiveWeek ? 'live' : 'active7d';
  const monthlyMode = anyLiveMonth ? 'live' : 'active30d';

  // Haftalik MVP
  let weeklyMvp = null;
  if (anyLiveWeek) {
    const sortedWeek = allPlayers.filter(p => p.hasLiveWeek).sort((a, b) => {
      if (b.w.power !== a.w.power) return b.w.power - a.w.power;
      return b.all.powerScore - a.all.powerScore;
    });
    if (sortedWeek.length > 0) {
      const topW = sortedWeek[0];
      weeklyMvp = {
        id: topW.id,
        name: topW.name,
        username: topW.username,
        photoUrl: topW.photoUrl,
        isOnline: topW.all.isOnline,
        level: topW.all.level,
        league: topW.all.league,
        metricPower: topW.w.power,
        metricKills: topW.w.kills,
        metricMatches: topW.w.matches,
        mode: 'live'
      };
    }
  }
  if (!weeklyMvp) {
    const act7 = allPlayers.filter(p => p.active7d).sort((a, b) => b.all.powerScore - a.all.powerScore);
    const topW = act7.length > 0 ? act7[0] : (allPlayers.slice().sort((a, b) => b.all.powerScore - a.all.powerScore)[0] || null);
    if (topW) {
      weeklyMvp = {
        id: topW.id,
        name: topW.name,
        username: topW.username,
        photoUrl: topW.photoUrl,
        isOnline: topW.all.isOnline,
        level: topW.all.level,
        league: topW.all.league,
        metricPower: topW.all.powerScore,
        metricKills: topW.all.kills,
        metricMatches: topW.all.totalMatches,
        mode: 'active7d'
      };
    }
  }

  // Oylik MVP
  let monthlyMvp = null;
  if (anyLiveMonth) {
    const sortedMonth = allPlayers.filter(p => p.hasLiveMonth).sort((a, b) => {
      if (b.m.power !== a.m.power) return b.m.power - a.m.power;
      return b.all.powerScore - a.all.powerScore;
    });
    if (sortedMonth.length > 0) {
      const topM = sortedMonth[0];
      monthlyMvp = {
        id: topM.id,
        name: topM.name,
        username: topM.username,
        photoUrl: topM.photoUrl,
        isOnline: topM.all.isOnline,
        level: topM.all.level,
        league: topM.all.league,
        metricPower: topM.m.power,
        metricKills: topM.m.kills,
        metricMatches: topM.m.matches,
        mode: 'live'
      };
    }
  }
  if (!monthlyMvp) {
    const act30 = allPlayers.filter(p => p.active30d).sort((a, b) => b.all.powerScore - a.all.powerScore);
    const topM = act30.length > 0 ? act30[0] : (allPlayers.slice().sort((a, b) => b.all.powerScore - a.all.powerScore)[0] || null);
    if (topM) {
      monthlyMvp = {
        id: topM.id,
        name: topM.name,
        username: topM.username,
        photoUrl: topM.photoUrl,
        isOnline: topM.all.isOnline,
        level: topM.all.level,
        league: topM.all.league,
        metricPower: topM.all.powerScore,
        metricKills: topM.all.kills,
        metricMatches: topM.all.totalMatches,
        mode: 'active30d'
      };
    }
  }

  // Tanlangan period va category bo'yicha filtrlash va metrikalarni hisoblash
  let pool = allPlayers;
  if (category === 'friends') {
    pool = allPlayers.filter(p => p.isSelf || p.isFriend);
  }

  const entries = pool.map(p => {
    let metricPower, metricKills, metricHeadshots, metricMatches, elo, hsRate, kpm;

    if (period === 'week' && anyLiveWeek) {
      const pw = p.w || { power: 0, kills: 0, headshots: 0, matches: 0 };
      metricPower = pw.power;
      metricKills = pw.kills;
      metricHeadshots = pw.headshots;
      metricMatches = pw.matches;
      elo = p.all.elo;
      hsRate = pw.kills > 0 ? Math.min(100, Math.round((pw.headshots / pw.kills) * 100)) : 0;
      kpm = pw.matches > 0 ? Number((pw.kills / pw.matches).toFixed(1)) : 0;
    } else if (period === 'month' && anyLiveMonth) {
      const pm = p.m || { power: 0, kills: 0, headshots: 0, matches: 0 };
      metricPower = pm.power;
      metricKills = pm.kills;
      metricHeadshots = pm.headshots;
      metricMatches = pm.matches;
      elo = p.all.elo;
      hsRate = pm.kills > 0 ? Math.min(100, Math.round((pm.headshots / pm.kills) * 100)) : 0;
      kpm = pm.matches > 0 ? Number((pm.kills / pm.matches).toFixed(1)) : 0;
    } else {
      metricPower = p.all.powerScore;
      metricKills = p.all.kills;
      metricHeadshots = p.all.headshots;
      metricMatches = p.all.totalMatches;
      elo = p.all.elo;
      hsRate = p.all.hsRate;
      kpm = p.all.kpm;
    }

    return {
      id: p.id,
      name: p.name,
      username: p.username,
      photoUrl: p.photoUrl,
      isOnline: p.all.isOnline,
      level: p.all.level,
      league: p.all.league,
      elo,
      isSelf: p.isSelf,
      isFriend: p.isFriend,
      metricPower,
      metricKills,
      metricHeadshots,
      metricMatches,
      hsRate,
      kpm,
      prestige: (db.players[p.id] && db.players[p.id].prestige) || 0,
      giftTotalCount: (db.players[p.id] && db.players[p.id].giftSummary && db.players[p.id].giftSummary.totalCount) || (db.players[p.id] && Array.isArray(db.players[p.id].gifts) ? db.players[p.id].gifts.length : 0),
      topGifts: (db.players[p.id] && db.players[p.id].giftSummary && db.players[p.id].giftSummary.topGifts) || []
    };
  });

  // Saralash
  entries.sort((a, b) => {
    if (category === 'kills') {
      if (b.metricKills !== a.metricKills) return b.metricKills - a.metricKills;
      if (b.metricPower !== a.metricPower) return b.metricPower - a.metricPower;
      return b.elo - a.elo;
    }
    if (category === 'headshots') {
      if (b.metricHeadshots !== a.metricHeadshots) return b.metricHeadshots - a.metricHeadshots;
      if (b.hsRate !== a.hsRate) return b.hsRate - a.hsRate;
      return b.metricKills - a.metricKills;
    }
    if (category === 'matches') {
      if (b.metricMatches !== a.metricMatches) return b.metricMatches - a.metricMatches;
      if (b.metricPower !== a.metricPower) return b.metricPower - a.metricPower;
      return b.elo - a.elo;
    }
    // overall yoki friends
    if (b.metricPower !== a.metricPower) return b.metricPower - a.metricPower;
    if (b.elo !== a.elo) return b.elo - a.elo;
    return b.metricKills - a.metricKills;
  });

  entries.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  let myEntry = entries.find(e => e.isSelf) || null;
  if (!myEntry && myObj) {
    const myAll = computePlayerPowerScore(myObj);
    myEntry = {
      id: myObj.id,
      name: myObj.name || myObj.id,
      username: myObj.username || '',
      photoUrl: myObj.photoUrl || '',
      isOnline: true,
      level: myAll.level,
      league: myAll.league,
      elo: myAll.elo,
      rank: entries.length + 1,
      isSelf: true,
      isFriend: false,
      metricPower: myAll.powerScore,
      metricKills: myAll.kills,
      metricHeadshots: myAll.headshots,
      metricMatches: myAll.totalMatches,
      hsRate: myAll.hsRate,
      kpm: myAll.kpm,
      prestige: myObj.prestige || 0,
      giftTotalCount: (myObj.giftSummary && myObj.giftSummary.totalCount) || (Array.isArray(myObj.gifts) ? myObj.gifts.length : 0),
      topGifts: (myObj.giftSummary && myObj.giftSummary.topGifts) || []
    };
  }

  return res.json({
    ok: true,
    weekKey: wk,
    monthKey: mk,
    period,
    category,
    weeklyMode,
    monthlyMode,
    totalPlayers: entries.length,
    weeklyMvp,
    monthlyMvp,
    myEntry,
    list: entries.slice(0, 100)
  });
});

// 5D-2) 👑 Hafta Chempioni (Har Dushanba 00:00 UTC+5 da qulflanadigan #1 o'yinchi vitrinasi)
app.get('/api/tg/weekly-champion', (req, res) => {
  const now = Date.now();
  const cleanMyId = String(req.query.myId || '').trim().toUpperCase();
  const lock = ensureWeeklyChampionLocked(now);
  if (!lock || !lock.playerId || !db.players[lock.playerId]) {
    return res.json({ ok: true, champion: null });
  }

  const p = db.players[lock.playerId];
  ensurePlayerEconomy(p);
  const score = computePlayerPowerScore(p);

  const rankedAll = Object.values(db.players || {}).map(x => {
    const sx = computePlayerPowerScore(x);
    return {
      id: x.id,
      powerScore: sx.powerScore,
      totalMatches: sx.totalMatches,
      elo: sx.elo,
      lastSeenAt: Number(x.lastSeenAt || x.updatedAt || x.createdAt || 0)
    };
  });
  rankedAll.sort((a, b) =>
    (b.powerScore - a.powerScore) ||
    (b.totalMatches - a.totalMatches) ||
    (b.elo - a.elo) ||
    (b.lastSeenAt - a.lastSeenAt)
  );
  const rankIdx = rankedAll.findIndex(x => x.id === p.id);
  const globalRank = rankIdx >= 0 ? (rankIdx + 1) : 1;
  const totalPlayers = rankedAll.length;

  const favWep = getPlayerFavoriteWeapon(p);
  const ps = (p.periodStats && typeof p.periodStats === 'object') ? p.periodStats : {};
  let weekStats = Object.assign({ matches: 0, kills: 0, headshots: 0, eloGain: 0, power: 0 }, lock.weekStats || {});
  if (lock.mode === 'current_week' && ps.weekKey === lock.displayWeekKey && ps.week) {
    weekStats = {
      matches: Number(ps.week.matches) || 0,
      kills: Number(ps.week.kills) || 0,
      headshots: Number(ps.week.headshots) || 0,
      eloGain: Number(ps.week.eloGain) || 0,
      power: Number(ps.week.power) || 0
    };
  }

  const myObj = cleanMyId ? (db.players[cleanMyId] || null) : null;
  const myFriendIds = new Set(((myObj && myObj.savedFriends) || []).map(f => String(f.id || '').toUpperCase()));
  const isSelf = cleanMyId !== '' && p.id === cleanMyId;
  const isFriend = myFriendIds.has(p.id);
  const hasPendingReq = !isSelf && !isFriend && cleanMyId
    ? db.friendRequests.some(r => r.fromId === cleanMyId && r.toId === p.id && r.status === 'pending')
    : false;

  const countsMap = {};
  for (const item of (p.userStats.gifts || [])) {
    if (!item || !item.giftId) continue;
    const gid = String(item.giftId).trim();
    if (!countsMap[gid]) {
      const cat = getGiftById(gid);
      const prestige = Number((cat && cat.prestige) || item.prestige || 0);
      countsMap[gid] = {
        giftId: gid,
        name: (cat && cat.name) || item.giftName || "Sovg'a",
        icon: (cat && cat.icon) || '🎁',
        category: (cat && cat.category) || 'coins',
        currency: (cat && cat.currency) || 'coins',
        rarity: (cat && cat.rarity) || item.rarity || 'common',
        prestige,
        price: Number((cat && cat.price) || 0),
        uzsPrice: Number((cat && cat.uzsPrice) || 0),
        color: (cat && cat.color) || '#f59e0b',
        glow: (cat && cat.glow) || '#fbbf24',
        desc: (cat && cat.desc) || '',
        count: 0,
        totalPrestige: 0
      };
    }
    countsMap[gid].count += 1;
    countsMap[gid].totalPrestige += countsMap[gid].prestige;
  }

  const giftsSorted = Object.values(countsMap).sort((a, b) =>
    (b.prestige - a.prestige) ||
    ((b.uzsPrice || 0) - (a.uzsPrice || 0)) ||
    ((b.price || 0) - (a.price || 0))
  );

  return res.json({
    ok: true,
    champion: {
      id: p.id,
      tgId: p.tgId || '',
      name: p.name || p.id,
      username: p.username || '',
      photoUrl: p.photoUrl || '',
      level: score.level,
      elo: score.elo,
      league: score.league,
      globalRank,
      totalPlayers,
      totalMatches: score.totalMatches,
      matches5v5: score.matches5v5,
      matchesOnline: score.matchesOnline,
      kills: score.kills,
      headshots: score.headshots,
      hsRate: score.hsRate,
      favoriteWeapon: favWep.name,
      favoriteWeaponKills: favWep.kills,
      favoriteWeaponShots: favWep.shots,
      prestige: Number(p.userStats.prestige) || 0,
      giftTotalCount: (p.userStats.gifts || []).length,
      weekStats,
      mode: lock.mode,
      isSelf,
      isFriend,
      hasPendingReq,
      giftsSorted,
      nextResetAt: getTashkentNextMondayMs(now),
      displayWeekKey: lock.displayWeekKey,
      earnedWeekKey: lock.earnedWeekKey
    }
  });
});


// ==========================================
// 5E) 3D SOVG'ALAR VA REAL KRISTAL REST API
// ==========================================

// a) Sovg'alar katalogi va Kristal narxlari
app.get("/api/tg/gifts/catalog", (req, res) => {
  res.json({ ok: true, gemsConfig: GEMS_CONFIG, gifts: GIFTS_CATALOG });
});

// b) O'yinchining sovg'alar kolleksiyasi (public - gems yashirin)
app.get("/api/tg/gifts/player/:id", (req, res) => {
  const p = findPlayerByAnyQuery(req.params.id);
  if (!p) {
    return res.status(404).json({ ok: false, error: "PLAYER_NOT_FOUND" });
  }
  ensurePlayerEconomy(p);
  const gSum = summarizeGifts(p.userStats.gifts);
  const giftList = (p.userStats.gifts || []).slice(-120).reverse();
  res.json({
    ok: true,
    gifts: giftList,
    player: {
      id: p.id,
      name: p.name || p.id,
      username: p.username || "",
      photoUrl: p.photoUrl || "",
      elo: (p.userStats && p.userStats.elo) || 1000,
      prestige: p.userStats.prestige,
      giftSummary: gSum,
      gifts: giftList
    }
  });
});

// c) Sovg'a sotib olish (o'ziga yoki boshqa o'yinchiga)
app.post("/api/tg/gifts/buy", (req, res) => {
  const { buyerId, giftId, recipientId, note } = req.body || {};
  const cleanBuyerId = String(buyerId || "").trim().toUpperCase();
  const buyer = db.players[cleanBuyerId];
  if (!buyer) {
    return res.status(404).json({ ok: false, error: "BUYER_NOT_FOUND", message: "Profil topilmadi, sahifani yangilang." });
  }
  ensurePlayerEconomy(buyer);

  const gift = getGiftById(giftId);
  if (!gift) {
    return res.status(400).json({ ok: false, error: "INVALID_GIFT" });
  }

  if (gift.category === "bonus" || gift.currency === "bonus") {
    return res.status(400).json({ ok: false, error: "BONUS_ONLY", message: "Bu sovg'ani sotib olib bo'lmaydi — faqat 3D Oltin Sandiqdan chiqadi!" });
  }

  const cleanRec = String(recipientId || "").trim().toUpperCase();
  const isSelf = !cleanRec || cleanRec === buyer.id;
  const target = isSelf ? buyer : findPlayerByAnyQuery(cleanRec);
  if (!target) {
    return res.status(404).json({ ok: false, error: "RECIPIENT_NOT_FOUND", message: "Qabul qiluvchi o'yinchi topilmadi!" });
  }
  ensurePlayerEconomy(target);

  if (gift.currency === "coins") {
    const curCoins = Number(buyer.userStats.coins) || 0;
    if (curCoins < gift.price) {
      return res.status(400).json({ ok: false, error: "NOT_ENOUGH_COINS", needed: gift.price, current: curCoins, message: "Tangalar yetarli emas!" });
    }
    buyer.userStats.coins = Math.max(0, Math.floor(curCoins - gift.price));
  } else if (gift.currency === "gems") {
    const curGems = Number(buyer.userStats.gems) || 0;
    if (curGems < gift.price) {
      return res.status(400).json({ ok: false, error: "NOT_ENOUGH_GEMS", needed: gift.price, current: curGems, message: "Kristallar yetarli emas! Admindan kristal sotib oling (1 💎 = 1,000 so'm)." });
    }
    buyer.userStats.gems = Math.max(0, Math.floor(curGems - gift.price));
  }

  const cleanNote = String(note || "").trim().slice(0, 80);
  const item = {
    uid: makeGiftUid(),
    giftId: gift.id,
    fromId: buyer.id,
    fromName: buyer.name || buyer.id,
    note: cleanNote,
    source: isSelf ? "shop_self" : "gift_received",
    acquiredAt: Date.now()
  };

  target.userStats.gifts.push(item);
  if (target.userStats.gifts.length > 500) target.userStats.gifts = target.userStats.gifts.slice(-500);
  target.userStats.prestige = computePrestigeFromGifts(target.userStats.gifts);
  buyer.userStats.prestige = computePrestigeFromGifts(buyer.userStats.gifts);
  buyer.updatedAt = Date.now();
  target.updatedAt = Date.now();

  if (!isSelf) {
    if (!Array.isArray(db.giftEvents)) db.giftEvents = [];
    db.giftEvents.push({
      id: item.uid,
      toId: target.id,
      fromId: buyer.id,
      fromName: buyer.name || buyer.id,
      giftId: gift.id,
      giftName: gift.name,
      giftIcon: gift.icon,
      prestige: gift.prestige,
      note: cleanNote,
      createdAt: Date.now(),
      delivered: false
    });

    if (target.tgId) {
      const giftMsg =
        `🎁 <b>Sizga yangi 3D sovg'a keldi!</b>\n\n` +
        `👤 Kimdan: <b>${escapeHtml(buyer.name || buyer.id)}</b> (${buyer.id})\n` +
        `${gift.icon} Sovg'a: <b>${escapeHtml(gift.name)}</b> (+${gift.prestige} Obro')\n` +
        (cleanNote ? `💬 Tilak: <i>"${escapeHtml(cleanNote)}"</i>\n\n` : '\n') +
        `👑 O'yinda umumiy Obro'ingiz oshdi! Kolleksiyani ko'rish uchun kiring:`;

      tgApiCall("sendMessage", {
        chat_id: target.tgId,
        text: giftMsg,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎁 SOVG'ALARNI KO'RISH 🎮", web_app: { url: `${APP_URL}/` } }]
          ]
        }
      }).catch(() => {});
    }
  }

  saveDb();

  return res.json({
    ok: true,
    mode: isSelf ? "self" : "gift",
    item,
    gift,
    targetName: target.name || target.id,
    buyerStats: {
      coins: buyer.userStats.coins,
      gems: buyer.userStats.gems,
      prestige: buyer.userStats.prestige,
      gifts: buyer.userStats.gifts,
      giftSummary: summarizeGifts(buyer.userStats.gifts)
    }
  });
});

// d) Mavjud sovg'ani boshqa o'yinchiga hadya qilish (transfer)
app.post("/api/tg/gifts/transfer", (req, res) => {
  const { fromId, toId, giftUid, note } = req.body || {};
  const cleanFrom = String(fromId || "").trim().toUpperCase();
  const fromP = db.players[cleanFrom];
  const toP = findPlayerByAnyQuery(toId);

  if (!fromP) return res.status(404).json({ ok: false, error: "SENDER_NOT_FOUND" });
  if (!toP) return res.status(404).json({ ok: false, error: "RECIPIENT_NOT_FOUND", message: "Qabul qiluvchi o'yinchi topilmadi!" });
  if (fromP.id === toP.id) return res.status(400).json({ ok: false, error: "CANNOT_TRANSFER_SELF", message: "O'zingizga sovg'a o'tkaza olmaysiz." });

  ensurePlayerEconomy(fromP);
  ensurePlayerEconomy(toP);

  const idx = (fromP.userStats.gifts || []).findIndex(g => g && g.uid === giftUid);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "GIFT_NOT_OWNED", message: "Bu sovg'a sizning kolleksiyangizda topilmadi." });
  }

  const [removed] = fromP.userStats.gifts.splice(idx, 1);
  const gift = getGiftById(removed.giftId);

  const cleanNote = String(note || "").trim().slice(0, 80);
  const newItem = {
    uid: makeGiftUid(),
    giftId: removed.giftId,
    fromId: fromP.id,
    fromName: fromP.name || fromP.id,
    note: cleanNote,
    source: "transfer_received",
    acquiredAt: Date.now()
  };

  toP.userStats.gifts.push(newItem);
  if (toP.userStats.gifts.length > 500) toP.userStats.gifts = toP.userStats.gifts.slice(-500);

  toP.userStats.prestige = computePrestigeFromGifts(toP.userStats.gifts);
  fromP.userStats.prestige = computePrestigeFromGifts(fromP.userStats.gifts);
  fromP.updatedAt = Date.now();
  toP.updatedAt = Date.now();

  if (!Array.isArray(db.giftEvents)) db.giftEvents = [];
  db.giftEvents.push({
    id: newItem.uid,
    toId: toP.id,
    fromId: fromP.id,
    fromName: fromP.name || fromP.id,
    giftId: gift ? gift.id : removed.giftId,
    giftName: gift ? gift.name : "Sovg'a",
    giftIcon: gift ? gift.icon : "🎁",
    prestige: gift ? gift.prestige : 0,
    note: cleanNote,
    createdAt: Date.now(),
    delivered: false
  });

  if (toP.tgId) {
    const giftName = gift ? gift.name : "Sovg'a";
    const giftIcon = gift ? gift.icon : "🎁";
    const prestige = gift ? gift.prestige : 0;
    const transferMsg =
      `🎁 <b>Sizga yangi 3D sovg'a hadya qilindi!</b>\n\n` +
      `👤 Kimdan: <b>${escapeHtml(fromP.name || fromP.id)}</b> (${fromP.id})\n` +
      `${giftIcon} Sovg'a: <b>${escapeHtml(giftName)}</b> (+${prestige} Obro')\n` +
      (cleanNote ? `💬 Tilak: <i>"${escapeHtml(cleanNote)}"</i>\n\n` : '\n') +
      `👑 O'yinda umumiy Obro'ingiz oshdi! Kolleksiyani ko'rish uchun kiring:`;

    tgApiCall("sendMessage", {
      chat_id: toP.tgId,
      text: transferMsg,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎁 SOVG'ALARNI KO'RISH 🎮", web_app: { url: `${APP_URL}/` } }]
        ]
      }
    }).catch(() => {});
  }

  saveDb();

  return res.json({
    ok: true,
    gift,
    targetName: toP.name || toP.id,
    fromStats: {
      coins: fromP.userStats.coins,
      gems: fromP.userStats.gems,
      prestige: fromP.userStats.prestige,
      gifts: fromP.userStats.gifts,
      giftSummary: summarizeGifts(fromP.userStats.gifts)
    }
  });
});

// e) Eski claim-bonus xavfsizlik uchun yopilgan (403 USE_BONUS_SPIN)
app.post("/api/tg/gifts/claim-bonus", (req, res) => {
  return res.status(403).json({
    ok: false,
    error: "USE_BONUS_SPIN",
    message: "Bu endpoint yopilgan. Iltimos /api/tg/bonus/spin dan foydalaning."
  });
});

// f) Yangi Oylik 5-Sovg'a Fondi Statusi (/api/tg/bonus/status)
app.get("/api/tg/bonus/status", (req, res) => {
  const { playerId } = req.query;
  const cleanId = String(playerId || "").trim().toUpperCase();
  const pool = getMonthlyBonusPool();
  const alreadyWonThisMonth = cleanId
    ? pool.winners.some(w => String(w.playerId || "").toUpperCase() === cleanId)
    : false;

  return res.json({
    ok: true,
    monthKey: pool.monthKey,
    maxGifts: 5,
    claimedCount: pool.claimedCount,
    remaining: Math.max(0, 5 - pool.claimedCount),
    alreadyWonThisMonth
  });
});

// g) Yangi 100% Server Nazoratidagi Oltin Sandiq Ruletkasi (/api/tg/bonus/spin)
app.post("/api/tg/bonus/spin", (req, res) => {
  const { playerId } = req.body || {};
  const cleanId = String(playerId || "").trim().toUpperCase();
  const p = db.players[cleanId];
  if (!p) {
    return res.status(404).json({ ok: false, error: "PLAYER_NOT_FOUND", message: "Profil topilmadi, sahifani yangilang." });
  }

  const now = Date.now();
  // 4.5 soniya anti-spam cooldown (p._lastBonusSpinAt)
  if (p._lastBonusSpinAt && (now - p._lastBonusSpinAt) < 4500) {
    return res.status(429).json({ ok: false, error: "TOO_FAST", message: "Iltimos, kuting..." });
  }
  p._lastBonusSpinAt = now;

  ensurePlayerEconomy(p);

  const pool = getMonthlyBonusPool(now);
  pool.totalSpins = (pool.totalSpins || 0) + 1;

  // Sovg'a tushishi shartlari (BARCHASI bajarilsagina):
  // a) pool.claimedCount < 5
  // b) pool.winners ichida cleanId yo'q (har oyda 5 ta ALOHIDA odam!)
  // c) unlockedSlots = pool.slotReleaseTimes.filter(ts => now >= ts).length; availableNow = unlockedSlots - pool.claimedCount > 0.
  const hasWonThisMonth = pool.winners.some(w => String(w.playerId || "").toUpperCase() === cleanId);
  const unlockedSlots = pool.slotReleaseTimes.filter(ts => now >= ts).length;
  const availableNow = unlockedSlots - pool.claimedCount;

  let canWinGift = (pool.claimedCount < 5) && (!hasWonThisMonth) && (availableNow > 0);
  let isGiftWin = false;

  if (canWinGift) {
    // Eng eski ochiq slot ochilganidan beri o'tgan soat (ageHours)
    const oldestSlotTs = pool.slotReleaseTimes[pool.claimedCount] || now;
    const ageHours = Math.max(0, (now - oldestSlotTs) / (1000 * 60 * 60));

    // Oy tugashiga qolgan vaqt (Toshkent vaqti)
    const [yearStr, monthStr] = pool.monthKey.split("-");
    const year = parseInt(yearStr, 10);
    const monthIdx = parseInt(monthStr, 10) - 1;
    const nextMonthUtcMs = Date.UTC(year, monthIdx + 1, 1, 0, 0, 0) - (5 * 60 * 60 * 1000);
    const hoursUntilMonthEnd = (nextMonthUtcMs - now) / (1000 * 60 * 60);

    // Dinamik ehtimol:
    // baza = 0.015 (1.5%); agar ageHours > 48 -> 0.04; ageHours > 96 -> 0.10; ageHours > 132 -> 0.18; oy tugashiga < 48 soat qolib hali slot bo'lsa -> 0.28.
    let giftProb = 0.015;
    if (hoursUntilMonthEnd < 48 && availableNow > 0) {
      giftProb = 0.28;
    } else if (ageHours > 132) {
      giftProb = 0.18;
    } else if (ageHours > 96) {
      giftProb = 0.10;
    } else if (ageHours > 48) {
      giftProb = 0.04;
    }

    if (Math.random() < giftProb) {
      isGiftWin = true;
    }
  }

  const monthlyPoolData = {
    monthKey: pool.monthKey,
    maxGifts: 5,
    claimedCount: pool.claimedCount,
    remaining: Math.max(0, 5 - pool.claimedCount)
  };

  if (isGiftWin) {
    // Sovg'a yutilsa:
    // Og'irlik: tactical_medal (45%), karambit_neon (30%), titan_shield (17%), golden_dragon (8%, oyiga max 1 dona).
    const dragonWon = pool.winners.some(w => w.giftId === "golden_dragon");
    let pickedGiftId;
    const roll = Math.random();

    if (!dragonWon && roll < 0.08) {
      pickedGiftId = "golden_dragon";
    } else {
      const subRoll = Math.random() * 92;
      if (subRoll < 45) {
        pickedGiftId = "tactical_medal";
      } else if (subRoll < (45 + 30)) {
        pickedGiftId = "karambit_neon";
      } else {
        pickedGiftId = "titan_shield";
      }
    }

    const gift = getGiftById(pickedGiftId);
    // 0 tanga qo'shiladi! Haqiqiy uid = makeGiftUid() bilan p.userStats.gifts.push(item)
    const item = {
      uid: makeGiftUid(),
      giftId: gift.id,
      fromId: "BONUS_CASE",
      fromName: "Oltin Sandiq",
      note: "3D Oltin Sandiq yutug'i",
      source: "bonus_case",
      acquiredAt: now
    };

    p.userStats.gifts.push(item);
    if (p.userStats.gifts.length > 500) p.userStats.gifts = p.userStats.gifts.slice(-500);
    p.userStats.prestige = computePrestigeFromGifts(p.userStats.gifts);
    p.updatedAt = now;

    pool.claimedCount++;
    pool.winners.push({
      playerId: cleanId,
      name: p.name || cleanId,
      giftId: gift.id,
      uid: item.uid,
      wonAt: now
    });

    monthlyPoolData.claimedCount = pool.claimedCount;
    monthlyPoolData.remaining = Math.max(0, 5 - pool.claimedCount);

    saveDb();

    return res.json({
      ok: true,
      outcomeType: "gift",
      gift,
      item,
      reward: 0,
      userStats: {
        coins: p.userStats.coins,
        gems: p.userStats.gems,
        prestige: p.userStats.prestige,
        gifts: p.userStats.gifts,
        giftSummary: summarizeGifts(p.userStats.gifts)
      },
      monthlyPool: monthlyPoolData
    });
  } else {
    // Tanga yutilsa:
    // 5 xil tanga (coin_500: 35%, coin_1500: 30%, coin_3000: 20%, coin_4500: 10%, coin_6000: 5%), p.userStats.coins += reward, saveDb()!
    const coinRoll = Math.random();
    let coinItemId, reward;
    if (coinRoll < 0.35) {
      coinItemId = "coin_500";
      reward = 500;
    } else if (coinRoll < 0.65) {
      coinItemId = "coin_1500";
      reward = 1500;
    } else if (coinRoll < 0.85) {
      coinItemId = "coin_3000";
      reward = 3000;
    } else if (coinRoll < 0.95) {
      coinItemId = "coin_4500";
      reward = 4500;
    } else {
      coinItemId = "coin_6000";
      reward = 6000;
    }

    p.userStats.coins = (Number(p.userStats.coins) || 0) + reward;
    p.updatedAt = now;
    saveDb();

    return res.json({
      ok: true,
      outcomeType: "coin",
      coinItemId,
      reward,
      userStats: {
        coins: p.userStats.coins,
        gems: p.userStats.gems,
        prestige: p.userStats.prestige,
        gifts: p.userStats.gifts,
        giftSummary: summarizeGifts(p.userStats.gifts)
      },
      monthlyPool: monthlyPoolData
    });
  }
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
  return res.json({ ok: true, savedFriends: (db.players[cleanMy] && db.players[cleanMy].savedFriends) || [] });
});

// 5D) Do'stga bot orqali shaxsiy xabar yuborish (@username siz do'stlar uchun)
app.post("/api/tg/friend-message", async (req, res) => {
  try {
    const { fromId, toId, text } = req.body || {};
    const cleanFrom = String(fromId || "").trim().toUpperCase();
    const cleanTo = String(toId || "").trim().toUpperCase();
    const cleanText = String(text || "").trim().slice(0, 250);

    if (!cleanFrom || !cleanTo || !cleanText) {
      return res.status(400).json({ ok: false, error: "MISSING_DATA", message: "Ma'lumotlar to'liq emas." });
    }

    const fromP = db.players[cleanFrom];
    const toP = db.players[cleanTo];
    if (!fromP || !toP) {
      return res.status(404).json({ ok: false, error: "PLAYER_NOT_FOUND", message: "O'yinchi topilmadi." });
    }

    // Do'stlik tekshiruvi: faqat o'zaro do'stlar (savedFriends) bir-biriga yozishi mumkin
    const isFriends = (Array.isArray(fromP.savedFriends) && fromP.savedFriends.some(f => String(f.id).toUpperCase() === cleanTo))
      || (Array.isArray(toP.savedFriends) && toP.savedFriends.some(f => String(f.id).toUpperCase() === cleanFrom));
    if (!isFriends) {
      return res.status(403).json({ ok: false, error: "NOT_FRIENDS", message: "Faqat o'zaro do'stlar bir-biriga xabar yoza oladi." });
    }

    // 4 soniyalik anti-spam cooldown
    const now = Date.now();
    if (fromP._lastMsgAt && (now - fromP._lastMsgAt < 4000)) {
      return res.status(429).json({ ok: false, error: "COOLDOWN", message: "Biroz kuting (4 soniya cooldown)." });
    }
    fromP._lastMsgAt = now;

    if (!toP.tgId) {
      return res.status(400).json({ ok: false, error: "NO_TG_ID", message: "Ushbu o'yinchi Telegram botga ulanmagan." });
    }

    const rows = [];
    if (fromP.username) {
      const cleanU = String(fromP.username).replace(/^@+/, "");
      rows.push([{ text: "💬 Telegramda javob yozish", url: "https://t.me/" + encodeURIComponent(cleanU) }]);
    }
    rows.push([{ text: "🎮 O'YINGA KIRISH", web_app: { url: APP_URL + "/" } }]);

    const msgText = `💬 <b>Do'stingizdan yangi xabar!</b>\n\n👤 Kimdan: <b>${escapeHtml(fromP.name || fromP.id)}</b>\n✉️ Xabar: <i>"${escapeHtml(cleanText)}"</i>`;

    await tgApiCall("sendMessage", {
      chat_id: toP.tgId,
      parse_mode: "HTML",
      text: msgText,
      reply_markup: { inline_keyboard: rows }
    });

    return res.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("friend-message error:", err);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: "Xabar yuborishda xatolik yuz berdi." });
  }
});

// 6) Telegram Bot Webhook (/api/tg/webhook)
let tourEngine = null;
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
      let playBtnText = "🔥 O'YINNI BOSHLASH (DIGI DIGI) 🎮";
      if (rawRef.startsWith("room_")) {
        const roomCode = rawRef.replace("room_", "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
        if (roomCode) webAppUrl = `${APP_URL}/?room_code=${encodeURIComponent(roomCode)}`;
      } else if (rawRef.startsWith("tour_")) {
        playBtnText = "🏆 TURNIRGA KIRISH (DIGI DIGI) 🔥";
        if (rawRef.startsWith("tour_ref_")) {
          const tourRefId = rawRef.replace("tour_ref_", "").trim();
          webAppUrl = tourRefId
            ? `${APP_URL}/?open_tour=1&tour_ref=${encodeURIComponent(tourRefId)}`
            : `${APP_URL}/?open_tour=1`;
        } else {
          webAppUrl = `${APP_URL}/?open_tour=1`;
        }
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
            [{ text: playBtnText, web_app: { url: webAppUrl } }]
          ]
        }
      });
    } else if (msg && msg.text && msg.text.startsWith("/tour") && tourEngine) {
      await tourEngine.handleAdminCommand(msg);
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

// 1v1 Olimpiya Play-off Turnir Dvigateli (1-Bosqich Backend + Telegram Bot Admin)
try {
  const { initTournament } = require("./tournament_engine");
  tourEngine = initTournament({ app, db, saveDb, tgApiCall, DATA_DIR, APP_URL, ADMIN_TG_ID });
} catch (tourErr) {
  console.error("[Tournament] Init error:", tourErr);
}

const httpServer = app.listen(PORT, async () => {
  console.log(`DIGI DIGI Server running on port ${PORT}`);
  warmHotAssetCache();

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
