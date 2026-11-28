/**
 * DIGI DIGI GRAND CUP — 1v1 Olimpiya Play-off Turnir Dvigateli (1-Bosqich Backend)
 * 0 ta tashqi kutubxona (faqat Node native fs, path, crypto).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CHANNEL_URL = "https://t.me/digi_digi_kanal";
const CHANNEL_USERNAME = "@digi_digi_kanal";
const CHANNEL_ID = "-1002067193964";
const BOT_USERNAME = "digi_dig_bot";
const DEFAULT_ADMIN_ID = "5155194813";
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const UZ_WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(n) {
  const num = Math.max(0, Math.round(Number(n) || 0));
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function maskCardNumber(cardRaw) {
  const digits = String(cardRaw || "").replace(/\D/g, "");
  if (digits.length < 8) return "****";
  return digits.slice(0, 4) + " **** **** " + digits.slice(-4);
}

/**
 * Kelayotgan yakshanba soat 20:00:00 (Toshkent UTC+5 = 15:00:00 UTC) timestampini qaytaradi.
 * Agar bugun yakshanba va hali 20:00 bo'lmagan bo'lsa — bugungi 20:00; o'tgan bo'lsa — keyingi yakshanba.
 */
function getNextSunday20TashkentMs(nowMs = Date.now()) {
  const t = new Date(nowMs + TASHKENT_OFFSET_MS);
  const day = t.getUTCDay();
  const daysUntilSunday = (7 - day) % 7;
  let candidate = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + daysUntilSunday, 20, 0, 0, 0) - TASHKENT_OFFSET_MS;
  if (nowMs >= candidate) {
    candidate += 7 * 24 * 60 * 60 * 1000;
  }
  return candidate;
}

/**
 * Timestampni Toshkent vaqtida "Yakshanba, DD.MM.YYYY • 20:00 (Toshkent)" formatiga o'giradi.
 */
function formatTashkentDateTime(ms) {
  const t = new Date(Number(ms) + TASHKENT_OFFSET_MS);
  const dayName = UZ_WEEKDAYS[t.getUTCDay()] || "Yakshanba";
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = t.getUTCFullYear();
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const min = String(t.getUTCMinutes()).padStart(2, "0");
  return `${dayName}, ${dd}.${mm}.${yyyy} • ${hh}:${min} (Toshkent)`;
}

function getRoundName(roundIdx, totalRounds) {
  const rem = totalRounds - 1 - roundIdx;
  if (rem === 0) return "GRAND FINAL";
  if (rem === 1) return "YARIM FINAL";
  if (rem === 2) return "1/4 FINAL";
  if (rem === 3) return "1/8 FINAL";
  if (rem === 4) return "1/16 FINAL";
  return "1/32 FINAL";
}

function toBracketSlot(p, seed) {
  if (!p) return null;
  return {
    playerId: String(p.playerId || p.id || ""),
    tgId: p.tgId ? String(p.tgId) : "",
    name: String(p.name || "Jangchi"),
    username: String(p.username || ""),
    photoUrl: String(p.photoUrl || ""),
    elo: Number(p.elo) || 1000,
    seed: Number(seed) || 0
  };
}

/**
 * 1v1 Olimpiya Play-off setkasini quradi (ELO seeding + BYE + 3-o'rin jangi).
 */
function buildPlayoffBracket(tour, opts = {}) {
  const all = Array.isArray(tour && tour.participants) ? tour.participants : [];
  const checked = all.filter(p => p && p.checkedIn === true && !p.dq);
  const useAll = checked.length < 2 && Boolean(opts.manualStart || opts.allowUncheckedIn);
  const pool = (useAll ? all.filter(p => p && !p.dq) : checked).slice();

  if (pool.length < 2) return null;

  pool.sort((a, b) => {
    const eloDiff = (Number(b.elo) || 1000) - (Number(a.elo) || 1000);
    if (eloDiff !== 0) return eloDiff;
    const regDiff = (Number(a.registeredAt) || 0) - (Number(b.registeredAt) || 0);
    if (regDiff !== 0) return regDiff;
    return String(a.playerId || "").localeCompare(String(b.playerId || ""));
  });

  let size = 2;
  while (size < pool.length && size < 64) {
    size *= 2;
  }
  while (size < pool.length) {
    size *= 2;
  }

  let seedOrder = [1, 2];
  while (seedOrder.length < size) {
    const sum = seedOrder.length * 2 + 1;
    const next = [];
    for (const s of seedOrder) {
      next.push(s, sum - s);
    }
    seedOrder = next;
  }

  const totalRounds = Math.round(Math.log2(size));
  const now = Date.now();
  const rounds = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchCount = size / Math.pow(2, r + 1);
    const roundName = getRoundName(r, totalRounds);
    const matches = [];
    for (let m = 0; m < matchCount; m++) {
      matches.push({
        id: `R${r + 1}_M${m + 1}`,
        roundIdx: r,
        matchIdx: m,
        roundName,
        p1: null,
        p2: null,
        score1: 0,
        score2: 0,
        winnerId: null,
        loserId: null,
        status: "pending",
        roomCode: null,
        readyAt: 0,
        startedAt: 0,
        finishedAt: 0,
        tko: false
      });
    }
    rounds.push({ roundIdx: r, roundName, matches });
  }

  // 1-raund juftliklarini seeding bo'yicha joylashtirish
  const r1Matches = rounds[0].matches;
  for (let m = 0; m < r1Matches.length; m++) {
    const s1 = seedOrder[m * 2];
    const s2 = seedOrder[m * 2 + 1];
    const raw1 = pool[s1 - 1] || null;
    const raw2 = pool[s2 - 1] || null;
    const match = r1Matches[m];
    match.p1 = toBracketSlot(raw1, s1);
    match.p2 = toBracketSlot(raw2, s2);

    if (match.p1 && !match.p2) {
      match.status = "bye";
      match.winnerId = match.p1.playerId;
      match.finishedAt = now;
      if (rounds[1]) {
        const nextM = rounds[1].matches[Math.floor(m / 2)];
        const slotKey = (m % 2 === 0) ? "p1" : "p2";
        nextM[slotKey] = Object.assign({}, match.p1);
      }
    } else if (match.p1 && match.p2) {
      match.status = "ready";
      match.readyAt = now;
    }
  }

  // Agar 1-raund BYE lar natijasida 2-raundda ikkala o'yinchi tayyor bo'lib qolsa
  if (rounds[1]) {
    for (const m2 of rounds[1].matches) {
      if (m2.p1 && m2.p2 && m2.status === "pending") {
        m2.status = "ready";
        m2.readyAt = now;
      }
    }
  }

  const thirdPlaceMatch = size >= 4 ? {
    id: "M_3RD",
    roundIdx: totalRounds - 1,
    matchIdx: 1,
    roundName: "3-O'RIN UCHUN",
    p1: null,
    p2: null,
    score1: 0,
    score2: 0,
    winnerId: null,
    loserId: null,
    status: "pending",
    roomCode: null,
    readyAt: 0,
    startedAt: 0,
    finishedAt: 0,
    tko: false
  } : null;

  return {
    size,
    totalRounds,
    playerCount: pool.length,
    rounds,
    thirdPlaceMatch,
    createdAt: now
  };
}

function initTournament({ app, db, saveDb, tgApiCall, DATA_DIR, APP_URL, ADMIN_TG_ID, mpEngine }) {
  const adminIdStr = String(ADMIN_TG_ID || DEFAULT_ADMIN_ID);
  let _mpEngine = mpEngine || null;
  function setMpEngine(eng) {
    _mpEngine = eng || null;
  }
  const TOUR_DB_FILE = path.join(DATA_DIR, "tournaments_db.json");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let tourDb = { seq: 0, active: null, history: [] };
  let _tourSaveTimer = null;

  function loadTourDb() {
    try {
      if (fs.existsSync(TOUR_DB_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(TOUR_DB_FILE, "utf8"));
        if (parsed && typeof parsed === "object") {
          tourDb.seq = Number(parsed.seq) || 0;
          tourDb.active = (parsed.active && typeof parsed.active === "object") ? parsed.active : null;
          tourDb.history = Array.isArray(parsed.history) ? parsed.history : [];
        }
      }
    } catch (err) {
      console.error("[Tournament] DB load error:", err.message);
    }
  }

  function saveTourDb() {
    if (_tourSaveTimer) clearTimeout(_tourSaveTimer);
    _tourSaveTimer = setTimeout(() => {
      fs.promises.writeFile(TOUR_DB_FILE, JSON.stringify(tourDb, null, 2), "utf8").catch(err => {
        console.error("[Tournament] DB save error:", err.message);
      });
    }, 400);
    if (_tourSaveTimer.unref) _tourSaveTimer.unref();
  }

  loadTourDb();

  // 60 soniyalik RAM kesh (faqat isMember === true holatlar uchun)
  const memberCache = new Map();

  async function safeTgCall(method, payload) {
    try {
      const raw = await tgApiCall(method, payload);
      if (!raw) return { ok: false, description: "EMPTY_RESPONSE" };
      if (typeof raw === "string") {
        return JSON.parse(raw);
      }
      return raw;
    } catch (err) {
      return { ok: false, description: err && err.message ? err.message : "TG_CALL_FAILED" };
    }
  }

  async function checkChannelSubscription(tgId, forceRefresh = false) {
    const key = String(tgId || "").trim();
    if (!key) {
      return { ok: false, isMember: false, reason: "NO_TG_ID" };
    }
    if (!forceRefresh) {
      const cached = memberCache.get(key);
      if (cached && cached.isMember === true && (Date.now() - cached.ts) < 60000) {
        return { ok: true, isMember: true, status: cached.status, cached: true };
      }
    }

    const userIdVal = /^\d+$/.test(key) ? Number(key) : key;
    let parsed = await safeTgCall("getChatMember", { chat_id: CHANNEL_ID, user_id: userIdVal });
    if (!parsed || !parsed.ok) {
      parsed = await safeTgCall("getChatMember", { chat_id: CHANNEL_USERNAME, user_id: userIdVal });
    }
    if (!parsed || !parsed.ok || !parsed.result) {
      return {
        ok: false,
        isMember: false,
        reason: (parsed && parsed.description) || "GET_CHAT_MEMBER_FAILED"
      };
    }

    const status = String(parsed.result.status || "");
    const isMember = ["member", "administrator", "creator"].includes(status) ||
      (status === "restricted" && parsed.result.is_member === true);

    if (isMember) {
      memberCache.set(key, { isMember: true, status, ts: Date.now() });
    }
    return { ok: true, isMember, status, cached: false };
  }

  async function sendPlayerDm(tgId, text, withWebApp = true) {
    if (!tgId) return { ok: false, description: "NO_TG_ID" };
    const payload = {
      chat_id: tgId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    };
    if (withWebApp) {
      payload.reply_markup = {
        inline_keyboard: [
          [{ text: "🏆 TURNIRGA KIRISH (DIGI DIGI) 🔥", web_app: { url: `${APP_URL}/?open_tour=1` } }]
        ]
      };
    }
    return safeTgCall("sendMessage", payload);
  }

  async function sendAdminDm(text) {
    return safeTgCall("sendMessage", {
      chat_id: adminIdStr,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  }

  async function sendChannelPost(text) {
    const reply_markup = {
      inline_keyboard: [
        [{ text: "🔥 TURNIRGA YOZILISH (DIGI DIGI) 🏆", url: `https://t.me/${BOT_USERNAME}?start=tour_join` }]
      ]
    };
    let parsed = await safeTgCall("sendMessage", {
      chat_id: CHANNEL_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup
    });
    if (!parsed || !parsed.ok) {
      parsed = await safeTgCall("sendMessage", {
        chat_id: CHANNEL_USERNAME,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup
      });
    }
    return parsed;
  }

  async function broadcastQueuedDm(participants, buildMessageFn) {
    const list = (participants || []).filter(p => p && !p.dq && p.tgId);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      try {
        const text = buildMessageFn(p);
        if (text) await sendPlayerDm(p.tgId, text, true);
      } catch (_) {}
      if (i < list.length - 1) {
        await new Promise(r => setTimeout(r, 60));
      }
    }
  }

  function findMainPlayer(playerId, tgId) {
    const players = (db && db.players) || {};
    if (playerId) {
      const raw = String(playerId).trim();
      const up = raw.toUpperCase();
      if (players[raw]) return players[raw];
      if (players[up]) return players[up];
      const byId = Object.values(players).find(p => p && String(p.id || "").toUpperCase() === up);
      if (byId) return byId;
    }
    if (tgId) {
      const tgStr = String(tgId).trim();
      const byTg = Object.values(players).find(p => p && String(p.tgId || "") === tgStr);
      if (byTg) return byTg;
    }
    return null;
  }

  function getAllBracketMatches(bracket) {
    if (!bracket) return [];
    const list = [];
    for (const r of (bracket.rounds || [])) {
      for (const m of (r.matches || [])) {
        list.push(m);
      }
    }
    if (bracket.thirdPlaceMatch) list.push(bracket.thirdPlaceMatch);
    return list;
  }

  function findBracketMatch(bracket, matchId) {
    if (!bracket || !matchId) return null;
    const target = String(matchId).trim().toUpperCase();
    return getAllBracketMatches(bracket).find(m => String(m.id || "").toUpperCase() === target) || null;
  }

  function sanitizeWinnerPublic(w) {
    if (!w) return null;
    return {
      playerId: w.playerId,
      name: w.name,
      username: w.username || "",
      photoUrl: w.photoUrl || "",
      cashPrize: Number(w.cashPrize) || 0,
      gemPrize: Number(w.gemPrize) || 0,
      paid: Boolean(w.paid),
      paidAt: Number(w.paidAt) || 0,
      hasSubmittedPayout: Boolean(w.payout && w.payout.submittedAt)
    };
  }

  function sanitizeBracketPublic(bracket) {
    if (!bracket) return null;
    const sanitizeMatch = (m) => ({
      id: m.id,
      roundIdx: m.roundIdx,
      matchIdx: m.matchIdx,
      roundName: m.roundName,
      p1: m.p1 ? { playerId: m.p1.playerId, name: m.p1.name, username: m.p1.username, photoUrl: m.p1.photoUrl, elo: m.p1.elo, seed: m.p1.seed } : null,
      p2: m.p2 ? { playerId: m.p2.playerId, name: m.p2.name, username: m.p2.username, photoUrl: m.p2.photoUrl, elo: m.p2.elo, seed: m.p2.seed } : null,
      score1: Number(m.score1) || 0,
      score2: Number(m.score2) || 0,
      winnerId: m.winnerId || null,
      loserId: m.loserId || null,
      status: m.status,
      roomCode: m.roomCode || null,
      readyAt: m.readyAt || 0,
      startedAt: m.startedAt || 0,
      finishedAt: m.finishedAt || 0,
      tko: Boolean(m.tko)
    });
    return {
      size: bracket.size,
      totalRounds: bracket.totalRounds,
      playerCount: bracket.playerCount,
      rounds: (bracket.rounds || []).map(r => ({
        roundIdx: r.roundIdx,
        roundName: r.roundName,
        matches: (r.matches || []).map(sanitizeMatch)
      })),
      thirdPlaceMatch: bracket.thirdPlaceMatch ? sanitizeMatch(bracket.thirdPlaceMatch) : null
    };
  }

  function sanitizeTourForPublic(tour, playerId = "") {
    if (!tour) return null;
    const participants = Array.isArray(tour.participants) ? tour.participants : [];
    const safeParticipants = participants.map(p => ({
      playerId: p.playerId,
      name: p.name,
      username: p.username || "",
      photoUrl: p.photoUrl || "",
      elo: Number(p.elo) || 1000,
      checkedIn: Boolean(p.checkedIn),
      dq: Boolean(p.dq),
      registeredAt: Number(p.registeredAt) || 0,
      refCount: participants.filter(x => x.refBy && String(x.refBy).toUpperCase() === String(p.playerId).toUpperCase()).length
    }));

    return {
      id: tour.id,
      seq: tour.seq,
      title: tour.title,
      status: tour.status,
      createdAt: tour.createdAt,
      checkinAt: tour.checkinAt,
      startAt: tour.startAt,
      startedAt: tour.startedAt || 0,
      finishedAt: tour.finishedAt || 0,
      maxPlayers: tour.maxPlayers,
      totalPrize: tour.totalPrize,
      prizes: tour.prizes,
      gemPrizes: tour.gemPrizes,
      channelUsername: tour.channelUsername || CHANNEL_USERNAME,
      channelUrl: tour.channelUrl || CHANNEL_URL,
      participantsCount: participants.filter(p => !p.dq).length,
      checkedInCount: participants.filter(p => p.checkedIn && !p.dq).length,
      participants: safeParticipants,
      bracket: sanitizeBracketPublic(tour.bracket),
      winners: tour.winners ? {
        first: sanitizeWinnerPublic(tour.winners.first),
        second: sanitizeWinnerPublic(tour.winners.second),
        third: sanitizeWinnerPublic(tour.winners.third)
      } : null,
      viewerId: playerId ? String(playerId).toUpperCase() : ""
    };
  }

  function findParticipant(tour, playerId, tgId) {
    if (!tour || !Array.isArray(tour.participants)) return null;
    const pidUp = playerId ? String(playerId).trim().toUpperCase() : "";
    const tgStr = tgId ? String(tgId).trim() : "";
    if (pidUp) {
      const byPid = tour.participants.find(p => String(p.playerId || "").toUpperCase() === pidUp);
      if (byPid) return byPid;
    }
    if (tgStr) {
      const byTg = tour.participants.find(p => String(p.tgId || "") === tgStr);
      if (byTg) return byTg;
    }
    return null;
  }

  function findPlayerMatch(tour, playerId, tgId) {
    if (!tour || !tour.bracket) return null;
    const pidUp = playerId ? String(playerId).trim().toUpperCase() : "";
    const tgStr = tgId ? String(tgId).trim() : "";
    const all = getAllBracketMatches(tour.bracket);
    const mine = all.filter(m => {
      const m1 = m.p1 && ((pidUp && String(m.p1.playerId).toUpperCase() === pidUp) || (tgStr && String(m.p1.tgId) === tgStr));
      const m2 = m.p2 && ((pidUp && String(m.p2.playerId).toUpperCase() === pidUp) || (tgStr && String(m.p2.tgId) === tgStr));
      return m1 || m2;
    });
    if (!mine.length) return null;
    const priority = { playing: 4, ready: 3, pending: 2, bye: 1, done: 0 };
    mine.sort((a, b) => (priority[b.status] || 0) - (priority[a.status] || 0) || b.roundIdx - a.roundIdx);
    return mine[0];
  }

  function getLatestFinishedTour() {
    if (tourDb.active && tourDb.active.status === "finished") return tourDb.active;
    if (Array.isArray(tourDb.history) && tourDb.history.length > 0) return tourDb.history[0];
    return null;
  }

  function syncHistoryRecord(tour) {
    if (!tour) return;
    const idx = tourDb.history.findIndex(h => h && h.id === tour.id);
    const snapshot = JSON.parse(JSON.stringify(tour));
    if (idx >= 0) {
      tourDb.history[idx] = snapshot;
    } else {
      tourDb.history.unshift(snapshot);
      if (tourDb.history.length > 25) tourDb.history.length = 25;
    }
  }

  async function notifyPairReady(match) {
    if (!match || !match.p1 || !match.p2) return;
    const msgFor = (me, opp) =>
      `⚔️ <b>KEYINGI RAUND TAYYOR!</b>\n\n` +
      `🏆 Raund: <b>${escapeHtml(match.roundName)}</b> (<code>${escapeHtml(match.id)}</code>)\n` +
      `🆚 Raqibingiz: <b>${escapeHtml(opp.name)}</b> (ELO: ${Number(opp.elo) || 1000})\n\n` +
      `👇 Jang xonasiga kirish uchun pastdagi tugmani bosing:`;
    await sendPlayerDm(match.p1.tgId, msgFor(match.p1, match.p2), true);
    await sendPlayerDm(match.p2.tgId, msgFor(match.p2, match.p1), true);
  }

  function makeWinnerRecord(slot, cashPrize, gemPrize) {
    if (!slot) return null;
    return {
      playerId: slot.playerId,
      tgId: slot.tgId || "",
      name: slot.name,
      username: slot.username || "",
      photoUrl: slot.photoUrl || "",
      cashPrize: Number(cashPrize) || 0,
      gemPrize: Number(gemPrize) || 0,
      paid: false,
      paidAt: 0,
      payout: null
    };
  }

  function awardGemsToWinner(winnerRec) {
    if (!winnerRec || !winnerRec.gemPrize) return;
    const p = findMainPlayer(winnerRec.playerId, winnerRec.tgId);
    if (!p) return;
    if (!p.userStats || typeof p.userStats !== "object") p.userStats = {};
    p.userStats.gems = Math.max(0, Math.floor(Number(p.userStats.gems) || 0)) + Number(winnerRec.gemPrize);
  }

  async function finalizeTournament(tour, opts = {}) {
    if (!tour) return { ok: false, error: "NO_TOURNAMENT" };
    if (tour.status === "finished") return { ok: true, alreadyFinished: true, tour };

    const bracket = tour.bracket;
    let firstSlot = null;
    let secondSlot = null;
    let thirdSlot = null;

    if (bracket && Array.isArray(bracket.rounds) && bracket.rounds.length > 0) {
      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      const gf = finalRound && finalRound.matches && finalRound.matches[0];
      if (gf && gf.winnerId) {
        firstSlot = (gf.p1 && gf.p1.playerId === gf.winnerId) ? gf.p1 : gf.p2;
        secondSlot = (gf.p1 && gf.p1.playerId === gf.winnerId) ? gf.p2 : gf.p1;
      }
      const tm = bracket.thirdPlaceMatch;
      if (tm && tm.winnerId) {
        thirdSlot = (tm.p1 && tm.p1.playerId === tm.winnerId) ? tm.p1 : tm.p2;
      } else if (opts.force && tm && (tm.p1 || tm.p2)) {
        thirdSlot = tm.p1 || tm.p2;
      }
    }

    if (!firstSlot && !opts.force) {
      return { ok: false, error: "FINAL_NOT_FINISHED" };
    }

    const prizes = tour.prizes || { first: 250000, second: 150000, third: 100000 };
    const gems = tour.gemPrizes || { first: 500, second: 250, third: 100 };

    tour.winners = {
      first: makeWinnerRecord(firstSlot, prizes.first, gems.first),
      second: makeWinnerRecord(secondSlot, prizes.second, gems.second),
      third: makeWinnerRecord(thirdSlot, prizes.third, gems.third)
    };

    if (!tour.gemsAwarded) {
      awardGemsToWinner(tour.winners.first);
      awardGemsToWinner(tour.winners.second);
      awardGemsToWinner(tour.winners.third);
      tour.gemsAwarded = true;
      if (typeof saveDb === "function") saveDb();
    }

    tour.status = "finished";
    tour.finishedAt = Date.now();
    syncHistoryRecord(tour);
    saveTourDb();

    // TOP-3 g'oliblarga DM
    const winnerPairs = [
      { rank: 1, medal: "🥇 1-O'RIN (CHEMPION)", w: tour.winners.first },
      { rank: 2, medal: "🥈 2-O'RIN", w: tour.winners.second },
      { rank: 3, medal: "🥉 3-O'RIN", w: tour.winners.third }
    ];
    for (const item of winnerPairs) {
      if (item.w && item.w.tgId) {
        const dmText =
          `🏆 <b>TABRIKLAYMIZ, ${escapeHtml(item.w.name)}!</b>\n\n` +
          `Siz <b>${escapeHtml(tour.title)}</b> turnirida <b>${item.medal}</b> egasi bo'ldingiz!\n` +
          `💵 Pul mukofoti: <b>${formatMoney(item.w.cashPrize)} so'm</b>\n` +
          `💎 Kristall mukofoti: <b>+${item.w.gemPrize} 💎</b> (balansingizga qo'shildi!)\n\n` +
          `💳 Sovrinni olish uchun o'yinga kirib karta ma'lumotingizni yuboring!`;
        await sendPlayerDm(item.w.tgId, dmText, true);
      }
    }

    // Admin hisoboti (TOP-3 + Anti-Cheat xulosasi)
    const formatAcLine = (w) => {
      if (!w) return "";
      const p = findParticipant(tour, w.playerId, w.tgId);
      const ac = p && p.acSummary;
      if (!ac) return "\n   🛡️ Anti-Cheat: — (o'yin ma'lumoti yo'q)";
      const hsPct = ac.hits > 0 ? Math.round((ac.hs / ac.hits) * 100) : 0;
      const tot = Number(ac.totalFlags) || 0;
      if (tot === 0 && hsPct < 70) {
        return `\n   🛡️ Anti-Cheat: ✅ Toza (0 shubha, HS: ${hsPct}%)`;
      }
      return `\n   🛡️ Anti-Cheat: ⚠️ ${tot} ta shubhali belgi! (Speed: ${ac.flagsSpeed || 0}, Fire: ${ac.flagsFireRate || 0}, Dmg: ${ac.flagsDmg || 0}, HS: ${hsPct}%)`;
    };
    const lineFor = (label, w) => w
      ? `${label}: <b>${escapeHtml(w.name)}</b> (<code>${escapeHtml(w.playerId)}</code>) — ${formatMoney(w.cashPrize)} so'm + ${w.gemPrize}💎${formatAcLine(w)}`
      : `${label}: —`;

    await sendAdminDm(
      `🏁 <b>TURNIR YAKUNLANDI: ${escapeHtml(tour.title)}</b>\n\n` +
      `${lineFor("🥇 1-o'rin", tour.winners.first)}\n` +
      `${lineFor("🥈 2-o'rin", tour.winners.second)}\n` +
      `${lineFor("🥉 3-o'rin", tour.winners.third)}\n\n` +
      `👥 Jami qatnashchilar: ${tour.participants.length} ta`
    );

    // Kanalga TOP-3 posti (faqat url tugma!)
    const channelText =
      `🏆 <b>${escapeHtml(tour.title)} — YAKUNIY NATIJALAR!</b>\n\n` +
      `${tour.winners.first ? `🥇 <b>1-O'RIN:</b> ${escapeHtml(tour.winners.first.name)} — <b>${formatMoney(tour.winners.first.cashPrize)} so'm</b> + ${tour.winners.first.gemPrize}💎\n` : ""}` +
      `${tour.winners.second ? `🥈 <b>2-O'RIN:</b> ${escapeHtml(tour.winners.second.name)} — <b>${formatMoney(tour.winners.second.cashPrize)} so'm</b> + ${tour.winners.second.gemPrize}💎\n` : ""}` +
      `${tour.winners.third ? `🥉 <b>3-O'RIN:</b> ${escapeHtml(tour.winners.third.name)} — <b>${formatMoney(tour.winners.third.cashPrize)} so'm</b> + ${tour.winners.third.gemPrize}💎\n` : ""}` +
      `\n🔥 Barcha g'oliblarni tabriklaymiz! Keyingi yakshanba turniriga tayyorlaning!`;
    await sendChannelPost(channelText);

    return { ok: true, tour };
  }

  async function reportMatchResult(matchId, winnerId, score1 = 0, score2 = 0, opts = {}) {
    const tour = tourDb.active;
    if (!tour || tour.status !== "live" || !tour.bracket) {
      return { ok: false, error: "NO_LIVE_TOURNAMENT" };
    }
    const match = findBracketMatch(tour.bracket, matchId);
    if (!match) return { ok: false, error: "MATCH_NOT_FOUND" };
    if (match.status === "done" || match.status === "bye") {
      return { ok: false, error: "MATCH_ALREADY_DONE", match };
    }
    if (!match.p1 || !match.p2) {
      return { ok: false, error: "MATCH_NOT_READY" };
    }

    const wKey = String(winnerId || "").trim().toUpperCase();
    const p1Match = String(match.p1.playerId).toUpperCase() === wKey || (match.p1.tgId && String(match.p1.tgId) === String(winnerId || "").trim());
    const p2Match = String(match.p2.playerId).toUpperCase() === wKey || (match.p2.tgId && String(match.p2.tgId) === String(winnerId || "").trim());
    if (!p1Match && !p2Match) {
      return { ok: false, error: "WINNER_NOT_IN_MATCH" };
    }

    const winnerSlot = p1Match ? match.p1 : match.p2;
    const loserSlot = p1Match ? match.p2 : match.p1;

    match.winnerId = winnerSlot.playerId;
    match.loserId = loserSlot.playerId;
    match.score1 = Number(score1) || 0;
    match.score2 = Number(score2) || 0;
    match.status = "done";
    match.finishedAt = Date.now();
    match.tko = Boolean(opts.tko);
    if (opts.dqReason) match.dqReason = String(opts.dqReason);

    if (opts.antiCheat && typeof opts.antiCheat === "object") {
      match.antiCheat = opts.antiCheat;
      for (const [acPid, acVal] of Object.entries(opts.antiCheat)) {
        if (!acVal || typeof acVal !== "object") continue;
        const p = findParticipant(tour, acPid, null);
        if (!p) continue;
        if (!p.acSummary) {
          p.acSummary = { kills: 0, deaths: 0, shots: 0, hits: 0, hs: 0, dmgDealt: 0, flagsSpeed: 0, flagsFireRate: 0, flagsDmg: 0, totalFlags: 0 };
        }
        p.acSummary.kills += Number(acVal.kills) || 0;
        p.acSummary.deaths += Number(acVal.deaths) || 0;
        p.acSummary.shots += Number(acVal.shots) || 0;
        p.acSummary.hits += Number(acVal.hits) || 0;
        p.acSummary.hs += Number(acVal.hs) || 0;
        p.acSummary.dmgDealt += Number(acVal.dmgDealt) || 0;
        p.acSummary.flagsSpeed += Number(acVal.flagsSpeed) || 0;
        p.acSummary.flagsFireRate += Number(acVal.flagsFireRate) || 0;
        p.acSummary.flagsDmg += Number(acVal.flagsDmg) || 0;
        p.acSummary.totalFlags = p.acSummary.flagsSpeed + p.acSummary.flagsFireRate + p.acSummary.flagsDmg;
      }
    }

    const rounds = tour.bracket.rounds || [];
    const totalRounds = tour.bracket.totalRounds;

    if (match.id !== "M_3RD") {
      // Keyingi raundga ko'chirish
      if (match.roundIdx + 1 < rounds.length) {
        const nextMatch = rounds[match.roundIdx + 1].matches[Math.floor(match.matchIdx / 2)];
        const slotKey = (match.matchIdx % 2 === 0) ? "p1" : "p2";
        nextMatch[slotKey] = Object.assign({}, winnerSlot);

        if (nextMatch.p1 && nextMatch.p2 && nextMatch.status === "pending") {
          const p1Part = findParticipant(tour, nextMatch.p1.playerId, nextMatch.p1.tgId);
          const p2Part = findParticipant(tour, nextMatch.p2.playerId, nextMatch.p2.tgId);
          if (p1Part && p1Part.dq && !(p2Part && p2Part.dq)) {
            nextMatch.status = "ready";
            nextMatch.readyAt = Date.now();
            saveTourDb();
            return reportMatchResult(nextMatch.id, nextMatch.p2.playerId, 1, 0, { tko: true, dqReason: p1Part.dqReason || "DQ" });
          } else if (p2Part && p2Part.dq && !(p1Part && p1Part.dq)) {
            nextMatch.status = "ready";
            nextMatch.readyAt = Date.now();
            saveTourDb();
            return reportMatchResult(nextMatch.id, nextMatch.p1.playerId, 1, 0, { tko: true, dqReason: p2Part.dqReason || "DQ" });
          }
          nextMatch.status = "ready";
          nextMatch.readyAt = Date.now();
          await notifyPairReady(nextMatch);
        }
      }

      // Yarim final mag'lubini 3-o'rin jangiga joylash
      if (totalRounds >= 2 && match.roundIdx === totalRounds - 2 && tour.bracket.thirdPlaceMatch) {
        const tm = tour.bracket.thirdPlaceMatch;
        const slotKey = (match.matchIdx % 2 === 0) ? "p1" : "p2";
        tm[slotKey] = Object.assign({}, loserSlot);

        // Agar size=4 va 3 o'yinchi bo'lib narigi yarim final BYE bo'lsa, 3-o'rinni avtomatik berish
        const otherSemiIdx = match.matchIdx % 2 === 0 ? match.matchIdx + 1 : match.matchIdx - 1;
        const otherSemi = rounds[match.roundIdx] && rounds[match.roundIdx].matches[otherSemiIdx];
        if (otherSemi && otherSemi.status === "bye" && tm.status === "pending") {
          tm.status = "bye";
          tm.winnerId = loserSlot.playerId;
          tm.finishedAt = Date.now();
        } else if (tm.p1 && tm.p2 && tm.status === "pending") {
          const p1Part = findParticipant(tour, tm.p1.playerId, tm.p1.tgId);
          const p2Part = findParticipant(tour, tm.p2.playerId, tm.p2.tgId);
          if (p1Part && p1Part.dq && !(p2Part && p2Part.dq)) {
            tm.status = "ready";
            tm.readyAt = Date.now();
            saveTourDb();
            return reportMatchResult(tm.id, tm.p2.playerId, 1, 0, { tko: true, dqReason: p1Part.dqReason || "DQ" });
          } else if (p2Part && p2Part.dq && !(p1Part && p1Part.dq)) {
            tm.status = "ready";
            tm.readyAt = Date.now();
            saveTourDb();
            return reportMatchResult(tm.id, tm.p1.playerId, 1, 0, { tko: true, dqReason: p2Part.dqReason || "DQ" });
          }
          tm.status = "ready";
          tm.readyAt = Date.now();
          await notifyPairReady(tm);
        }
      }
    }

    saveTourDb();

    // Grand Final va (agar mavjud bo'lsa) 3-o'rin jangi tugaganligini tekshirish
    const finalRound = rounds[rounds.length - 1];
    const grandFinal = finalRound && finalRound.matches && finalRound.matches[0];
    const thirdMatch = tour.bracket.thirdPlaceMatch;
    let tournamentFinished = false;
    if (grandFinal && grandFinal.status === "done" && (!thirdMatch || thirdMatch.status === "done" || thirdMatch.status === "bye")) {
      await finalizeTournament(tour);
      tournamentFinished = true;
    }

    return { ok: true, match, tournamentFinished };
  }

  async function startTournamentLive(tour, manualStart = false) {
    if (!tour) return { ok: false, error: "NO_TOURNAMENT" };
    if (tour.status === "live") return { ok: false, error: "ALREADY_LIVE" };
    if (tour.status === "finished" || tour.status === "cancelled") return { ok: false, error: "TOURNAMENT_ENDED" };

    const bracket = buildPlayoffBracket(tour, { manualStart });
    if (!bracket) {
      return { ok: false, error: "NOT_ENOUGH_PLAYERS" };
    }

    tour.bracket = bracket;
    tour.status = "live";
    tour.startedAt = Date.now();
    tour.notified = Object.assign({}, tour.notified, { start: true });
    saveTourDb();

    // 1-raund juftliklari va BYE olganlarga DM
    const r1Matches = (bracket.rounds[0] && bracket.rounds[0].matches) || [];
    for (let i = 0; i < r1Matches.length; i++) {
      const m = r1Matches[i];
      if (m.status === "bye" && m.p1 && m.p1.tgId) {
        await sendPlayerDm(
          m.p1.tgId,
          `🔥 <b>TURNIR BOSHLANDI!</b>\n\n` +
          `✅ Siz yuqori ELO reytingingiz tufayli 1-raunddan <b>BYE</b> bilan avtomatik 2-raundga o'tdingiz!\n` +
          `⏳ Raqibingiz aniqlanishi bilan sizga xabar beramiz.`,
          true
        );
      } else if (m.status === "ready" && m.p1 && m.p2) {
        await sendPlayerDm(
          m.p1.tgId,
          `🔥 <b>TURNIR BOSHLANDI!</b>\n\n` +
          `🏆 Raund: <b>${escapeHtml(m.roundName)}</b> (<code>${escapeHtml(m.id)}</code>)\n` +
          `🆚 Raqibingiz: <b>${escapeHtml(m.p2.name)}</b> (ELO: ${Number(m.p2.elo) || 1000})\n\n` +
          `👇 Jang xonasiga kirish uchun tugmani bosing:`,
          true
        );
        await sendPlayerDm(
          m.p2.tgId,
          `🔥 <b>TURNIR BOSHLANDI!</b>\n\n` +
          `🏆 Raund: <b>${escapeHtml(m.roundName)}</b> (<code>${escapeHtml(m.id)}</code>)\n` +
          `🆚 Raqibingiz: <b>${escapeHtml(m.p1.name)}</b> (ELO: ${Number(m.p1.elo) || 1000})\n\n` +
          `👇 Jang xonasiga kirish uchun tugmani bosing:`,
          true
        );
      }
      await new Promise(r => setTimeout(r, 60));
    }

    // 2-raundda BYE lar sababli tayyor juftlik bo'lsa
    if (bracket.rounds[1]) {
      for (const m2 of bracket.rounds[1].matches) {
        if (m2.status === "ready") {
          await notifyPairReady(m2);
        }
      }
    }

    await sendChannelPost(
      `🔥 <b>TURNIR BOSHLANDI! (${escapeHtml(tour.title)})</b>\n\n` +
      `⚔️ <b>1v1 Olimpiya Play-off</b> setkasi (${bracket.playerCount} nafar jangchi, ${bracket.size} lik setka) rasman start oldi!\n` +
      `🏆 Sovrin fondi: <b>${formatMoney(tour.totalPrize)} so'm</b> + 850 💎\n\n` +
      `📺 Natijalar va setkani o'yin ichida jonli kuzating!`
    );

    return { ok: true, bracket };
  }

  // ==================== AVTOMATIK VAQTNAZORATCHI (har 15s) ====================
  let _tickBusy = false;
  async function schedulerTick() {
    if (_tickBusy) return;
    _tickBusy = true;
    try {
      const tour = tourDb.active;
      if (!tour || tour.status === "finished" || tour.status === "cancelled") return;
      if (!tour.notified) tour.notified = { h1: false, checkin: false, start: false, lowPlayers: false };

      const now = Date.now();

      // Double No-Show himoyasi: 3 daqiqa (180s) ichida ikkala o'yinchi ham kirmasa yuqori seed o'tadi
      if (tour.status === "live") {
        if (tour.bracket) {
          const allMatches = getAllBracketMatches(tour.bracket);
          for (const m of allMatches) {
            if (m.status === "ready" && m.p1 && m.p2 && !m.roomCode && m.readyAt > 0 && (now - m.readyAt) >= 180000) {
              await reportMatchResult(m.id, m.p1.playerId, 1, 0, { tko: true, dqReason: "DOUBLE_NO_SHOW" });
            }
          }
        }
        return;
      }

      const checkinAt = Number(tour.checkinAt) || (Number(tour.startAt) - 15 * 60 * 1000);

      if (tour.status === "registration") {
        if (now >= tour.startAt - 60 * 60 * 1000 && now < checkinAt && !tour.notified.h1) {
          tour.notified.h1 = true;
          saveTourDb();
          await broadcastQueuedDm(tour.participants, () =>
            `⏳ <b>TURNIRGA 1 SOAT QOLDI!</b>\n\n` +
            `🏆 <b>${escapeHtml(tour.title)}</b>\n` +
            `🕒 Start: <b>${formatTashkentDateTime(tour.startAt)}</b>\n` +
            `✅ Startdan 15 daqiqa oldin Check-In ochiladi. Tayyor turing!`
          );
        }
        if (now >= checkinAt) {
          tour.status = "checkin";
          tour.notified.checkin = true;
          tour.notified.h1 = true;
          saveTourDb();
          await broadcastQueuedDm(tour.participants, () =>
            `✅ <b>CHECK-IN OCHILDI! 15 daqiqa ichida TASDIQLASH bosing</b>\n\n` +
            `🏆 <b>${escapeHtml(tour.title)}</b>\n` +
            `⚠️ Check-In qilmagan o'yinchilar Play-off setkasiga kiritilmaydi!\n\n` +
            `👇 Hozir kirib tasdiqlang:`
          );
        }
      }

      if (tour.status === "checkin" && now >= tour.startAt) {
        const checked = (tour.participants || []).filter(p => p && p.checkedIn === true && !p.dq);
        if (checked.length >= 2) {
          await startTournamentLive(tour, false);
        } else if (!tour.notified.lowPlayers) {
          tour.notified.lowPlayers = true;
          saveTourDb();
          await sendAdminDm(
            `⚠️ Check-in qilganlar 2 tadan kam (${checked.length} ta). /tour_start yoki /tour_time +15 bering`
          );
        }
      }
    } catch (err) {
      console.error("[Tournament] Scheduler tick error:", err.message);
    } finally {
      _tickBusy = false;
    }
  }

  const _schedulerInterval = setInterval(schedulerTick, 15000);
  if (_schedulerInterval.unref) _schedulerInterval.unref();

  // ==================== REST API ENDPOINTLARI (/api/tour/*) ====================
  app.get("/api/tour/state", async (req, res) => {
    try {
      const playerId = String(req.query.playerId || "").trim().toUpperCase();
      const tgId = String(req.query.tgId || "").trim();
      const active = tourDb.active;

      const mePart = findParticipant(active, playerId, tgId);
      const effectivePid = (mePart && mePart.playerId) || playerId;
      const effectiveTgId = (mePart && mePart.tgId) || tgId;

      let isChannelMember = false;
      if (effectiveTgId) {
        const sub = await checkChannelSubscription(effectiveTgId, false);
        isChannelMember = Boolean(sub && sub.isMember);
      }

      let myWinnerRank = null;
      let hasSubmittedPayout = false;
      const latestFin = getLatestFinishedTour();
      if (latestFin && latestFin.winners) {
        const matchWinner = (w) => w && (
          (effectivePid && String(w.playerId).toUpperCase() === effectivePid) ||
          (effectiveTgId && String(w.tgId) === String(effectiveTgId))
        );
        if (matchWinner(latestFin.winners.first)) {
          myWinnerRank = 1;
          hasSubmittedPayout = Boolean(latestFin.winners.first.payout && latestFin.winners.first.payout.submittedAt);
        } else if (matchWinner(latestFin.winners.second)) {
          myWinnerRank = 2;
          hasSubmittedPayout = Boolean(latestFin.winners.second.payout && latestFin.winners.second.payout.submittedAt);
        } else if (matchWinner(latestFin.winners.third)) {
          myWinnerRank = 3;
          hasSubmittedPayout = Boolean(latestFin.winners.third.payout && latestFin.winners.third.payout.submittedAt);
        }
      }

      const myMatchRaw = findPlayerMatch(active, effectivePid, effectiveTgId);
      const myMatch = myMatchRaw ? sanitizeBracketPublic({ rounds: [{ roundIdx: 0, roundName: myMatchRaw.roundName, matches: [myMatchRaw] }] }).rounds[0].matches[0] : null;
      const refCount = active && Array.isArray(active.participants) && effectivePid
        ? active.participants.filter(p => p.refBy && String(p.refBy).toUpperCase() === effectivePid).length
        : 0;

      return res.json({
        ok: true,
        serverNow: Date.now(),
        active: sanitizeTourForPublic(active, effectivePid),
        me: {
          isRegistered: Boolean(mePart && !mePart.dq),
          isDq: Boolean(mePart && mePart.dq),
          isCheckedIn: Boolean(mePart && mePart.checkedIn),
          isChannelMember,
          myMatch,
          myWinnerRank,
          hasSubmittedPayout,
          refCount
        },
        history: (tourDb.history || []).slice(0, 10).map(h => sanitizeTourForPublic(h, effectivePid))
      });
    } catch (err) {
      console.error("[Tournament] /api/tour/state error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  app.post("/api/tour/check-channel", async (req, res) => {
    try {
      const { playerId, tgId } = req.body || {};
      const mainP = findMainPlayer(playerId, tgId);
      const resolvedTgId = String(tgId || (mainP && mainP.tgId) || "").trim();
      const sub = await checkChannelSubscription(resolvedTgId, true);
      return res.json({
        ok: Boolean(sub.ok),
        isMember: Boolean(sub.isMember),
        status: sub.status || "",
        reason: sub.reason || "",
        channelUrl: CHANNEL_URL
      });
    } catch (err) {
      console.error("[Tournament] /api/tour/check-channel error:", err);
      return res.status(500).json({ ok: false, isMember: false, error: "SERVER_ERROR" });
    }
  });

  app.post("/api/tour/register", async (req, res) => {
    try {
      const { playerId, tgId, name, username, photoUrl, refBy } = req.body || {};
      const active = tourDb.active;
      if (!active || (active.status !== "registration" && active.status !== "checkin")) {
        return res.status(400).json({ ok: false, error: "REGISTRATION_CLOSED" });
      }

      const mainP = findMainPlayer(playerId, tgId);
      const resolvedTgId = String(tgId || (mainP && mainP.tgId) || "").trim();
      if (!resolvedTgId) {
        return res.status(400).json({ ok: false, error: "TG_REQUIRED" });
      }

      const sub = await checkChannelSubscription(resolvedTgId, true);
      if (!sub || !sub.isMember) {
        return res.status(403).json({
          ok: false,
          error: "NOT_SUBSCRIBED",
          channelUrl: CHANNEL_URL,
          reason: (sub && sub.reason) || ""
        });
      }

      const pid = String(playerId || (mainP && mainP.id) || ("TG-" + resolvedTgId)).trim().toUpperCase();
      const existing = findParticipant(active, pid, resolvedTgId);
      if (existing) {
        return res.json({
          ok: true,
          alreadyRegistered: true,
          participant: {
            playerId: existing.playerId,
            name: existing.name,
            checkedIn: existing.checkedIn
          },
          active: sanitizeTourForPublic(active, existing.playerId)
        });
      }

      const activeCount = active.participants.filter(p => !p.dq).length;
      if (activeCount >= Number(active.maxPlayers || 32)) {
        return res.status(400).json({ ok: false, error: "TOURNAMENT_FULL" });
      }

      let validRefBy = "";
      const cleanRef = String(refBy || "").trim().toUpperCase();
      if (cleanRef && cleanRef !== pid) {
        const inviter = findMainPlayer(cleanRef, null);
        if (inviter && String(inviter.tgId || "") !== resolvedTgId) {
          validRefBy = inviter.id;
          if (!Array.isArray(active.rewardedRefTgIds)) active.rewardedRefTgIds = [];
          if (!active.rewardedRefTgIds.includes(resolvedTgId)) {
            active.rewardedRefTgIds.push(resolvedTgId);
            if (!inviter.userStats || typeof inviter.userStats !== "object") inviter.userStats = {};
            inviter.userStats.coins = Math.max(0, Math.floor(Number(inviter.userStats.coins) || 0)) + 1000;
            if (typeof saveDb === "function") saveDb();
          }
        }
      }

      const elo = Number((mainP && mainP.userStats && mainP.userStats.elo)) || 1000;
      const participant = {
        playerId: pid,
        tgId: resolvedTgId,
        name: String(name || (mainP && mainP.name) || "Jangchi").slice(0, 40),
        username: String(username || (mainP && mainP.username) || "").replace(/^@+/, ""),
        photoUrl: String(photoUrl || (mainP && mainP.photoUrl) || ""),
        elo,
        checkedIn: active.status === "checkin",
        checkedInAt: active.status === "checkin" ? Date.now() : 0,
        dq: false,
        dqReason: "",
        refBy: validRefBy,
        registeredAt: Date.now()
      };

      active.participants.push(participant);
      saveTourDb();

      await sendPlayerDm(
        resolvedTgId,
        `🎟 <b>TURNIR CHIPTASI TASDIQLANDI!</b>\n\n` +
        `🏆 Turnir: <b>${escapeHtml(active.title)}</b>\n` +
        `👤 Jangchi: <b>${escapeHtml(participant.name)}</b> (<code>${escapeHtml(participant.playerId)}</code>)\n` +
        `📊 ELO Reyting: <b>${participant.elo}</b>\n` +
        `🕒 Boshlanishi: <b>${formatTashkentDateTime(active.startAt)}</b>\n` +
        `${participant.checkedIn ? "✅ Check-In avtomatik tasdiqlandi!" : "⏰ Startdan 15 daqiqa oldin Check-In tugmasini bosishni unutmang!"}`,
        true
      );

      return res.json({
        ok: true,
        participant: {
          playerId: participant.playerId,
          name: participant.name,
          checkedIn: participant.checkedIn
        },
        active: sanitizeTourForPublic(active, pid)
      });
    } catch (err) {
      console.error("[Tournament] /api/tour/register error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  app.post("/api/tour/checkin", (req, res) => {
    try {
      const { playerId, tgId } = req.body || {};
      const active = tourDb.active;
      if (!active || active.status !== "checkin") {
        return res.status(400).json({ ok: false, error: "CHECKIN_NOT_OPEN" });
      }
      const part = findParticipant(active, playerId, tgId);
      if (!part) {
        return res.status(404).json({ ok: false, error: "NOT_REGISTERED" });
      }
      if (part.dq) {
        return res.status(403).json({ ok: false, error: "DISQUALIFIED" });
      }
      part.checkedIn = true;
      part.checkedInAt = Date.now();
      saveTourDb();
      return res.json({
        ok: true,
        isCheckedIn: true,
        active: sanitizeTourForPublic(active, part.playerId)
      });
    } catch (err) {
      console.error("[Tournament] /api/tour/checkin error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  app.post("/api/tour/enter-match", (req, res) => {
    try {
      const { playerId, tgId } = req.body || {};
      const active = tourDb.active;
      if (!active || active.status !== "live") {
        return res.status(404).json({ ok: false, error: "NO_ACTIVE_MATCH" });
      }
      const part = findParticipant(active, playerId, tgId);
      const effectivePid = (part && part.playerId) || String(playerId || "").trim().toUpperCase();
      const effectiveTgId = (part && part.tgId) || String(tgId || "").trim();
      const m = findPlayerMatch(active, effectivePid, effectiveTgId);
      if (!m || (m.status !== "ready" && m.status !== "playing")) {
        return res.status(404).json({ ok: false, error: "NO_ACTIVE_MATCH" });
      }
      if (!m.p1 || !m.p2) {
        return res.status(400).json({ ok: false, error: "MATCH_NOT_READY" });
      }
      if (!_mpEngine || typeof _mpEngine.createTournamentRoom !== "function") {
        return res.status(500).json({ ok: false, error: "MP_ENGINE_UNAVAILABLE" });
      }

      const isP1 = (effectivePid && String(m.p1.playerId).toUpperCase() === effectivePid) ||
        (effectiveTgId && String(m.p1.tgId) === effectiveTgId);
      const mySlot = isP1 ? m.p1 : m.p2;
      const oppSlot = isP1 ? m.p2 : m.p1;
      const myTeam = isP1 ? "red" : "blue";

      let room = (m.roomCode && typeof _mpEngine.getRoom === "function") ? _mpEngine.getRoom(m.roomCode) : null;
      if (!room || room.status === "ended") {
        room = _mpEngine.createTournamentRoom({
          tourId: active.id,
          matchId: m.id,
          roundName: m.roundName,
          p1: m.p1,
          p2: m.p2,
          mazeIdx: 0
        });
        attachRoomToMatch(m.id, room.code, { markPlaying: false });
      }

      if (!m.urgentDmSent && oppSlot && oppSlot.tgId) {
        m.urgentDmSent = true;
        saveTourDb();
        sendPlayerDm(
          oppSlot.tgId,
          `⏳ <b>SHOSHILINCH! RAQIBINGIZ KUTMOQDA!</b>\n\n` +
          `🏆 ${escapeHtml(m.roundName)}\n` +
          `🆚 <b>${escapeHtml(mySlot.name)}</b> 1v1 turnir xonasiga kirdi!\n` +
          `⚠️ <b>45 soniya</b> ichida kirmasangiz texnik mag'lubiyat (TKO) yoziladi!\n\n` +
          `👇 Darhol jangga kiring:`,
          true
        ).catch(() => {});
      }

      return res.json({
        ok: true,
        roomCode: room.code,
        matchId: m.id,
        roundName: m.roundName,
        team: myTeam,
        opponentName: oppSlot.name,
        opponentElo: oppSlot.elo,
        noShowDeadlineAt: room.noShowDeadlineAt || (Date.now() + 45000)
      });
    } catch (err) {
      console.error("[Tournament] /api/tour/enter-match error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  app.post("/api/tour/payout", async (req, res) => {
    try {
      const { playerId, tgId, cardNumber, holderName, phone } = req.body || {};
      const tour = getLatestFinishedTour();
      if (!tour || !tour.winners) {
        return res.status(400).json({ ok: false, error: "NO_FINISHED_TOURNAMENT" });
      }

      const pidUp = String(playerId || "").trim().toUpperCase();
      const tgStr = String(tgId || "").trim();
      const matchesWinner = (w) => w && (
        (pidUp && String(w.playerId).toUpperCase() === pidUp) ||
        (tgStr && String(w.tgId) === tgStr)
      );

      let rank = 0;
      let winnerObj = null;
      if (matchesWinner(tour.winners.first)) { rank = 1; winnerObj = tour.winners.first; }
      else if (matchesWinner(tour.winners.second)) { rank = 2; winnerObj = tour.winners.second; }
      else if (matchesWinner(tour.winners.third)) { rank = 3; winnerObj = tour.winners.third; }

      if (!winnerObj) {
        return res.status(403).json({ ok: false, error: "NOT_A_WINNER" });
      }

      const cleanCard = String(cardNumber || "").replace(/\D/g, "");
      if (cleanCard.length < 12 || cleanCard.length > 19) {
        return res.status(400).json({ ok: false, error: "INVALID_CARD" });
      }
      const cleanHolder = String(holderName || "").trim().slice(0, 80);
      const cleanPhone = String(phone || "").trim().slice(0, 32);
      if (!cleanHolder) {
        return res.status(400).json({ ok: false, error: "INVALID_HOLDER_NAME" });
      }

      const payoutData = {
        cardRaw: cleanCard,
        cardMasked: maskCardNumber(cleanCard),
        holderName: cleanHolder,
        phone: cleanPhone,
        submittedAt: Date.now()
      };

      winnerObj.payout = payoutData;
      // Agar active va history alohida nusxa bo'lsa, ikkalasini ham sinxronlash
      const rankKey = rank === 1 ? "first" : (rank === 2 ? "second" : "third");
      if (tourDb.active && tourDb.active.id === tour.id && tourDb.active.winners && tourDb.active.winners[rankKey]) {
        tourDb.active.winners[rankKey].payout = Object.assign({}, payoutData);
      }
      syncHistoryRecord(tour);
      saveTourDb();

      await sendAdminDm(
        `💳 <b>TURNIR G'OLIBIDAN KARTA MA'LUMOTI!</b>\n\n` +
        `🏆 Turnir: <b>${escapeHtml(tour.title)}</b>\n` +
        `🥇 O'rin: <b>${rank}-o'rin</b>\n` +
        `👤 G'olib: <b>${escapeHtml(winnerObj.name)}</b> (<code>${escapeHtml(winnerObj.playerId)}</code>)\n` +
        `💵 Mukofot: <b>${formatMoney(winnerObj.cashPrize)} so'm</b>\n` +
        `💳 Karta: <code>${escapeHtml(cleanCard)}</code>\n` +
        `🪪 Karta egasi: <b>${escapeHtml(cleanHolder)}</b>\n` +
        `📞 Telefon: <code>${escapeHtml(cleanPhone || "-")}</code>\n\n` +
        `✅ To'lab bo'lgach shu buyruqni yuboring:\n<code>/tour_paid ${escapeHtml(winnerObj.playerId)}</code>`
      );

      return res.json({
        ok: true,
        rank,
        cardMasked: payoutData.cardMasked,
        submittedAt: payoutData.submittedAt
      });
    } catch (err) {
      console.error("[Tournament] /api/tour/payout error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  // ==================== TELEGRAM BOT ADMIN BUYRUQLARI ====================
  async function handleAdminCommand(msg) {
    if (!msg || !msg.from || String(msg.from.id) !== adminIdStr) {
      return false;
    }
    const text = String(msg.text || "").trim();
    if (!text.startsWith("/tour")) return false;

    const parts = text.split(/\s+/);
    const cmd = parts[0].split("@")[0].toLowerCase();
    const args = parts.slice(1);

    try {
      if (cmd === "/tour_help") {
        await sendAdminDm(
          `🛠 <b>DIGI DIGI TURNIR — ADMIN BUYRUQLARI</b>\n\n` +
          `• <code>/tour_create [sovrin] [max]</code> — Yangi turnir (masalan: <code>/tour_create 500000 32</code>)\n` +
          `• <code>/tour_prize &lt;1&gt; &lt;2&gt; &lt;3&gt;</code> — Sovrinlarni o'zgartirish\n` +
          `• <code>/tour_time +&lt;daqiqa&gt;</code> — masalan <code>/tour_time +5</code> (Check-in hoziroq!)\n` +
          `• <code>/tour_time &lt;YYYY-MM-DD&gt; &lt;HH:MM&gt;</code> — Toshkent vaqti bilan start\n` +
          `• <code>/tour_announce</code> — @digi_digi_kanal ga afisha joylash\n` +
          `• <code>/tour_status</code> — Holat, ro'yxat va juftliklar\n` +
          `• <code>/tour_checkin</code> — Check-in bosqichini hoziroq ochish\n` +
          `• <code>/tour_start</code> — Setkani qurib hoziroq LIVE qilish\n` +
          `• <code>/tour_win &lt;MATCH_ID&gt; &lt;PLAYER_ID&gt;</code> — Bahsli jangda g'olib qo'yish\n` +
          `• <code>/tour_dq &lt;PLAYER_ID&gt; [sabab]</code> — Diskvalifikatsiya\n` +
          `• <code>/tour_finish</code> — Turnirni yakunlash\n` +
          `• <code>/tour_paid &lt;PLAYER_ID&gt;</code> — G'olibga pul to'langanini belgilash\n` +
          `• <code>/tour_cancel</code> — Faol turnirni bekor qilish`
        );
        return true;
      }

      if (cmd === "/tour_create") {
        if (tourDb.active && !["finished", "cancelled"].includes(tourDb.active.status)) {
          await sendAdminDm(`⚠️ Hozir faol turnir mavjud (<code>${escapeHtml(tourDb.active.id)}</code>, holat: <b>${tourDb.active.status}</b>). Avval <code>/tour_cancel</code> yoki <code>/tour_finish</code> bering.`);
          return true;
        }
        const totalPrize = Math.max(0, parseInt(args[0], 10) || 500000);
        const maxPlayers = Math.min(64, Math.max(2, parseInt(args[1], 10) || 32));
        const p1 = Math.round(totalPrize * 0.5);
        const p2 = Math.round(totalPrize * 0.3);
        const p3 = Math.max(0, totalPrize - p1 - p2);

        tourDb.seq += 1;
        const startAt = getNextSunday20TashkentMs();
        const checkinAt = startAt - 15 * 60 * 1000;
        const tour = {
          id: "TOUR-" + tourDb.seq,
          seq: tourDb.seq,
          title: `DIGI DIGI GRAND CUP #${tourDb.seq}`,
          status: "registration",
          createdAt: Date.now(),
          startAt,
          checkinAt,
          startedAt: 0,
          finishedAt: 0,
          maxPlayers,
          totalPrize,
          prizes: { first: p1, second: p2, third: p3 },
          gemPrizes: { first: 500, second: 250, third: 100 },
          channelId: CHANNEL_ID,
          channelUsername: CHANNEL_USERNAME,
          channelUrl: CHANNEL_URL,
          participants: [],
          rewardedRefTgIds: [],
          bracket: null,
          winners: null,
          gemsAwarded: false,
          notified: { h1: false, checkin: false, start: false, lowPlayers: false }
        };
        tourDb.active = tour;
        saveTourDb();

        await sendAdminDm(
          `✅ <b>Yangi turnir yaratildi!</b>\n\n` +
          `🆔 ID: <code>${tour.id}</code>\n` +
          `🏆 Nom: <b>${escapeHtml(tour.title)}</b>\n` +
          `🕒 Start: <b>${formatTashkentDateTime(tour.startAt)}</b>\n` +
          `👥 Maksimal o'yinchi: <b>${tour.maxPlayers}</b>\n` +
          `💵 Sovrin: <b>${formatMoney(tour.totalPrize)} so'm</b> (🥇 ${formatMoney(p1)} / 🥈 ${formatMoney(p2)} / 🥉 ${formatMoney(p3)})\n` +
          `💎 Kristallar: +500 / +250 / +100\n\n` +
          `📢 Kanalga e'lon chiqarish uchun: <code>/tour_announce</code>`
        );
        return true;
      }

      if (cmd === "/tour_paid") {
        const targetId = args[0];
        if (!targetId) {
          await sendAdminDm("ℹ️ Namuna: <code>/tour_paid DOOM-1234</code>");
          return true;
        }
        const finTour = getLatestFinishedTour();
        if (!finTour || !finTour.winners) {
          await sendAdminDm("⚠️ Yakunlangan turnir topilmadi.");
          return true;
        }
        const qUp = String(targetId).trim().toUpperCase();
        const qRaw = String(targetId).trim();
        let foundRank = 0;
        let foundWinner = null;
        for (const [rankNum, key] of [[1, "first"], [2, "second"], [3, "third"]]) {
          const w = finTour.winners[key];
          if (w && (String(w.playerId).toUpperCase() === qUp || String(w.tgId) === qRaw)) {
            foundRank = rankNum;
            foundWinner = w;
            break;
          }
        }
        if (!foundWinner) {
          await sendAdminDm(`❌ <code>${escapeHtml(targetId)}</code> oxirgi turnir TOP-3 g'oliblari orasida topilmadi.`);
          return true;
        }
        foundWinner.paid = true;
        foundWinner.paidAt = Date.now();
        const rankKey = foundRank === 1 ? "first" : (foundRank === 2 ? "second" : "third");
        if (tourDb.active && tourDb.active.id === finTour.id && tourDb.active.winners && tourDb.active.winners[rankKey]) {
          tourDb.active.winners[rankKey].paid = true;
          tourDb.active.winners[rankKey].paidAt = foundWinner.paidAt;
        }
        syncHistoryRecord(finTour);
        saveTourDb();

        if (foundWinner.tgId) {
          await sendPlayerDm(
            foundWinner.tgId,
            `💸 <b>SOVRIN TO'LANDI!</b>\n\n` +
            `🏆 Turnir: <b>${escapeHtml(finTour.title)}</b> (${foundRank}-o'rin)\n` +
            `💵 Summa: <b>${formatMoney(foundWinner.cashPrize)} so'm</b> kartangizga o'tkazildi!\n` +
            `🔥 Tabriklaymiz va keyingi janglarda omad tilaymiz!`,
            true
          );
        }
        await sendAdminDm(`✅ <b>To'langan deb belgilandi:</b> ${escapeHtml(foundWinner.name)} (<code>${escapeHtml(foundWinner.playerId)}</code>, ${foundRank}-o'rin, ${formatMoney(foundWinner.cashPrize)} so'm).`);
        return true;
      }

      const active = tourDb.active;
      if (!active) {
        await sendAdminDm("⚠️ Hozir faol turnir yo'q. Yangi ochish uchun: <code>/tour_create 500000 32</code>");
        return true;
      }

      if (cmd === "/tour_prize") {
        const p1 = parseInt(args[0], 10);
        const p2 = parseInt(args[1], 10);
        const p3 = parseInt(args[2], 10);
        if (!Number.isFinite(p1) || !Number.isFinite(p2) || !Number.isFinite(p3) || p1 < 0 || p2 < 0 || p3 < 0) {
          await sendAdminDm("ℹ️ Namuna: <code>/tour_prize 300000 150000 50000</code>");
          return true;
        }
        active.prizes = { first: p1, second: p2, third: p3 };
        active.totalPrize = p1 + p2 + p3;
        saveTourDb();
        await sendAdminDm(`✅ Sovrinlar yangilandi: 🥇 ${formatMoney(p1)} / 🥈 ${formatMoney(p2)} / 🥉 ${formatMoney(p3)} (Jami: ${formatMoney(active.totalPrize)} so'm)`);
        return true;
      }

      if (cmd === "/tour_time") {
        if (["live", "finished", "cancelled"].includes(active.status)) {
          await sendAdminDm(`⚠️ Turnir holati <b>${active.status}</b>, start vaqtini o'zgartirib bo'lmaydi.`);
          return true;
        }
        const arg0 = args[0] || "";
        const now = Date.now();
        if (/^\+\d+$/.test(arg0)) {
          const mins = Math.max(1, parseInt(arg0.slice(1), 10));
          active.startAt = now + mins * 60 * 1000;
          active.checkinAt = now;
          active.notified = Object.assign({}, active.notified, { h1: true, checkin: true, lowPlayers: false });
          if (active.status === "registration") {
            active.status = "checkin";
            saveTourDb();
            await broadcastQueuedDm(active.participants, () =>
              `✅ <b>CHECK-IN OCHILDI! ${mins} daqiqa ichida TASDIQLASH bosing</b>\n\n` +
              `🏆 <b>${escapeHtml(active.title)}</b>\n` +
              `🕒 Start: <b>${formatTashkentDateTime(active.startAt)}</b>`
            );
          } else {
            saveTourDb();
          }
          await sendAdminDm(`⏱ Start <b>+${mins} daqiqa</b> ga ko'chirildi (${formatTashkentDateTime(active.startAt)}). Check-In hozir ochiq!`);
          return true;
        }
        const dateStr = args[0] || "";
        const timeStr = args[1] || "20:00";
        const mDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
        const mTime = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
        if (!mDate || !mTime) {
          await sendAdminDm("ℹ️ Namuna: <code>/tour_time +5</code> yoki <code>/tour_time 2026-11-29 20:00</code>");
          return true;
        }
        const startMs = Date.UTC(Number(mDate[1]), Number(mDate[2]) - 1, Number(mDate[3]), Number(mTime[1]), Number(mTime[2]), 0, 0) - TASHKENT_OFFSET_MS;
        active.startAt = startMs;
        active.checkinAt = startMs - 15 * 60 * 1000;
        active.notified = { h1: false, checkin: false, start: false, lowPlayers: false };
        if (now >= active.checkinAt && now < active.startAt && active.status === "registration") {
          active.status = "checkin";
          active.notified.checkin = true;
        } else if (now < active.checkinAt && active.status === "checkin") {
          active.status = "registration";
        }
        saveTourDb();
        await sendAdminDm(`🕒 Turnir vaqti yangilandi: <b>${formatTashkentDateTime(active.startAt)}</b>`);
        return true;
      }

      if (cmd === "/tour_announce") {
        const postText =
          `🏆 <b>${escapeHtml(active.title)} — RASMIY 1v1 TURNIR!</b>\n\n` +
          `💵 <b>Sovrin fondi:</b> ${formatMoney(active.totalPrize)} so'm + 850 💎\n` +
          `🥇 1-o'rin: <b>${formatMoney(active.prizes.first)} so'm</b> + 500 💎\n` +
          `🥈 2-o'rin: <b>${formatMoney(active.prizes.second)} so'm</b> + 250 💎\n` +
          `🥉 3-o'rin: <b>${formatMoney(active.prizes.third)} so'm</b> + 100 💎\n\n` +
          `⚔️ <b>Format:</b> 1v1 Olimpiya Play-off (Maks. ${active.maxPlayers} jangchi)\n` +
          `🕒 <b>Boshlanishi:</b> ${formatTashkentDateTime(active.startAt)}\n` +
          `📢 <b>Shart:</b> ${CHANNEL_USERNAME} kanaliga obuna bo'lish va startdan 15 daqiqa oldin Check-In bosish!\n\n` +
          `👇 <b>Ro'yxatdan o'tish uchun tugmani bosing:</b>`;
        const resPost = await sendChannelPost(postText);
        if (resPost && resPost.ok) {
          await sendAdminDm(`✅ Kanalga joylandi! (message_id: <code>${resPost.result && resPost.result.message_id}</code>)`);
        } else {
          await sendAdminDm(`❌ Kanalga joylashda xato: <code>${escapeHtml((resPost && resPost.description) || "Noma'lum xato")}</code>`);
        }
        return true;
      }

      if (cmd === "/tour_status") {
        const partsList = active.participants || [];
        const validParts = partsList.filter(p => !p.dq);
        const checked = validParts.filter(p => p.checkedIn);
        let msgOut =
          `📊 <b>TURNIR HOLATI: ${escapeHtml(active.title)}</b>\n` +
          `🆔 ID: <code>${active.id}</code> | Holat: <b>${active.status.toUpperCase()}</b>\n` +
          `🕒 Start: <b>${formatTashkentDateTime(active.startAt)}</b>\n` +
          `👥 Ro'yxatda: <b>${validParts.length}/${active.maxPlayers}</b> | ✅ Check-In: <b>${checked.length}</b>\n\n`;

        if (validParts.length) {
          msgOut += `<b>Ro'yxat (birinchi 20 ta):</b>\n`;
          msgOut += validParts.slice(0, 20).map((p, idx) =>
            `${idx + 1}. ${p.checkedIn ? "✅" : "⏳"} <b>${escapeHtml(p.name)}</b> (<code>${escapeHtml(p.playerId)}</code>, ${p.elo})`
          ).join("\n") + "\n\n";
        }
        if (active.bracket) {
          const liveMatches = getAllBracketMatches(active.bracket).filter(m => m.status === "ready" || m.status === "playing");
          msgOut += `<b>Faol juftliklar (${liveMatches.length} ta):</b>\n`;
          msgOut += (liveMatches.length ? liveMatches.map(m =>
            `• <code>${m.id}</code> (${escapeHtml(m.roundName)}): <b>${escapeHtml(m.p1 && m.p1.name)}</b> vs <b>${escapeHtml(m.p2 && m.p2.name)}</b> [${m.status}]`
          ).join("\n") : "(Hozircha faol jang yo'q)");
        }
        await sendAdminDm(msgOut);
        return true;
      }

      if (cmd === "/tour_checkin") {
        if (active.status === "live" || active.status === "finished" || active.status === "cancelled") {
          await sendAdminDm(`⚠️ Turnir holati <b>${active.status}</b>, Check-in ochib bo'lmaydi.`);
          return true;
        }
        active.status = "checkin";
        active.checkinAt = Date.now();
        active.notified = Object.assign({}, active.notified, { checkin: true, h1: true });
        saveTourDb();

        const activeCount = active.participants.filter(p => !p.dq && p.tgId).length;
        await broadcastQueuedDm(active.participants, () =>
          `✅ <b>CHECK-IN OCHILDI! 15 daqiqa ichida TASDIQLASH bosing</b>\n\n` +
          `🏆 <b>${escapeHtml(active.title)}</b>\n` +
          `👇 O'yinga kirib Check-In tugmasini bosing:`
        );
        await sendAdminDm(`✅ Check-In ochildi va ${activeCount} ta o'yinchiga DM yuborildi.`);
        return true;
      }

      if (cmd === "/tour_start") {
        const started = await startTournamentLive(active, true);
        if (!started.ok) {
          await sendAdminDm(`❌ Turnirni boshlab bo'lmadi: <code>${started.error}</code> (kamida 2 ta DQ bo'lmagan o'yinchi kerak).`);
          return true;
        }
        await sendAdminDm(
          `🔥 <b>TURNIR BOSHLANDI (LIVE)!</b>\n` +
          `👥 O'yinchilar: <b>${started.bracket.playerCount}</b> | Setka: <b>${started.bracket.size}</b>\n` +
          `📋 Juftliklarni ko'rish: <code>/tour_status</code>`
        );
        return true;
      }

      if (cmd === "/tour_win") {
        const matchId = args[0];
        const winnerId = args[1];
        if (!matchId || !winnerId) {
          await sendAdminDm("ℹ️ Namuna: <code>/tour_win R1_M1 DOOM-1234</code>");
          return true;
        }
        const resWin = await reportMatchResult(matchId, winnerId, 1, 0, { adminOverride: true });
        if (!resWin.ok) {
          await sendAdminDm(`❌ Xato: <code>${resWin.error}</code>`);
          return true;
        }
        await sendAdminDm(`✅ <code>${escapeHtml(matchId.toUpperCase())}</code> g'olibi: <code>${escapeHtml(resWin.match.winnerId)}</code>.${resWin.tournamentFinished ? " 🏆 Turnir avtomatik yakunlandi!" : ""}`);
        return true;
      }

      if (cmd === "/tour_dq") {
        const targetId = args[0];
        const reason = args.slice(1).join(" ").trim() || "Qoidabuzarlik / kelmadi";
        if (!targetId) {
          await sendAdminDm("ℹ️ Namuna: <code>/tour_dq DOOM-1234 kelmadi</code>");
          return true;
        }
        const part = findParticipant(active, targetId, targetId);
        if (!part) {
          await sendAdminDm(`❌ O'yinchi topilmadi: <code>${escapeHtml(targetId)}</code>`);
          return true;
        }
        part.dq = true;
        part.dqReason = reason;
        saveTourDb();

        if (part.tgId) {
          await sendPlayerDm(
            part.tgId,
            `⛔ <b>DISKVALIFIKATSIYA</b>\n\n` +
            `🏆 Turnir: <b>${escapeHtml(active.title)}</b>\n` +
            `📝 Sabab: ${escapeHtml(reason)}`,
            false
          );
        }

        if (active.status === "live" && active.bracket) {
          const allMatches = getAllBracketMatches(active.bracket);
          const activeMatch = allMatches.find(m =>
            (m.status === "ready" || m.status === "playing") &&
            ((m.p1 && m.p1.playerId === part.playerId) || (m.p2 && m.p2.playerId === part.playerId))
          );
          if (activeMatch && activeMatch.p1 && activeMatch.p2) {
            const opp = activeMatch.p1.playerId === part.playerId ? activeMatch.p2 : activeMatch.p1;
            const dqRes = await reportMatchResult(activeMatch.id, opp.playerId, 1, 0, { tko: true, dqReason: reason });
            await sendAdminDm(`⛔ <b>${escapeHtml(part.name)}</b> (<code>${part.playerId}</code>) diskvalifikatsiya qilindi. <code>${activeMatch.id}</code> g'olibi: <b>${escapeHtml(opp.name)}</b>.${dqRes.tournamentFinished ? " 🏆 Turnir yakunlandi!" : ""}`);
            return true;
          }
        }
        await sendAdminDm(`⛔ <b>${escapeHtml(part.name)}</b> (<code>${part.playerId}</code>) diskvalifikatsiya qilindi. Sabab: ${escapeHtml(reason)}`);
        return true;
      }

      if (cmd === "/tour_finish") {
        const fin = await finalizeTournament(active, { force: true });
        if (!fin.ok) {
          await sendAdminDm(`❌ Yakunlashda xato: <code>${fin.error}</code>`);
          return true;
        }
        await sendAdminDm(`🏁 Turnir majburiy yakunlandi va natijalar e'lon qilindi.`);
        return true;
      }

      if (cmd === "/tour_cancel") {
        if (active.status === "finished") {
          await sendAdminDm("⚠️ Turnir allaqachon yakunlangan.");
          return true;
        }
        active.status = "cancelled";
        active.cancelledAt = Date.now();
        syncHistoryRecord(active);
        tourDb.active = null;
        saveTourDb();
        await broadcastQueuedDm(active.participants, () =>
          `⚠️ <b>TURNIR BEKOR QILINDI</b>\n\n` +
          `🏆 <b>${escapeHtml(active.title)}</b> admin tomonidan bekor qilindi. Yangi turnir haqida kanalda xabar beriladi.`
        );
        await sendAdminDm(`🗑 Turnir bekor qilindi (<code>${escapeHtml(active.id)}</code>).`);
        return true;
      }

      await sendAdminDm(`❓ Noma'lum buyruq: <code>${escapeHtml(cmd)}</code>. Ro'yxat uchun: <code>/tour_help</code>`);
      return true;
    } catch (err) {
      console.error("[Tournament] Admin command error:", err);
      await sendAdminDm(`❌ Ichki xato: <code>${escapeHtml(err.message)}</code>`);
      return true;
    }
  }

  function getActiveTournament() {
    return tourDb.active;
  }

  function getTourMatchByRoomCode(roomCode) {
    const active = tourDb.active;
    if (!active || !active.bracket || !roomCode) return null;
    const code = String(roomCode).trim().toUpperCase();
    const match = getAllBracketMatches(active.bracket).find(m => String(m.roomCode || "").toUpperCase() === code);
    return match ? { tournament: active, match } : null;
  }

  function attachRoomToMatch(matchId, roomCode, opts = {}) {
    const active = tourDb.active;
    if (!active || !active.bracket) return { ok: false, error: "NO_LIVE_TOURNAMENT" };
    const match = findBracketMatch(active.bracket, matchId);
    if (!match) return { ok: false, error: "MATCH_NOT_FOUND" };
    match.roomCode = String(roomCode || "").trim().toUpperCase();
    if (opts.markPlaying !== false && match.status === "ready") {
      match.status = "playing";
      if (!match.startedAt) match.startedAt = Date.now();
    }
    saveTourDb();
    return { ok: true, match };
  }

  return {
    handleAdminCommand,
    reportMatchResult,
    getActiveTournament,
    getTourMatchByRoomCode,
    attachRoomToMatch,
    setMpEngine
  };
}

module.exports = {
  initTournament,
  getNextSunday20TashkentMs,
  formatTashkentDateTime,
  buildPlayoffBracket
};
