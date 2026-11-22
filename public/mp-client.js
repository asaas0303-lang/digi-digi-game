/**
 * DIGI DIGI — Real-Time Multiplayer Client & Live Lobby UI (SSE + Keep-Alive HTTP)
 * Works seamlessly with mp_engine.js on Livops HTTPS proxy (0 external dependencies)
 */
(function () {
  if (window.DIGI_MP) return;

  const BOT_USERNAME = "digi_dig_bot";
  let currentRoom = null;
  let pollTimer = null;
  let pollInFlight = false;
  let lastEventSeq = 0;
  let activeMatchStartedAt = 0;
  let roomsPollTimer = null;
  let selectedMpMode = "1v1";
  let _lastStateSentAt = 0;
  let _stateInFlight = false;
  let _manualLeave = false;
  let _hooks = null;

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showMpToast(msg, emoji) {
    const tb = document.getElementById("toastBox");
    const tm = document.getElementById("toastMsg");
    const te = document.getElementById("toastEmoji");
    if (tb && tm) {
      if (te && emoji) te.textContent = emoji;
      tm.textContent = msg;
      tb.classList.remove("hidden");
      if (window._mpToastTimer) clearTimeout(window._mpToastTimer);
      window._mpToastTimer = setTimeout(() => {
        tb.classList.add("hidden");
      }, 2800);
    }
  }

  function getPlayerIdentity() {
    const idEl = document.getElementById("myDoomId");
    const nameEl = document.getElementById("myNameInput");
    let id = (idEl && idEl.textContent) ? idEl.textContent.trim().toUpperCase() : "";
    let name = (nameEl && nameEl.value) ? nameEl.value.trim() : "";

    if (!id || id === "DOOM-0000") {
      try {
        const raw = localStorage.getItem("digi_digi_tg_bridge_v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.myId) id = String(parsed.myId).trim().toUpperCase();
          if (!name && parsed && parsed.myName) name = String(parsed.myName).trim();
        }
      } catch (e) {}
    }
    if (!id) {
      id = "DOOM-" + Math.floor(1000 + Math.random() * 9000);
    }
    if (!name) name = id;
    return { id, name };
  }

  async function apiPost(url, bodyObj) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj || {}),
      cache: "no-store"
    });
    const data = await res.json().catch(() => ({ ok: false, error: "BAD_JSON" }));
    if (!res.ok && data.ok !== false) data.ok = false;
    return data;
  }

  function dispatchMpEvent(evType, data) {
    if (!evType || !data) return;
    switch (evType) {
      case "room":
        currentRoom = data;
        renderMpRoomUI();
        if (_hooks && typeof _hooks.onRoom === "function") {
          try { _hooks.onRoom(data); } catch (e) {}
        }
        break;
      case "start":
        currentRoom = data;
        renderMpRoomUI();
        if (!activeMatchStartedAt) {
          activeMatchStartedAt = Date.now();
          if (_hooks && typeof _hooks.onMatchStart === "function") {
            try { _hooks.onMatchStart(data); } catch (e) {}
          } else {
            showMpToast("🔥 Jonli " + (data.mode || "1v1").toUpperCase() + " jangi boshlandi!", "⚔️");
          }
        }
        break;
      case "state":
        if (currentRoom) {
          currentRoom.redScore = data.rs;
          currentRoom.blueScore = data.bs;
          currentRoom.remSec = data.rem;
        }
        if (_hooks && typeof _hooks.onState === "function") {
          try { _hooks.onState(data); } catch (e) {}
        }
        break;
      case "shoot":
        if (_hooks && typeof _hooks.onShoot === "function") {
          try { _hooks.onShoot(data); } catch (e) {}
        }
        break;
      case "hit":
        if (_hooks && typeof _hooks.onHit === "function") {
          try { _hooks.onHit(data); } catch (e) {}
        }
        break;
      case "kill":
        if (currentRoom && data) {
          if (typeof data.redScore === "number") currentRoom.redScore = data.redScore;
          if (typeof data.blueScore === "number") currentRoom.blueScore = data.blueScore;
        }
        if (_hooks && typeof _hooks.onKill === "function") {
          try { _hooks.onKill(data); } catch (e) {}
        }
        break;
      case "respawn":
        if (_hooks && typeof _hooks.onRespawn === "function") {
          try { _hooks.onRespawn(data); } catch (e) {}
        }
        break;
      case "grenade":
        if (_hooks && typeof _hooks.onGrenade === "function") {
          try { _hooks.onGrenade(data); } catch (e) {}
        }
        break;
      case "match_end":
        if (data.room) currentRoom = data.room;
        activeMatchStartedAt = 0;
        renderMpRoomUI();
        if (_hooks && typeof _hooks.onMatchEnd === "function") {
          try { _hooks.onMatchEnd(data); } catch (e) {}
        }
        break;
    }
  }

  function applySyncPayload(payload) {
    if (!payload || !payload.ok) return;

    if (typeof payload.seq === "number" && payload.seq > lastEventSeq) {
      lastEventSeq = payload.seq;
    }

    if (payload.room) {
      currentRoom = payload.room;
      renderMpRoomUI();
      if (_hooks && typeof _hooks.onRoom === "function") {
        try { _hooks.onRoom(payload.room); } catch (e) {}
      }
    }

    if (Array.isArray(payload.events) && payload.events.length > 0) {
      for (let i = 0; i < payload.events.length; i++) {
        const ev = payload.events[i];
        if (ev && ev.type) {
          dispatchMpEvent(ev.type, ev.data);
        }
      }
    }

    if (currentRoom && currentRoom.status === "playing") {
      if (!activeMatchStartedAt) {
        activeMatchStartedAt = Date.now();
        if (_hooks && typeof _hooks.onMatchStart === "function") {
          try { _hooks.onMatchStart(currentRoom); } catch (e) {}
        }
      }
    } else if (currentRoom && currentRoom.status !== "playing") {
      activeMatchStartedAt = 0;
    }

    if (payload.state) {
      if (currentRoom) {
        currentRoom.redScore = payload.state.rs;
        currentRoom.blueScore = payload.state.bs;
        currentRoom.remSec = payload.state.rem;
      }
      if (_hooks && typeof _hooks.onState === "function") {
        try { _hooks.onState(payload.state); } catch (e) {}
      }
    }
  }

  async function pollRoomOnce() {
    if (!currentRoom || pollInFlight || _manualLeave) return;
    const me = getPlayerIdentity();
    const code = currentRoom.code;
    pollInFlight = true;
    try {
      const url = `/api/mp/poll?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(me.id)}&since=${lastEventSeq}&t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) {
        stopSyncLoop();
        currentRoom = null;
        renderMpRoomUI();
        showMpToast("Xona yopildi yoki vaqt tugadi", "ℹ️");
        return;
      }
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        applySyncPayload(data);
      }
    } catch (e) {
    } finally {
      pollInFlight = false;
    }
  }

  function stopSyncLoop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    pollInFlight = false;
  }

  function startSyncLoop(code, playerId) {
    stopSyncLoop();
    _manualLeave = false;
    activeMatchStartedAt = 0;
    pollRoomOnce();

    pollTimer = setInterval(() => {
      if (!currentRoom || _manualLeave) {
        stopSyncLoop();
        return;
      }
      if (currentRoom.status === "playing") {
        if (performance.now() - _lastStateSentAt > 450) {
          pollRoomOnce();
        }
      } else {
        pollRoomOnce();
      }
    }, 650);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentRoom && !_manualLeave) {
      pollRoomOnce();
    }
  });
  window.addEventListener("focus", () => {
    if (currentRoom && !_manualLeave) {
      pollRoomOnce();
    }
  });

  async function createRoom() {
    const me = getPlayerIdentity();
    setButtonsBusy(true);
    try {
      const data = await apiPost("/api/mp/create", {
        playerId: me.id,
        name: me.name,
        mode: selectedMpMode,
        isPublic: true,
        mazeIdx: 0
      });
      if (!data.ok || !data.room) {
        showMpToast("Xona yaratib bo'lmadi: " + (data.error || "Xato"), "⚠️");
        return;
      }
      currentRoom = data.room;
      lastEventSeq = typeof data.seq === "number" ? data.seq : 0;
      startSyncLoop(currentRoom.code, me.id);
      renderMpRoomUI();
      showMpToast("Xona ochildi! Kod: " + currentRoom.code, "🏠");
    } catch (err) {
      showMpToast("Serverga ulanib bo'lmadi!", "⚠️");
    } finally {
      setButtonsBusy(false);
    }
  }

  async function quickMatch() {
    const me = getPlayerIdentity();
    setButtonsBusy(true);
    try {
      const data = await apiPost("/api/mp/quickmatch", {
        playerId: me.id,
        name: me.name,
        mode: selectedMpMode
      });
      if (!data.ok || !data.room) {
        showMpToast("Qidiruvda xato: " + (data.error || "Xato"), "⚠️");
        return;
      }
      currentRoom = data.room;
      lastEventSeq = typeof data.seq === "number" ? data.seq : 0;
      startSyncLoop(currentRoom.code, me.id);
      renderMpRoomUI();
      showMpToast("Xonaga ulandingiz: " + currentRoom.code, "⚡");
    } catch (err) {
      showMpToast("Serverga ulanib bo'lmadi!", "⚠️");
    } finally {
      setButtonsBusy(false);
    }
  }

  async function joinRoomByCode(rawCode) {
    const code = String(rawCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) {
      showMpToast("4 belgili xona kodini kiriting (masalan: A7K9)", "⚠️");
      return;
    }
    const me = getPlayerIdentity();
    setButtonsBusy(true);
    try {
      const data = await apiPost("/api/mp/join", {
        code,
        playerId: me.id,
        name: me.name
      });
      if (!data.ok || !data.room) {
        const errMsg = data.error === "ROOM_NOT_FOUND"
          ? "Bunday kodli xona topilmadi!"
          : (data.error === "ROOM_FULL" ? "Bu xona allaqachon to'lgan!" : "Xonaga kirib bo'lmadi!");
        showMpToast(errMsg, "⚠️");
        return;
      }
      currentRoom = data.room;
      lastEventSeq = typeof data.seq === "number" ? data.seq : 0;
      startSyncLoop(currentRoom.code, me.id);
      renderMpRoomUI();
      showMpToast("Xonaga qo'shildingiz: " + currentRoom.code, "✅");
    } catch (err) {
      showMpToast("Serverga ulanib bo'lmadi!", "⚠️");
    } finally {
      setButtonsBusy(false);
    }
  }

  async function switchTeam(team) {
    if (!currentRoom) return;
    const me = getPlayerIdentity();
    try {
      const data = await apiPost("/api/mp/team", {
        code: currentRoom.code,
        playerId: me.id,
        team
      });
      if (!data.ok) {
        showMpToast(data.error === "TEAM_FULL" ? "Bu jamoa to'lgan!" : "Jamoani almashtirib bo'lmadi", "⚠️");
      }
    } catch (e) {}
  }

  async function startLiveMatch() {
    if (!currentRoom) return;
    const me = getPlayerIdentity();
    setButtonsBusy(true);
    try {
      const data = await apiPost("/api/mp/start", {
        code: currentRoom.code,
        playerId: me.id,
        mazeIdx: currentRoom.mazeIdx || 0
      });
      if (!data.ok) {
        const msg = data.error === "NEED_OPPONENT"
          ? "Boshlash uchun kamida 1 ta raqib qo'shilishi kerak!"
          : (data.error === "NOT_HOST" ? "Faqat xona egasi (Host) boshlay oladi!" : "Boshlab bo'lmadi!");
        showMpToast(msg, "⚠️");
      } else if (data.room) {
        currentRoom = data.room;
        renderMpRoomUI();
        pollRoomOnce();
      }
    } catch (e) {
      showMpToast("Boshlashda tarmoq xatosi!", "⚠️");
    } finally {
      setButtonsBusy(false);
    }
  }

  async function leaveRoom(silent) {
    _manualLeave = true;
    const prevCode = currentRoom ? currentRoom.code : null;
    const me = getPlayerIdentity();
    stopSyncLoop();
    currentRoom = null;
    activeMatchStartedAt = 0;
    renderMpRoomUI();
    if (prevCode) {
      try {
        fetch("/api/mp/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: prevCode, playerId: me.id }),
          keepalive: true
        }).catch(() => {});
      } catch (e) {}
      if (!silent) showMpToast("Jonli xonadan chiqdingiz.", "🚪");
    }
    refreshOpenRooms();
  }

  function shareRoomOnTelegram() {
    if (!currentRoom) return;
    const link = `https://t.me/${BOT_USERNAME}?start=room_${encodeURIComponent(currentRoom.code)}`;
    const text = `⚔️ DIGI DIGI 3D CS Jonli ${currentRoom.mode.toUpperCase()} jangiga kir! Xona kodi: ${currentRoom.code}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
    if (tg && typeof tg.openTelegramLink === "function") {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank");
    }
  }

  function copyRoomCode() {
    if (!currentRoom) return;
    const code = currentRoom.code;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).catch(() => {});
      }
    } catch (e) {}
    showMpToast("Xona kodi nusxalandi: " + code, "📋");
  }

  async function refreshOpenRooms() {
    const listEl = document.getElementById("mpOpenRoomsList");
    if (!listEl || currentRoom) return;
    const modal = document.getElementById("modalOnline");
    if (!modal || modal.classList.contains("hidden")) return;

    try {
      const res = await fetch("/api/mp/rooms?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const rooms = Array.isArray(data.rooms) ? data.rooms : [];
      if (rooms.length === 0) {
        listEl.innerHTML = `<div class="text-[10px] text-slate-400 text-center py-1.5">Hozircha ochiq xona yo'q — yangi xona oching yoki Tezkor Qidiruvni bosing!</div>`;
        return;
      }
      listEl.innerHTML = rooms.map((r) => `
        <div class="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-mono font-black text-xs text-amber-300">${escHtml(r.code)}</span>
              <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">${escHtml(r.mode)}</span>
              <span class="text-[10px] text-slate-200 truncate">${escHtml(r.hostName)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="font-mono text-[10px] font-bold text-slate-300">${r.playersCount}/${r.maxPlayers}</span>
            <button data-join-code="${escHtml(r.code)}" class="mp-join-room-btn bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-[10px] px-2.5 py-1 rounded-lg">KIRISH</button>
          </div>
        </div>
      `).join("");
      listEl.querySelectorAll(".mp-join-room-btn").forEach((btn) => {
        btn.addEventListener("click", () => joinRoomByCode(btn.getAttribute("data-join-code")));
      });
    } catch (e) {}
  }

  function setButtonsBusy(busy) {
    ["mpBtnQuick", "mpBtnCreate", "mpBtnJoinCode", "mpBtnStartLive"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!busy;
    });
  }

  function updateModePills() {
    const b1 = document.getElementById("mpMode1v1");
    const b4 = document.getElementById("mpMode4v4");
    if (!b1 || !b4) return;
    if (selectedMpMode === "1v1") {
      b1.className = "py-1.5 px-2 rounded-lg text-[11px] font-black uppercase bg-emerald-600 text-white border border-emerald-400 transition";
      b4.className = "py-1.5 px-2 rounded-lg text-[11px] font-bold uppercase bg-slate-900 text-slate-300 border border-slate-700 transition";
    } else {
      b4.className = "py-1.5 px-2 rounded-lg text-[11px] font-black uppercase bg-emerald-600 text-white border border-emerald-400 transition";
      b1.className = "py-1.5 px-2 rounded-lg text-[11px] font-bold uppercase bg-slate-900 text-slate-300 border border-slate-700 transition";
    }
  }

  function renderMpRoomUI() {
    const lobbyBox = document.getElementById("mpLobbyControls");
    const roomBox = document.getElementById("mpRoomPanel");
    if (!lobbyBox || !roomBox) return;

    if (!currentRoom) {
      lobbyBox.classList.remove("hidden");
      roomBox.classList.add("hidden");
      updateModePills();
      return;
    }

    lobbyBox.classList.add("hidden");
    roomBox.classList.remove("hidden");

    const me = getPlayerIdentity();
    const isHost = currentRoom.hostId === me.id;
    const players = Array.isArray(currentRoom.players) ? currentRoom.players : [];
    const reds = players.filter((p) => p.team === "red");
    const blues = players.filter((p) => p.team === "blue");

    const codeEl = document.getElementById("mpActiveRoomCode");
    const metaEl = document.getElementById("mpActiveRoomMeta");
    const redListEl = document.getElementById("mpRedRoster");
    const blueListEl = document.getElementById("mpBlueRoster");
    const statusEl = document.getElementById("mpRoomStatusText");
    const startBtn = document.getElementById("mpBtnStartLive");

    if (codeEl) codeEl.textContent = currentRoom.code;
    if (metaEl) metaEl.textContent = `${currentRoom.mode.toUpperCase()} • ${players.length}/${currentRoom.maxPlayers}`;

    const renderTeam = (arr, colorCls) => {
      if (!arr.length) return `<div class="text-[10px] text-slate-500 italic py-1">Kutilmoqda...</div>`;
      return arr.map((p) => {
        const isMe = p.id === me.id;
        return `
          <div class="flex items-center justify-between gap-1 bg-black/40 border ${colorCls} rounded-lg px-2 py-1 text-[11px]">
            <span class="font-bold ${isMe ? "text-amber-300" : "text-white"} truncate">${p.isHost ? "👑 " : ""}${escHtml(p.name)}${isMe ? " (Siz)" : ""}</span>
          </div>
        `;
      }).join("");
    };

    if (redListEl) redListEl.innerHTML = renderTeam(reds, "border-red-500/40");
    if (blueListEl) blueListEl.innerHTML = renderTeam(blues, "border-sky-500/40");

    if (statusEl) {
      if (currentRoom.status === "playing") {
        statusEl.textContent = "🟢 Jonli jang faol! (Real-time sinxronizatsiya)";
      } else if (currentRoom.status === "ended") {
        statusEl.textContent = "🏁 Jang yakunlandi! Host yangi raundni boshlashi mumkin.";
      } else if (players.length < 2) {
        statusEl.textContent = "⏳ Raqib kutilmoqda... Kodni yoki Telegram taklifni do'stingizga yuboring!";
      } else if (isHost) {
        statusEl.textContent = "✅ Raqib tayyor! Pastdagi BOSHLASH tugmasini bosing.";
      } else {
        statusEl.textContent = "✅ Xona tayyor! Host jangni boshlashini kuting...";
      }
    }

    if (startBtn) {
      if (isHost) {
        startBtn.classList.remove("hidden");
        const canStart = players.length >= 2;
        startBtn.disabled = !canStart;
        startBtn.className = canStart
          ? "flex-1 menu-btn-gold text-white font-black italic text-xs py-2.5 px-3 rounded-xl uppercase transition"
          : "flex-1 bg-slate-800 border border-slate-700 text-slate-400 font-bold text-xs py-2.5 px-3 rounded-xl uppercase cursor-not-allowed";
        if (currentRoom.status === "ended") {
          startBtn.textContent = canStart ? "🔥 QAYTA O'YNASH" : "⏳ RAQIB KUTILMOQDA (1/" + currentRoom.maxPlayers + ")";
        } else {
          startBtn.textContent = canStart ? "🔥 JONLI JANGNI BOSHLASH" : "⏳ RAQIB KUTILMOQDA (1/" + currentRoom.maxPlayers + ")";
        }
      } else {
        startBtn.classList.add("hidden");
      }
    }
  }

  function injectLiveMultiplayerUI() {
    const panelSquad = document.getElementById("panelSquad");
    if (!panelSquad || document.getElementById("mpLivePanel")) return;

    const wrap = document.createElement("div");
    wrap.id = "mpLivePanel";
    wrap.className = "bg-slate-950/95 border-2 border-emerald-500/55 rounded-2xl p-2.5 space-y-2 shadow-xl";
    wrap.innerHTML = `
      <div class="flex items-center justify-between gap-2 border-b border-emerald-500/30 pb-1.5">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          <span class="text-xs font-black italic uppercase text-emerald-300 tracking-wide truncate">🌐 JONLI ONLINE MULTIPLAYER</span>
        </div>
        <span class="text-[9px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded uppercase shrink-0">REAL-TIME SYNC</span>
      </div>

      <div id="mpLobbyControls" class="space-y-2">
        <div class="grid grid-cols-2 gap-1.5">
          <button id="mpMode1v1" type="button">🎯 1v1 Jonli Duel</button>
          <button id="mpMode4v4" type="button">⚔️ 4v4 Jonli Jamoa</button>
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <button id="mpBtnQuick" type="button" class="menu-btn-gold py-2 px-2 rounded-xl text-[11px] font-black uppercase text-white active:scale-95 transition">⚡ Tezkor Qidiruv</button>
          <button id="mpBtnCreate" type="button" class="bg-sky-700 hover:bg-sky-600 active:scale-95 border border-sky-400/70 py-2 px-2 rounded-xl text-[11px] font-black uppercase text-white transition">🏠 Xona Ochish</button>
        </div>

        <div class="flex gap-1.5">
          <input id="mpCodeInput" type="text" maxlength="6" placeholder="Xona kodi (A7K9)" class="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-emerald-400 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-white uppercase focus:outline-none" />
          <button id="mpBtnJoinCode" type="button" class="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs px-3 py-1.5 rounded-xl shrink-0 transition">🔑 Kirish</button>
        </div>

        <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-2 space-y-1.5">
          <div class="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-300">
            <span>📋 Ochiq Jonli Xonalar</span>
            <button id="mpBtnRefreshRooms" type="button" class="text-emerald-300 hover:text-emerald-200 font-bold">🔄 Yangilash</button>
          </div>
          <div id="mpOpenRoomsList" class="space-y-1 max-h-28 overflow-y-auto">
            <div class="text-[10px] text-slate-400 text-center py-1">Yuklanmoqda...</div>
          </div>
        </div>
      </div>

      <div id="mpRoomPanel" class="hidden space-y-2">
        <div class="flex items-center justify-between gap-2 bg-slate-900 border border-amber-500/50 rounded-xl px-2.5 py-2">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold uppercase text-slate-400">KOD:</span>
            <span id="mpActiveRoomCode" class="font-mono font-black text-base tracking-widest text-amber-300">----</span>
            <button id="mpBtnCopyCode" type="button" class="bg-slate-800 hover:bg-slate-700 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-slate-600">📋</button>
          </div>
          <span id="mpActiveRoomMeta" class="font-mono text-[10px] font-extrabold text-emerald-300 bg-emerald-950/90 border border-emerald-500/40 px-2 py-0.5 rounded-full">1V1 • 1/2</span>
        </div>

        <button id="mpBtnInviteTg" type="button" class="w-full bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow transition">
          <span>✈️</span> <span>DO'STNI TELEGRAMDA XONAGA CHAQIRISH</span>
        </button>

        <div class="grid grid-cols-2 gap-2">
          <div class="bg-red-950/25 border border-red-500/40 rounded-xl p-2 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-red-400">🔴 T-FORCE</span>
              <button id="mpBtnTeamRed" type="button" class="text-[9px] font-bold bg-red-900/70 text-red-200 px-1.5 py-0.5 rounded border border-red-500/50">O'tish</button>
            </div>
            <div id="mpRedRoster" class="space-y-1"></div>
          </div>
          <div class="bg-sky-950/25 border border-sky-500/40 rounded-xl p-2 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black text-sky-400">🔵 CT-SPEC</span>
              <button id="mpBtnTeamBlue" type="button" class="text-[9px] font-bold bg-sky-900/70 text-sky-200 px-1.5 py-0.5 rounded border border-sky-500/50">O'tish</button>
            </div>
            <div id="mpBlueRoster" class="space-y-1"></div>
          </div>
        </div>

        <div id="mpRoomStatusText" class="text-[10px] text-center font-bold text-amber-200 bg-black/50 border border-slate-800 rounded-lg py-1.5 px-2">
          ⏳ Raqib kutilmoqda...
        </div>

        <div class="flex items-center gap-1.5">
          <button id="mpBtnStartLive" type="button" class="flex-1 menu-btn-gold text-white font-black italic text-xs py-2.5 px-3 rounded-xl uppercase">🔥 JONLI JANGNI BOSHLASH</button>
          <button id="mpBtnLeaveRoom" type="button" class="bg-red-950/90 hover:bg-red-800 border border-red-500/60 text-red-200 font-bold text-xs py-2.5 px-3 rounded-xl shrink-0">🚪 Chiqish</button>
        </div>
      </div>
    `;

    panelSquad.prepend(wrap);

    document.getElementById("mpMode1v1").addEventListener("click", () => { selectedMpMode = "1v1"; updateModePills(); });
    document.getElementById("mpMode4v4").addEventListener("click", () => { selectedMpMode = "4v4"; updateModePills(); });
    document.getElementById("mpBtnQuick").addEventListener("click", quickMatch);
    document.getElementById("mpBtnCreate").addEventListener("click", createRoom);
    document.getElementById("mpBtnJoinCode").addEventListener("click", () => {
      const inp = document.getElementById("mpCodeInput");
      joinRoomByCode(inp ? inp.value : "");
    });
    document.getElementById("mpCodeInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") joinRoomByCode(e.target.value);
    });
    document.getElementById("mpBtnRefreshRooms").addEventListener("click", refreshOpenRooms);
    document.getElementById("mpBtnCopyCode").addEventListener("click", copyRoomCode);
    document.getElementById("mpBtnInviteTg").addEventListener("click", shareRoomOnTelegram);
    document.getElementById("mpBtnTeamRed").addEventListener("click", () => switchTeam("red"));
    document.getElementById("mpBtnTeamBlue").addEventListener("click", () => switchTeam("blue"));
    document.getElementById("mpBtnStartLive").addEventListener("click", startLiveMatch);
    document.getElementById("mpBtnLeaveRoom").addEventListener("click", () => leaveRoom(false));

    updateModePills();
    renderMpRoomUI();

    const onlineBtn = document.getElementById("menuBtnOnline");
    if (onlineBtn) {
      onlineBtn.addEventListener("click", () => setTimeout(refreshOpenRooms, 120));
    }
    if (roomsPollTimer) clearInterval(roomsPollTimer);
    roomsPollTimer = setInterval(refreshOpenRooms, 4500);
  }

  function checkDeepLinkRoomJoin() {
    const params = new URLSearchParams(window.location.search);
    const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
    const startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ? tg.initDataUnsafe.start_param : "";
    let roomCode = params.get("room_code") || "";
    if (!roomCode && startParam && startParam.startsWith("room_")) {
      roomCode = startParam.replace("room_", "");
    }
    roomCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!roomCode) return;

    setTimeout(() => {
      const modal = document.getElementById("modalOnline");
      if (modal) modal.classList.remove("hidden");
      joinRoomByCode(roomCode);
    }, 550);
  }

  window.addEventListener("beforeunload", () => {
    if (!currentRoom) return;
    const me = getPlayerIdentity();
    const payload = JSON.stringify({ code: currentRoom.code, playerId: me.id });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/mp/leave", new Blob([payload], { type: "application/json" }));
      }
    } catch (e) {}
  });

  // 3-Bosqich (index.html 3D arena) uchun global Multiplayer kontrolleri
  window.DIGI_MP = {
    isActive: () => !!(currentRoom && currentRoom.status === "playing"),
    isInRoom: () => !!currentRoom,
    getRoom: () => currentRoom,
    getMyId: () => getPlayerIdentity().id,
    getMyTeam: () => {
      if (!currentRoom || !Array.isArray(currentRoom.players)) return "red";
      const meId = getPlayerIdentity().id;
      const found = currentRoom.players.find((p) => p.id === meId);
      return found ? found.team : "red";
    },
    setGameHooks: (hooksObj) => { _hooks = hooksObj || null; },
    leaveRoom: (silent) => leaveRoom(silent),
    sendState: (x, y, a, mv, wp) => {
      if (!currentRoom || currentRoom.status !== "playing") return;
      const now = performance.now();
      if (_stateInFlight || now - _lastStateSentAt < 60) return;
      _lastStateSentAt = now;
      _stateInFlight = true;
      const me = getPlayerIdentity();
      fetch("/api/mp/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          code: currentRoom.code,
          playerId: me.id,
          x: +Number(x).toFixed(2),
          y: +Number(y).toFixed(2),
          a: +Number(a).toFixed(2),
          mv: mv ? 1 : 0,
          wp: wp || 0,
          since: lastEventSeq
        })
      })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.ok) applySyncPayload(data);
      })
      .catch(() => {})
      .finally(() => { _stateInFlight = false; });
    },
    sendShoot: (hitTargetId, dmg, isHeadshot, isWallbang) => {
      if (!currentRoom || currentRoom.status !== "playing") return Promise.resolve({ ok: false });
      const me = getPlayerIdentity();
      return apiPost("/api/mp/shoot", {
        code: currentRoom.code,
        playerId: me.id,
        hitTargetId: hitTargetId || "",
        dmg: dmg || 0,
        isHeadshot: !!isHeadshot,
        isWallbang: !!isWallbang
      }).catch(() => ({ ok: false }));
    },
    sendGrenade: (kind, x, y, vx, vy) => {
      if (!currentRoom || currentRoom.status !== "playing") return;
      const me = getPlayerIdentity();
      fetch("/api/mp/grenade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: currentRoom.code,
          playerId: me.id,
          kind: kind === "smoke" ? "smoke" : "he",
          x: +Number(x).toFixed(2),
          y: +Number(y).toFixed(2),
          vx: +Number(vx).toFixed(2),
          vy: +Number(vy).toFixed(2)
        }),
        keepalive: true
      }).catch(() => {});
    }
  };

  window.addEventListener("DOMContentLoaded", () => {
    injectLiveMultiplayerUI();
    checkDeepLinkRoomJoin();
  });
})();
