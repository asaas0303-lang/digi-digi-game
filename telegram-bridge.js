/**
 * DIGI DIGI — Telegram Mini App, Server Data Sync, Mutual Profile & 7-Day Block Bridge
 * Domain: https://digi-digi.livops.app/
 */
(function () {
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun = 604,800,000 ms
  const LOCAL_STORAGE_KEY = 'digi_digi_tg_bridge_v1';

  let tgState = {
    myId: 'DOOM-4886',
    myTgId: null,
    myName: 'Sardor_UZ',
    myUsername: '',
    myPhoto: '',
    elo: 1000,
    coins: 12500,
    blockedUsers: {}, // { [playerId]: blockedUntilTimestampMs }
    friends: []
  };

  let currentPendingSender = null;
  let currentPreviewProfile = null;

  // 1. Lokal xotiradan o'qish
  function loadLocalBridgeState() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(tgState, parsed);
      }
    } catch (e) {}
  }

  function saveLocalBridgeState() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tgState));
    } catch (e) {}
  }

  // 2. O'yin ichidagi DOM elementlardan joriy balans va ELO ni o'qish va yozish
  function syncFromGameDOM() {
    const nameInp = document.getElementById('myNameInput');
    const idEl = document.getElementById('myDoomId');
    const coinsEl = document.getElementById('userCoinsLabel');
    const rankEl = document.getElementById('menuRankBadge');

    if (nameInp && nameInp.value) tgState.myName = nameInp.value.trim();
    if (idEl && idEl.textContent) tgState.myId = idEl.textContent.trim();
    if (coinsEl && coinsEl.textContent) {
      const num = parseInt(coinsEl.textContent.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) tgState.coins = num;
    }
    if (rankEl && rankEl.textContent) {
      const eloNum = parseInt(rankEl.textContent.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(eloNum)) tgState.elo = eloNum;
    }
  }

  function applyToGameDOM() {
    const nameInp = document.getElementById('myNameInput');
    const idEl = document.getElementById('myDoomId');
    if (nameInp) {
      nameInp.value = tgState.myName;
      nameInp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (idEl) {
      idEl.textContent = tgState.myId;
    }
  }

  // 3. Server bazasi bilan sinxronizatsiya (/api/tg/sync)
  async function syncWithServer() {
    syncFromGameDOM();
    saveLocalBridgeState();
    try {
      const res = await fetch('/api/tg/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myProfile: {
            id: tgState.myId,
            tgId: tgState.myTgId,
            name: tgState.myName,
            username: tgState.myUsername,
            photoUrl: tgState.myPhoto
          },
          userStats: {
            coins: tgState.coins,
            elo: tgState.elo
          },
          blockedUsersMap: tgState.blockedUsers,
          savedFriends: tgState.friends,
          updatedAt: Date.now()
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.player) {
          if (data.player.blockedUsersMap) {
            tgState.blockedUsers = Object.assign({}, tgState.blockedUsers, data.player.blockedUsersMap);
          }
          if (Array.isArray(data.player.savedFriends)) {
            tgState.friends = data.player.savedFriends;
          }
          saveLocalBridgeState();
        }
      }
    } catch (e) {}
  }

  // 4. 1 haftalik blok tekshiruvi
  function getBlockRemaining(playerId) {
    const key = String(playerId || '').trim().toUpperCase();
    const until = tgState.blockedUsers[key];
    if (!until) return null;
    const now = Date.now();
    if (until <= now) {
      delete tgState.blockedUsers[key];
      saveLocalBridgeState();
      return null;
    }
    const remMs = until - now;
    const days = Math.ceil(remMs / (24 * 60 * 60 * 1000));
    const hours = Math.ceil(remMs / (60 * 60 * 1000));
    return { until, days, hours };
  }

  // 5. UI: O'zaro Profil Ko'rish Modali + 1 Haftalik Blok Tugmasini Yaratish
  function injectTelegramBridgeUI() {
    // a) #incomingModal ichiga "🚫 1 haftaga bloklash" tugmasini qo'shish (agar yo'q bo'lsa)
    const acceptBtn = document.getElementById('btnAcceptIncoming');
    const rejectBtn = document.getElementById('btnRejectIncoming');
    if (acceptBtn && rejectBtn && !document.getElementById('btnBlockIncoming1Week')) {
      const btnRow = acceptBtn.parentElement;
      const blockBtn = document.createElement('button');
      blockBtn.id = 'btnBlockIncoming1Week';
      blockBtn.className = 'flex-1 bg-red-900/85 hover:bg-red-700 active:scale-95 border border-red-500/60 text-red-200 font-extrabold text-[11px] py-2 px-2 rounded-xl transition';
      blockBtn.textContent = '🚫 1 haftaga blok';
      btnRow.appendChild(blockBtn);

      blockBtn.addEventListener('click', async () => {
        const modal = document.getElementById('incomingModal');
        if (modal) modal.classList.add('hidden');
        const badgeEl = document.getElementById('incomingBadge');
        const senderId = (currentPendingSender && currentPendingSender.id) || (badgeEl ? badgeEl.textContent.trim().toUpperCase() : '');
        if (!senderId) return;

        tgState.blockedUsers[senderId.toUpperCase()] = Date.now() + ONE_WEEK_MS;
        saveLocalBridgeState();

        try {
          await fetch('/api/tg/friend-respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              myId: tgState.myId,
              senderId: senderId.toUpperCase(),
              action: 'block_1_week'
            })
          });
        } catch (e) {}

        showBridgeToast(`🚫 ${senderId} 1 haftaga bloklandi! 7 kun davomida sizga so'rov yubora olmaydi.`);
      });
    }

    // b) O'zaro Profil Ko'rish va Do'st Taklif Havolasi Modali (#tgMutualProfileModal)
    if (!document.getElementById('tgMutualProfileModal')) {
      const modalWrap = document.createElement('div');
      modalWrap.id = 'tgMutualProfileModal';
      modalWrap.className = 'hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
      modalWrap.innerHTML = `
        <div class="bg-slate-950 border-2 border-amber-500/60 rounded-2xl max-w-md w-full overflow-hidden text-center shadow-2xl">
          <div class="bg-gradient-to-r from-amber-600/30 via-amber-500/20 to-slate-900 px-4 py-3 flex items-center justify-between border-b border-amber-500/40">
            <h2 class="text-xs sm:text-sm font-black italic uppercase text-amber-300">🤝 TELEGRAM PROFIL VA DO'STLASHISH</h2>
            <button id="btnCloseTgMutualModal" class="bg-slate-900 border border-slate-700 text-white text-xs font-bold px-3 py-1 rounded-xl">✕ Yopish</button>
          </div>
          <div class="p-4 space-y-3.5">
            <div class="grid grid-cols-2 gap-2.5">
              <div class="bg-slate-900/90 border border-emerald-500/50 rounded-xl p-3 flex flex-col items-center">
                <span class="text-[9px] font-extrabold uppercase text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full">Sizning Profilingiz</span>
                <div class="w-12 h-12 rounded-full bg-emerald-900/40 border-2 border-emerald-400 flex items-center justify-center text-2xl my-2">🛡️</div>
                <div id="tgBridgeMyName" class="font-black text-xs text-white truncate w-full">Sardor_UZ</div>
                <div id="tgBridgeMyId" class="font-mono text-[10px] text-amber-400">DOOM-4886</div>
                <div id="tgBridgeMyElo" class="text-[10px] font-bold text-slate-300 mt-1">🏆 1000 ELO</div>
              </div>
              <div class="bg-slate-900/90 border border-sky-400/60 rounded-xl p-3 flex flex-col items-center">
                <span class="text-[9px] font-extrabold uppercase text-sky-300 bg-sky-950 px-2 py-0.5 rounded-full">Taklif Egasi</span>
                <div class="w-12 h-12 rounded-full bg-sky-900/40 border-2 border-sky-400 flex items-center justify-center text-2xl my-2">🦅</div>
                <div id="tgBridgeOtherName" class="font-black text-xs text-white truncate w-full">@Friend</div>
                <div id="tgBridgeOtherId" class="font-mono text-[10px] text-amber-400">DOOM-0000</div>
                <div id="tgBridgeOtherElo" class="text-[10px] font-bold text-slate-300 mt-1">🏆 1100 ELO</div>
              </div>
            </div>
            <div id="tgBridgeMutualStatus" class="bg-zinc-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-200 font-semibold">
              Do'stlashish tugmasini bossangiz, ushbu o'yinchiga darhol bildirishnoma boradi!
            </div>
            <button id="btnSendMutualFriendReq" class="w-full bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 font-black italic text-sm py-3 px-5 rounded-xl shadow-xl transition active:scale-95">
              🤝 DO'STLASHISH SO'ROVINI YUBORISH
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modalWrap);

      document.getElementById('btnCloseTgMutualModal').addEventListener('click', () => {
        modalWrap.classList.add('hidden');
      });

      document.getElementById('btnSendMutualFriendReq').addEventListener('click', async () => {
        if (!currentPreviewProfile) return;
        const statusEl = document.getElementById('tgBridgeMutualStatus');
        const btn = document.getElementById('btnSendMutualFriendReq');
        btn.disabled = true;
        btn.textContent = '⏳ Yuborilmoqda...';

        try {
          const res = await fetch('/api/tg/friend-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromId: tgState.myId,
              fromName: tgState.myName,
              fromElo: tgState.elo,
              toId: currentPreviewProfile.id
            })
          });
          const data = await res.json();
          if (data && data.error === 'BLOCKED_1_WEEK') {
            statusEl.textContent = `🚫 ${currentPreviewProfile.name} sizni 1 haftaga bloklagan (${data.remDays || 7} kun qoldi). Qayta yuborib bo'lmaydi!`;
            statusEl.className = 'bg-red-950 border border-red-500 rounded-xl px-3 py-2 text-xs text-red-200 font-bold';
            btn.textContent = '🚫 1 HAFTAGA BLOKLANGAN';
            return;
          }
          modalWrap.classList.add('hidden');
          showBridgeToast(`✅ ${currentPreviewProfile.name} ga do'stlashish so'rovi yuborildi!`);
        } catch (e) {
          modalWrap.classList.add('hidden');
          showBridgeToast(`✅ ${currentPreviewProfile.name} ga do'stlashish so'rovi yuborildi!`);
        } finally {
          btn.disabled = false;
        }
      });
    }

    // c) Online oynasidagi Do'stlar bo'limiga "✈️ Telegram Taklif Havolasini Ulashish" tugmasini qo'shish
    const friendInput = document.getElementById('friendIdInput');
    if (friendInput && !document.getElementById('btnShareTgLinkBridge') && !document.getElementById('btnShareTelegramInvite')) {
      const parentBox = friendInput.closest('div')?.parentElement;
      if (parentBox) {
        const shareBar = document.createElement('div');
        shareBar.className = 'grid grid-cols-2 gap-1.5 mt-2';
        shareBar.innerHTML = `
          <button id="btnShareTgLinkBridge" class="bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-extrabold text-[11px] py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow transition">
            <span>✈️</span> <span>Telegramda ulashish</span>
          </button>
          <button id="btnCopyTgLinkBridge" class="bg-slate-800 hover:bg-slate-700 active:scale-95 border border-amber-500/40 text-amber-300 font-bold text-[11px] py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition">
            <span>🔗</span> <span>Havolani nusxalash</span>
          </button>
        `;
        parentBox.appendChild(shareBar);

        document.getElementById('btnShareTgLinkBridge').addEventListener('click', shareMyInviteLinkOnTelegram);
        document.getElementById('btnCopyTgLinkBridge').addEventListener('click', copyMyInviteLink);
      }
    }
  }

  function buildMyInviteLink() {
    syncFromGameDOM();
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('friend_ref', tgState.myId);
    params.set('friend_name', tgState.myName);
    params.set('friend_elo', String(tgState.elo));
    return `${base}?${params.toString()}`;
  }

  function shareMyInviteLinkOnTelegram() {
    const link = buildMyInviteLink();
    const text = `🔥 DIGI DIGI 3D CS o'yinida men bilan do'stlashing! Mening profilim: ${tgState.myName} (${tgState.myId})`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openTelegramLink === 'function') {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  }

  function copyMyInviteLink() {
    const link = buildMyInviteLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
    showBridgeToast('🔗 Do\'st taklif qilish havolasi nusxalandi! Do\'stingizga yuboring.');
  }

  function showBridgeToast(msg) {
    const toastBox = document.getElementById('toastBox');
    const toastMsg = document.getElementById('toastMsg');
    if (toastBox && toastMsg) {
      toastMsg.textContent = msg;
      toastBox.classList.remove('hidden');
      setTimeout(() => toastBox.classList.add('hidden'), 3200);
    }
  }

  function showMutualProfileCard(friendData) {
    syncFromGameDOM();
    currentPreviewProfile = friendData;
    document.getElementById('tgBridgeMyName').textContent = tgState.myName;
    document.getElementById('tgBridgeMyId').textContent = tgState.myId;
    document.getElementById('tgBridgeMyElo').textContent = `🏆 ${tgState.elo} ELO`;

    document.getElementById('tgBridgeOtherName').textContent = friendData.name;
    document.getElementById('tgBridgeOtherId').textContent = friendData.id;
    document.getElementById('tgBridgeOtherElo').textContent = `🏆 ${friendData.elo || 1100} ELO`;

    const modal = document.getElementById('tgMutualProfileModal');
    if (modal) modal.classList.remove('hidden');
  }

  // 6. Bildirishnomalarni har 4 soniyada tekshirish (Real-time Do'stlashish so'rovlari)
  function startNotificationsPolling() {
    setInterval(async () => {
      try {
        const res = await fetch(`/api/tg/notifications?myId=${encodeURIComponent(tgState.myId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.requests) && data.requests.length > 0) {
          const req = data.requests[0];
          if (getBlockRemaining(req.fromId)) return; // 1 haftalik blokda bo'lsa ko'rsatmaymiz

          currentPendingSender = { id: req.fromId, name: req.fromName, elo: req.fromElo || 1050 };
          const modal = document.getElementById('incomingModal');
          const title = document.getElementById('incomingTitle');
          const badge = document.getElementById('incomingBadge');
          const text = document.getElementById('incomingText');
          const icon = document.getElementById('incomingIcon');
          if (modal && title && badge && text) {
            if (icon) icon.textContent = '🤝';
            title.textContent = 'Yangi Do\'stlashish Taklifi';
            badge.textContent = req.fromId;
            text.textContent = `${req.fromName} (${req.fromId}) siz bilan do'stlashmoqchi!`;
            modal.classList.remove('hidden');
          }
        }
      } catch (e) {}
    }, 4000);
  }

  // 7. Ishga tushirish (Telegram WebApp Init)
  window.addEventListener('DOMContentLoaded', async () => {
    loadLocalBridgeState();
    injectTelegramBridgeUI();

    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (e) {}
      const u = tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
      if (u) {
        tgState.myTgId = String(u.id);
        tgState.myUsername = u.username || '';
        tgState.myName = u.username ? `@${u.username}` : (u.first_name || 'TG_Player');
        tgState.myId = 'DOOM-' + String(u.id).slice(-4).padStart(4, '0');
        tgState.myPhoto = u.photo_url || '';
      }
    }

    applyToGameDOM();
    await syncWithServer();

    // Havola orqali kirganlikni tekshirish (?friend_ref=... yoki Telegram start_param)
    const params = new URLSearchParams(window.location.search);
    const startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ? tg.initDataUnsafe.start_param : '';
    let refId = params.get('friend_ref') || '';
    let refName = params.get('friend_name') || '';
    let refElo = parseInt(params.get('friend_elo') || '1100', 10);

    if (!refId && startParam.startsWith('friend_')) {
      refId = startParam.replace('friend_', '');
    }

    if (refId && refId.toUpperCase() !== tgState.myId.toUpperCase()) {
      try {
        const r = await fetch(`/api/tg/profile/${encodeURIComponent(refId)}`);
        const prof = r.ok ? await r.json() : null;
        showMutualProfileCard(prof && prof.id ? prof : {
          id: refId.toUpperCase(),
          name: refName || (`@Player_${refId.slice(-4)}`),
          elo: refElo
        });
      } catch (e) {
        showMutualProfileCard({
          id: refId.toUpperCase(),
          name: refName || (`@Player_${refId.slice(-4)}`),
          elo: refElo
        });
      }
    }

    startNotificationsPolling();
    // Har 15 soniyada o'yinchi ma'lumotlarini serverga saqlab borish
    setInterval(syncWithServer, 15000);
  });
})();
