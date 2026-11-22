/**
 * DIGI DIGI — Real-Time Multiplayer Room Engine (SSE + Keep-Alive HTTP)
 * Zero external dependencies — Livops HTTPS proxy compatible (no WS 502)
 */
const MAP_SIZE = 16;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const RED_SPAWNS = [
  { x: 1.5, y: 1.5, a: 0 },
  { x: 4.5, y: 1.5, a: Math.PI / 2 },
  { x: 1.5, y: 4.5, a: 0 },
  { x: 7.5, y: 1.5, a: Math.PI / 2 }
];
const BLUE_SPAWNS = [
  { x: 14.5, y: 14.5, a: Math.PI },
  { x: 11.5, y: 14.5, a: -Math.PI / 2 },
  { x: 14.5, y: 11.5, a: Math.PI },
  { x: 8.5, y: 14.5, a: -Math.PI / 2 }
];

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function cleanId(raw) {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

function cleanName(raw, fallback) {
  const s = String(raw || "").trim().replace(/[<>]/g, "").slice(0, 20);
  return s || fallback || "Jangchi";
}

function cleanCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function initMultiplayer(app) {
  const rooms = new Map();       // code -> room
  const playerRoom = new Map();  // playerId -> code

  function genCode() {
    for (let attempt = 0; attempt < 30; attempt++) {
      let c = "";
      for (let i = 0; i < 4; i++) {
        c += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }
      if (!rooms.has(c)) return c;
    }
    return String(Date.now()).slice(-4);
  }

  function sseWrite(res, eventName, payloadObj) {
    if (!res || res.writableEnded || res.destroyed) return false;
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payloadObj)}\n\n`);
      return true;
    } catch (e) {
      return false;
    }
  }

  function broadcast(room, eventName, payloadObj, excludeId = null) {
    if (!room) return;
    if (eventName !== "state") {
      if (!Array.isArray(room.events)) room.events = [];
      if (typeof room.nextEventSeq !== "number") room.nextEventSeq = 1;
      room.events.push({
        seq: room.nextEventSeq++,
        type: eventName,
        data: payloadObj,
        excludeId: excludeId || null,
        at: Date.now()
      });
      if (room.events.length > 80) {
        room.events.splice(0, room.events.length - 80);
      }
    }
    const msg = `event: ${eventName}\ndata: ${JSON.stringify(payloadObj)}\n\n`;
    for (const p of room.players.values()) {
      if (excludeId && p.id === excludeId) continue;
      if (p.sseRes && !p.sseRes.writableEnded && !p.sseRes.destroyed) {
        try {
          p.sseRes.write(msg);
        } catch (e) {
          p.sseRes = null;
        }
      }
    }
  }

  function buildStatePayload(room, now) {
    const rem = room.status === "playing" && room.startedAt
      ? Math.max(0, Math.ceil((room.durationSec * 1000 - (now - room.startedAt)) / 1000))
      : room.durationSec;
    const arr = [];
    for (const p of room.players.values()) {
      arr.push([
        p.id,
        +p.x.toFixed(2),
        +p.y.toFixed(2),
        +p.a.toFixed(2),
        p.hp,
        p.alive ? 1 : 0,
        p.mv ? 1 : 0,
        now < p.mfUntil ? 1 : 0,
        p.kills,
        p.deaths,
        p.wp
      ]);
    }
    return { rem, rs: room.redScore, bs: room.blueScore, p: arr };
  }

  function collectEventsSince(room, sinceSeq, pid) {
    const since = Math.max(0, parseInt(sinceSeq, 10) || 0);
    const list = Array.isArray(room.events) ? room.events : [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      if (ev.seq > since && (!ev.excludeId || ev.excludeId !== pid)) {
        out.push({ seq: ev.seq, type: ev.type, data: ev.data });
      }
    }
    const latestSeq = (typeof room.nextEventSeq === "number" ? room.nextEventSeq - 1 : 0);
    return { events: out, seq: latestSeq };
  }

  function serializeRoom(room) {
    const now = Date.now();
    const remSec = room.status === "playing" && room.startedAt
      ? Math.max(0, Math.ceil((room.durationSec * 1000 - (now - room.startedAt)) / 1000))
      : room.durationSec;
    const playersList = [];
    for (const p of room.players.values()) {
      playersList.push({
        id: p.id,
        name: p.name,
        team: p.team,
        x: +p.x.toFixed(2),
        y: +p.y.toFixed(2),
        a: +p.a.toFixed(2),
        hp: p.hp,
        armor: p.armor,
        alive: p.alive,
        kills: p.kills,
        deaths: p.deaths,
        wp: p.wp,
        isHost: p.id === room.hostId
      });
    }
    return {
      code: room.code,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      mazeIdx: room.mazeIdx,
      isPublic: room.isPublic,
      status: room.status,
      hostId: room.hostId,
      redScore: room.redScore,
      blueScore: room.blueScore,
      remSec,
      players: playersList
    };
  }

  function pickTeam(room, preferred) {
    const half = room.maxPlayers / 2;
    let r = 0, b = 0;
    for (const p of room.players.values()) {
      if (p.team === "red") r++;
      else b++;
    }
    if (preferred === "red" && r < half) return "red";
    if (preferred === "blue" && b < half) return "blue";
    return r <= b ? "red" : "blue";
  }

  function getSpawnFor(room, team, slotIdx) {
    const list = team === "red" ? RED_SPAWNS : BLUE_SPAWNS;
    return list[slotIdx % list.length];
  }

  function removePlayerFromAnyRoom(pid) {
    const oldCode = playerRoom.get(pid);
    if (!oldCode) return;
    playerRoom.delete(pid);
    const oldRoom = rooms.get(oldCode);
    if (!oldRoom) return;
    const existing = oldRoom.players.get(pid);
    if (existing && existing.sseRes && !existing.sseRes.writableEnded) {
      try { existing.sseRes.end(); } catch (e) {}
    }
    oldRoom.players.delete(pid);
    oldRoom.updatedAt = Date.now();
    if (oldRoom.players.size === 0) {
      rooms.delete(oldCode);
      return;
    }
    if (oldRoom.hostId === pid) {
      const nextHost = oldRoom.players.values().next().value;
      if (nextHost) oldRoom.hostId = nextHost.id;
    }
    broadcast(oldRoom, "room", serializeRoom(oldRoom));
  }

  function addPlayerToRoom(room, pid, name, preferredTeam) {
    if (room.players.has(pid)) {
      const p = room.players.get(pid);
      p.name = name || p.name;
      p.lastSeenAt = Date.now();
      playerRoom.set(pid, room.code);
      return p;
    }
    removePlayerFromAnyRoom(pid);
    const team = pickTeam(room, preferredTeam);
    let slotIdx = 0;
    for (const o of room.players.values()) {
      if (o.team === team) slotIdx++;
    }
    const sp = getSpawnFor(room, team, slotIdx);
    const p = {
      id: pid,
      name,
      team,
      x: sp.x,
      y: sp.y,
      a: sp.a,
      hp: 100,
      armor: 50,
      alive: true,
      respawnAt: 0,
      spawnShieldUntil: 0,
      kills: 0,
      deaths: 0,
      wp: 0,
      mv: 0,
      mfUntil: 0,
      lastSeenAt: Date.now(),
      sseRes: null
    };
    room.players.set(pid, p);
    playerRoom.set(pid, room.code);
    room.updatedAt = Date.now();
    room.dirty = true;
    return p;
  }

  function startRoomMatch(room) {
    const now = Date.now();
    room.status = "playing";
    room.startedAt = now;
    room.redScore = 0;
    room.blueScore = 0;
    room.updatedAt = now;
    room.dirty = true;
    let rIdx = 0, bIdx = 0;
    for (const p of room.players.values()) {
      const sp = p.team === "red" ? getSpawnFor(room, "red", rIdx++) : getSpawnFor(room, "blue", bIdx++);
      p.x = sp.x;
      p.y = sp.y;
      p.a = sp.a;
      p.hp = 100;
      p.armor = 50;
      p.alive = true;
      p.respawnAt = 0;
      p.spawnShieldUntil = now + 2600;
      p.kills = 0;
      p.deaths = 0;
      p.mv = 0;
      p.mfUntil = 0;
      p.lastSeenAt = now;
    }
    broadcast(room, "start", serializeRoom(room));
  }

  // 1) Ochiq xonalar ro'yxati
  app.get("/api/mp/rooms", (req, res) => {
    const list = [];
    for (const r of rooms.values()) {
      if (!r.isPublic || r.status === "ended") continue;
      if (r.players.size >= r.maxPlayers) continue;
      const host = r.players.get(r.hostId);
      list.push({
        code: r.code,
        mode: r.mode,
        status: r.status,
        mazeIdx: r.mazeIdx,
        playersCount: r.players.size,
        maxPlayers: r.maxPlayers,
        hostName: host ? host.name : "Jangchi"
      });
    }
    res.json({ ok: true, rooms: list, activeRoomsCount: rooms.size });
  });

  // 2) Yangi xona yaratish
  app.post("/api/mp/create", (req, res) => {
    const b = req.body || {};
    const pid = cleanId(b.playerId);
    if (!pid) return res.status(400).json({ ok: false, error: "INVALID_PLAYER" });
    const mode = b.mode === "4v4" ? "4v4" : "1v1";
    const code = genCode();
    const room = {
      code,
      mode,
      maxPlayers: mode === "4v4" ? 8 : 2,
      mazeIdx: b.mazeIdx === 1 ? 1 : 0,
      isPublic: b.isPublic !== false,
      status: "waiting",
      hostId: pid,
      durationSec: 120,
      startedAt: null,
      redScore: 0,
      blueScore: 0,
      players: new Map(),
      events: [],
      nextEventSeq: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dirty: false
    };
    rooms.set(code, room);
    addPlayerToRoom(room, pid, cleanName(b.name, pid), b.team === "blue" ? "blue" : "red");
    res.json({ ok: true, room: serializeRoom(room), seq: (typeof room.nextEventSeq === "number" ? room.nextEventSeq - 1 : 0) });
  });

  // 3) Kod orqali xonaga qo'shilish
  app.post("/api/mp/join", (req, res) => {
    const b = req.body || {};
    const pid = cleanId(b.playerId);
    const code = cleanCode(b.code);
    if (!pid || !code) return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
    const room = rooms.get(code);
    if (!room) return res.status(404).json({ ok: false, error: "ROOM_NOT_FOUND" });
    if (!room.players.has(pid) && room.players.size >= room.maxPlayers) {
      return res.status(409).json({ ok: false, error: "ROOM_FULL" });
    }
    addPlayerToRoom(room, pid, cleanName(b.name, pid), b.team);
    const snap = serializeRoom(room);
    broadcast(room, "room", snap);
    res.json({ ok: true, room: snap, seq: (typeof room.nextEventSeq === "number" ? room.nextEventSeq - 1 : 0) });
  });

  // 4) Tezkor avto-qidiruv (1v1 / 4v4 ochiq xona topadi yoki yangi yaratadi)
  app.post("/api/mp/quickmatch", (req, res) => {
    const b = req.body || {};
    const pid = cleanId(b.playerId);
    if (!pid) return res.status(400).json({ ok: false, error: "INVALID_PLAYER" });
    const mode = b.mode === "4v4" ? "4v4" : "1v1";
    const name = cleanName(b.name, pid);

    let target = null;
    for (const r of rooms.values()) {
      if (r.isPublic && r.mode === mode && r.status === "waiting" && r.players.size < r.maxPlayers && !r.players.has(pid)) {
        target = r;
        break;
      }
    }
    if (!target) {
      const code = genCode();
      target = {
        code,
        mode,
        maxPlayers: mode === "4v4" ? 8 : 2,
        mazeIdx: 0,
        isPublic: true,
        status: "waiting",
        hostId: pid,
        durationSec: 120,
        startedAt: null,
        redScore: 0,
        blueScore: 0,
        players: new Map(),
        events: [],
        nextEventSeq: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        dirty: false
      };
      rooms.set(code, target);
    }
    addPlayerToRoom(target, pid, name, b.team);
    const snap = serializeRoom(target);
    broadcast(target, "room", snap);
    res.json({ ok: true, room: snap, seq: (typeof target.nextEventSeq === "number" ? target.nextEventSeq - 1 : 0) });
  });

  // 5) Kutish xonasida jamoa almashtirish
  app.post("/api/mp/team", (req, res) => {
    const b = req.body || {};
    const pid = cleanId(b.playerId);
    const code = cleanCode(b.code);
    const room = rooms.get(code);
    if (!room || room.status !== "waiting") return res.status(400).json({ ok: false });
    const p = room.players.get(pid);
    if (!p) return res.status(404).json({ ok: false });
    const want = b.team === "blue" ? "blue" : "red";
    const half = room.maxPlayers / 2;
    let cnt = 0;
    for (const o of room.players.values()) {
      if (o.id !== pid && o.team === want) cnt++;
    }
    if (cnt >= half) return res.status(409).json({ ok: false, error: "TEAM_FULL" });
    p.team = want;
    p.lastSeenAt = Date.now();
    const snap = serializeRoom(room);
    broadcast(room, "room", snap);
    res.json({ ok: true, room: snap });
  });

  // 6) Jangni boshlash / Qayta o'ynash (Host boshlaydi, >=2 o'yinchi kerak)
  app.post("/api/mp/start", (req, res) => {
    const b = req.body || {};
    const pid = cleanId(b.playerId);
    const code = cleanCode(b.code);
    const room = rooms.get(code);
    if (!room) return res.status(404).json({ ok: false, error: "ROOM_NOT_FOUND" });
    if (room.hostId !== pid) return res.status(403).json({ ok: false, error: "NOT_HOST" });
    if (room.players.size < 2) return res.status(400).json({ ok: false, error: "NEED_OPPONENT" });
    if (typeof b.mazeIdx === "number") room.mazeIdx = b.mazeIdx === 1 ? 1 : 0;
    startRoomMatch(room);
    res.json({ ok: true, room: serializeRoom(room) });
  });

  // 7) Xonadan chiqish
  app.post("/api/mp/leave", (req, res) => {
    const b = req.body || {};
    const pid = cleanId(b.playerId);
    if (pid) removePlayerFromAnyRoom(pid);
    res.json({ ok: true });
  });

  // 8) SSE Jonli Oqim (Server -> Client real-time updates)
  app.get("/api/mp/stream", (req, res) => {
    console.log("[MP] /api/mp/stream hit query:", req.query);
    const code = cleanCode(req.query.code);
    const pid = cleanId(req.query.playerId);
    const room = rooms.get(code);
    if (!room || !room.players.has(pid)) {
      return res.status(404).json({ ok: false, error: "ROOM_OR_PLAYER_NOT_FOUND" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const p = room.players.get(pid);
    if (p.sseRes && p.sseRes !== res && !p.sseRes.writableEnded) {
      try { p.sseRes.end(); } catch (e) {}
    }
    p.sseRes = res;
    p.lastSeenAt = Date.now();

    res.write(": " + " ".repeat(4096) + "\n\n");
    res.write(": connected\n\n");
    sseWrite(res, "room", serializeRoom(room));

    req.on("close", () => {
      if (p.sseRes === res) p.sseRes = null;
    });
  });

  // 8.5) Zero-Buffer HTTP Poll (Caddy SSE buferlanishisiz 0 ms sinxronizatsiya)
  app.get("/api/mp/poll", (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    const code = cleanCode(req.query.code);
    const pid = cleanId(req.query.playerId);
    const room = rooms.get(code);
    if (!room || !room.players.has(pid)) {
      return res.status(404).json({ ok: false, error: "ROOM_OR_PLAYER_NOT_FOUND" });
    }
    const now = Date.now();
    const p = room.players.get(pid);
    p.lastSeenAt = now;

    const { events, seq } = collectEventsSince(room, req.query.since, pid);
    const state = room.status === "playing" ? buildStatePayload(room, now) : null;
    res.json({
      ok: true,
      seq,
      room: serializeRoom(room),
      state,
      events
    });
  });

  // 9) Ultra-tezkor harakat + sinxronizatsiya paketi (1 ta HTTP so'rovda ham yuboradi, ham oladi)
  app.post("/api/mp/state", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const b = req.body || {};
    const code = cleanCode(b.code);
    const pid = cleanId(b.playerId);
    const room = rooms.get(code);
    if (!room) return res.status(404).json({ ok: false, error: "ROOM_NOT_FOUND" });
    const p = room.players.get(pid);
    if (!p) return res.status(404).json({ ok: false, error: "PLAYER_NOT_FOUND" });

    const now = Date.now();
    p.lastSeenAt = now;
    if (p.alive) {
      p.x = clamp(b.x, 1.0, MAP_SIZE - 1.0);
      p.y = clamp(b.y, 1.0, MAP_SIZE - 1.0);
      p.a = Number.isFinite(Number(b.a)) ? Number(b.a) : p.a;
      p.mv = b.mv ? 1 : 0;
      p.wp = Math.max(0, Math.min(3, parseInt(b.wp, 10) || 0));
      room.dirty = true;
    }

    const { events, seq } = collectEventsSince(room, b.since, pid);
    res.json({
      ok: true,
      seq,
      status: room.status,
      state: room.status === "playing" ? buildStatePayload(room, now) : null,
      events
    });
  });

  // 10) Otishma va Server-Authoritative Zarar / Headshot / Kill
  app.post("/api/mp/shoot", (req, res) => {
    const b = req.body || {};
    const code = cleanCode(b.code);
    const pid = cleanId(b.playerId);
    const room = rooms.get(code);
    if (!room || room.status !== "playing") return res.status(400).json({ ok: false });
    const shooter = room.players.get(pid);
    if (!shooter || !shooter.alive) return res.status(400).json({ ok: false });

    const now = Date.now();
    shooter.lastSeenAt = now;
    shooter.mfUntil = now + 130;
    room.dirty = true;

    broadcast(room, "shoot", {
      id: shooter.id,
      x: +shooter.x.toFixed(2),
      y: +shooter.y.toFixed(2),
      wp: shooter.wp
    }, shooter.id);

    const targetId = cleanId(b.hitTargetId);
    if (!targetId) return res.json({ ok: true, hit: false });

    const target = room.players.get(targetId);
    if (!target || !target.alive || target.team === shooter.team) {
      return res.json({ ok: true, hit: false });
    }
    if (now < target.spawnShieldUntil) {
      return res.json({ ok: true, hit: false, shielded: true });
    }

    const rawDmg = Math.round(clamp(b.dmg, 5, 135));
    let hpDmg = rawDmg;
    if (target.armor > 0) {
      const absorb = Math.min(target.armor, Math.ceil(rawDmg * 0.45));
      target.armor -= absorb;
      hpDmg = Math.max(1, rawDmg - absorb);
    }
    target.hp = Math.max(0, target.hp - hpDmg);
    const isHeadshot = !!b.isHeadshot;
    const isWallbang = !!b.isWallbang;
    const badge = isHeadshot ? "🎯HS" : (isWallbang ? "🧱WB" : "💥");

    broadcast(room, "hit", {
      shooterId: shooter.id,
      targetId: target.id,
      sx: +shooter.x.toFixed(2),
      sy: +shooter.y.toFixed(2),
      dmg: rawDmg,
      hp: target.hp,
      armor: target.armor,
      hs: isHeadshot
    });

    let killed = false;
    if (target.hp <= 0) {
      killed = true;
      target.alive = false;
      target.respawnAt = now + 3200;
      target.deaths++;
      shooter.kills++;
      if (shooter.team === "red") room.redScore++;
      else room.blueScore++;

      broadcast(room, "kill", {
        killerId: shooter.id,
        killerName: shooter.name,
        killerTeam: shooter.team,
        victimId: target.id,
        victimName: target.name,
        victimTeam: target.team,
        badge,
        hs: isHeadshot,
        redScore: room.redScore,
        blueScore: room.blueScore
      });
    }

    res.json({ ok: true, hit: true, killed, targetHp: target.hp, targetArmor: target.armor });
  });

  // 11) Granata / Tutun sinxronizatsiyasi
  app.post("/api/mp/grenade", (req, res) => {
    const b = req.body || {};
    const code = cleanCode(b.code);
    const pid = cleanId(b.playerId);
    const room = rooms.get(code);
    if (!room || room.status !== "playing") return res.status(400).end();
    const p = room.players.get(pid);
    if (!p || !p.alive) return res.status(400).end();
    broadcast(room, "grenade", {
      fromId: pid,
      team: p.team,
      kind: b.kind === "smoke" ? "smoke" : "he",
      x: +clamp(b.x, 1, MAP_SIZE - 1).toFixed(2),
      y: +clamp(b.y, 1, MAP_SIZE - 1).toFixed(2),
      vx: +clamp(b.vx, -12, 12).toFixed(2),
      vy: +clamp(b.vy, -12, 12).toFixed(2)
    }, pid);
    res.status(204).end();
  });

  // 16.6 Hz (har 60ms) ixcham pozitsiya oqimi
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.status !== "playing") continue;
      if (!room.dirty) continue;
      room.dirty = false;
      const rem = Math.max(0, Math.ceil((room.durationSec * 1000 - (now - room.startedAt)) / 1000));
      const arr = [];
      for (const p of room.players.values()) {
        arr.push([
          p.id,
          +p.x.toFixed(2),
          +p.y.toFixed(2),
          +p.a.toFixed(2),
          p.hp,
          p.alive ? 1 : 0,
          p.mv ? 1 : 0,
          now < p.mfUntil ? 1 : 0,
          p.kills,
          p.deaths,
          p.wp
        ]);
      }
      broadcast(room, "state", { rem, rs: room.redScore, bs: room.blueScore, p: arr });
    }
  }, 60);

  // Har 500ms: qayta tirilish, taymer tugashi va uzilgan o'yinchilarni tozalash
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      let roomChanged = false;

      for (const [pid, p] of room.players.entries()) {
        const timeoutMs = 28000;
        if (now - p.lastSeenAt > timeoutMs && !p.sseRes) {
          room.players.delete(pid);
          playerRoom.delete(pid);
          roomChanged = true;
          continue;
        }
        if (room.status === "playing" && !p.alive && p.respawnAt > 0 && now >= p.respawnAt) {
          const spList = p.team === "red" ? RED_SPAWNS : BLUE_SPAWNS;
          const sp = spList[Math.floor(Math.random() * spList.length)];
          p.x = sp.x;
          p.y = sp.y;
          p.a = sp.a;
          p.hp = 100;
          p.armor = 50;
          p.alive = true;
          p.respawnAt = 0;
          p.spawnShieldUntil = now + 2600;
          room.dirty = true;
          broadcast(room, "respawn", { id: p.id, x: p.x, y: p.y, a: p.a, hp: 100, armor: 50 });
        }
      }

      if (room.players.size === 0 || (now - room.updatedAt > 10 * 60 * 1000 && room.status !== "playing")) {
        rooms.delete(code);
        continue;
      }

      if (roomChanged) {
        if (!room.players.has(room.hostId)) {
          const first = room.players.values().next().value;
          if (first) room.hostId = first.id;
        }
        broadcast(room, "room", serializeRoom(room));
      }

      if (room.status === "playing" && room.startedAt) {
        const elapsed = (now - room.startedAt) / 1000;
        if (elapsed >= room.durationSec) {
          room.status = "ended";
          const winner = room.redScore > room.blueScore ? "red" : (room.blueScore > room.redScore ? "blue" : "draw");
          broadcast(room, "match_end", { winner, room: serializeRoom(room) });
        }
      }
    }
  }, 500);

  // Har 14 soniyada SSE keep-alive (Livops/Nginx proxy ulanishni uzmasligi uchun)
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const p of room.players.values()) {
        if (p.sseRes && !p.sseRes.writableEnded && !p.sseRes.destroyed) {
          try { p.sseRes.write(": ping\n\n"); } catch (e) { p.sseRes = null; }
        }
      }
    }
  }, 14000);
}

module.exports = { initMultiplayer };
