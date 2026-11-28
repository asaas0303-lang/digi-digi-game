// DIGI DIGI GRAND CUP — ONLINE OYNASI ICHIDAGI 3D iOS GLASS TURNIR MARKAZI VA 1v1 SETKA UI (v20261128_3)
(function () {
  'use strict';

  const BOT_USERNAME = 'digi_dig_bot';
  const CHANNEL_URL_DEFAULT = 'https://t.me/digi_digi_kanal';
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const UZ_WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  const TOUR_REF_STORAGE_KEY = 'digi_tour_ref';

  let _state = null;
  let _serverOffsetMs = 0; // serverNow - Date.now()
  let _onlineTab = 'live'; // 'live' | 'tour'
  let _activeTab = 'main'; // 'main' | 'bracket' | 'rules' | 'history'
  let _onlineControlsBound = false;
  let _isFetching = false;
  let _lastPollAt = 0;
  let _subWarning = false;
  let _actionBusy = false;
  let _statusNotice = null; // { type: 'ok' | 'err', text: string }
  let _lastInvoker = null;
  let _lastModalRenderSig = '';
  let _waitingMatch = null; // { roomCode, matchId, roundName, oppName, oppElo, noShowDeadlineAt }
  const _payoutDraft = { cardNumber: '', holderName: '', phone: '' };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHttpUrl(raw) {
    const s = String(raw || '').trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function formatMoney(n) {
    const num = Math.max(0, Math.round(Number(n) || 0));
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function isGameBusy() {
    if (window.gameRunning === true) return true;
    const lv = document.getElementById('lobbyView');
    if (lv && lv.classList.contains('hidden')) return true;
    const gv = document.getElementById('gameView');
    return !!(gv && !gv.classList.contains('hidden') && gv.style.display !== 'none');
  }

  function isLobbyVisible() {
    const lv = document.getElementById('lobbyView');
    return !!(lv && !lv.classList.contains('hidden') && lv.style.display !== 'none');
  }

  function isModalOpen() {
    const m = document.getElementById('modalOnline');
    const p = document.getElementById('panelTournament');
    return !!(m && !m.classList.contains('hidden') && p && !p.classList.contains('hidden'));
  }

  function getServerNowMs() {
    return Date.now() + _serverOffsetMs;
  }

  function formatTashkentDateTime(ms) {
    if (!ms) return 'Yakshanba • 20:00 (Toshkent)';
    const t = new Date(Number(ms) + TASHKENT_OFFSET_MS);
    const dayName = UZ_WEEKDAYS[t.getUTCDay()] || 'Yakshanba';
    const dd = String(t.getUTCDate()).padStart(2, '0');
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = t.getUTCFullYear();
    const hh = String(t.getUTCHours()).padStart(2, '0');
    const min = String(t.getUTCMinutes()).padStart(2, '0');
    return `${dayName}, ${dd}.${mm}.${yyyy} • ${hh}:${min} (Toshkent)`;
  }

  function formatCountdown(targetMs) {
    const diff = Math.max(0, Number(targetMs || 0) - getServerNowMs());
    if (diff <= 0) return '00:00';
    const totalSec = Math.floor(diff / 1000);
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const p2 = (v) => String(v).padStart(2, '0');
    if (days > 0) return `${days}k ${p2(hrs)}s ${p2(mins)}d`;
    if (hrs > 0) return `${p2(hrs)}:${p2(mins)}:${p2(secs)}`;
    return `${p2(mins)}:${p2(secs)}`;
  }

  function getMyIdentity() {
    const prof = window.DIGI_TG_PROFILE || {};
    const tg = window.Telegram && window.Telegram.WebApp;
    const tgUser = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : {};

    const doomEl = document.getElementById('myDoomId');
    const nameEl = document.getElementById('myNameInput');
    const avatarEl = document.getElementById('lobbyAvatarImg');

    const playerId = String(prof.myId || (doomEl && doomEl.textContent) || '').trim().toUpperCase();
    const tgId = String(tgUser.id || prof.myTgId || prof.tgId || '').trim();
    const tgFullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
    const name = String((nameEl && nameEl.value) || tgFullName || prof.myName || 'Jangchi').trim();
    const username = String(tgUser.username || prof.myUsername || '').replace(/^@+/, '').trim();
    const rawPhoto = tgUser.photo_url || prof.myPhoto || (avatarEl && avatarEl.getAttribute('src')) || '';
    const photoUrl = safeHttpUrl(rawPhoto);

    return { playerId, tgId, name, username, photoUrl };
  }

  function getStoredRefBy(myPlayerId) {
    try {
      const ref = String(localStorage.getItem(TOUR_REF_STORAGE_KEY) || '').trim().toUpperCase();
      if (!ref || ref === String(myPlayerId || '').toUpperCase()) return '';
      return ref;
    } catch (_) {
      return '';
    }
  }

  function parseDeepLinksAndAutoOpen() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const openTourParam = params.get('open_tour');
      const tourRefParam = params.get('tour_ref');
      const tg = window.Telegram && window.Telegram.WebApp;
      const startParam = String((tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '').trim();

      let capturedRef = '';
      if (tourRefParam) {
        capturedRef = String(tourRefParam).trim().toUpperCase();
      } else if (startParam.startsWith('tour_ref_')) {
        capturedRef = startParam.slice('tour_ref_'.length).trim().toUpperCase();
      }
      if (capturedRef) {
        try { localStorage.setItem(TOUR_REF_STORAGE_KEY, capturedRef); } catch (_) {}
      }

      const shouldOpen = openTourParam === '1' || startParam === 'tour_join' || startParam.startsWith('tour_');
      if (shouldOpen) {
        setTimeout(() => {
          if (!isGameBusy()) openTournamentModal();
        }, 450);
      }
    } catch (_) {}
  }

  function openExternalTelegramLink(url) {
    const cleanUrl = safeHttpUrl(url);
    if (!cleanUrl) return;
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && typeof tg.openTelegramLink === 'function' && cleanUrl.startsWith('https://t.me/')) {
      tg.openTelegramLink(cleanUrl);
    } else if (tg && typeof tg.openLink === 'function') {
      tg.openLink(cleanUrl);
    } else {
      window.open(cleanUrl, '_blank', 'noopener');
    }
  }

  function showTourToast(msg, emoji = '🏆') {
    const tb = document.getElementById('toastBox');
    const te = document.getElementById('toastEmoji');
    const tm = document.getElementById('toastMsg');
    if (tb && tm) {
      if (te) te.textContent = emoji;
      tm.textContent = msg;
      tb.classList.remove('hidden');
      setTimeout(() => tb.classList.add('hidden'), 3200);
    }
  }

  function ensureTournamentStyles() {
    if (document.getElementById('digiTournamentStyles')) return;
    const style = document.createElement('style');
    style.id = 'digiTournamentStyles';
    style.textContent = `
      @keyframes dgLivePulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.24); opacity: 0.5; }
      }
      @keyframes dgTourPulseGreen {
        0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55), 0 6px 18px rgba(0, 0, 0, 0.55); border-color: rgba(52, 211, 153, 0.95); }
        50% { box-shadow: 0 0 18px 2px rgba(16, 185, 129, 0.65), 0 6px 18px rgba(0, 0, 0, 0.55); border-color: rgba(167, 243, 208, 1); }
      }
      .dg-tour-checkin-pulse {
        animation: dgTourPulseGreen 1.8s ease-in-out infinite;
      }
      @keyframes dgTourDotBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.32; }
      }
      .dg-tour-live-dot {
        animation: dgTourDotBlink 1.1s ease-in-out infinite;
      }
      .dg-online-live-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border-radius: 9999px;
        font-size: 8.5px;
        font-weight: 900;
        letter-spacing: 0.06em;
        line-height: 1.15;
        color: #ffe4e6;
        background: linear-gradient(135deg, rgba(244, 63, 94, 0.28) 0%, rgba(159, 18, 57, 0.40) 100%);
        border: 1px solid rgba(251, 113, 133, 0.62);
        box-shadow: 0 2px 10px rgba(244, 63, 94, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.24);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
        white-space: nowrap;
      }
      .dg-online-live-pill.dg-live-reg {
        color: #fef3c7;
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.28) 0%, rgba(180, 83, 9, 0.38) 100%);
        border-color: rgba(251, 191, 36, 0.65);
        box-shadow: 0 2px 10px rgba(245, 158, 11, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.24);
      }
      .dg-online-live-pill.dg-live-hot {
        color: #ffffff;
        background: linear-gradient(135deg, rgba(244, 63, 94, 0.42) 0%, rgba(225, 29, 72, 0.56) 100%);
        border-color: rgba(253, 164, 175, 0.9);
        box-shadow: 0 0 12px rgba(244, 63, 94, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.32);
      }
      .dg-online-live-dot {
        width: 5.5px;
        height: 5.5px;
        border-radius: 9999px;
        background: #fb7185;
        box-shadow: 0 0 8px rgba(251, 113, 133, 0.98);
        animation: dgLivePulse 1.25s ease-in-out infinite;
        flex-shrink: 0;
      }
      .dg-online-live-pill.dg-live-reg .dg-online-live-dot {
        background: #fbbf24;
        box-shadow: 0 0 8px rgba(251, 191, 36, 0.95);
      }
      @media (prefers-reduced-motion: reduce) {
        .dg-online-live-dot,
        .dg-tour-live-dot,
        .dg-tour-checkin-pulse {
          animation: none !important;
        }
      }
      .dg-onl-seg-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.2;
        color: rgba(226, 232, 240, 0.78);
        background: transparent;
        border: 1px solid transparent;
        transition: color 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
        white-space: nowrap;
        cursor: pointer;
      }
      #btnOnlineTabLive[aria-selected="true"] {
        color: #ffffff;
        background: linear-gradient(180deg, rgba(48, 209, 88, 0.28) 0%, rgba(16, 185, 129, 0.16) 100%);
        border-color: rgba(52, 211, 153, 0.62);
        box-shadow: 0 2px 10px rgba(16, 185, 129, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.28);
      }
      #btnOnlineTabTour[aria-selected="true"] {
        color: #fef08a;
        background: linear-gradient(180deg, rgba(245, 158, 11, 0.30) 0%, rgba(180, 83, 9, 0.22) 100%);
        border-color: rgba(251, 191, 36, 0.68);
        box-shadow: 0 2px 10px rgba(245, 158, 11, 0.24), inset 0 1px 0 rgba(254, 240, 138, 0.32);
      }
      .dg-onl-tour-mini {
        font-size: 8.5px;
        font-weight: 900;
        padding: 1px 5px;
        border-radius: 9999px;
        background: rgba(244, 63, 94, 0.32);
        border: 1px solid rgba(251, 113, 133, 0.65);
        color: #ffe4e6;
        line-height: 1.15;
      }
      #panelTournament {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
      }
      #panelTournament .dg-tour-scroll,
      #panelTournament .overflow-y-auto,
      #panelTournament .dg-tour-bracket-scroll {
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x pan-y;
        overscroll-behavior: contain;
      }
      .dg-tour-tablist {
        display: flex;
        flex-wrap: nowrap;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        scroll-snap-type: inline proximity;
      }
      .dg-tour-tablist::-webkit-scrollbar { display: none; }
      .dg-tour-tab {
        position: relative;
        flex: none;
        scroll-snap-align: start;
        padding: 4px 10px;
        border-radius: 9px;
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        background: rgba(15, 23, 42, 0.58);
        border: 1px solid rgba(148, 163, 184, 0.22);
        transition: color 140ms ease, background 140ms ease, border-color 140ms ease;
        white-space: nowrap;
      }
      .dg-tour-tab[aria-selected="true"] {
        color: #fef08a;
        background: linear-gradient(180deg, rgba(245, 158, 11, 0.24) 0%, rgba(120, 53, 15, 0.34) 100%);
        border-color: rgba(251, 191, 36, 0.65);
      }
      .dg-tour-tab[aria-selected="true"]::after {
        content: "";
        position: absolute;
        left: 14%;
        right: 14%;
        bottom: 0;
        border-block-end: 2px solid #fbbf24;
      }
      .dg-tour-tab:focus-visible,
      .dg-onl-seg-btn:focus-visible,
      #panelTournament button:focus-visible,
      #panelTournament input:focus-visible {
        outline: 2px solid #38bdf8;
        outline-offset: 2px;
      }
      .dg-tour-bracket-scroll {
        display: flex;
        gap: 14px;
        overflow-x: auto;
        padding-bottom: 8px;
        align-items: stretch;
      }
      .dg-tour-input {
        width: 100%;
        min-height: 40px;
        padding: 8px 12px;
        font-size: 16px;
        line-height: 1.25;
        color: #f8fafc;
        background: rgba(5, 10, 22, 0.86);
        border: 1px solid rgba(96, 165, 250, 0.35);
        border-radius: 12px;
        box-sizing: border-box;
      }
      .dg-tour-input[aria-invalid="true"] {
        border-color: rgba(244, 63, 94, 0.85);
      }
    `;
    document.head.appendChild(style);
  }

  function removeLegacyLobbyCard() {
    const legacy = document.getElementById('lobbyTournamentCard');
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
  }

  function updateOnlineLiveBadge() {
    ensureTournamentStyles();
    const badge = document.getElementById('onlineTourLiveBadge');
    const tabBadge = document.getElementById('onlineTourTabBadge');
    const active = _state && _state.active;
    const me = (_state && _state.me) || {};

    if (badge) {
      badge.classList.remove('dg-live-hot', 'dg-live-reg');
      if (active && (active.status === 'checkin' || active.status === 'live')) {
        badge.classList.add('dg-live-hot');
      } else if (active && active.status === 'registration') {
        badge.classList.add('dg-live-reg');
      }
    }

    if (tabBadge) {
      let miniText = '';
      if (active && active.status === 'live') {
        const myReady = me.myMatch && (me.myMatch.status === 'ready' || me.myMatch.status === 'playing');
        miniText = myReady ? 'JANG!' : 'LIVE';
      } else if (active && active.status === 'checkin') {
        miniText = 'CHECK-IN';
      } else if (active && active.status === 'registration') {
        miniText = `${Number(active.participantsCount) || 0}/${Number(active.maxPlayers) || 32}`;
      }
      if (miniText) {
        tabBadge.textContent = miniText;
        tabBadge.classList.remove('hidden');
      } else {
        tabBadge.textContent = '';
        tabBadge.classList.add('hidden');
      }
    }
  }

  function ensureEmbeddedTourDOM() {
    ensureTournamentStyles();
    removeLegacyLobbyCard();
    const panel = document.getElementById('panelTournament');
    if (!panel) return null;

    if (!document.getElementById('dgTourBody')) {
      panel.innerHTML = `
        <div class="shrink-0 px-2.5 pt-2 pb-1.5 border-b border-white/10 bg-slate-950/35 flex items-center justify-between gap-2">
          <div id="dgTourTablist" class="dg-tour-tablist flex-1 min-w-0" role="tablist" aria-label="Turnir bo'limlari">
            <button type="button" role="tab" id="dgTabBtnMain" data-tab="main" aria-selected="true" class="dg-tour-tab">📋 Asosiy</button>
            <button type="button" role="tab" id="dgTabBtnBracket" data-tab="bracket" aria-selected="false" class="dg-tour-tab">🏆 Setka</button>
            <button type="button" role="tab" id="dgTabBtnRules" data-tab="rules" aria-selected="false" class="dg-tour-tab">📜 Qoidalar &amp; Sovrin</button>
            <button type="button" role="tab" id="dgTabBtnHistory" data-tab="history" aria-selected="false" class="dg-tour-tab">🏛️ Chempionlar</button>
          </div>
          <span id="dgTourStatusPill" class="ios-fh-stat-pill text-amber-200 text-[9.5px] font-semibold px-2 py-0.5 rounded-full truncate shrink-0">Yuklanmoqda...</span>
        </div>
        <div id="dgTourBody" class="flex-1 min-h-0 overflow-y-auto dg-tour-scroll p-2.5"></div>
      `;

      const tablist = document.getElementById('dgTourTablist');
      if (tablist) {
        tablist.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-tab]');
          if (!btn) return;
          selectTab(btn.getAttribute('data-tab'));
        });
        tablist.addEventListener('keydown', (e) => {
          const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
          const curIdx = tabs.indexOf(document.activeElement);
          if (curIdx < 0) return;
          let nextIdx = -1;
          if (e.key === 'ArrowRight') nextIdx = (curIdx + 1) % tabs.length;
          else if (e.key === 'ArrowLeft') nextIdx = (curIdx - 1 + tabs.length) % tabs.length;
          else if (e.key === 'Home') nextIdx = 0;
          else if (e.key === 'End') nextIdx = tabs.length - 1;
          if (nextIdx >= 0) {
            e.preventDefault();
            tabs[nextIdx].focus();
            selectTab(tabs[nextIdx].getAttribute('data-tab'));
          }
        });
      }
    }

    return panel;
  }

  function setOnlineTab(mode) {
    ensureEmbeddedTourDOM();
    const target = mode === 'tour' ? 'tour' : 'live';
    _onlineTab = target;

    const panelSquad = document.getElementById('panelSquad');
    const panelTour = document.getElementById('panelTournament');
    const btnLive = document.getElementById('btnOnlineTabLive');
    const btnTour = document.getElementById('btnOnlineTabTour');
    const btnRefresh = document.getElementById('btnTourHeaderRefresh');

    if (target === 'tour') {
      if (panelSquad) {
        panelSquad.classList.add('hidden');
        panelSquad.classList.remove('flex');
      }
      if (panelTour) {
        panelTour.classList.remove('hidden');
        panelTour.classList.add('flex');
      }
      if (btnRefresh) btnRefresh.classList.remove('hidden');
      if (btnLive) btnLive.setAttribute('aria-selected', 'false');
      if (btnTour) btnTour.setAttribute('aria-selected', 'true');
      renderModalContent(true);
      fetchTourState(true);
    } else {
      if (panelTour) {
        panelTour.classList.add('hidden');
        panelTour.classList.remove('flex');
      }
      if (panelSquad) {
        panelSquad.classList.remove('hidden');
        panelSquad.classList.add('flex');
      }
      if (btnRefresh) btnRefresh.classList.add('hidden');
      if (btnLive) btnLive.setAttribute('aria-selected', 'true');
      if (btnTour) btnTour.setAttribute('aria-selected', 'false');
      if (window.DIGI_MP && typeof window.DIGI_MP.refreshOpenRooms === 'function') {
        window.DIGI_MP.refreshOpenRooms();
      }
    }
  }

  function bindOnlineModalControls() {
    if (_onlineControlsBound) return;
    _onlineControlsBound = true;

    const btnLive = document.getElementById('btnOnlineTabLive');
    const btnTour = document.getElementById('btnOnlineTabTour');
    const btnRefresh = document.getElementById('btnTourHeaderRefresh');
    const btnOnline = document.getElementById('menuBtnOnline');
    const btnClose = document.getElementById('btnCloseOnlineModal');
    const onlineModal = document.getElementById('modalOnline');
    const segList = onlineModal ? onlineModal.querySelector('.ios-mp-seg') : null;

    if (btnLive) {
      btnLive.addEventListener('click', () => setOnlineTab('live'));
    }
    if (btnTour) {
      btnTour.addEventListener('click', () => setOnlineTab('tour'));
    }
    if (segList) {
      segList.addEventListener('keydown', (e) => {
        const tabs = Array.from(segList.querySelectorAll('[role="tab"]'));
        const curIdx = tabs.indexOf(document.activeElement);
        if (curIdx < 0) return;
        let nextIdx = -1;
        if (e.key === 'ArrowRight') nextIdx = (curIdx + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') nextIdx = (curIdx - 1 + tabs.length) % tabs.length;
        if (nextIdx >= 0) {
          e.preventDefault();
          tabs[nextIdx].focus();
          setOnlineTab(tabs[nextIdx].getAttribute('data-online-tab'));
        }
      });
    }
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        await fetchTourState(true);
        showTourToast("Turnir ma'lumoti yangilandi", '🔄');
      });
    }
    if (btnOnline) {
      btnOnline.addEventListener('click', () => {
        _lastInvoker = btnOnline;
        setOnlineTab(_waitingMatch ? 'tour' : 'live');
      });
    }
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (!_waitingMatch) setOnlineTab('live');
        _lastInvoker = null;
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalOpen()) {
        e.preventDefault();
        closeTournamentModal();
      }
    });
  }

  function selectTab(tabName) {
    if (!tabName) return;
    _activeTab = tabName;
    const tabs = document.querySelectorAll('#dgTourTablist [role="tab"]');
    tabs.forEach(t => {
      const isSel = t.getAttribute('data-tab') === _activeTab;
      t.setAttribute('aria-selected', isSel ? 'true' : 'false');
      if (isSel && typeof t.scrollIntoView === 'function') {
        try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
      }
    });
    _lastModalRenderSig = '';
    renderModalContent();
  }

  function getStatusMeta(active) {
    if (!active) return { label: 'Kutilmoqda', cls: 'text-slate-300 border-slate-500/40' };
    if (active.status === 'registration') return { label: '📝 Ro\'yxat ochiq', cls: 'text-emerald-200 border-emerald-400/50' };
    if (active.status === 'checkin') return { label: '🟢 Check-In', cls: 'text-emerald-200 border-emerald-400/70' };
    if (active.status === 'live') return { label: '🔴 LIVE Play-off', cls: 'text-rose-200 border-rose-400/70' };
    if (active.status === 'finished') return { label: '🏁 Yakunlangan', cls: 'text-amber-200 border-amber-400/55' };
    return { label: String(active.status || '—'), cls: 'text-slate-300 border-slate-500/40' };
  }

  function renderMainTab(active, me, identity) {
    const noticeHtml = _statusNotice
      ? `<div role="status" aria-live="polite" class="mb-2.5 rounded-xl px-3 py-2 text-[11px] font-bold border ${_statusNotice.type === 'err' ? 'bg-rose-950/75 border-rose-400/60 text-rose-200' : 'bg-emerald-950/75 border-emerald-400/60 text-emerald-200'}">${esc(_statusNotice.text)}</div>`
      : '';

    const prizes = (active && active.prizes) || { first: 250000, second: 150000, third: 100000 };
    const gems = (active && active.gemPrizes) || { first: 500, second: 250, third: 100 };
    const title = (active && active.title) || 'DIGI DIGI GRAND CUP';
    const startFmt = active ? formatTashkentDateTime(active.startAt) : 'Har Yakshanba • 20:00 (Toshkent)';
    const cnt = active ? (Number(active.participantsCount) || 0) : 0;
    const max = active ? (Number(active.maxPlayers) || 32) : 32;
    const pct = Math.min(100, Math.round((cnt / Math.max(1, max)) * 100));
    const timerVal = active && (active.status === 'registration' || active.status === 'checkin')
      ? formatCountdown(active.startAt)
      : (active && active.status === 'live' ? 'JONLI JANG' : '—');

    const channelUrl = (active && active.channelUrl) || CHANNEL_URL_DEFAULT;
    const myRefLink = `https://t.me/${BOT_USERNAME}?start=tour_ref_${encodeURIComponent(identity.playerId || 'DOOM')}`;

    let actionBlockHtml = '';
    if (!active) {
      actionBlockHtml = `
        <div class="rounded-xl p-3 bg-slate-900/75 border border-slate-600/35 text-center">
          <div class="text-[11.5px] font-bold text-slate-200">⏳ Hozircha faol turnir ochilmagan</div>
          <div class="text-[10px] text-slate-400 mt-0.5">Yangi turnir e'lon qilinishi bilan @digi_digi_kanal va bu yerda paydo bo'ladi.</div>
        </div>
      `;
    } else if (active.status === 'registration') {
      if (me.isDq) {
        actionBlockHtml = `<div class="rounded-xl p-3 bg-rose-950/65 border border-rose-500/50 text-rose-200 text-[11px] font-bold text-center">⛔ Siz ushbu turnirdan diskvalifikatsiya qilingansiz.</div>`;
      } else if (me.isRegistered) {
        actionBlockHtml = `
          <div class="rounded-xl p-3 bg-emerald-950/65 border border-emerald-400/60 text-center">
            <div class="text-[12px] font-black text-emerald-200">✅ RO'YXATDAN O'TDINGIZ!</div>
            <div class="text-[10px] text-emerald-100/85 mt-1">Startdan 15 daqiqa oldin (19:45 da) Check-In ochiladi — kirib tasdiqlashni unutmang!</div>
          </div>
        `;
      } else {
        actionBlockHtml = `
          <button id="btnTourRegister" type="button" ${_actionBusy ? 'disabled' : ''} class="ios-btn-gold w-full py-2.5 px-4 text-[12px] tracking-wide cursor-pointer disabled:opacity-60">
            ${_actionBusy ? '⏳ Yuborilmoqda...' : '📝 TURNIRGA YOZILISH (BEPUL)'}
          </button>
        `;
      }
    } else if (active.status === 'checkin') {
      if (me.isDq) {
        actionBlockHtml = `<div class="rounded-xl p-3 bg-rose-950/65 border border-rose-500/50 text-rose-200 text-[11px] font-bold text-center">⛔ Siz ushbu turnirdan diskvalifikatsiya qilingansiz.</div>`;
      } else if (me.isCheckedIn) {
        actionBlockHtml = `
          <div class="rounded-xl p-3 bg-emerald-950/70 border border-emerald-400/70 text-center">
            <div class="text-[12px] font-black text-emerald-200">🔥 TAYYORSIZ! SETKA 20:00 DA OCHILADI</div>
            <div class="text-[10px] text-emerald-100/85 mt-0.5">Start bilan raqibingiz va 1v1 jang xonangiz avtomatik chiqadi.</div>
          </div>
        `;
      } else if (me.isRegistered) {
        actionBlockHtml = `
          <button id="btnTourCheckin" type="button" ${_actionBusy ? 'disabled' : ''} class="ios-btn-green dg-tour-checkin-pulse w-full py-2.5 px-4 text-[12px] tracking-wide cursor-pointer disabled:opacity-60">
            ${_actionBusy ? '⏳ Tasdiqlanmoqda...' : '✅ ISHTIROKNI TASDIQLASH (CHECK-IN)'}
          </button>
        `;
      } else {
        actionBlockHtml = `
          <button id="btnTourRegister" type="button" ${_actionBusy ? 'disabled' : ''} class="ios-btn-green w-full py-2.5 px-4 text-[12px] tracking-wide cursor-pointer disabled:opacity-60">
            ${_actionBusy ? '⏳ Yuborilmoqda...' : '📝 YOZILISH VA TASDIQLASH'}
          </button>
        `;
      }
    } else if (active.status === 'live') {
      const m = me.myMatch;
      if (_waitingMatch && m && (m.status === 'ready' || m.status === 'playing')) {
        const noShowRem = Math.max(0, Math.ceil((Number(_waitingMatch.noShowDeadlineAt || 0) - Date.now()) / 1000));
        actionBlockHtml = `
          <div class="rounded-xl p-3 bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-rose-950/75 border border-amber-400/80 flex flex-col gap-2">
            <div role="status" aria-live="polite" class="flex items-center justify-between gap-2">
              <span class="text-[11px] font-black text-amber-200 truncate">⏳ Raqib kutilmoqda: ${esc(_waitingMatch.oppName || 'Raqib')} • Xona: ${esc(_waitingMatch.roomCode)}</span>
              <span class="text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/60 text-rose-200 shrink-0" id="dgTourNoShowTimer">TKO gacha: ${noShowRem}s</span>
            </div>
            <div class="text-[10px] text-slate-300">Raqibingizga shoshilinch Telegram xabari yuborildi. U kirishi bilan 3D jang avtomatik boshlanadi!</div>
            <button id="btnTourCancelWait" type="button" class="ios-btn-gray w-full py-2 px-4 text-[11px] cursor-pointer">🚪 Kutishni bekor qilish</button>
          </div>
        `;
      } else if (m && (m.status === 'ready' || m.status === 'playing')) {
        const opp = (m.p1 && m.p1.playerId === identity.playerId) ? m.p2 : m.p1;
        actionBlockHtml = `
          <div class="rounded-xl p-3 bg-gradient-to-r from-rose-950/80 via-amber-950/65 to-slate-900/85 border border-amber-400/70 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10.5px] font-black text-amber-300 uppercase">⚔️ ${esc(m.roundName || '1v1 JANG')} (${esc(m.id)})</span>
              <span class="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/50 text-rose-200">${m.status === 'playing' ? '● JANGDA' : 'TAYYOR'}</span>
            </div>
            <div class="text-[12px] font-extrabold text-white">🆚 Raqib: <span class="text-amber-200">${esc((opp && opp.name) || 'Aniqlanmoqda...')}</span> <span class="text-[10px] text-slate-300 font-mono">(ELO ${Number((opp && opp.elo) || 1000)})</span></div>
            <button id="btnTourLaunchMatch" type="button" ${_actionBusy ? 'disabled' : ''} class="ios-btn-gold w-full py-2 px-4 text-[12px] cursor-pointer disabled:opacity-60">
              ${_actionBusy ? '⏳ Xona ochilmoqda...' : '⚔️ 1v1 JANGGA KIRISH'}
            </button>
          </div>
        `;
      } else if (me.isDq) {
        actionBlockHtml = `<div class="rounded-xl p-3 bg-rose-950/65 border border-rose-500/50 text-rose-200 text-[11px] font-bold text-center">⛔ Siz diskvalifikatsiya qilingansiz.</div>`;
      } else {
        actionBlockHtml = `
          <div class="rounded-xl p-2.5 bg-slate-900/75 border border-amber-500/40 flex items-center justify-between gap-2">
            <span class="text-[11px] font-bold text-amber-200">🔥 1v1 Play-off janglari jonli davom etmoqda</span>
            <button id="btnTourGoBracket" type="button" class="ios-btn-tinted px-3 py-1.5 text-[10.5px] shrink-0 cursor-pointer">🏆 Setkani ko'rish</button>
          </div>
        `;
      }
    } else if (active.status === 'finished') {
      const w1 = active.winners && active.winners.first;
      actionBlockHtml = `
        <div class="rounded-xl p-3 bg-amber-950/40 border border-amber-400/50 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11.5px] font-black text-amber-200">🏁 Turnir yakunlandi! ${w1 ? '🥇 Chempion: ' + esc(w1.name) : ''}</span>
            <button id="btnTourGoBracket" type="button" class="ios-btn-gray px-2.5 py-1 text-[10px] shrink-0 cursor-pointer">Setka</button>
          </div>
          ${me.myWinnerRank ? `
            <button id="btnTourGoPayout" type="button" class="ios-btn-green w-full py-2 text-[11.5px] cursor-pointer">
              ${me.hasSubmittedPayout ? '✅ Karta ma\'lumoti yuborilgan' : `💳 ${me.myWinnerRank}-o'rin sovrinini olish`}
            </button>
          ` : ''}
        </div>
      `;
    }

    return `
      ${noticeHtml}
      <div class="flex flex-col gap-2">
        <!-- 1) Afisha Banneri -->
        <div class="ios-fh-group p-2.5 bg-gradient-to-br from-amber-950/45 via-slate-900/80 to-rose-950/35 border border-amber-400/45">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[13px] font-black text-amber-200 tracking-wide truncate">${esc(title)}</div>
              <div class="text-[10.5px] font-semibold text-slate-200/90 mt-0.5">🕒 ${esc(startFmt)}</div>
            </div>
            <div class="shrink-0 text-right">
              <div class="text-[8.5px] uppercase text-slate-400 font-bold">Taymer</div>
              <div id="dgTourMainTimer" class="text-[13px] font-mono font-black text-amber-300">${esc(timerVal)}</div>
            </div>
          </div>
          <div class="mt-2">
            <div class="flex items-center justify-between text-[10px] font-bold text-slate-200 mb-1">
              <span>👥 Ishtirokchilar: <span class="text-amber-300 font-mono">${cnt} / ${max}</span></span>
              <span class="text-emerald-300 font-mono">✅ Check-In: ${active ? (Number(active.checkedInCount) || 0) : 0}</span>
            </div>
            <div class="w-full h-2 rounded-full bg-slate-950/85 border border-white/10 overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 transition-all" style="width:${pct}%"></div>
            </div>
          </div>
        </div>

        <!-- 2) Sovrin Jamg'armasi 3 ta karta -->
        <div class="grid grid-cols-3 gap-1.5">
          <div class="ios-fh-group p-2 text-center border-amber-400/55 bg-amber-950/25">
            <div class="text-[10px] font-black text-amber-300">🥇 1-O'RIN</div>
            <div class="text-[11.5px] font-black text-white mt-0.5">${esc(formatMoney(prizes.first))} so'm</div>
            <div class="text-[10px] font-mono font-bold text-cyan-300 mt-0.5">💎 ${Number(gems.first) || 500}</div>
          </div>
          <div class="ios-fh-group p-2 text-center border-sky-400/40">
            <div class="text-[10px] font-black text-sky-200">🥈 2-O'RIN</div>
            <div class="text-[11.5px] font-black text-white mt-0.5">${esc(formatMoney(prizes.second))} so'm</div>
            <div class="text-[10px] font-mono font-bold text-cyan-300 mt-0.5">💎 ${Number(gems.second) || 250}</div>
          </div>
          <div class="ios-fh-group p-2 text-center border-amber-600/40">
            <div class="text-[10px] font-black text-amber-400">🥉 3-O'RIN</div>
            <div class="text-[11.5px] font-black text-white mt-0.5">${esc(formatMoney(prizes.third))} so'm</div>
            <div class="text-[10px] font-mono font-bold text-cyan-300 mt-0.5">💎 ${Number(gems.third) || 100}</div>
          </div>
        </div>

        <!-- 3) Majburiy shartlar qutisi -->
        <div class="ios-fh-group p-2 flex flex-col gap-1.5 ${_subWarning ? 'border-rose-400/85 shadow-[0_0_16px_rgba(244,63,94,0.35)]' : ''}">
          <div class="flex items-center justify-between gap-2 text-[10.5px]">
            <span class="text-slate-200 font-semibold">🆔 Telegram profili:</span>
            <span class="font-bold ${identity.tgId ? 'text-emerald-300' : 'text-rose-300'}">${identity.tgId ? '✅ Tasdiqlangan' : '❌ Telegram orqali kiring'}</span>
          </div>
          <div class="flex items-center justify-between gap-2 text-[10.5px] flex-wrap">
            <span class="text-slate-200 font-semibold">📢 @digi_digi_kanal obunasi:</span>
            <span class="font-bold ${me.isChannelMember ? 'text-emerald-300' : 'text-amber-300'}">${me.isChannelMember ? '✅ Obuna tasdiqlandi' : '❌ Obuna bo\'lish shart'}</span>
          </div>
          ${!me.isChannelMember ? `
            <div class="flex items-center gap-2 pt-1">
              <button id="btnTourOpenChannel" type="button" data-url="${esc(channelUrl)}" class="ios-btn-blue flex-1 py-1.5 px-3 text-[10.5px] cursor-pointer">📢 Kanalga o'tish</button>
              <button id="btnTourCheckChannel" type="button" ${_actionBusy ? 'disabled' : ''} class="ios-btn-tinted flex-1 py-1.5 px-3 text-[10.5px] cursor-pointer disabled:opacity-60">🔄 Obunani tekshirish</button>
            </div>
          ` : ''}
        </div>

        <!-- 4) Asosiy harakat tugmasi -->
        <div>${actionBlockHtml}</div>

        <!-- 5) Viral do'st chaqirish -->
        <div class="ios-fh-group p-2 flex items-center justify-between gap-2">
          <button id="btnTourShareRef" type="button" data-share-url="${esc(myRefLink)}" class="ios-btn-tinted flex-1 py-2 px-3 text-[11px] font-extrabold cursor-pointer">
            ✈️ DO'STNI TURNIRGA CHAQIRISH (+$1,000)
          </button>
          <span class="ios-fh-stat-pill px-2.5 py-1.5 rounded-full text-[10px] font-mono font-extrabold text-amber-200 shrink-0">
            Takliflar: ${Number(me.refCount) || 0}
          </span>
        </div>
      </div>
    `;
  }

  function renderMatchCardHtml(m, myPlayerId) {
    if (!m) return '';
    const isMine = (m.p1 && m.p1.playerId === myPlayerId) || (m.p2 && m.p2.playerId === myPlayerId);
    const cardBorder = isMine
      ? 'border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.36)] bg-amber-950/25'
      : 'border-sky-400/25 bg-slate-950/75';

    let statusBadge = '<span class="text-[8.5px] px-1.5 py-[1px] rounded bg-slate-800 text-slate-300">Kutilmoqda</span>';
    if (m.status === 'bye') statusBadge = '<span class="text-[8.5px] px-1.5 py-[1px] rounded bg-sky-500/25 text-sky-200 font-bold">BYE</span>';
    else if (m.status === 'ready') statusBadge = '<span class="text-[8.5px] px-1.5 py-[1px] rounded bg-emerald-500/25 text-emerald-200 font-bold">TAYYOR</span>';
    else if (m.status === 'playing') statusBadge = '<span class="text-[8.5px] px-1.5 py-[1px] rounded bg-rose-500/30 text-rose-200 font-bold">● LIVE</span>';
    else if (m.status === 'done') statusBadge = `<span class="text-[8.5px] px-1.5 py-[1px] rounded bg-amber-500/25 text-amber-200 font-bold">${m.tko ? 'TKO' : 'TUGADI'}</span>`;

    const renderSlot = (slot, score, isOpponentBye) => {
      if (!slot) {
        return `
          <div class="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-slate-900/60 text-slate-500 text-[10px] italic">
            <span class="truncate">${isOpponentBye ? 'BYE (Bo\'sh)' : 'Kutilmoqda...'}</span>
            <span class="font-mono">-</span>
          </div>
        `;
      }
      const isWinner = m.winnerId && m.winnerId === slot.playerId;
      const isMeSlot = slot.playerId === myPlayerId;
      const rowCls = isWinner
        ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-100 font-black'
        : (isMeSlot ? 'bg-amber-500/15 border border-amber-400/40 text-amber-100 font-bold' : 'bg-slate-900/80 text-slate-200');
      return `
        <div class="flex items-center justify-between gap-1.5 px-2 py-1 rounded ${rowCls} text-[10.5px]">
          <span class="truncate">${isWinner ? '🏆 ' : ''}${esc(slot.name)}</span>
          <span class="font-mono font-black shrink-0">${Number(score) || 0}</span>
        </div>
      `;
    };

    return `
      <div class="rounded-xl p-2 border ${cardBorder} flex flex-col gap-1 min-w-[186px]">
        <div class="flex items-center justify-between gap-1 pb-0.5 border-b border-white/10">
          <span class="text-[8.5px] font-mono font-bold text-slate-400">${esc(m.id)}</span>
          ${statusBadge}
        </div>
        ${renderSlot(m.p1, m.score1, false)}
        ${renderSlot(m.p2, m.score2, m.status === 'bye')}
      </div>
    `;
  }

  function renderBracketTab(active, identity) {
    const bracket = active && active.bracket;
    if (bracket && Array.isArray(bracket.rounds) && bracket.rounds.length > 0) {
      const colsHtml = bracket.rounds.map(r => `
        <div class="flex flex-col gap-2 min-w-[196px] shrink-0">
          <div class="text-center text-[10px] font-black uppercase tracking-wider text-amber-300 bg-slate-900/85 border border-amber-400/35 rounded-lg py-1 px-2">
            ${esc(r.roundName)}
          </div>
          <div class="flex flex-col justify-around gap-2.5 flex-1">
            ${(r.matches || []).map(m => renderMatchCardHtml(m, identity.playerId)).join('')}
          </div>
        </div>
      `).join('');

      const thirdHtml = bracket.thirdPlaceMatch ? `
        <div class="flex flex-col gap-2 min-w-[196px] shrink-0">
          <div class="text-center text-[10px] font-black uppercase tracking-wider text-amber-400 bg-slate-900/85 border border-amber-500/35 rounded-lg py-1 px-2">
            🥉 3-O'RIN UCHUN
          </div>
          <div class="flex flex-col justify-center flex-1">
            ${renderMatchCardHtml(bracket.thirdPlaceMatch, identity.playerId)}
          </div>
        </div>
      ` : '';

      return `
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-[10.5px] text-slate-300 px-1">
            <span>⚔️ <b>${Number(bracket.playerCount) || 0}</b> jangchi • <b>${Number(bracket.size) || 0}</b> lik Play-off setka</span>
            <span class="text-slate-400">‹ Yon tomonga suring ›</span>
          </div>
          <div class="dg-tour-bracket-scroll">
            ${colsHtml}
            ${thirdHtml}
          </div>
        </div>
      `;
    }

    const list = ((active && Array.isArray(active.participants)) ? active.participants : [])
      .slice()
      .sort((a, b) => (Number(b.elo) || 1000) - (Number(a.elo) || 1000));

    if (!list.length) {
      return `
        <div class="ios-fh-group p-5 text-center text-[11.5px] text-slate-300">
          👥 Hozircha ro'yxatdan o'tgan jangchilar yo'q. Birinchi bo'lib yoziling!
        </div>
      `;
    }

    const rowsHtml = list.map((p, idx) => {
      const initial = esc((p.name || 'J').trim().charAt(0).toUpperCase());
      const safePhoto = safeHttpUrl(p.photoUrl);
      const avatar = safePhoto
        ? `<img src="${esc(safePhoto)}" alt="" class="w-7 h-7 rounded-full object-cover shrink-0 border border-white/20" />`
        : `<span class="w-7 h-7 rounded-full bg-slate-800 border border-white/20 flex items-center justify-center text-[11px] font-black text-amber-300 shrink-0">${initial}</span>`;
      const isMe = p.playerId === identity.playerId;
      const badge = p.dq
        ? '<span class="text-[9.5px] font-bold text-rose-300">⛔ DQ</span>'
        : (p.checkedIn ? '<span class="text-[9.5px] font-bold text-emerald-300">✅ Check-In</span>' : '<span class="text-[9.5px] font-bold text-sky-300">📝 Ro\'yxatda</span>');

      return `
        <tr class="border-b border-white/10 ${isMe ? 'bg-amber-500/15' : ''}">
          <td class="py-1.5 px-2 font-mono text-[10.5px] text-slate-400">#${idx + 1}</td>
          <td class="py-1.5 px-2">
            <div class="flex items-center gap-2 min-w-0">
              ${avatar}
              <span class="text-[11px] font-bold text-white truncate max-w-[160px]">${esc(p.name)}${isMe ? ' (Siz)' : ''}</span>
            </div>
          </td>
          <td class="py-1.5 px-2 font-mono text-[11px] font-extrabold text-amber-300">${Number(p.elo) || 1000}</td>
          <td class="py-1.5 px-2 text-right whitespace-nowrap">${badge}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="ios-fh-group overflow-hidden">
        <table class="w-full text-left border-collapse">
          <caption class="sr-only">Turnirga ro'yxatdan o'tgan jangchilar jadvali</caption>
          <thead>
            <tr class="bg-slate-900/80 border-b border-white/15 text-[9.5px] uppercase tracking-wider text-slate-300">
              <th scope="col" class="py-2 px-2">#</th>
              <th scope="col" class="py-2 px-2">Jangchi</th>
              <th scope="col" class="py-2 px-2">ELO</th>
              <th scope="col" class="py-2 px-2 text-right">Holat</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function renderRulesTab(me) {
    const rules = [
      { icon: '⚔️', title: '1v1 Olimpiya Play-off', desc: "Bitta mag'lubiyat bilan chiqib ketiladi; yarim final mag'lublari 3-o'rin uchun bellashadi." },
      { icon: '🛡️', title: 'Teng 100 HP / 50 Zirh', desc: "Barcha o'yinchilar teng jangovar sharoitda, ELO seeding asosida juftlanadi." },
      { icon: '⏱️', title: '45 soniya No-Show TKO', desc: "Jang tayyor bo'lgach 45 soniya ichida kirmagan o'yinchiga texnik mag'lubiyat yoziladi." },
      { icon: '🚫', title: 'Anti-Cheat & Halol O\'yin', desc: "Har qanday chiterlik, bag yoki soxta hisob darhol diskvalifikatsiya qilinadi." },
      { icon: '📢', title: 'Kanal Obunasi & Check-In', desc: "@digi_digi_kanal obunasi va startdan 15 daqiqa oldin Check-In tasdiqlash majburiy." }
    ];

    let payoutBlock = '';
    if (me.myWinnerRank && !me.hasSubmittedPayout) {
      payoutBlock = `
        <div class="ios-fh-group p-3 border-emerald-400/60 bg-emerald-950/25">
          <div class="text-[12.5px] font-black text-emerald-200 mb-1">🏆 TABRIKLAYMIZ! Siz ${Number(me.myWinnerRank)}-o'rin g'olibisiz!</div>
          <p class="text-[10.5px] text-slate-200/90 mb-2.5">Sovrinni qabul qilish uchun karta ma'lumotlaringizni to'ldiring:</p>
          <form id="dgTourPayoutForm" novalidate class="flex flex-col gap-2.5">
            <div class="flex flex-col gap-1">
              <label for="dgPayCard" class="text-[10.5px] font-bold text-slate-200">Karta raqami (Humo / Uzcard, 16 raqam) <span aria-hidden="true">*</span></label>
              <input id="dgPayCard" name="cardNumber" type="text" inputmode="numeric" autocomplete="cc-number" maxlength="23" placeholder="8600 0000 0000 0000" value="${esc(_payoutDraft.cardNumber)}" required class="dg-tour-input font-mono" />
            </div>
            <div class="flex flex-col gap-1">
              <label for="dgPayHolder" class="text-[10.5px] font-bold text-slate-200">Karta egasining ismi-familiyasi <span aria-hidden="true">*</span></label>
              <input id="dgPayHolder" name="holderName" type="text" autocomplete="name" maxlength="80" placeholder="ALIYEV VALI" value="${esc(_payoutDraft.holderName)}" required class="dg-tour-input" />
            </div>
            <div class="flex flex-col gap-1">
              <label for="dgPayPhone" class="text-[10.5px] font-bold text-slate-200">Telefon raqami (+998...) <span aria-hidden="true">*</span></label>
              <input id="dgPayPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="+998 90 123 45 67" value="${esc(_payoutDraft.phone)}" required class="dg-tour-input font-mono" />
            </div>
            <div id="dgPayFormMsg" role="status" aria-live="polite" class="text-[10.5px] font-bold min-h-[16px]"></div>
            <button id="btnTourPayoutSubmit" type="submit" ${_actionBusy ? 'disabled' : ''} class="ios-btn-green w-full py-2.5 px-4 text-[11.5px] cursor-pointer disabled:opacity-60">
              ${_actionBusy ? '⏳ Yuborilmoqda...' : '💳 MA\'LUMOTNI ADMINGA YUBORISH'}
            </button>
          </form>
        </div>
      `;
    } else if (me.hasSubmittedPayout) {
      payoutBlock = `
        <div class="ios-fh-group p-3 border-emerald-400/60 bg-emerald-950/35 text-[11px] font-bold text-emerald-200">
          ✅ Karta ma'lumotlaringiz adminga yuborildi! Tekshiruvdan so'ng to'lov o'tkaziladi.
        </div>
      `;
    } else {
      payoutBlock = `
        <div class="ios-fh-group p-3 text-[10.5px] text-slate-300">
          💳 Pul sovrinini olish formasi faqat turnirda 1-, 2- yoki 3-o'rinni egallagan g'oliblar uchun avtomatik ochiladi.
        </div>
      `;
    }

    return `
      <div class="flex flex-col gap-2.5">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${rules.map(r => `
            <div class="ios-fh-group p-2.5 flex items-start gap-2">
              <span class="text-base leading-none shrink-0 mt-0.5">${r.icon}</span>
              <div class="min-w-0">
                <div class="text-[11px] font-black text-amber-200">${esc(r.title)}</div>
                <div class="text-[10px] text-slate-300 leading-snug mt-0.5">${esc(r.desc)}</div>
              </div>
            </div>
          `).join('')}
        </div>
        ${payoutBlock}
      </div>
    `;
  }

  function renderHistoryTab(history) {
    if (!Array.isArray(history) || !history.length) {
      return `
        <div class="ios-fh-group p-6 text-center">
          <div class="text-2xl mb-1.5">🏆</div>
          <div class="text-[12px] font-bold text-amber-200">Birinchi chempion siz bo'lishingiz mumkin! 🏆</div>
          <div class="text-[10.5px] text-slate-400 mt-1">Yakunlangan turnirlar va TOP-3 g'oliblar shu yerda abadiy saqlanadi.</div>
        </div>
      `;
    }

    return `
      <div class="flex flex-col gap-2.5">
        ${history.map(t => {
          const w = t.winners || {};
          const rowFor = (medal, item) => {
            if (!item) return '';
            const badge = item.paid
              ? '<span class="text-[9px] font-bold px-1.5 py-[1px] rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-200">✅ To\'langan</span>'
              : '<span class="text-[9px] font-bold px-1.5 py-[1px] rounded-full bg-amber-500/20 border border-amber-400/45 text-amber-200">⏳ To\'lov kutilmoqda</span>';
            return `
              <div class="flex items-center justify-between gap-2 text-[10.5px] py-1 border-t border-white/10">
                <span class="font-bold text-white truncate">${medal} ${esc(item.name)}</span>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span class="font-mono text-amber-200 font-bold">${esc(formatMoney(item.cashPrize))} so'm</span>
                  ${badge}
                </div>
              </div>
            `;
          };
          return `
            <div class="ios-fh-group p-3">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <span class="text-[12px] font-black text-amber-200 truncate">🏆 ${esc(t.title || 'Turnir')}</span>
                <span class="text-[9.5px] text-slate-300 shrink-0">${esc(formatTashkentDateTime(t.finishedAt || t.startAt))}</span>
              </div>
              <div class="text-[10px] text-slate-400 mb-1.5">💵 Umumiy sovrin: <b class="text-white">${esc(formatMoney(t.totalPrize || 0))} so'm</b></div>
              ${rowFor('🥇', w.first)}
              ${rowFor('🥈', w.second)}
              ${rowFor('🥉', w.third)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function bindModalTabEvents() {
    const body = document.getElementById('dgTourBody');
    if (!body) return;

    const btnOpenCh = document.getElementById('btnTourOpenChannel');
    if (btnOpenCh) {
      btnOpenCh.addEventListener('click', () => {
        openExternalTelegramLink(btnOpenCh.getAttribute('data-url') || CHANNEL_URL_DEFAULT);
      });
    }

    const btnCheckCh = document.getElementById('btnTourCheckChannel');
    if (btnCheckCh) {
      btnCheckCh.addEventListener('click', handleCheckChannelClick);
    }

    const btnReg = document.getElementById('btnTourRegister');
    if (btnReg) {
      btnReg.addEventListener('click', handleRegisterClick);
    }

    const btnCheckin = document.getElementById('btnTourCheckin');
    if (btnCheckin) {
      btnCheckin.addEventListener('click', handleCheckinClick);
    }

    const btnLaunch = document.getElementById('btnTourLaunchMatch');
    if (btnLaunch) {
      btnLaunch.addEventListener('click', launchMyTournamentMatch);
    }

    const btnCancelWait = document.getElementById('btnTourCancelWait');
    if (btnCancelWait) {
      btnCancelWait.addEventListener('click', () => {
        _waitingMatch = null;
        if (window.DIGI_MP && typeof window.DIGI_MP.leaveRoom === 'function') {
          window.DIGI_MP.leaveRoom(true);
        }
        renderModalContent(true);
        showTourToast('Kutish bekor qilindi', '🚪');
      });
    }

    const btnGoBracket = document.getElementById('btnTourGoBracket');
    if (btnGoBracket) {
      btnGoBracket.addEventListener('click', () => selectTab('bracket'));
    }

    const btnGoPayout = document.getElementById('btnTourGoPayout');
    if (btnGoPayout) {
      btnGoPayout.addEventListener('click', () => selectTab('rules'));
    }

    const btnShare = document.getElementById('btnTourShareRef');
    if (btnShare) {
      btnShare.addEventListener('click', () => {
        const link = btnShare.getAttribute('data-share-url') || `https://t.me/${BOT_USERNAME}?start=tour_join`;
        const text = "🔥 DIGI DIGI GRAND CUP — 500,000 SO'M + 850 💎 sovrinli 1v1 Play-off turniriga qo'shil!";
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
        openExternalTelegramLink(shareUrl);
      });
    }

    const payoutForm = document.getElementById('dgTourPayoutForm');
    if (payoutForm) {
      const cardEl = document.getElementById('dgPayCard');
      const holderEl = document.getElementById('dgPayHolder');
      const phoneEl = document.getElementById('dgPayPhone');
      const msgEl = document.getElementById('dgPayFormMsg');

      const syncDraft = () => {
        _payoutDraft.cardNumber = cardEl.value;
        _payoutDraft.holderName = holderEl.value;
        _payoutDraft.phone = phoneEl.value;
      };

      cardEl.addEventListener('input', () => {
        const digits = cardEl.value.replace(/\D/g, '').slice(0, 19);
        cardEl.value = digits.replace(/(.{4})/g, '$1 ').trim();
        cardEl.removeAttribute('aria-invalid');
        if (msgEl) msgEl.textContent = '';
        syncDraft();
      });
      holderEl.addEventListener('input', () => {
        holderEl.removeAttribute('aria-invalid');
        if (msgEl) msgEl.textContent = '';
        syncDraft();
      });
      phoneEl.addEventListener('input', () => {
        phoneEl.removeAttribute('aria-invalid');
        if (msgEl) msgEl.textContent = '';
        syncDraft();
      });

      cardEl.addEventListener('blur', () => {
        const digits = cardEl.value.replace(/\D/g, '');
        if (digits && (digits.length < 12 || digits.length > 19)) {
          cardEl.setAttribute('aria-invalid', 'true');
        }
      });

      payoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (_actionBusy) return;
        const cleanCard = cardEl.value.replace(/\D/g, '');
        const cleanHolder = holderEl.value.trim();
        const cleanPhone = phoneEl.value.trim();

        if (cleanCard.length < 12 || cleanCard.length > 19) {
          cardEl.setAttribute('aria-invalid', 'true');
          cardEl.focus();
          if (msgEl) { msgEl.className = 'text-[10.5px] font-bold text-rose-300'; msgEl.textContent = "Karta raqamini to'liq kiriting (16 raqam)."; }
          return;
        }
        if (cleanHolder.length < 2) {
          holderEl.setAttribute('aria-invalid', 'true');
          holderEl.focus();
          if (msgEl) { msgEl.className = 'text-[10.5px] font-bold text-rose-300'; msgEl.textContent = 'Karta egasining ismini kiriting.'; }
          return;
        }
        if (cleanPhone.length < 7) {
          phoneEl.setAttribute('aria-invalid', 'true');
          phoneEl.focus();
          if (msgEl) { msgEl.className = 'text-[10.5px] font-bold text-rose-300'; msgEl.textContent = "Telefon raqamini kiriting."; }
          return;
        }

        _actionBusy = true;
        renderModalContent(true);
        try {
          const id = getMyIdentity();
          const res = await fetch('/api/tour/payout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerId: id.playerId,
              tgId: id.tgId,
              cardNumber: cleanCard,
              holderName: cleanHolder,
              phone: cleanPhone
            })
          });
          const data = await res.json();
          if (data && data.ok) {
            _payoutDraft.cardNumber = '';
            _payoutDraft.holderName = '';
            _payoutDraft.phone = '';
            showTourToast('Karta ma\'lumoti adminga yuborildi!', '✅');
            await fetchTourState(true);
          } else {
            _statusNotice = { type: 'err', text: (data && data.error) || 'Yuborishda xatolik.' };
          }
        } catch (_) {
          _statusNotice = { type: 'err', text: "Tarmoq xatosi. Qayta urinib ko'ring." };
        } finally {
          _actionBusy = false;
          renderModalContent(true);
        }
      });
    }
  }

  function renderModalContent(force = false) {
    if (!isModalOpen()) return;
    const active = _state && _state.active;
    const me = (_state && _state.me) || {};
    const history = (_state && Array.isArray(_state.history)) ? _state.history : [];
    const identity = getMyIdentity();

    const pill = document.getElementById('dgTourStatusPill');
    if (pill) {
      const meta = getStatusMeta(active);
      pill.textContent = meta.label;
      pill.className = `ios-fh-stat-pill text-[9.5px] font-semibold px-2 py-0.5 rounded-full truncate ${meta.cls}`;
    }

    const tabBracketBtn = document.getElementById('dgTabBtnBracket');
    if (tabBracketBtn) {
      const hasBracket = Boolean(active && active.bracket && Array.isArray(active.bracket.rounds));
      tabBracketBtn.textContent = hasBracket ? '🏆 Setka' : '👥 Ishtirokchilar / Setka';
    }

    const body = document.getElementById('dgTourBody');
    if (!body) return;

    // Agar foydalanuvchi karta formasiga ma'lumot kiritayotgan bo'lsa, fon pollingi inputni uzib qo'ymasin
    if (!force && _activeTab === 'rules' && body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      return;
    }

    const sig = JSON.stringify({
      tab: _activeTab,
      busy: _actionBusy,
      subWarn: _subWarning,
      waiting: _waitingMatch ? _waitingMatch.roomCode : null,
      notice: _statusNotice,
      active,
      me,
      historyLen: history.length,
      pid: identity.playerId,
      tgId: identity.tgId
    });
    if (!force && sig === _lastModalRenderSig) return;
    _lastModalRenderSig = sig;

    if (_activeTab === 'main') body.innerHTML = renderMainTab(active, me, identity);
    else if (_activeTab === 'bracket') body.innerHTML = renderBracketTab(active, identity);
    else if (_activeTab === 'rules') body.innerHTML = renderRulesTab(me);
    else body.innerHTML = renderHistoryTab(history);

    bindModalTabEvents();
  }

  async function handleCheckChannelClick() {
    if (_actionBusy) return;
    const id = getMyIdentity();
    if (!id.tgId) {
      _statusNotice = { type: 'err', text: "Avval o'yinni Telegram bot (@digi_dig_bot) orqali oching." };
      renderModalContent(true);
      return;
    }
    _actionBusy = true;
    renderModalContent(true);
    try {
      const res = await fetch('/api/tour/check-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: id.playerId, tgId: id.tgId })
      });
      const data = await res.json();
      if (data && data.isMember) {
        _subWarning = false;
        _statusNotice = { type: 'ok', text: '✅ @digi_digi_kanal obunasi tasdiqlandi!' };
        await fetchTourState(true);
      } else {
        _subWarning = true;
        _statusNotice = { type: 'err', text: "❌ Hali kanalga obuna bo'lmagansiz. Avval obuna bo'lib qayta tekshiring." };
      }
    } catch (_) {
      _statusNotice = { type: 'err', text: 'Server bilan aloqa xatosi.' };
    } finally {
      _actionBusy = false;
      renderModalContent(true);
    }
  }

  async function handleRegisterClick() {
    if (_actionBusy) return;
    const id = getMyIdentity();
    if (!id.tgId) {
      _statusNotice = { type: 'err', text: "❌ Ro'yxatdan o'tish uchun o'yinni Telegram bot (@digi_dig_bot) ichidan oching." };
      renderModalContent(true);
      return;
    }
    _actionBusy = true;
    _statusNotice = null;
    renderModalContent(true);
    try {
      const refBy = getStoredRefBy(id.playerId);
      const res = await fetch('/api/tour/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: id.playerId,
          tgId: id.tgId,
          name: id.name,
          username: id.username,
          photoUrl: id.photoUrl,
          refBy
        })
      });
      const data = await res.json();
      if (res.ok && data && data.ok) {
        _subWarning = false;
        _statusNotice = { type: 'ok', text: "✅ Tabriklaymiz! Turnirga muvaffaqiyatli yozildingiz!" };
        showTourToast('Turnirga yozildingiz!', '🎟️');
        await fetchTourState(true);
      } else if (res.status === 403 && data && data.error === 'NOT_SUBSCRIBED') {
        _subWarning = true;
        _statusNotice = { type: 'err', text: "📢 Qatnashish uchun avval @digi_digi_kanal ga obuna bo'lishingiz shart!" };
      } else {
        _statusNotice = { type: 'err', text: (data && data.error) || "Ro'yxatdan o'tishda xatolik." };
      }
    } catch (_) {
      _statusNotice = { type: 'err', text: 'Tarmoq xatosi. Qayta urinib ko\'ring.' };
    } finally {
      _actionBusy = false;
      renderModalContent(true);
    }
  }

  async function handleCheckinClick() {
    if (_actionBusy) return;
    const id = getMyIdentity();
    _actionBusy = true;
    _statusNotice = null;
    renderModalContent(true);
    try {
      const res = await fetch('/api/tour/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: id.playerId, tgId: id.tgId })
      });
      const data = await res.json();
      if (res.ok && data && data.ok) {
        _statusNotice = { type: 'ok', text: '🔥 Check-In tasdiqlandi! Setka ochilishini kuting.' };
        showTourToast('Check-In tasdiqlandi!', '✅');
        await fetchTourState(true);
      } else {
        _statusNotice = { type: 'err', text: (data && data.error) || 'Check-In xatosi.' };
      }
    } catch (_) {
      _statusNotice = { type: 'err', text: 'Tarmoq xatosi.' };
    } finally {
      _actionBusy = false;
      renderModalContent(true);
    }
  }

  async function fetchTourState(force = false) {
    if (_isFetching) return _state;
    if (!force && isGameBusy()) return _state;
    _isFetching = true;
    try {
      const id = getMyIdentity();
      const qs = new URLSearchParams();
      if (id.playerId) qs.set('playerId', id.playerId);
      if (id.tgId) qs.set('tgId', id.tgId);
      qs.set('_t', String(Date.now()));
      const res = await fetch('/api/tour/state?' + qs.toString());
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          _state = data;
          if (data.serverNow) {
            _serverOffsetMs = Number(data.serverNow) - Date.now();
          }
          _lastPollAt = Date.now();
          updateOnlineLiveBadge();
          renderModalContent(false);
        }
      }
    } catch (_) {
    } finally {
      _isFetching = false;
    }
    return _state;
  }

  async function openTournamentModal() {
    ensureEmbeddedTourDOM();
    _statusNotice = null;
    if (typeof window.openOnlineModal === 'function') {
      window.openOnlineModal();
    } else {
      const m = document.getElementById('modalOnline');
      if (m) m.classList.remove('hidden');
    }
    setOnlineTab('tour');
    await fetchTourState(true);
  }

  function closeTournamentModal() {
    const modal = document.getElementById('modalOnline');
    if (modal) modal.classList.add('hidden');
    if (!_waitingMatch) setOnlineTab('live');
    if (_lastInvoker && typeof _lastInvoker.focus === 'function') {
      try { _lastInvoker.focus(); } catch (_) {}
    }
    _lastInvoker = null;
  }

  async function launchMyTournamentMatch() {
    if (_actionBusy) return;
    const active = _state && _state.active;
    const myMatch = _state && _state.me && _state.me.myMatch;
    if (typeof window.DIGI_TOUR_LAUNCH_MATCH === 'function') {
      window.DIGI_TOUR_LAUNCH_MATCH(myMatch, active);
      return;
    }
    const id = getMyIdentity();
    if (!id.playerId) {
      _statusNotice = { type: 'err', text: "O'yinchi ID topilmadi. Sahifani qayta yuklang." };
      renderModalContent(true);
      return;
    }
    _actionBusy = true;
    _statusNotice = null;
    renderModalContent(true);
    try {
      const res = await fetch('/api/tour/enter-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: id.playerId, tgId: id.tgId, name: id.name })
      });
      const data = await res.json();
      if (!res.ok || !data || !data.ok || !data.roomCode) {
        _statusNotice = { type: 'err', text: (data && data.error) || 'Jang xonasini ochib bo\'lmadi.' };
        return;
      }
      if (!window.DIGI_MP || typeof window.DIGI_MP.joinRoomByCode !== 'function') {
        _statusNotice = { type: 'err', text: 'Multiplayer moduli hali yuklanmadi.' };
        return;
      }
      const joinRes = await window.DIGI_MP.joinRoomByCode(data.roomCode, { isTournament: true });
      if (!joinRes || !joinRes.ok) {
        _waitingMatch = null;
        _statusNotice = { type: 'err', text: (joinRes && joinRes.error) || 'Turnir xonasiga ulanib bo\'lmadi.' };
      } else if (joinRes.room && joinRes.room.status === 'waiting') {
        _waitingMatch = {
          roomCode: data.roomCode,
          matchId: data.matchId,
          roundName: data.roundName,
          oppName: data.opponentName,
          oppElo: data.opponentElo,
          noShowDeadlineAt: Number(joinRes.room.noShowDeadlineAt || data.noShowDeadlineAt) || (Date.now() + 45000)
        };
      } else {
        _waitingMatch = null;
      }
    } catch (_) {
      _statusNotice = { type: 'err', text: 'Tarmoq xatosi. Qayta urinib ko\'ring.' };
    } finally {
      _actionBusy = false;
      renderModalContent(true);
    }
  }

  function onMpEvent(type, data) {
    if (type === 'room' && _waitingMatch) {
      if (data && data.noShowDeadlineAt) {
        _waitingMatch.noShowDeadlineAt = Number(data.noShowDeadlineAt);
      }
      if (data && data.status === 'playing') {
        _waitingMatch = null;
        renderModalContent(true);
      }
    } else if (type === 'match_end') {
      _waitingMatch = null;
      if (data && data.tko) {
        showTourToast("🏆 Texnik g'alaba (TKO) qayd etildi!", '🏆');
      } else if (data && data.overtimeWin) {
        showTourToast("⚡ Overtaym g'alabasi qayd etildi!", '⚡');
      }
      renderModalContent(true);
      setTimeout(() => { fetchTourState(true); }, 700);
    }
  }

  function onMatchFinished(data) {
    _waitingMatch = null;
    fetchTourState(true);
  }

  function tickSecond() {
    if (document.hidden || isGameBusy() || !isLobbyVisible()) return;
    const active = _state && _state.active;

    if (active && (active.status === 'registration' || active.status === 'checkin')) {
      const cd = formatCountdown(active.startAt);
      if (isModalOpen() && _activeTab === 'main') {
        const mainTimer = document.getElementById('dgTourMainTimer');
        if (mainTimer) mainTimer.textContent = cd;
      }
    }

    if (_waitingMatch && isModalOpen() && _activeTab === 'main') {
      const nsTimer = document.getElementById('dgTourNoShowTimer');
      if (nsTimer) {
        const noShowRem = Math.max(0, Math.ceil((Number(_waitingMatch.noShowDeadlineAt || 0) - Date.now()) / 1000));
        nsTimer.textContent = 'TKO gacha: ' + noShowRem + 's';
      }
    }

    const pollIntervalMs = isModalOpen() ? 10000 : 45000;
    if ((Date.now() - _lastPollAt) >= pollIntervalMs) {
      fetchTourState(false);
    }
  }

  function bootTournamentUI() {
    ensureTournamentStyles();
    removeLegacyLobbyCard();
    bindOnlineModalControls();
    ensureEmbeddedTourDOM();
    updateOnlineLiveBadge();
    parseDeepLinksAndAutoOpen();
    if (!isGameBusy()) {
      fetchTourState(false);
    }
    setInterval(tickSecond, 1000);
  }

  window.DIGI_TOUR = {
    open: openTournamentModal,
    close: closeTournamentModal,
    setOnlineTab,
    refresh: fetchTourState,
    getState: () => _state,
    onMpEvent,
    onMatchFinished
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootTournamentUI);
  } else {
    bootTournamentUI();
  }
})();
