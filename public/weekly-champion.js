// DIGI DIGI — «👑 HAFTA CHEMPIONI» VITRINASI VA SUZUVCHI 3D iOS GLASS PROFILI (v20261124_11)
(function () {
  'use strict';

  const WC_IMG_VER = '20261124_10';
  let _cachedChampion = null;
  let _isFetching = false;
  const _sentFriendReqIds = {};

  const RARITY_MAP = {
    common: { name: 'Oddiy', border: 'border-slate-700/60', badge: 'bg-slate-800 text-slate-300' },
    uncommon: { name: 'Maxsus', border: 'border-emerald-500/50', badge: 'bg-emerald-950/85 text-emerald-300' },
    rare: { name: 'Nodir', border: 'border-sky-500/50', badge: 'bg-sky-950/80 text-sky-300' },
    epic: { name: 'Epik', border: 'border-purple-500/50', badge: 'bg-purple-950/80 text-purple-300' },
    legendary: { name: 'Afsonaviy', border: 'border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]', badge: 'bg-amber-950/80 text-amber-300' },
    mythic: { name: 'Mifik', border: 'border-rose-500/70 shadow-[0_0_16px_rgba(244,63,94,0.35)]', badge: 'bg-rose-950/80 text-rose-300' }
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getMyPlayerId() {
    const prof = window.DIGI_TG_PROFILE || {};
    const doomEl = document.getElementById('myDoomId');
    return String(prof.myId || (doomEl && doomEl.textContent) || '').trim().toUpperCase();
  }

  function formatResetRemaining(nextResetAt) {
    const diff = Math.max(0, Number(nextResetAt || 0) - Date.now());
    if (diff <= 60000) return 'Tez orada';
    const totalHours = Math.floor(diff / 3600000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days > 0) return `${days} kun ${hours} soat`;
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours} soat ${mins} daq` : `${mins} daqiqa`;
  }

  function formatGiftPriceTag(g) {
    if (!g) return '';
    if (g.currency === 'gems' || g.category === 'gems') {
      return `💎 ${Number(g.price || 0).toLocaleString('en-US')}`;
    }
    if (g.currency === 'bonus' || g.category === 'bonus') {
      return '🧰 Sandiq';
    }
    const p = Number(g.price || 0);
    if (p >= 1000) {
      const k = Math.round(p / 1000);
      return `$${k}K`;
    }
    return `$${p.toLocaleString('en-US')}`;
  }

  function formatShortWeaponName(raw) {
    const s = String(raw || 'M4A1-S AVTOMAT').trim();
    if (s.length <= 16) return s;
    return s.split(' ').slice(0, 2).join(' ').slice(0, 16);
  }

  function ensureWeeklyChampionStyles() {
    if (document.getElementById('digiWeeklyChampionStyles')) return;
    const style = document.createElement('style');
    style.id = 'digiWeeklyChampionStyles';
    style.textContent = `
      #btnNewsCard {
        border-color: rgba(251, 191, 36, 0.38) !important;
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.78), 0 0 18px rgba(245, 158, 11, 0.14), inset 0 1px 0 rgba(254, 240, 138, 0.22);
      }
      #modalWeeklyChampion {
        background:
          radial-gradient(circle at 20% 18%, rgba(251, 191, 36, 0.18), transparent 44%),
          radial-gradient(circle at 82% 84%, rgba(14, 165, 233, 0.20), transparent 46%),
          rgba(3, 7, 18, 0.76);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
      }
      #lobbyView.digi-lobby-rot90 #modalWeeklyChampion {
        padding: 8px 14px 8px max(66px, calc(var(--digi-safe-left, 58px) + 8px)) !important;
      }
      #lobbyView.digi-lobby-rot90 #modalWeeklyChampion > div {
        height: 94% !important;
        max-height: 94% !important;
      }
      #modalWeeklyChampion .overflow-y-auto {
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x pan-y;
        overscroll-behavior: contain;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureWeeklyChampionModalDOM() {
    ensureWeeklyChampionStyles();
    let modal = document.getElementById('modalWeeklyChampion');
    if (modal) return modal;

    const shopEl = document.getElementById('modalShop');
    const host = document.getElementById('lobbyView') || (shopEl && shopEl.parentElement) || document.body;

    modal = document.createElement('div');
    modal.id = 'modalWeeklyChampion';
    modal.className = 'hidden fixed inset-0 z-[65] flex items-center justify-center p-2.5';
    modal.innerHTML = `
      <div class="ios-fh-sheet w-full max-w-[740px] max-h-[92%] flex flex-col overflow-hidden">
        <div class="ios-fh-nav shrink-0 h-[44px] px-3.5 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-7 h-7 rounded-full ios-fh-avatar ios-fh-avatar-gold bg-slate-900/90 flex items-center justify-center text-amber-300 text-xs shrink-0">👑</span>
            <h2 class="text-[14px] font-bold tracking-tight bg-gradient-to-b from-white via-amber-100 to-amber-300 bg-clip-text text-transparent drop-shadow truncate">Hafta Chempioni</h2>
            <span id="wcModalResetPill" class="ios-fh-stat-pill text-amber-200 text-[9.5px] font-semibold px-2 py-0.5 rounded-full truncate">⏳ Keyingi g'olib: --</span>
          </div>
          <button id="btnCloseWeeklyChampionModal" type="button" class="ios-btn-circle" title="Yopish" aria-label="Yopish">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="grid grid-cols-12 gap-2.5 p-2.5 flex-1 min-h-0 overflow-hidden">
          <!-- CHAP USTUN: Chempion Profili, Harakat Tugmalari va 6 ta Statistika -->
          <div class="col-span-5 ios-fh-group p-2.5 flex flex-col justify-between gap-2 min-h-0 overflow-y-auto">
            <div class="flex items-center gap-2.5 min-w-0">
              <div id="wcModalAvatarWrap" class="relative w-[52px] h-[52px] shrink-0">
                <div id="wcModalAvatarBox" class="w-full h-full rounded-full ios-fh-avatar ios-fh-avatar-gold bg-slate-900 flex items-center justify-center text-lg font-black text-amber-200 overflow-hidden">👑</div>
                <span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500/95 border border-amber-200 text-[10px] flex items-center justify-center shadow">👑</span>
              </div>
              <div class="min-w-0 flex-1 leading-tight">
                <div id="wcModalName" class="font-black text-white text-[13px] truncate">Yuklanmoqda...</div>
                <div id="wcModalUsername" class="text-[9.5px] text-sky-300 font-semibold truncate hidden"></div>
                <div class="flex items-center gap-1 flex-wrap mt-1">
                  <span id="wcModalLeaguePill" class="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200">👑 Liga</span>
                  <span id="wcModalLevelPill" class="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/40 text-sky-200">LV.1</span>
                  <span id="wcModalRankPill" class="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-slate-200">#1 Reytingda</span>
                </div>
              </div>
            </div>

            <div id="wcModalActionsRow" class="flex items-center gap-1.5 shrink-0"></div>

            <div id="wcModalStatsGrid" class="grid grid-cols-2 gap-1.5 shrink-0"></div>
          </div>

          <!-- O'NG USTUN: Sovg'alar Kolleksiyasi (Eng qimmatidan -> arzonigacha) -->
          <div class="col-span-7 ios-fh-group p-2.5 flex flex-col gap-2 min-h-0 overflow-hidden">
            <div class="shrink-0 flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
              <div class="min-w-0 leading-tight">
                <div class="text-[11px] font-black text-white truncate">💎 Sovg'alar Kolleksiyasi</div>
                <div class="text-[8.5px] text-slate-400 truncate">Eng qimmatidan → arzonigacha</div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span id="wcModalPrestigePill" class="ios-fh-stat-pill px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold text-amber-300">👑 0</span>
                <span id="wcModalGiftCountPill" class="ios-fh-stat-pill px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold text-sky-300 border-sky-400/40">🎁 0 ta</span>
              </div>
            </div>

            <div id="wcModalGiftsScroll" class="flex-1 min-h-0 overflow-y-auto pr-0.5">
              <div id="wcModalGiftsGrid" class="grid grid-cols-3 gap-2"></div>
              <div id="wcModalGiftsEmpty" class="hidden h-full min-h-[150px] flex flex-col items-center justify-center text-center gap-2 text-slate-400 p-3">
                <span class="text-3xl">🎁</span>
                <div class="text-[11px] font-bold text-slate-200">Hali sovg'alar yig'ilmagan</div>
                <p class="text-[9.5px] text-slate-400">Hafta Chempionini tabriklab birinchi 3D sovg'ani yuboring!</p>
                <button id="btnWcEmptySendGift" type="button" class="hidden ios-btn-gold px-3 py-1.5 text-[10px] font-extrabold cursor-pointer">🎁 Chempionga birinchi sovg'ani yuborish</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    host.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeWeeklyChampionModal();
    });
    const closeBtn = modal.querySelector('#btnCloseWeeklyChampionModal');
    if (closeBtn) closeBtn.addEventListener('click', closeWeeklyChampionModal);

    return modal;
  }

  function renderAvatarInto(boxEl, photoUrl, name, sizeCls) {
    if (!boxEl) return;
    const cleanUrl = String(photoUrl || '').trim();
    const initial = esc((String(name || 'C').replace(/^@/, '').charAt(0) || 'C').toUpperCase());
    if (cleanUrl) {
      boxEl.innerHTML = `<img src="${esc(cleanUrl)}" alt="${esc(name)}" class="${sizeCls || 'w-full h-full object-cover rounded-full'}" onerror="this.parentNode.textContent='${initial}'" />`;
    } else {
      boxEl.textContent = initial;
    }
  }

  function renderLobbyChampionCard(c) {
    ensureWeeklyChampionStyles();
    const card = document.getElementById('btnNewsCard');
    if (!card) return;

    const bodyEl = document.getElementById('wcCardBody');
    if (!c) {
      if (bodyEl) {
        bodyEl.innerHTML = `<div class="text-[9.5px] text-slate-300 font-semibold truncate w-full text-center">Chempion ma'lumoti yuklanmoqda...</div>`;
      }
      return;
    }

    const prestigeFormatted = Number(c.prestige || 0).toLocaleString('en-US');
    const giftCount = Number(c.giftTotalCount || 0);
    const initial = esc((String(c.name || 'C').replace(/^@/, '').charAt(0) || 'C').toUpperCase());
    const avatarHtml = c.photoUrl
      ? `<img src="${esc(c.photoUrl)}" alt="${esc(c.name)}" class="w-full h-full object-cover rounded-full" onerror="this.parentNode.textContent='${initial}'" />`
      : `<span>${initial}</span>`;

    const headerReset = document.getElementById('wcCardResetBadge');
    if (headerReset) {
      headerReset.textContent = '#1 • Dush gacha';
    }

    const htmlBody = `
      <div class="relative w-10 h-10 shrink-0">
        <div class="w-10 h-10 rounded-full border-2 border-amber-400/80 bg-slate-900 flex items-center justify-center text-sm font-black text-amber-200 overflow-hidden shadow-[0_0_10px_rgba(251,191,36,0.35)]">
          ${avatarHtml}
        </div>
        <span class="absolute -top-1 -right-1 text-[10px] leading-none drop-shadow">👑</span>
      </div>
      <div class="min-w-0 flex-1 leading-tight">
        <div class="text-[10.5px] font-black text-white truncate">${esc(c.name)}</div>
        <div class="text-[8.5px] font-semibold text-slate-300 truncate mt-0.5">LV.${c.level || 1} · 👑 ${prestigeFormatted} · 🎁 ${giftCount}</div>
      </div>
      <button id="btnWcCardGift" type="button" class="w-8 h-8 rounded-lg bg-gradient-to-b from-amber-400/25 to-amber-600/20 border border-amber-400/55 flex items-center justify-center text-sm shrink-0 hover:bg-amber-400/30 active:scale-95 transition cursor-pointer shadow" title="${c.isSelf ? 'Kolleksiyam' : 'Sovg\'a yuborish'}">🎁</button>
    `;

    if (bodyEl) {
      bodyEl.innerHTML = htmlBody;
    } else {
      card.innerHTML = `
        <div class="shrink-0 flex items-center justify-between w-full border-b border-amber-400/25 pb-1">
          <span class="text-[9px] font-black uppercase text-amber-300 tracking-wider flex items-center gap-1 truncate">👑 HAFTA CHEMPIONI</span>
          <span id="wcCardResetBadge" class="text-[8px] font-bold text-amber-200/90 bg-amber-500/15 border border-amber-400/35 px-1.5 py-0.5 rounded-full shrink-0">#1 • Dush gacha</span>
        </div>
        <div id="wcCardBody" class="flex items-center gap-2 flex-1 min-h-0 pt-1">
          ${htmlBody}
        </div>
      `;
    }

    const giftBtn = document.getElementById('btnWcCardGift');
    if (giftBtn) {
      giftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (c.isSelf) {
          if (typeof window.openPlayerCollectionModal === 'function') {
            window.openPlayerCollectionModal(c.id);
          }
        } else {
          if (typeof window.openDigiGiftShopModal === 'function') {
            window.openDigiGiftShopModal({ id: c.id, name: c.name });
          }
        }
      });
    }
  }

  function renderWeeklyChampionModal(c) {
    const modal = ensureWeeklyChampionModalDOM();
    if (!c) return;

    const resetPill = modal.querySelector('#wcModalResetPill');
    if (resetPill) resetPill.textContent = `⏳ Keyingi g'olib: ${formatResetRemaining(c.nextResetAt)}`;

    const avatarBox = modal.querySelector('#wcModalAvatarBox');
    renderAvatarInto(avatarBox, c.photoUrl, c.name);

    const nameEl = modal.querySelector('#wcModalName');
    if (nameEl) nameEl.textContent = c.name || c.id;

    const userEl = modal.querySelector('#wcModalUsername');
    if (userEl) {
      if (c.username) {
        userEl.textContent = '@' + String(c.username).replace(/^@+/, '');
        userEl.classList.remove('hidden');
      } else {
        userEl.classList.add('hidden');
      }
    }

    const leaguePill = modal.querySelector('#wcModalLeaguePill');
    if (leaguePill && c.league) {
      leaguePill.textContent = `${c.league.icon || '🏆'} ${c.league.name || ''}`.trim();
    }

    const lvlPill = modal.querySelector('#wcModalLevelPill');
    if (lvlPill) lvlPill.textContent = `LV. ${c.level || 1}`;

    const rankPill = modal.querySelector('#wcModalRankPill');
    if (rankPill) rankPill.textContent = `#${c.globalRank || 1} Reytingda`;

    // Harakat tugmalari
    const actionsRow = modal.querySelector('#wcModalActionsRow');
    if (actionsRow) {
      actionsRow.innerHTML = '';
      if (!c.isSelf) {
        const btnSocial = document.createElement('button');
        btnSocial.type = 'button';
        if (c.isFriend) {
          btnSocial.className = 'ios-btn-blue flex-1 py-1.5 px-2.5 text-[10.5px] cursor-pointer';
          btnSocial.textContent = '💬 Xabar';
          btnSocial.addEventListener('click', () => {
            closeWeeklyChampionModal();
            if (typeof window.openFriendTelegramChat === 'function') {
              window.openFriendTelegramChat(c.username, c.tgId, c.name, c.id);
            }
          });
        } else if (c.hasPendingReq || _sentFriendReqIds[c.id]) {
          btnSocial.className = 'ios-btn-gray flex-1 py-1.5 px-2.5 text-[10.5px] opacity-85 cursor-default';
          btnSocial.textContent = '✓ Yuborildi';
          btnSocial.disabled = true;
        } else {
          btnSocial.className = 'ios-btn-blue flex-1 py-1.5 px-2.5 text-[10.5px] cursor-pointer';
          btnSocial.textContent = '🤝 Do\'stlashish';
          btnSocial.addEventListener('click', async () => {
            btnSocial.disabled = true;
            btnSocial.textContent = '✓ Yuborildi';
            btnSocial.className = 'ios-btn-gray flex-1 py-1.5 px-2.5 text-[10.5px] opacity-85 cursor-default';
            _sentFriendReqIds[c.id] = true;
            if (typeof window.digiSendQuickFriendReq === 'function') {
              await window.digiSendQuickFriendReq(c.id, c.name);
            }
          });
        }

        const btnGift = document.createElement('button');
        btnGift.type = 'button';
        btnGift.className = 'ios-btn-gold flex-1 py-1.5 px-2.5 text-[10.5px] cursor-pointer';
        btnGift.textContent = '🎁 Sovg\'a';
        btnGift.addEventListener('click', () => {
          closeWeeklyChampionModal();
          if (typeof window.openDigiGiftShopModal === 'function') {
            window.openDigiGiftShopModal({ id: c.id, name: c.name });
          }
        });

        actionsRow.appendChild(btnSocial);
        actionsRow.appendChild(btnGift);
      } else {
        actionsRow.innerHTML = `
          <div class="flex-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[9.5px] font-bold text-center truncate">🏆 Siz bu haftaning eng zo'risiz!</div>
          <button id="btnWcSelfCollec" type="button" class="ios-btn-gold px-2.5 py-1.5 text-[10px] shrink-0 cursor-pointer">🎁 Kolleksiyam</button>
        `;
        const selfBtn = actionsRow.querySelector('#btnWcSelfCollec');
        if (selfBtn) {
          selfBtn.addEventListener('click', () => {
            closeWeeklyChampionModal();
            if (typeof window.openPlayerCollectionModal === 'function') {
              window.openPlayerCollectionModal(c.id);
            }
          });
        }
      }
    }

    // 6 ta ixcham reyting va jang statistikasi kartasi
    const statsGrid = modal.querySelector('#wcModalStatsGrid');
    if (statsGrid) {
      const wsPower = Number((c.weekStats && c.weekStats.power) || 0).toLocaleString('en-US');
      const cards = [
        { lbl: '🏆 Reyting', val: `${Number(c.elo || 1000).toLocaleString('en-US')} ELO`, cls: 'text-amber-300' },
        { lbl: '⚔️ Janglar', val: `${Number(c.totalMatches || 0).toLocaleString('en-US')} ta`, cls: 'text-sky-300' },
        { lbl: '💀 Fraglar', val: `${Number(c.kills || 0).toLocaleString('en-US')} ta`, cls: 'text-rose-300' },
        { lbl: '🎯 Headshot', val: `${c.hsRate || 0}% (${c.headshots || 0})`, cls: 'text-emerald-300' },
        { lbl: '🔫 Asosiy qurol', val: formatShortWeaponName(c.favoriteWeapon), cls: 'text-cyan-200' },
        { lbl: '🔥 Hafta balli', val: `+${wsPower}`, cls: 'text-amber-200' }
      ];
      statsGrid.innerHTML = cards.map(item => `
        <div class="rounded-xl bg-slate-950/75 border border-white/10 px-2 py-1.5 min-w-0">
          <div class="text-[8.5px] text-slate-400 font-semibold truncate">${esc(item.lbl)}</div>
          <div class="text-[10.5px] font-black font-mono ${item.cls} truncate mt-0.5">${esc(item.val)}</div>
        </div>
      `).join('');
    }

    // O'ng ustun: Sovg'alar kolleksiyasi (eng qimmatidan -> arzonigacha)
    const presPill = modal.querySelector('#wcModalPrestigePill');
    if (presPill) presPill.textContent = `👑 ${Number(c.prestige || 0).toLocaleString('en-US')}`;

    const cntPill = modal.querySelector('#wcModalGiftCountPill');
    if (cntPill) cntPill.textContent = `🎁 ${Number(c.giftTotalCount || 0)} ta`;

    const grid = modal.querySelector('#wcModalGiftsGrid');
    const emptyBox = modal.querySelector('#wcModalGiftsEmpty');
    const emptySendBtn = modal.querySelector('#btnWcEmptySendGift');
    const gifts = Array.isArray(c.giftsSorted) ? c.giftsSorted : [];

    if (grid && emptyBox) {
      grid.innerHTML = '';
      if (gifts.length === 0) {
        emptyBox.classList.remove('hidden');
        if (emptySendBtn) {
          if (!c.isSelf) {
            emptySendBtn.classList.remove('hidden');
            emptySendBtn.onclick = () => {
              closeWeeklyChampionModal();
              if (typeof window.openDigiGiftShopModal === 'function') {
                window.openDigiGiftShopModal({ id: c.id, name: c.name });
              }
            };
          } else {
            emptySendBtn.classList.add('hidden');
          }
        }
      } else {
        emptyBox.classList.add('hidden');
        gifts.forEach(g => {
          const rarity = RARITY_MAP[g.rarity] || RARITY_MAP.common;
          const imgUrl = `/img/gifts/${encodeURIComponent(g.giftId)}.webp?v=${WC_IMG_VER}`;
          const glow = g.glow || '#fbbf24';
          const countBadge = (g.count > 1)
            ? `<span class="absolute top-1.5 right-1.5 z-20 px-1.5 py-0.2 rounded-full bg-amber-500/95 text-slate-950 font-mono font-black text-[8.5px] shadow">x${g.count}</span>`
            : '';

          const card = document.createElement('div');
          card.className = `relative rounded-xl p-2 flex flex-col justify-between gap-1 select-none bg-gradient-to-b from-slate-900/90 to-slate-950 border ${rarity.border} ${!c.isSelf ? 'cursor-pointer hover:brightness-110 active:scale-[0.98] transition' : ''}`;
          card.innerHTML = `
            ${countBadge}
            <div class="flex items-center justify-between gap-1 min-w-0 pr-5">
              <span class="text-[9.5px] font-bold text-white truncate" title="${esc(g.name)}">${esc(g.name)}</span>
            </div>
            <div class="h-[64px] w-full flex items-center justify-center relative overflow-hidden rounded-lg bg-[#050914]">
              <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(circle at 50% 50%, ${esc(glow)}33 0%, transparent 74%);"></div>
              <img src="${imgUrl}" alt="${esc(g.name)}" class="max-h-[60px] max-w-[60px] scale-[1.08] object-contain relative z-10" style="-webkit-mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%); mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
              <span class="hidden items-center justify-center text-3xl relative z-10">${esc(g.icon || '🎁')}</span>
            </div>
            <div class="flex items-center justify-between gap-1 pt-0.5 border-t border-white/5 text-[8.5px]">
              <span class="text-slate-300 font-bold truncate">${esc(formatGiftPriceTag(g))}</span>
              <span class="text-amber-300 font-mono font-bold shrink-0">👑 +${Number(g.prestige || 0).toLocaleString('en-US')}</span>
            </div>
          `;
          if (!c.isSelf) {
            card.addEventListener('click', () => {
              closeWeeklyChampionModal();
              if (typeof window.openGiftDetailModal === 'function') {
                window.openGiftDetailModal(g.giftId, { id: c.id, name: c.name });
              }
            });
          }
          grid.appendChild(card);
        });
      }
    }
  }

  async function refreshWeeklyChampionCard() {
    if (_isFetching) return _cachedChampion;
    _isFetching = true;
    try {
      const myId = getMyPlayerId();
      const qs = myId ? `?myId=${encodeURIComponent(myId)}&_t=${Date.now()}` : `?_t=${Date.now()}`;
      const res = await fetch('/api/tg/weekly-champion' + qs);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          _cachedChampion = data.champion || null;
          renderLobbyChampionCard(_cachedChampion);
          const modal = document.getElementById('modalWeeklyChampion');
          if (modal && !modal.classList.contains('hidden') && _cachedChampion) {
            renderWeeklyChampionModal(_cachedChampion);
          }
        }
      }
    } catch (_) {}
    finally {
      _isFetching = false;
    }
    return _cachedChampion;
  }

  async function openWeeklyChampionModal() {
    const modal = ensureWeeklyChampionModalDOM();
    if (_cachedChampion) {
      renderWeeklyChampionModal(_cachedChampion);
    }
    modal.classList.remove('hidden');
    await refreshWeeklyChampionCard();
  }

  function closeWeeklyChampionModal() {
    const modal = document.getElementById('modalWeeklyChampion');
    if (modal) modal.classList.add('hidden');
  }

  window.refreshWeeklyChampionCard = refreshWeeklyChampionCard;
  window.openWeeklyChampionModal = openWeeklyChampionModal;
  window.closeWeeklyChampionModal = closeWeeklyChampionModal;

  function bootWeeklyChampion() {
    ensureWeeklyChampionStyles();
    refreshWeeklyChampionCard();
    setTimeout(refreshWeeklyChampionCard, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWeeklyChampion);
  } else {
    bootWeeklyChampion();
  }
})();
