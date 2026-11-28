// DIGI DIGI GRAND CUP — 2-BOSQICH: 3D iOS GLASS TURNIR MARKAZI VA 1v1 PLAY-OFF SETKA UI (v20261128_1)
(function () {
  'use strict';

  const BOT_USERNAME = 'digi_dig_bot';
  const CHANNEL_URL_DEFAULT = 'https://t.me/digi_digi_kanal';
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const UZ_WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  const TOUR_REF_STORAGE_KEY = 'digi_tour_ref';

  let _state = null;
  let _serverOffsetMs = 0; // serverNow - Date.now()
  let _activeTab = 'main'; // 'main' | 'bracket' | 'rules' | 'history'
  let _isFetching = false;
  let _lastPollAt = 0;
  let _subWarning = false;
  let _actionBusy = false;
  let _statusNotice = null; // { type: 'ok' | 'err', text: string }
  let _lastInvoker = null;
  let _lastModalRenderSig = '';
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
    const m = document.getElementById('modalTournament');
    return !!(m && !m.classList.contains('hidden'));
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
      .dg-tour-lobby-card {
        position: absolute;
        left: 34.5%;
        width: 27.5%;
        bottom: calc(clamp(104px, 31%, 126px) + 3% + 8px);
        min-height: 58px;
        max-height: 74px;
        z-index: 20;
        background: linear-gradient(150deg, rgba(58, 22, 12, 0.86) 0%, rgba(28, 12, 16, 0.90) 52%, rgba(14, 18, 36, 0.92) 100%);
        border: 1.5px solid rgba(251, 191, 36, 0.72);
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.62), 0 0 16px rgba(245, 158, 11, 0.24), inset 0 1px 0 rgba(254, 240, 138, 0.38);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.88);
        transition: transform 130ms ease, border-color 150ms ease, box-shadow 150ms ease;
      }
      .dg-tour-lobby-card:active {
        transform: scale(0.975);
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
      #modalTournament {
        background:
          radial-gradient(circle at 18% 18%, rgba(251, 191, 36, 0.18), transparent 45%),
          radial-gradient(circle at 82% 84%, rgba(239, 68, 68, 0.16), transparent 46%),
          rgba(3, 7, 18, 0.76);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
      }
      #lobbyView.digi-lobby-rot90 #modalTournament {
        padding: 8px 14px 8px max(66px, calc(var(--digi-safe-left, 58px) + 8px)) !important;
      }
      #lobbyView.digi-lobby-rot90 #modalTournament > div {
        height: 95% !important;
        max-height: 95% !important;
      }
      #modalTournament .dg-tour-scroll,
      #modalTournament .overflow-y-auto,
      #modalTournament .dg-tour-bracket-scroll {
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
        padding: 7px 11px;
        border-radius: 10px;
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
        border-block-end: 2.5px solid #fbbf24;
      }
      .dg-tour-tab:focus-visible,
      #modalTournament button:focus-visible,
      #modalTournament input:focus-visible {
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

  function ensureLobbyCardDOM() {
    ensureTournamentStyles();
    let card = document.getElementById('lobbyTournamentCard');
    if (card) return card;
    const stage = document.getElementById('lobbyStage');
    if (!stage) return null;

    card = document.createElement('button');
    card.type = 'button';
    card.id = 'lobbyTournamentCard';
    card.className = 'dg-tour-lobby-card rounded-xl px-2.5 py-1.5 flex flex-col justify-between text-left cursor-pointer overflow-hidden';
    card.setAttribute('aria-label', 'Yakshanba turniri markazini ochish');
    card.innerHTML = `
      <div class="w-full flex items-center justify-between gap-1.5 min-w-0">
        <span class="text-[9px] font-black uppercase tracking-wider text-amber-300 truncate">🏆 YAKSHANBA TURNIRI</span>
        <span class="text-[8px] font-mono font-bold px-1.5 py-[1px] rounded-full bg-white/10 border border-white/20 text-slate-100 shrink-0">--</span>
      </div>
      <div class="w-full flex items-center justify-between gap-1.5 min-w-0">
        <span class="text-[11px] font-black text-white truncate">500,000 SO'M</span>
        <span class="text-[8.5px] font-bold text-amber-200 shrink-0">MA'LUMOT ›</span>
      </div>
    `;
    card.addEventListener('click', () => {
      _lastInvoker = card;
      openTournamentModal();
    });
    stage.appendChild(card);
    return card;
  }

  function renderLobbyCard() {
    const card = ensureLobbyCardDOM();
    if (!card) return;
    const active = _state && _state.active;
    const me = (_state && _state.me) || {};
    const history = (_state && Array.isArray(_state.history)) ? _state.history : [];

    card.classList.remove('dg-tour-checkin-pulse');

    if (active && active.status === 'registration') {
      const cnt = Number(active.participantsCount) || 0;
      const max = Number(active.maxPlayers) || 32;
      const prizeStr = formatMoney(active.totalPrize || 500000) + " SO'M";
      const cd = formatCountdown(active.startAt);
      card.innerHTML = `
        <div class="w-full flex items-center justify-between gap-1.5 min-w-0">
          <span class="text-[8.5px] font-black uppercase tracking-wider text-amber-300 truncate">🏆 YAKSHANBA TURNIRI</span>
          <span class="text-[8px] font-mono font-extrabold px-1.5 py-[1px] rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 shrink-0">${cnt}/${max}</span>
        </div>
        <div class="w-full flex items-center justify-between gap-1.5 min-w-0 mt-0.5">
          <span class="text-[11px] font-black text-amber-200 truncate">${esc(prizeStr)}</span>
          <div class="flex items-center gap-1.5 shrink-0">
            <span id="dgTourCardTimer" class="text-[8.5px] font-mono font-bold text-sky-200">⏳ ${esc(cd)}</span>
            <span class="text-[8.5px] font-black text-amber-300">${me.isRegistered ? 'RO\'YXATDA ›' : 'QATNASHISH ›'}</span>
          </div>
        </div>
      `;
      return;
    }

    if (active && active.status === 'checkin') {
      card.classList.add('dg-tour-checkin-pulse');
      const cd = formatCountdown(active.startAt);
      const ctaText = me.isCheckedIn ? '✅ TAYYORSIZ' : '✅ TAYYORMAN ›';
      const ctaCls = me.isCheckedIn ? 'text-emerald-200' : 'text-emerald-300';
      card.innerHTML = `
        <div class="w-full flex items-center justify-between gap-1.5 min-w-0">
          <span class="text-[9px] font-black uppercase tracking-wider text-emerald-300 truncate">🟢 CHECK-IN OCHILDI!</span>
          <span id="dgTourCardTimer" class="text-[9px] font-mono font-black text-emerald-100 bg-emerald-500/25 border border-emerald-400/55 px-1.5 py-[1px] rounded-full shrink-0">⏳ ${esc(cd)}</span>
        </div>
        <div class="w-full flex items-center justify-between gap-1.5 min-w-0 mt-0.5">
          <span class="text-[10px] font-extrabold text-white truncate">${esc(formatMoney(active.totalPrize || 500000))} SO'M</span>
          <span class="text-[8.5px] font-black ${ctaCls} shrink-0">${ctaText}</span>
        </div>
      `;
      return;
    }

    if (active && active.status === 'live') {
      const myMatch = me.myMatch;
      const myReady = myMatch && (myMatch.status === 'ready' || myMatch.status === 'playing');
      card.innerHTML = `
        <div class="w-full flex items-center justify-between gap-1.5 min-w-0">
          <span class="text-[8.5px] font-black uppercase tracking-wider text-rose-200 truncate flex items-center gap-1">
            <span class="inline-block w-2 h-2 rounded-full bg-rose-500 dg-tour-live-dot shrink-0"></span>
            LIVE • 1v1 PLAY-OFF
          </span>
          <span class="text-[7.5px] font-mono font-bold text-amber-200 bg-rose-500/25 border border-rose-400/50 px-1.5 py-[1px] rounded-full shrink-0">${active.checkedInCount || active.participantsCount || 0} jangchi</span>
        </div>
        <div class="w-full flex items-center justify-between gap-1.5 min-w-0 mt-0.5">
          <span class="text-[9.5px] font-extrabold ${myReady ? 'text-amber-300' : 'text-white'} truncate">${myReady ? '⚔️ JANGINGIZ TAYYOR!' : '🔥 1v1 PLAY-OFF KETMOQDA'}</span>
          <span class="text-[8.5px] font-black text-amber-300 shrink-0">${myReady ? 'JANG ›' : 'SETKANI KO\'RISH ›'}</span>
        </div>
      `;
      return;
    }

    const latestChamp = (active && active.status === 'finished' && active.winners && active.winners.first)
      ? active.winners.first
      : (history[0] && history[0].winners && history[0].winners.first);

    card.innerHTML = `
      <div class="w-full flex items-center justify-between gap-1.5 min-w-0">
        <span class="text-[8.5px] font-black uppercase tracking-wider text-amber-300 truncate">🏆 YAKSHANBA 20:00 TURNIRI</span>
        <span class="text-[7.5px] font-bold px-1.5 py-[1px] rounded-full bg-white/10 border border-white/20 text-slate-200 shrink-0">1v1 Cup</span>
      </div>
      <div class="w-full flex items-center justify-between gap-1.5 min-w-0 mt-0.5">
        <span class="text-[10px] font-bold text-slate-100 truncate">${latestChamp ? '🥇 ' + esc(latestChamp.name) : "500,000 SO'M + 850 💎"}</span>
        <span class="text-[8.5px] font-black text-amber-200 shrink-0">MA'LUMOT ›</span>
      </div>
    `;
  }

  function ensureModalDOM() {
    ensureTournamentStyles();
    let modal = document.getElementById('modalTournament');
    if (modal) return modal;

    const shopEl = document.getElementById('modalShop');
    const host = document.getElementById('lobbyView') || (shopEl && shopEl.parentElement) || document.body;

    modal = document.createElement('div');
    modal.id = 'modalTournament';
    modal.className = 'hidden fixed inset-0 z-[66] flex items-center justify-center p-2.5';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'dgTourModalTitle');

    modal.innerHTML = `
      <div id="dgTourSheet" class="ios-fh-sheet w-[95%] max-w-[680px] max-h-[92%] flex flex-col overflow-hidden">
        <div class="ios-fh-nav shrink-0 h-[44px] px-3.5 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-7 h-7 rounded-full ios-fh-avatar ios-fh-avatar-gold bg-slate-900/90 flex items-center justify-center text-amber-300 text-xs shrink-0">🏆</span>
            <h2 id="dgTourModalTitle" class="text-[13.5px] font-extrabold tracking-tight bg-gradient-to-b from-white via-amber-100 to-amber-300 bg-clip-text text-transparent truncate">DIGI DIGI GRAND CUP</h2>
            <span id="dgTourStatusPill" class="ios-fh-stat-pill text-amber-200 text-[9.5px] font-semibold px-2 py-0.5 rounded-full truncate">Yuklanmoqda...</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button id="btnTourRefresh" type="button" class="ios-btn-circle" title="Yangilash" aria-label="Turnir holatini yangilash">
              <span class="text-xs leading-none">🔄</span>
            </button>
            <button id="btnCloseTournamentModal" type="button" class="ios-btn-circle" title="Yopish" aria-label="Yopish">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div class="shrink-0 px-3 pt-2 pb-1.5 border-b border-white/10 bg-slate-950/35">
          <div id="dgTourTablist" class="dg-tour-tablist" role="tablist" aria-label="Turnir bo'limlari">
            <button type="button" role="tab" id="dgTabBtnMain" data-tab="main" aria-selected="true" class="dg-tour-tab">📋 Asosiy</button>
            <button type="button" role="tab" id="dgTabBtnBracket" data-tab="bracket" aria-selected="false" class="dg-tour-tab">🏆 Setka</button>
            <button type="button" role="tab" id="dgTabBtnRules" data-tab="rules" aria-selected="false" class="dg-tour-tab">📜 Qoidalar &amp; Sovrin</button>
            <button type="button" role="tab" id="dgTabBtnHistory" data-tab="history" aria-selected="false" class="dg-tour-tab">🏛️ Chempionlar</button>
          </div>
        </div>

        <div id="dgTourBody" class="flex-1 min-h-0 overflow-y-auto dg-tour-scroll p-3"></div>
      </div>
    `;

    host.appendChild(modal);

    // Light dismiss: faqat sheet tashqarisida boshlanib tashqarisida tugagan bosishda yopiladi
    let pressedOutside = false;
    const isOutsideSheet = (e) => {
      const sheet = document.getElementById('dgTourSheet');
      if (!sheet) return false;
      const r = sheet.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    modal.addEventListener('pointerdown', (e) => {
      pressedOutside = isOutsideSheet(e);
    });
    modal.addEventListener('pointerup', (e) => {
      if (pressedOutside && isOutsideSheet(e)) closeTournamentModal();
      pressedOutside = false;
    });

    document.getElementById('btnCloseTournamentModal').addEventListener('click', closeTournamentModal);
    document.getElementById('btnTourRefresh').addEventListener('click', async () => {
      await fetchTourState(true);
      showTourToast("Turnir ma'lumoti yangilandi", '🔄');
    });

    const tablist = document.getElementById('dgTourTablist');
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalOpen()) {
        e.preventDefault();
        closeTournamentModal();
      }
    });

    return modal;
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
      if (m && (m.status === 'ready' || m.status === 'playing')) {
        const opp = (m.p1 && m.p1.playerId === identity.playerId) ? m.p2 : m.p1;
        actionBlockHtml = `
          <div class="rounded-xl p-3 bg-gradient-to-r from-rose-950/80 via-amber-950/65 to-slate-900/85 border border-amber-400/70 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10.5px] font-black text-amber-300 uppercase">⚔️ ${esc(m.roundName || '1v1 JANG')} (${esc(m.id)})</span>
              <span class="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/50 text-rose-200">${m.status === 'playing' ? '● JANGDA' : 'TAYYOR'}</span>
            </div>
            <div class="text-[12px] font-extrabold text-white">🆚 Raqib: <span class="text-amber-200">${esc((opp && opp.name) || 'Aniqlanmoqda...')}</span> <span class="text-[10px] text-slate-300 font-mono">(ELO ${Number((opp && opp.elo) || 1000)})</span></div>
            <button id="btnTourLaunchMatch" type="button" class="ios-btn-gold w-full py-2 px-4 text-[12px] cursor-pointer">⚔️ 1v1 JANGGA KIRISH</button>
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
      <div class="flex flex-col gap-2.5">
        <!-- 1) Afisha Banneri -->
        <div class="ios-fh-group p-3 bg-gradient-to-br from-amber-950/45 via-slate-900/80 to-rose-950/35 border border-amber-400/45">
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
          <div class="mt-2.5">
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
        <div class="grid grid-cols-3 gap-2">
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
        <div class="ios-fh-group p-2.5 flex flex-col gap-2 ${_subWarning ? 'border-rose-400/85 shadow-[0_0_16px_rgba(244,63,94,0.35)]' : ''}">
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
        <div class="ios-fh-group p-2.5 flex items-center justify-between gap-2">
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
      btnLaunch.addEventListener('click', () => {
        const active = _state && _state.active;
        const myMatch = _state && _state.me && _state.me.myMatch;
        if (typeof window.DIGI_TOUR_LAUNCH_MATCH === 'function') {
          window.DIGI_TOUR_LAUNCH_MATCH(myMatch, active);
        } else {
          selectTab('bracket');
        }
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
          renderLobbyCard();
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
    const modal = ensureModalDOM();
    _statusNotice = null;
    modal.classList.remove('hidden');
    renderModalContent(true);
    await fetchTourState(true);
  }

  function closeTournamentModal() {
    const modal = document.getElementById('modalTournament');
    if (modal) modal.classList.add('hidden');
    if (_lastInvoker && typeof _lastInvoker.focus === 'function') {
      try { _lastInvoker.focus(); } catch (_) {}
    }
    _lastInvoker = null;
  }

  function tickSecond() {
    if (document.hidden || isGameBusy() || !isLobbyVisible()) return;
    const active = _state && _state.active;

    if (active && (active.status === 'registration' || active.status === 'checkin')) {
      const cd = formatCountdown(active.startAt);
      const cardTimer = document.getElementById('dgTourCardTimer');
      if (cardTimer) cardTimer.textContent = '⏳ ' + cd;
      if (isModalOpen() && _activeTab === 'main') {
        const mainTimer = document.getElementById('dgTourMainTimer');
        if (mainTimer) mainTimer.textContent = cd;
      }
    }

    const pollIntervalMs = isModalOpen() ? 10000 : 45000;
    if ((Date.now() - _lastPollAt) >= pollIntervalMs) {
      fetchTourState(false);
    }
  }

  function bootTournamentUI() {
    ensureLobbyCardDOM();
    parseDeepLinksAndAutoOpen();
    if (!isGameBusy()) {
      fetchTourState(false);
    }
    setInterval(tickSecond, 1000);
  }

  window.DIGI_TOUR = {
    open: openTournamentModal,
    close: closeTournamentModal,
    refresh: fetchTourState,
    getState: () => _state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootTournamentUI);
  } else {
    bootTournamentUI();
  }
})();
