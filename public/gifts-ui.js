// ==============================================================================
// DIGI DIGI — ULTRA 3D SOVG'ALAR DO'KONI VA KRISTAL OYNASI (GIFTS-UI.JS)
// 3-BOSQICH: O'yinchi Kolleksiyasi, Hadya Qilish (Transfer), Rasmiy Kristal Do'koni
// ==============================================================================
(function () {
  'use strict';

  // 1. STATIK KONSTANTALAR VA VERSİYALASH
  const GIFT_IMG_VER = '20261124_3';
  const GIFT_IMG_EXT = 'webp';

  function getGiftImageUrl(giftId) {
    return '/img/gifts/' + encodeURIComponent(giftId) + '.' + GIFT_IMG_EXT + '?v=' + GIFT_IMG_VER;
  }
  window.getDigiGiftThumb = getGiftImageUrl;

  // Rasmiy 5 ta Kristal Paketi (1 💎 = 1,000 so'm, 0% soxta bonus!)
  function getGemsPackages() {
    if (window.DIGI_GEMS_CONFIG && Array.isArray(window.DIGI_GEMS_CONFIG.packages) && window.DIGI_GEMS_CONFIG.packages.length > 0) {
      return window.DIGI_GEMS_CONFIG.packages.map(p => ({
        id: 'gems_' + p.gems,
        gems: p.gems,
        uzs: p.uzs || p.gems * 1000,
        badge: p.badge || '',
        title: p.label || (p.gems + ' Kristal')
      }));
    }
    return [
      { id: 'gems_15', gems: 15, uzs: 15000, badge: '', title: 'Start Paket' },
      { id: 'gems_35', gems: 35, uzs: 35000, badge: '🔥 OMMABOP', title: 'Mashhur' },
      { id: 'gems_75', gems: 75, uzs: 75000, badge: '👑 VIP', title: 'VIP Paket' },
      { id: 'gems_150', gems: 150, uzs: 150000, badge: '⚡ ELITA', title: 'Elita Paket' },
      { id: 'gems_300', gems: 300, uzs: 300000, badge: '💎 MAX', title: 'Imperator' }
    ];
  }

  // Nodirlik Ranglari va Nomlari
  const RARITY_MAP = {
    common: { name: 'Oddiy', color: '#94a3b8', border: 'border-slate-700/60', badge: 'bg-slate-800 text-slate-300' },
    uncommon: { name: 'Maxsus', color: '#34d399', border: 'border-emerald-500/50', badge: 'bg-emerald-950/85 text-emerald-300' },
    rare: { name: 'Nodir', color: '#38bdf8', border: 'border-sky-500/50', badge: 'bg-sky-950/80 text-sky-300' },
    epic: { name: 'Epik', color: '#c084fc', border: 'border-purple-500/50', badge: 'bg-purple-950/80 text-purple-300' },
    legendary: { name: 'Afsonaviy', color: '#f59e0b', border: 'border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]', badge: 'bg-amber-950/80 text-amber-300' },
    mythic: { name: 'Mifik', color: '#f43f5e', border: 'border-rose-500/70 shadow-[0_0_16px_rgba(244,63,94,0.35)]', badge: 'bg-rose-950/80 text-rose-300' }
  };

  // 2. HAQIQIY O'YINCHI PROFILINI ANIQ OLISH FUNKSIYASI
  function getCurrentPlayerIdentity() {
    const tgU = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) || null;
    const prof = window.DIGI_TG_PROFILE || {};
    const doomEl = document.getElementById('myDoomId');
    const nameEl = document.getElementById('myNameInput');

    const id = String(prof.myId || (doomEl && doomEl.textContent) || (tgU && tgU.id ? 'TG-' + tgU.id : '') || '').trim().toUpperCase();
    const tgId = String(prof.myTgId || (tgU && tgU.id) || '').trim();
    const username = String(prof.myUsername || (tgU && tgU.username) || '').replace(/^@/, '').trim();
    const tgFullName = tgU ? [tgU.first_name, tgU.last_name].filter(Boolean).join(' ').trim() : '';
    const name = String((nameEl && nameEl.value) || prof.myName || tgFullName || username || id || "O'yinchi").trim();
    const photoUrl = String(prof.myPhoto || (tgU && tgU.photo_url) || '').trim();

    return { id, tgId, username, name, photoUrl };
  }

  // 3. SOVG'ALAR KATALOGINI ANIQLASH (gifts-catalog.js dan yoki zaxira)
  function getGiftsCatalog() {
    if (Array.isArray(window.DIGI_GIFTS_CATALOG) && window.DIGI_GIFTS_CATALOG.length > 0) {
      return window.DIGI_GIFTS_CATALOG;
    }
    return [
      { id: 'rose_red', name: 'Qizil Atirgul', icon: '🌹', category: 'coins', price: 49000, rarity: 'common', prestige: 50, desc: 'Baxmal qizil gulbargli 3D atirgul — ehtirom va samimiy sovg\'a.', glow: '#ef4444' },
      { id: 'teddy_bear', name: 'Teddi Ayiqcha', icon: '🧸', category: 'coins', price: 89000, rarity: 'common', prestige: 100, desc: 'Yumshoq va do\'stona ayiqcha, oltin bantikli.', glow: '#f59e0b' },
      { id: 'royal_bouquet', name: 'Qirollik Guldastasi', icon: '💐', category: 'coins', price: 149000, rarity: 'uncommon', prestige: 180, desc: 'Qizil va oltin atirgullar guldastasi.', glow: '#ec4899' },
      { id: 'party_cake', name: 'Bayram Torti', icon: '🎂', category: 'coins', price: 220000, rarity: 'uncommon', prestige: 280, desc: '3 qavatli qulupnayli shirin bayram torti.', glow: '#fb7185' },
      { id: 'gold_champagne', name: 'Oltin Shampan', icon: '🍾', category: 'coins', price: 350000, rarity: 'rare', prestige: 450, desc: 'Oltin chelakda taqdim etiladigan elita shampan.', glow: '#facc15' },
      { id: 'diamond_ring', name: 'Olmos Uzuk', icon: '💍', category: 'coins', price: 550000, rarity: 'rare', prestige: 750, desc: 'Toza olmos bilan bezatilgan 18K oq oltin uzuk.', glow: '#38bdf8' },
      { id: 'tactical_medal', name: 'Taktik Medalyon', icon: '🎖️', category: 'bonus', price: 0, rarity: 'rare', prestige: 400, desc: 'Jang maydonidagi jasorat uchun beriladigan qanotli yulduzli medal.', glow: '#f59e0b' },
      { id: 'karambit_neon', name: 'Karambit Neon', icon: '🗡️', category: 'bonus', price: 0, rarity: 'epic', prestige: 900, desc: 'Kiberpank neon moviy jiloli taktik karambit pichog\'i.', glow: '#06b6d4' },
      { id: 'titan_shield', name: 'Titan Qalqon', icon: '🛡️', category: 'bonus', price: 0, rarity: 'epic', prestige: 1500, desc: 'Oltin burgutli, singmas titan va moviy neon himoyasi.', glow: '#38bdf8' },
      { id: 'golden_dragon', name: 'Oltin Ajdar', icon: '🐉', category: 'bonus', price: 0, rarity: 'mythic', prestige: 3000, desc: 'Qizil yoqut ko\'zli, 24K toza oltindan quyilgan ulug\'vor ajdar.', glow: '#eab308' },
      { id: 'gold_watch', name: 'Oltin Soat', icon: '⌚', category: 'gems', price: 15, uzsPrice: 15000, rarity: 'epic', prestige: 1200, desc: 'Skelet siferblatli 24K oltin xronograf soat.', glow: '#f59e0b' },
      { id: 'blue_brilliant', name: 'Moviy Brilliant', icon: '💎', category: 'gems', price: 35, uzsPrice: 35000, rarity: 'legendary', prestige: 3000, desc: 'Noyob 57 qirrali nur taratuvchi moviy olmos marvaridi.', glow: '#00f2fe' },
      { id: 'emperor_crown', name: 'Imperator Toji', icon: '👑', category: 'gems', price: 75, uzsPrice: 75000, rarity: 'legendary', prestige: 7000, desc: 'Qizil baxmalli, yoqut-zumradli imperatorlik toji.', glow: '#fbbf24' },
      { id: 'gold_hypercar', name: 'Oltin Giperkar', icon: '🏎️', category: 'gems', price: 150, uzsPrice: 150000, rarity: 'mythic', prestige: 15000, desc: 'Aerodinamik karbon-oltin korpusli 1500 ot kuchli superkar.', glow: '#f59e0b' },
      { id: 'private_jet', name: 'Shaxsiy Biznes-Jet', icon: '✈️', category: 'gems', price: 300, uzsPrice: 300000, rarity: 'mythic', prestige: 30000, desc: 'Platina va oltin qanotli hashamatli shaxsiy samolyot.', glow: '#e2e8f0' }
    ];
  }

  function getOwnedGiftCounts() {
    const counts = {};
    const gifts = (window.userStats && Array.isArray(window.userStats.gifts)) ? window.userStats.gifts : [];
    gifts.forEach(g => {
      const gid = typeof g === 'string' ? g : (g.giftId || g.id);
      if (gid) counts[gid] = (counts[gid] || 0) + (g.count || 1);
    });
    return counts;
  }

  // 4. MAXSUS CSS STILLARNI SAHNAGA JOYLASHTIRISH
  function ensureGiftsCustomStyles() {
    if (document.getElementById('digi-gifts-custom-css')) return;
    const style = document.createElement('style');
    style.id = 'digi-gifts-custom-css';
    style.textContent = `
      @keyframes digiGiftIdleFloat {
        0%, 100% { transform: rotateY(-5deg) rotateX(3deg) translateY(0px); }
        50% { transform: rotateY(5deg) rotateX(-3deg) translateY(-5px); }
      }
      .digi-gift-card-idle {
        animation: digiGiftIdleFloat 4.2s ease-in-out infinite;
      }

      .digi-gift-sheen {
        pointer-events: none;
        transition: opacity 0.2s ease-out, transform 0.1s ease-out;
      }

      @keyframes digiSparkTwinkle {
        0%, 100% { opacity: 0.2; transform: scale(0.7); }
        50% { opacity: 1; transform: scale(1.2); }
      }
      .digi-gift-spark {
        position: absolute;
        color: #fde047;
        font-size: 11px;
        line-height: 1;
        user-select: none;
        pointer-events: none;
        animation: digiSparkTwinkle 2.4s ease-in-out infinite;
        text-shadow: 0 0 6px rgba(253, 224, 71, 0.8);
      }

      /* 90° Yonbosh rejimda Telegram Safe-Area Himoyasi */
      #lobbyView.digi-lobby-rot90 #modalGiftDetail,
      #lobbyView.digi-lobby-rot90 #modalBuyGems,
      #lobbyView.digi-lobby-rot90 #modalShop,
      #lobbyView.digi-lobby-rot90 #modalPlayerCollection {
        padding: 8px 14px 8px max(66px, calc(var(--digi-safe-left, 58px) + 8px)) !important;
      }
      #lobbyView.digi-lobby-rot90 #modalGiftDetail > div,
      #lobbyView.digi-lobby-rot90 #modalBuyGems > div,
      #lobbyView.digi-lobby-rot90 #modalShop > div,
      #lobbyView.digi-lobby-rot90 #modalPlayerCollection > div {
        height: 95% !important;
        max-height: 95% !important;
      }
    `;
    document.head.appendChild(style);
  }

  // 5. DO'KON VITRINASI (#modalShop -> #giftShopGrid)
  let _activeFilter = 'all';

  function renderDigiGiftShop() {
    ensureGiftsCustomStyles();
    const container = document.getElementById('giftShopGrid');
    if (!container) return;

    const catalog = getGiftsCatalog();
    const myGiftsMap = getOwnedGiftCounts();

    // 4 ta filtr tablarini yangilash
    const tabsContainer = document.getElementById('giftShopTabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = `
        <button type="button" data-filter="all" class="gift-tab-btn px-3 py-1 rounded-full text-[10.5px] font-bold transition whitespace-nowrap ${_activeFilter === 'all' ? 'active bg-white/15 text-white border border-white/20' : 'text-slate-300 hover:text-white border border-white/10'}">🎁 Barchasi (15)</button>
        <button type="button" data-filter="coins" class="gift-tab-btn px-3 py-1 rounded-full text-[10.5px] font-bold transition whitespace-nowrap ${_activeFilter === 'coins' ? 'active bg-white/15 text-white border border-white/20' : 'text-slate-300 hover:text-white border border-white/10'}">💰 Tangaga (6)</button>
        <button type="button" data-filter="bonus" class="gift-tab-btn px-3 py-1 rounded-full text-[10.5px] font-bold transition whitespace-nowrap ${_activeFilter === 'bonus' ? 'active bg-white/15 text-white border border-white/20' : 'text-slate-300 hover:text-white border border-white/10'}">🧰 Sandiqdan (4)</button>
        <button type="button" data-filter="gems" class="gift-tab-btn px-3 py-1 rounded-full text-[10.5px] font-bold transition whitespace-nowrap ${_activeFilter === 'gems' ? 'active bg-white/15 text-white border border-white/20' : 'text-slate-300 hover:text-white border border-white/10'}">💎 VIP Kristal (5)</button>
      `;
      tabsContainer.querySelectorAll('button[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          _activeFilter = btn.getAttribute('data-filter') || 'all';
          renderDigiGiftShop();
        });
      });
    }

    container.innerHTML = '';

    function createGiftCardElement(gift) {
      const rarity = RARITY_MAP[gift.rarity] || RARITY_MAP.common;
      const ownedCount = myGiftsMap[gift.id] || 0;
      const imgUrl = getGiftImageUrl(gift.id);

      let priceHtml = '';
      if (gift.category === 'coins') {
        priceHtml = `<span class="text-amber-300 font-mono font-extrabold text-[10px]">$${gift.price.toLocaleString('en-US')}</span>`;
      } else if (gift.category === 'bonus') {
        priceHtml = `<span class="text-amber-400 font-bold text-[9px] flex items-center gap-0.5">🔒 Faqat Sandiq</span>`;
      } else if (gift.category === 'gems') {
        priceHtml = `<span class="text-cyan-300 font-mono font-extrabold text-[10px] flex items-center gap-0.5">💎 ${gift.price}</span>`;
      }

      const card = document.createElement('div');
      card.className = `relative rounded-xl p-1.5 flex flex-col justify-between gap-1 cursor-pointer active:scale-95 transition-all duration-150 select-none bg-gradient-to-b from-slate-900/90 to-slate-950 border ${rarity.border} hover:border-sky-400/70`;

      card.innerHTML = `
        <!-- Tepada: Nomi va Nodirlik belgisi -->
        <div class="flex items-center justify-between gap-1 min-w-0">
          <span class="text-[10.5px] font-bold text-white truncate" title="${gift.name}">${gift.name}</span>
          <span class="text-[7.5px] font-bold px-1.5 py-0.2 rounded-full uppercase shrink-0 ${rarity.badge}">${rarity.name}</span>
        </div>

        <!-- O'rtada: Ixcham Seamless 3D Rasm Sahna (74px) -->
        <div class="h-[74px] w-full flex items-center justify-center relative overflow-hidden rounded-lg bg-[#050914]" style="box-shadow: inset 0 2px 10px rgba(0,0,0,0.85);">
          <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(circle at 50% 50%, ${gift.glow}2e 0%, transparent 74%);"></div>
          
          <img src="${imgUrl}" 
               alt="${gift.name}" 
               class="max-h-[70px] max-w-[70px] scale-[1.08] object-contain relative z-10 transition-transform duration-200"
               style="-webkit-mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%); mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%);"
               loading="lazy" 
               decoding="async" 
               draggable="false"
               onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-2xl select-none\\'>${gift.icon}</span>';" />

          ${ownedCount > 0 ? `
            <span class="absolute bottom-1 right-1 z-20 text-[8.5px] font-mono font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 px-1.5 py-0.2 rounded-full shadow">
              x${ownedCount}
            </span>
          ` : ''}
        </div>

        <!-- Pastda: Narx va Obro' -->
        <div class="flex items-center justify-between gap-1 pt-0.5 border-t border-white/5 text-[9px]">
          <div class="min-w-0 truncate">${priceHtml}</div>
          <span class="text-amber-400 font-mono font-bold shrink-0 text-[8.5px]">👑 +${(gift.prestige || 0).toLocaleString('en-US')}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        openGiftDetailModal(gift.id);
      });

      return card;
    }

    if (_activeFilter === 'all') {
      // 3 ta aniq bo'lim sarlavhasi bilan chiqarish
      const coinsGifts = catalog.filter(g => g.category === 'coins');
      const bonusGifts = catalog.filter(g => g.category === 'bonus');
      const gemsGifts = catalog.filter(g => g.category === 'gems');

      // Bo'lim 1: Tangali
      const h1 = document.createElement('div');
      h1.className = 'col-span-3 text-[10px] font-black uppercase tracking-wider text-amber-300 pt-1 pb-0.5 flex items-center gap-1.5 border-b border-amber-500/20';
      h1.innerHTML = '<span>💰 O\'YIN TANGALARIGA SOVG\'ALAR (6)</span>';
      container.appendChild(h1);
      coinsGifts.forEach(g => container.appendChild(createGiftCardElement(g)));

      // Bo'lim 2: Oltin Sandiqdan
      const h2 = document.createElement('div');
      h2.className = 'col-span-3 text-[10px] font-black uppercase tracking-wider text-purple-300 pt-2 pb-0.5 flex items-center gap-1.5 border-b border-purple-500/20';
      h2.innerHTML = '<span>🧰 FAQAT 3D OLTIN SANDIQDAN (4) — sotib olib bo\'lmaydi</span>';
      container.appendChild(h2);
      bonusGifts.forEach(g => container.appendChild(createGiftCardElement(g)));

      // Bo'lim 3: VIP Kristallar
      const h3 = document.createElement('div');
      h3.className = 'col-span-3 text-[10px] font-black uppercase tracking-wider text-cyan-300 pt-2 pb-0.5 flex items-center gap-1.5 border-b border-cyan-500/20';
      h3.innerHTML = '<span>💎 VIP KRISTAL SOVG\'ALARI (5) — 1 💎 = 1,000 so\'m</span>';
      container.appendChild(h3);
      gemsGifts.forEach(g => container.appendChild(createGiftCardElement(g)));
    } else {
      const filtered = catalog.filter(g => g.category === _activeFilter);
      filtered.forEach(gift => {
        container.appendChild(createGiftCardElement(gift));
      });
    }
  }

  // 6. 360° INTERAKTIV 3D DETAIL VA SOVG'A YUBORISH MODALI (#modalGiftDetail)
  let _currentGiftId = null;
  let _detailMode = 'buy';
  let _selectedFriend = null;
  let _activeSubTab = 'friends';

  function ensureGiftDetailModalDOM() {
    if (document.getElementById('modalGiftDetail')) return;

    const parent = document.getElementById('modalShop')?.parentElement || document.getElementById('lobbyView') || document.body;

    const modal = document.createElement('div');
    modal.id = 'modalGiftDetail';
    modal.className = 'hidden fixed inset-0 z-[55] flex items-center justify-center p-2.5';
    modal.innerHTML = `
      <div class="ios-fh-sheet w-full max-w-4xl h-[94%] flex flex-col overflow-hidden">
        
        <!-- Yuqori Sarlavha (Safe-Area pl-4) -->
        <div class="ios-fh-nav shrink-0 h-[48px] px-4 flex items-center justify-between gap-2 border-b border-white/10">
          <div class="flex items-center gap-2.5 min-w-0">
            <span id="giftDetailIcon" class="text-xl shrink-0">🎁</span>
            <div class="min-w-0 leading-tight">
              <h2 id="giftDetailTitle" class="text-[14px] font-black tracking-tight text-white drop-shadow truncate">Sovg'a Tafsiloti</h2>
              <span id="giftDetailRarityBadge" class="text-[9px] font-bold uppercase tracking-wider text-amber-300">Nodir</span>
            </div>
          </div>
          <button id="btnCloseGiftDetailModal" type="button" class="ios-btn-circle" title="Yopish" aria-label="Yopish">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- 2 Ustunli Tarkib -->
        <div class="grid grid-cols-2 gap-3 p-3 flex-1 min-h-0 overflow-hidden">
          
          <!-- CHAP: Telegram Star Gifts 3D Tilt Sahnasi -->
          <div class="ios-bonus-stage relative flex-1 min-h-0 overflow-hidden flex flex-col justify-between items-center p-2.5 rounded-2xl bg-gradient-to-b from-[#070c18] to-[#03060d] border border-white/10 min-w-0">
            
            <div id="giftDetailStage" class="flex-1 min-h-0 w-full flex items-center justify-center relative select-none" style="perspective: 850px; touch-action: none;">
              <div id="giftDetail3DCard" class="digi-gift-card-idle relative flex items-center justify-center" style="transform-style: preserve-3d; transition: transform 0.12s ease-out; will-change: transform;">
                <div id="giftDetailAura" class="absolute w-[210px] h-[210px] rounded-full pointer-events-none" style="filter: blur(28px); opacity: 0.45; transform: translateZ(-20px);"></div>
                
                <img id="giftDetailImg" 
                     src="" 
                     alt="Gift" 
                     class="w-[170px] h-[170px] object-contain pointer-events-none select-none relative z-10" 
                     style="-webkit-mask-image: radial-gradient(circle at 50% 50%, #000 64%, transparent 98%); mask-image: radial-gradient(circle at 50% 50%, #000 64%, transparent 98%); transform: translateZ(26px);" 
                     draggable="false" />
                
                <div id="giftDetailSheen" class="digi-gift-sheen absolute inset-0 rounded-2xl pointer-events-none z-20" style="mix-blend-mode: screen; opacity: 0.28; background: linear-gradient(135deg, transparent 20%, rgba(255,255,255,0.7) 48%, rgba(255,215,0,0.6) 52%, transparent 75%); transform: translateZ(32px);"></div>
                <div id="giftDetailSparks" class="absolute inset-0 pointer-events-none z-20"></div>
              </div>
            </div>

            <!-- Pastki qism: Izoh + To'liq Tavsif + Obro' -->
            <div class="shrink-0 w-full px-2 pt-1 pb-0.5 text-center space-y-1">
              <p class="text-[9px] text-cyan-300 font-semibold tracking-wide">👆 Barmoq bilan 3D harakatlantiring</p>
              <p id="giftDetailDesc" class="text-[10.5px] leading-snug text-slate-300/95 whitespace-normal break-words max-w-full">Tavsif</p>
              <div class="flex items-center justify-center gap-2 text-[10px] pt-0.5">
                <span id="giftDetailPrestige" class="font-mono font-bold text-amber-300">👑 +0 Obro'</span>
                <span class="text-slate-600">•</span>
                <span id="giftDetailOwnedBadge" class="text-emerald-300 font-semibold">Sizda bor: 0 ta</span>
              </div>
            </div>

          </div>

          <!-- O'NG: Xarid va Yuborish Paneli -->
          <div class="ios-fh-group p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-y-auto">
            <div class="space-y-2.5">
              
              <!-- Tablar: O'zimga olish / O'yinchiga yuborish -->
              <div class="flex items-center p-0.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <button id="btnTabGiftBuySelf" type="button" class="flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-white/15 text-white shadow">
                  🎁 O'zimga olish
                </button>
                <button id="btnTabGiftSendOther" type="button" class="flex-1 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white">
                  ✈️ Hadya yuborish
                </button>
              </div>

              <!-- Narx paneli -->
              <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span class="text-[9.5px] text-slate-400 block">Narxi:</span>
                  <div id="giftDetailPriceLabel" class="text-sm font-mono font-black text-amber-300 mt-0.5">$0</div>
                </div>
                <div class="text-right">
                  <span class="text-[9.5px] text-slate-400 block">Sizning balansingiz:</span>
                  <div id="giftDetailBalanceLabel" class="text-xs font-mono font-bold text-slate-200 mt-0.5">$0</div>
                </div>
              </div>

              <!-- Faqat Sandiq sovg'alari uchun ogohlantirish -->
              <div id="giftBonusOnlyBox" class="hidden p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-center space-y-1">
                <div class="text-xs font-bold text-amber-300">🎰 Maxsus Sandiq Sovg'asi!</div>
                <p class="text-[10px] text-slate-300">Bu sovg'ani to'g'ridan-to'g'ri sotib olib bo'lmaydi. Uni <b>Bosh menyu -> BONUS</b> bo'limidagi 3D Oltin Sandiqni ochib yutib olishingiz mumkin!</p>
                <button id="btnGoToBonusCase" type="button" class="ios-btn-gold px-4 py-1.5 text-xs font-bold mt-1 inline-block">
                  🧰 Oltin Sandiqqa o'tish
                </button>
              </div>

              <!-- Hadya Yuborish Bo'limi -->
              <div id="giftSendPanel" class="hidden space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Kimga yuborasiz?</label>
                  <span id="selectedFriendNameLabel" class="text-[10px] text-sky-400 font-semibold truncate max-w-[140px]">Tanlanmagan</span>
                </div>

                <!-- 3 ta subtab -->
                <div class="flex gap-1 text-[10px]">
                  <button id="subTabFriends" type="button" class="px-2.5 py-1 rounded-md bg-white/10 text-white font-bold">Do'stlar</button>
                  <button id="subTabOnline" type="button" class="px-2.5 py-1 rounded-md text-slate-400 hover:text-white">Barchasi</button>
                  <button id="subTabId" type="button" class="px-2.5 py-1 rounded-md text-slate-400 hover:text-white">ID orqali</button>
                </div>

                <!-- O'yinchilar ro'yxati -->
                <div id="giftFriendsList" class="max-h-28 overflow-y-auto space-y-1 p-1 rounded-xl bg-slate-950/90 border border-slate-800 text-[10px]">
                  <div class="py-3 text-center text-slate-500">O'yinchilar ro'yxati yuklanmoqda...</div>
                </div>

                <!-- Telegram ID / DOOM-ID kiritish -->
                <div id="giftCustomIdBox" class="hidden">
                  <input id="inputGiftTargetId" type="text" placeholder="DOOM-XXXX yoki Telegram ID" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono" />
                </div>

                <!-- Tilak xabari -->
                <div>
                  <label class="text-[9.5px] text-slate-400 block mb-1">Tilak yoki xabar (ixtiyoriy):</label>
                  <input id="inputGiftMessage" type="text" maxlength="80" placeholder="Tabriklayman! 🎉" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
                </div>
              </div>

              <!-- Kristal yetmayaptimi yordam havolasi -->
              <div id="giftGemsHelpLinkBox" class="hidden text-center pt-1">
                <button id="btnOpenGemsFromGiftDetail" type="button" class="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2 transition">
                  💎 Kristal yetmayaptimi? Admindan olish (1 💎 = 1,000 so'm) ›
                </button>
              </div>

            </div>

            <!-- Pastki Harakat Tugmasi -->
            <div class="pt-2 border-t border-slate-800/80">
              <button id="btnConfirmGiftAction" type="button" class="ios-btn-gold w-full py-2.5 text-xs font-black tracking-wide flex items-center justify-center gap-1.5">
                <span id="btnGiftActionIcon">🛒</span>
                <span id="btnGiftActionText">O'zimga sotib olish</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
    `;

    parent.appendChild(modal);

    document.getElementById('btnCloseGiftDetailModal').addEventListener('click', closeGiftDetailModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeGiftDetailModal();
    });

    document.getElementById('btnTabGiftBuySelf').addEventListener('click', () => {
      _detailMode = 'buy';
      updateDetailModeUI();
    });
    document.getElementById('btnTabGiftSendOther').addEventListener('click', () => {
      _detailMode = 'send';
      updateDetailModeUI();
      loadGiftRecipients();
    });

    document.getElementById('subTabFriends').addEventListener('click', () => {
      _activeSubTab = 'friends';
      updateSubTabsUI();
      loadGiftRecipients();
    });
    document.getElementById('subTabOnline').addEventListener('click', () => {
      _activeSubTab = 'online';
      updateSubTabsUI();
      loadGiftRecipients();
    });
    document.getElementById('subTabId').addEventListener('click', () => {
      _activeSubTab = 'id';
      updateSubTabsUI();
    });

    document.getElementById('btnGoToBonusCase').addEventListener('click', () => {
      closeGiftDetailModal();
      document.getElementById('modalShop').classList.add('hidden');
      const bonusBtn = document.getElementById('menuBtnBonus');
      if (bonusBtn) bonusBtn.click();
    });

    document.getElementById('btnOpenGemsFromGiftDetail').addEventListener('click', () => {
      closeGiftDetailModal();
      openBuyGemsModal();
    });

    initGiftDetail3DTilt();
    document.getElementById('btnConfirmGiftAction').addEventListener('click', handleGiftActionSubmit);
  }

  function updateSubTabsUI() {
    const b1 = document.getElementById('subTabFriends');
    const b2 = document.getElementById('subTabOnline');
    const b3 = document.getElementById('subTabId');
    const list = document.getElementById('giftFriendsList');
    const customBox = document.getElementById('giftCustomIdBox');

    [b1, b2, b3].forEach(b => {
      b.className = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white font-medium';
    });

    if (_activeSubTab === 'friends') {
      b1.className = 'px-2.5 py-1 rounded-md bg-white/10 text-white font-bold';
      list.classList.remove('hidden');
      customBox.classList.add('hidden');
    } else if (_activeSubTab === 'online') {
      b2.className = 'px-2.5 py-1 rounded-md bg-white/10 text-white font-bold';
      list.classList.remove('hidden');
      customBox.classList.add('hidden');
    } else {
      b3.className = 'px-2.5 py-1 rounded-md bg-white/10 text-white font-bold';
      list.classList.add('hidden');
      customBox.classList.remove('hidden');
    }
  }

  function initGiftDetail3DTilt() {
    const stage = document.getElementById('giftDetailStage');
    const card = document.getElementById('giftDetail3DCard');
    const sheen = document.getElementById('giftDetailSheen');
    if (!stage || !card) return;

    let isPointerDown = false;

    function handleStart(e) {
      isPointerDown = true;
      card.classList.remove('digi-gift-card-idle');
      card.style.transition = 'transform 0.06s ease-out';
      handleMove(e);
    }

    function handleMove(e) {
      if (!isPointerDown && e.type !== 'pointermove') return;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

      const isRot90 = document.body.classList.contains('digi-lobby-rot90') ||
                      document.getElementById('lobbyView')?.classList.contains('digi-lobby-rot90') ||
                      !!window._digiRot90;

      let nx = 0, ny = 0;
      if (isRot90) {
        nx = ((clientY - (rect.top + rect.height * 0.5)) / (rect.height * 0.5));
        ny = -((clientX - (rect.left + rect.width * 0.5)) / (rect.width * 0.5));
      } else {
        nx = ((clientX - (rect.left + rect.width * 0.5)) / (rect.width * 0.5));
        ny = ((clientY - (rect.top + rect.height * 0.5)) / (rect.height * 0.5));
      }

      nx = Math.max(-1.25, Math.min(1.25, nx));
      ny = Math.max(-1.25, Math.min(1.25, ny));

      card.style.transform = `rotateY(${nx * 22}deg) rotateX(${-ny * 18}deg) scale(1.04)`;

      if (sheen) {
        sheen.style.transform = `translateZ(32px) translateX(${-nx * 26}px) translateY(${-ny * 26}px)`;
        sheen.style.opacity = `${0.24 + Math.hypot(nx, ny) * 0.26}`;
      }
    }

    function handleEnd() {
      if (!isPointerDown) return;
      isPointerDown = false;
      card.style.transition = 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)';
      card.style.transform = 'rotateY(0deg) rotateX(0deg) scale(1)';
      if (sheen) {
        sheen.style.transform = 'translateZ(32px) translateX(0px) translateY(0px)';
        sheen.style.opacity = '0.28';
      }
      setTimeout(() => {
        if (!isPointerDown) {
          card.classList.add('digi-gift-card-idle');
        }
      }, 460);
    }

    stage.addEventListener('pointerdown', handleStart);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  }

  function updateDetailModeUI() {
    const btnBuy = document.getElementById('btnTabGiftBuySelf');
    const btnSend = document.getElementById('btnTabGiftSendOther');
    const sendPanel = document.getElementById('giftSendPanel');
    const btnIcon = document.getElementById('btnGiftActionIcon');
    const btnText = document.getElementById('btnGiftActionText');

    if (_detailMode === 'buy') {
      btnBuy.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-white/15 text-white shadow';
      btnSend.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white';
      sendPanel.classList.add('hidden');
      btnIcon.textContent = '🛒';
      btnText.textContent = 'O\'zimga sotib olish';
    } else {
      btnSend.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-white/15 text-white shadow';
      btnBuy.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white';
      sendPanel.classList.remove('hidden');
      btnIcon.textContent = '✈️';
      btnText.textContent = _selectedFriend ? `${_selectedFriend.name} ga yuborish` : 'Hadya yuborish';
    }
  }

  function loadGiftRecipients() {
    const list = document.getElementById('giftFriendsList');
    if (!list) return;

    list.innerHTML = '<div class="py-2 text-center text-slate-400 text-[10px]">O\'yinchilar qidirilmoqda...</div>';

    const me = getCurrentPlayerIdentity();
    fetch('/api/tg/directory?myId=' + encodeURIComponent(me.id))
      .then(res => res.json())
      .then(data => {
        let players = [];
        if (_activeSubTab === 'friends') {
          players = (data && data.myFriends) || [];
        } else {
          players = (data && data.allPlayers) || [];
        }

        const myIdUpper = me.id.toUpperCase();
        const otherPlayers = players.filter(p => String(p.id || '').toUpperCase() !== myIdUpper);

        if (otherPlayers.length === 0) {
          list.innerHTML = `<div class="py-2 text-center text-slate-500 text-[10px]">${_activeSubTab === 'friends' ? 'Do\'stlar topilmadi. "Barchasi" yoki "ID orqali" ni tanlang.' : 'O\'yinchilar topilmadi.'}</div>`;
          return;
        }

        list.innerHTML = '';
        otherPlayers.forEach(p => {
          const item = document.createElement('div');
          const isSel = _selectedFriend && String(_selectedFriend.id) === String(p.id);
          const prestigeFormatted = (p.prestige || 0).toLocaleString('en-US');
          item.className = `p-1.5 rounded-lg flex items-center justify-between cursor-pointer transition ${isSel ? 'bg-sky-950/80 border border-sky-400/60' : 'bg-slate-900/60 hover:bg-slate-800/80 border border-transparent'}`;
          item.innerHTML = `
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">👤</span>
              <div class="min-w-0 leading-tight">
                <span class="font-bold text-white truncate block max-w-[120px]">${p.name || p.username || p.id}</span>
                <span class="text-[8px] text-slate-400 font-mono">${p.id} • Lv.${p.level || 1}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <span class="text-[9px] font-mono text-amber-300 block">👑 ${prestigeFormatted}</span>
              <span class="text-[8px] text-sky-400 font-mono">${p.elo || 1000} ELO</span>
            </div>
          `;
          item.addEventListener('click', () => {
            _selectedFriend = { id: p.id, name: p.name || p.username || p.id };
            document.getElementById('selectedFriendNameLabel').textContent = _selectedFriend.name;
            updateDetailModeUI();
            loadGiftRecipients();
          });
          list.appendChild(item);
        });
      })
      .catch(() => {
        list.innerHTML = '<div class="py-2 text-center text-slate-500 text-[10px]">O\'yinchilar ro\'yxatini yuklab bo\'lmadi</div>';
      });
  }

  function openGiftDetailModal(giftId, preselectRecipient) {
    ensureGiftDetailModalDOM();
    const catalog = getGiftsCatalog();
    const gift = catalog.find(g => g.id === giftId);
    if (!gift) return;

    _currentGiftId = giftId;
    _detailMode = preselectRecipient ? 'send' : 'buy';
    _selectedFriend = preselectRecipient || null;
    _activeSubTab = 'friends';

    const modal = document.getElementById('modalGiftDetail');
    const rarity = RARITY_MAP[gift.rarity] || RARITY_MAP.common;
    const uStats = window.userStats || { coins: 0, gems: 0, gifts: [] };
    const myGiftsMap = getOwnedGiftCounts();

    document.getElementById('giftDetailIcon').textContent = gift.icon;
    document.getElementById('giftDetailTitle').textContent = gift.name;
    const rBadge = document.getElementById('giftDetailRarityBadge');
    rBadge.textContent = rarity.name;
    rBadge.className = `text-[9px] font-bold uppercase tracking-wider ${rarity.badge}`;

    const imgEl = document.getElementById('giftDetailImg');
    if (imgEl) imgEl.src = getGiftImageUrl(gift.id);

    const aura = document.getElementById('giftDetailAura');
    if (aura) {
      aura.style.background = `radial-gradient(circle, ${gift.glow}80 0%, ${gift.glow}15 65%, transparent 75%)`;
    }

    const sparksContainer = document.getElementById('giftDetailSparks');
    if (sparksContainer) {
      sparksContainer.innerHTML = '';
      if (['rare', 'epic', 'legendary', 'mythic'].includes(gift.rarity)) {
        const positions = [
          { top: '12%', left: '15%', delay: '0s' },
          { top: '22%', right: '14%', delay: '0.4s' },
          { bottom: '26%', left: '16%', delay: '0.8s' },
          { bottom: '16%', right: '18%', delay: '1.2s' },
          { top: '48%', left: '8%', delay: '1.6s' },
          { top: '54%', right: '8%', delay: '2.0s' }
        ];
        positions.forEach(pos => {
          const sp = document.createElement('span');
          sp.className = 'digi-gift-spark';
          sp.textContent = '✦';
          Object.assign(sp.style, pos);
          sparksContainer.appendChild(sp);
        });
      }
    }

    document.getElementById('giftDetailDesc').textContent = gift.desc || '';
    document.getElementById('giftDetailPrestige').textContent = `👑 +${(gift.prestige || 0).toLocaleString('en-US')} Obro'`;
    document.getElementById('giftDetailOwnedBadge').textContent = `Sizda bor: ${myGiftsMap[gift.id] || 0} ta`;

    const priceLbl = document.getElementById('giftDetailPriceLabel');
    const balLbl = document.getElementById('giftDetailBalanceLabel');
    const bonusBox = document.getElementById('giftBonusOnlyBox');
    const btnAction = document.getElementById('btnConfirmGiftAction');
    const gemsHelpBox = document.getElementById('giftGemsHelpLinkBox');

    if (gift.category === 'coins') {
      priceLbl.textContent = `$${gift.price.toLocaleString('en-US')}`;
      balLbl.textContent = `$${(uStats.coins || 0).toLocaleString('en-US')}`;
      bonusBox.classList.add('hidden');
      btnAction.classList.remove('hidden');
      gemsHelpBox.classList.add('hidden');
    } else if (gift.category === 'gems') {
      priceLbl.textContent = `💎 ${gift.price} Kristal`;
      balLbl.textContent = `💎 ${(uStats.gems || 0).toLocaleString('en-US')}`;
      bonusBox.classList.add('hidden');
      btnAction.classList.remove('hidden');
      gemsHelpBox.classList.remove('hidden');
    } else if (gift.category === 'bonus') {
      priceLbl.textContent = '🔒 Faqat Sandiqdan';
      balLbl.textContent = 'Oltin Sandiq';
      bonusBox.classList.remove('hidden');
      btnAction.classList.add('hidden');
      gemsHelpBox.classList.add('hidden');
    }

    if (preselectRecipient) {
      document.getElementById('selectedFriendNameLabel').textContent = preselectRecipient.name;
    } else {
      document.getElementById('selectedFriendNameLabel').textContent = 'Tanlanmagan';
    }

    updateDetailModeUI();
    updateSubTabsUI();
    modal.classList.remove('hidden');
  }

  function closeGiftDetailModal() {
    const modal = document.getElementById('modalGiftDetail');
    if (modal) modal.classList.add('hidden');
    _currentGiftId = null;
  }

  // Sotib olish yoki Yuborish API chaqiruvi (POST /api/tg/gifts/buy)
  function handleGiftActionSubmit() {
    const catalog = getGiftsCatalog();
    const gift = catalog.find(g => g.id === _currentGiftId);
    if (!gift) return;

    const me = getCurrentPlayerIdentity();
    if (!me.id) {
      if (typeof window.showToast === 'function') window.showToast('O\'yinchi ID aniqlanmadi!', '⚠️');
      return;
    }

    let targetId = me.id;
    if (_detailMode === 'send') {
      if (_activeSubTab === 'id') {
        const inp = document.getElementById('inputGiftTargetId');
        targetId = (inp && inp.value.trim().toUpperCase()) || '';
      } else {
        targetId = (_selectedFriend && _selectedFriend.id) || '';
      }

      if (!targetId) {
        if (typeof window.showToast === 'function') window.showToast('Iltimos, sovg\'a yuboriladigan o\'yinchini tanlang!', '⚠️');
        return;
      }
    }

    const uStats = window.userStats || { coins: 0, gems: 0, gifts: [] };
    const btn = document.getElementById('btnConfirmGiftAction');

    // Valyuta yetarliligini oldindan tekshirish
    if (gift.category === 'coins') {
      if ((uStats.coins || 0) < gift.price) {
        if (typeof window.showToast === 'function') window.showToast('Tangalar yetarli emas! 777 Ruletkani aylantiring.', '⚠️');
        return;
      }
    } else if (gift.category === 'gems') {
      if ((uStats.gems || 0) < gift.price) {
        if (typeof window.showToast === 'function') window.showToast('Kristallar yetarli emas! Kristal do\'konidan xarid qiling.', '💎');
        openBuyGemsModal();
        return;
      }
    }

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '⏳ Bajarilmoqda...';

    const note = (document.getElementById('inputGiftMessage')?.value || '').trim().slice(0, 80);

    const payload = {
      buyerId: me.id,
      giftId: gift.id,
      recipientId: targetId,
      note: note
    };

    fetch('/api/tg/gifts/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      btn.disabled = false;
      btn.innerHTML = oldText;

      if (data && data.ok) {
        if (data.buyerStats) {
          if (typeof data.buyerStats.coins === 'number') uStats.coins = data.buyerStats.coins;
          if (typeof data.buyerStats.gems === 'number') uStats.gems = data.buyerStats.gems;
          if (typeof data.buyerStats.prestige === 'number') uStats.prestige = data.buyerStats.prestige;
          if (Array.isArray(data.buyerStats.gifts)) uStats.gifts = data.buyerStats.gifts;
          if (data.buyerStats.giftSummary) uStats.giftSummary = data.buyerStats.giftSummary;
        }

        if (typeof window.saveUserData === 'function') window.saveUserData();
        if (typeof window.updateMainMenuWidgets === 'function') window.updateMainMenuWidgets();
        renderDigiGiftShop();

        if (typeof window.playSound === 'function') window.playSound('victory_fanfare');
        if (typeof window.showToast === 'function') {
          if (_detailMode === 'buy') {
            window.showToast(`🎉 ${gift.name} kolleksiyangizga qo'shildi!`, '🎁');
          } else {
            window.showToast(`🎉 ${gift.name} ${data.targetName || targetId} ga yuborildi!`, '✈️');
          }
        }
        closeGiftDetailModal();
      } else {
        if (data && data.error === 'NOT_ENOUGH_GEMS') {
          if (typeof window.showToast === 'function') window.showToast('Kristallar yetarli emas! Kristal do\'konini oching.', '💎');
          openBuyGemsModal();
        } else {
          const errMsg = (data && (data.message || data.error)) || 'Xaridni amalga oshirib bo\'lmadi';
          if (typeof window.showToast === 'function') window.showToast(errMsg, '⚠️');
        }
      }
    })
    .catch(err => {
      btn.disabled = false;
      btn.innerHTML = oldText;
      console.error('Gift buy error:', err);
      if (typeof window.showToast === 'function') window.showToast('Server bilan aloqa uzildi', '⚠️');
    });
  }

  // 7. 💎 KRISTAL SOTIB OLISH MODALI (#modalBuyGems)
  let _selectedGemsPackage = getGemsPackages()[1] || getGemsPackages()[0];

  function buildGemsOrderText(pkg, me) {
    return `Assalomu alaykum! DIGI DIGI Kristal buyurtmasi:
💎 Paket: ${pkg.gems} Kristal (${pkg.uzs.toLocaleString('en-US')} so'm)
👤 O'yinchi: ${me.name}
🆔 O'yin ID: ${me.id || 'Aniqlanmadi'}${me.username ? '\n📱 Username: @' + me.username : ''}${me.tgId ? '\n🔢 Telegram ID: ' + me.tgId : ''}
To'lov rekvizitlarini yuborsangiz, chekni tashlayman.`;
  }

  function ensureBuyGemsModalDOM() {
    if (document.getElementById('modalBuyGems')) return;

    const parent = document.getElementById('modalShop')?.parentElement || document.getElementById('lobbyView') || document.body;

    const modal = document.createElement('div');
    modal.id = 'modalBuyGems';
    modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-2.5';
    modal.innerHTML = `
      <div class="ios-fh-sheet w-full max-w-4xl h-[94%] flex flex-col overflow-hidden">
        
        <!-- Yuqori Sarlavha + Jonli Kristal Balansi -->
        <div class="ios-fh-nav shrink-0 h-[48px] px-4 flex items-center justify-between gap-2 border-b border-white/10">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-xl shrink-0">💎</span>
            <div class="min-w-0 leading-tight">
              <h2 class="text-[14px] font-black tracking-tight text-white drop-shadow truncate">Kristal Do'koni</h2>
              <span class="text-[9px] text-cyan-300 font-semibold">1 💎 = 1,000 so'm</span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button id="btnRefreshGemsBalance" type="button" class="ios-fh-stat-pill px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] font-bold text-slate-300 hover:text-white transition" title="Balansni yangilash">
              <span>🔄</span>
              <span class="hidden sm:inline">Yangilash</span>
            </button>
            <div class="ios-fh-stat-pill px-3 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-mono font-extrabold text-cyan-300 border border-cyan-400/50">
              <span>💎</span>
              <span id="buyGemsModalBalance">0</span>
            </div>
            <button id="btnCloseBuyGemsModal" type="button" class="ios-btn-circle" title="Yopish" aria-label="Yopish">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- 2 Ustunli Tarkib -->
        <div class="grid grid-cols-2 gap-3 p-3 flex-1 min-h-0 overflow-hidden">
          
          <!-- CHAP: 5 ta Tayyor Paket Ro'yxati -->
          <div class="ios-fh-group p-3 flex flex-col justify-between gap-2 min-h-0 overflow-y-auto">
            <div>
              <div class="flex items-center justify-between px-1 mb-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-amber-300">Rasmiy Kristal Paketlari</span>
                <span class="text-[9.5px] text-slate-400">1 💎 = 1,000 so'm</span>
              </div>
              <div id="gemsPackagesList" class="space-y-2"></div>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[9.5px] text-slate-400 leading-relaxed">
              ℹ️ <b>Eslatma:</b> Kristallar xavfsiz va rasmiy admin orqali to'ldiriladi. To'lov cheki yuborilgach, hisobingizga darhol o'tkaziladi.
            </div>
          </div>

          <!-- O'NG: Buyurtma Tafsilotlari va Adminga Yuborish -->
          <div class="ios-fh-group p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-y-auto">
            <div class="space-y-3">
              
              <!-- Tanlangan Paket Xulosasi -->
              <div class="p-3 rounded-2xl bg-gradient-to-b from-sky-950/60 to-slate-950 border border-sky-400/40 text-center relative overflow-hidden">
                <span class="text-[10px] font-bold text-sky-300 uppercase tracking-wider">Tanlangan Paket</span>
                <div id="summaryGemsAmount" class="text-3xl font-black font-mono text-cyan-200 mt-1">💎 35</div>
                <div id="summaryGemsPrice" class="text-sm font-extrabold text-amber-300 font-mono mt-0.5">35,000 so'm</div>
              </div>

              <!-- Foydalanuvchi ID si va Nusxalash -->
              <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="text-[9.5px] text-slate-400 block">Sizning Profilingiz:</span>
                  <span id="buyGemsUserIdLabel" class="text-xs font-mono font-bold text-white truncate block">--</span>
                </div>
                <button id="btnCopyOrderId" type="button" class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold shrink-0 transition">
                  📋 Nusxalash
                </button>
              </div>

              <!-- Adminga yuboriladigan tayyor matn -->
              <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                <span class="text-[9.5px] text-slate-400 block">Adminga yuboriladigan buyurtma:</span>
                <div id="buyGemsOrderTextPreview" class="text-[10px] font-mono text-cyan-100 bg-slate-900/90 p-2 rounded-lg border border-slate-800 whitespace-pre-wrap leading-tight">
                  Yuklanmoqda...
                </div>
              </div>

            </div>

            <!-- Adminga Telegram Lichkasiga O'tish Tugmasi -->
            <div class="pt-2 border-t border-slate-800/80">
              <button id="btnOpenTelegramAdmin" type="button" class="ios-btn-blue w-full py-2.5 text-xs font-black tracking-wide flex items-center justify-center gap-2 shadow-lg">
                <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.673c.458 0 .66-.21.916-.457l2.199-2.138 4.574 3.379c.843.465 1.447.225 1.657-.783l2.997-14.12c.307-1.233-.473-1.792-1.277-1.428z"/></svg>
                <span>Telegram Admin Lichkasiga Yuborish</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
    `;

    parent.appendChild(modal);

    document.getElementById('btnCloseBuyGemsModal').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    document.getElementById('btnRefreshGemsBalance').addEventListener('click', () => {
      if (typeof window.tgBridgeRefreshFromServer === 'function') {
        window.tgBridgeRefreshFromServer();
        if (typeof window.showToast === 'function') window.showToast("Balans yangilanmoqda...", "🔄");
      } else if (typeof window.updateMainMenuWidgets === 'function') {
        window.updateMainMenuWidgets();
      }
      setTimeout(() => {
        const balEl = document.getElementById('buyGemsModalBalance');
        if (balEl && window.userStats) balEl.textContent = (window.userStats.gems || 0).toLocaleString('en-US');
      }, 500);
    });

    document.getElementById('btnCopyOrderId').addEventListener('click', () => {
      const txt = document.getElementById('buyGemsOrderTextPreview').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt);
        if (typeof window.showToast === 'function') window.showToast('Buyurtma xabari nusxalandi!', '📋');
      }
    });

    document.getElementById('btnOpenTelegramAdmin').addEventListener('click', () => {
      const me = getCurrentPlayerIdentity();
      const orderTxt = buildGemsOrderText(_selectedGemsPackage, me);

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(orderTxt);
        }
      } catch (e) {}

      const adminUser = (window.DIGI_GEMS_CONFIG && window.DIGI_GEMS_CONFIG.adminUsername) || 'Abror444';
      const tgChatWithTextUrl = 'https://t.me/' + adminUser + '?text=' + encodeURIComponent(orderTxt);

      const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
      if (tg && typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(tgChatWithTextUrl);
      } else if (tg && typeof tg.openLink === 'function') {
        tg.openLink(tgChatWithTextUrl);
      } else {
        const w = window.open(tgChatWithTextUrl, '_blank');
        if (!w) window.location.href = tgChatWithTextUrl;
      }
    });
  }

  function renderGemsPackages() {
    const list = document.getElementById('gemsPackagesList');
    if (!list) return;

    const packages = getGemsPackages();
    list.innerHTML = '';
    packages.forEach(pkg => {
      const isSel = _selectedGemsPackage && _selectedGemsPackage.gems === pkg.gems;
      const card = document.createElement('div');
      card.className = `p-2 rounded-xl flex items-center justify-between cursor-pointer transition select-none ${isSel ? 'bg-cyan-950/70 border border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-900/60 hover:bg-slate-850 border border-slate-800'}`;

      card.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xl">💎</span>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-mono font-black text-white">${pkg.gems} Kristal</span>
              ${pkg.badge ? `<span class="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-500/50">${pkg.badge}</span>` : ''}
            </div>
            <span class="text-[9px] text-slate-400">${pkg.title}</span>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs font-mono font-extrabold text-amber-300">${pkg.uzs.toLocaleString('en-US')} so'm</div>
          <span class="text-[8.5px] text-cyan-300 font-mono">${(pkg.uzs / pkg.gems).toFixed(0)} so'm/💎</span>
        </div>
      `;

      card.addEventListener('click', () => {
        _selectedGemsPackage = pkg;
        renderGemsPackages();
        updateGemsOrderSummary();
      });

      list.appendChild(card);
    });

    updateGemsOrderSummary();
  }

  function updateGemsOrderSummary() {
    if (!_selectedGemsPackage) return;
    const summaryGems = document.getElementById('summaryGemsAmount');
    const summaryPrice = document.getElementById('summaryGemsPrice');
    const userLabel = document.getElementById('buyGemsUserIdLabel');
    const orderPreview = document.getElementById('buyGemsOrderTextPreview');

    if (summaryGems) summaryGems.textContent = `💎 ${_selectedGemsPackage.gems}`;
    if (summaryPrice) summaryPrice.textContent = `${_selectedGemsPackage.uzs.toLocaleString('en-US')} so'm`;

    const me = getCurrentPlayerIdentity();
    if (userLabel) {
      userLabel.textContent = `${me.name} • ${me.id || 'ID yuklanmoqda'}${me.tgId ? ' (TG: ' + me.tgId + ')' : ''}`;
    }

    if (orderPreview) {
      orderPreview.textContent = buildGemsOrderText(_selectedGemsPackage, me);
    }
  }

  function openBuyGemsModal() {
    ensureBuyGemsModalDOM();
    const modal = document.getElementById('modalBuyGems');
    if (!modal) return;

    const uStats = window.userStats || { gems: 0 };
    const balEl = document.getElementById('buyGemsModalBalance');
    if (balEl) balEl.textContent = (uStats.gems || 0).toLocaleString('en-US');

    const packages = getGemsPackages();
    if (!_selectedGemsPackage || !packages.some(p => p.gems === _selectedGemsPackage.gems)) {
      _selectedGemsPackage = packages[1] || packages[0];
    }

    renderGemsPackages();
    modal.classList.remove('hidden');
  }

  // 8. O'YINCHI PROFIL KOLLEKSIYASI VA HADYA QILISH MODALI (#modalPlayerCollection)
  let _activeCollectionPlayerId = null;
  let _activeTransferItem = null;

  function ensurePlayerCollectionModalDOM() {
    if (document.getElementById('modalPlayerCollection')) return;

    const parent = document.getElementById('modalShop')?.parentElement || document.getElementById('lobbyView') || document.body;

    const modal = document.createElement('div');
    modal.id = 'modalPlayerCollection';
    modal.className = 'hidden fixed inset-0 z-[58] flex items-center justify-center p-2.5';
    modal.innerHTML = `
      <div class="ios-fh-sheet w-full max-w-4xl h-[94%] flex flex-col overflow-hidden">
        
        <!-- Yuqori Sarlavha -->
        <div class="ios-fh-nav shrink-0 h-[48px] px-4 flex items-center justify-between gap-2 border-b border-white/10">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-xl shrink-0">👑</span>
            <div class="min-w-0 leading-tight">
              <h2 id="collectionModalTitle" class="text-[14px] font-black tracking-tight text-white drop-shadow truncate">Sovg'alar Kolleksiyasi</h2>
              <span id="collectionModalSubtitle" class="text-[9px] text-amber-300 font-semibold truncate block">Profil ma'lumotlari</span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button id="btnCollectionHeaderAction" type="button" class="ios-fh-stat-pill px-3 py-1 rounded-full text-xs font-bold text-amber-300 border border-amber-400/50 hover:bg-white/10 transition">
              🛒 Do'konga o'tish
            </button>
            <button id="btnClosePlayerCollectionModal" type="button" class="ios-btn-circle" title="Yopish" aria-label="Yopish">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Profil Qutisi (Avatar, Ism, ELO, Obro', Jami Sovg'alar) -->
        <div class="shrink-0 p-3 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-white/10 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div id="collecUserAvatarBox" class="w-11 h-11 rounded-xl bg-slate-800 border border-amber-400/40 flex items-center justify-center text-xl shadow-lg shrink-0 overflow-hidden">
              👤
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span id="collecUserName" class="text-sm font-black text-white truncate max-w-[180px]">O'yinchi</span>
                <span id="collecUserElo" class="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded-full border border-sky-400/40 shrink-0">1,000 ELO</span>
              </div>
              <span id="collecUserId" class="text-[9.5px] font-mono text-slate-400 block mt-0.5">DOOM-XXXX</span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <div class="px-3 py-1.5 rounded-xl bg-amber-950/70 border border-amber-400/50 text-center">
              <span class="text-[8px] font-bold text-amber-300/80 uppercase tracking-wider block">Jami Obro'</span>
              <span id="collecUserPrestige" class="text-sm font-black font-mono text-amber-300">👑 0</span>
            </div>
            <div class="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-700 text-center">
              <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Sovg'alar</span>
              <span id="collecUserCount" class="text-sm font-black font-mono text-white">🎁 0 ta</span>
            </div>
          </div>
        </div>

        <!-- Kolleksiya Vitrinasi (Grid) -->
        <div class="flex-1 min-h-0 overflow-y-auto p-3 relative">
          <div id="playerCollectionGrid" class="grid grid-cols-3 gap-2.5"></div>
          <div id="playerCollectionEmpty" class="hidden py-16 text-center text-slate-400 space-y-2">
            <span class="text-3xl block">🎁</span>
            <div class="text-xs font-bold text-slate-300">Hozircha sovg'alar kolleksiyasi bo'sh</div>
            <p class="text-[10px] text-slate-500">Do'kondan sovg'a oling yoki 3D Oltin Sandiqdan eksklyuziv sovg'alarni yutib oling!</p>
          </div>

          <!-- Ichki Slayd/Transfer Paneli -->
          <div id="collecTransferPanel" class="hidden absolute inset-0 z-30 bg-slate-950/95 backdrop-blur-sm p-4 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between border-b border-white/10 pb-2">
                <div class="flex items-center gap-2">
                  <span class="text-xl">✈️</span>
                  <div>
                    <h3 class="text-xs font-black text-white">Sovg'ani Hadya Qilish</h3>
                    <span id="transferGiftNameLabel" class="text-[9px] text-amber-300 font-bold block">Sovg'a nomi</span>
                  </div>
                </div>
                <button id="btnCancelTransfer" type="button" class="ios-btn-circle text-xs" title="Bekor qilish">✕</button>
              </div>

              <div class="space-y-2.5 mt-3">
                <label class="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">Kimga hadya qilasiz?</label>
                <div id="transferFriendsList" class="max-h-36 overflow-y-auto space-y-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px]">
                  <div class="py-2 text-center text-slate-500">Do'stlar ro'yxati...</div>
                </div>

                <div>
                  <label class="text-[9.5px] text-slate-400 block mb-1">Tilak yoki xabar:</label>
                  <input id="inputTransferNote" type="text" maxlength="80" placeholder="Sizga chin dildan! 🌟" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
                </div>
              </div>
            </div>

            <div class="pt-2 border-t border-slate-800">
              <button id="btnConfirmTransfer" type="button" class="ios-btn-blue w-full py-2.5 text-xs font-black flex items-center justify-center gap-1.5">
                <span>✈️</span>
                <span>Hadya qilishni tasdiqlash</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
    `;

    parent.appendChild(modal);

    document.getElementById('btnClosePlayerCollectionModal').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    document.getElementById('btnCancelTransfer').addEventListener('click', () => {
      document.getElementById('collecTransferPanel').classList.add('hidden');
      _activeTransferItem = null;
    });

    document.getElementById('btnConfirmTransfer').addEventListener('click', executeGiftTransfer);
  }

  function openPlayerCollectionModal(playerId) {
    ensurePlayerCollectionModalDOM();
    const modal = document.getElementById('modalPlayerCollection');
    if (!modal) return;

    const me = getCurrentPlayerIdentity();
    const targetId = String(playerId || me.id).trim().toUpperCase();
    _activeCollectionPlayerId = targetId;

    const isSelf = (targetId === me.id.toUpperCase());

    // Sarlavha va tugma moslashuvi
    const titleEl = document.getElementById('collectionModalTitle');
    const subTitleEl = document.getElementById('collectionModalSubtitle');
    const actionBtn = document.getElementById('btnCollectionHeaderAction');

    if (isSelf) {
      titleEl.textContent = 'Mening Sovg\'alar Kolleksiyam';
      subTitleEl.textContent = 'Siz egalik qilayotgan barcha 3D sovg\'alar';
      actionBtn.textContent = '🛒 Do\'konga o\'tish';
      actionBtn.onclick = () => {
        modal.classList.add('hidden');
        openDigiGiftShopModal();
      };
    } else {
      titleEl.textContent = 'O\'yinchi Kolleksiyasi';
      subTitleEl.textContent = `${targetId} profilingizdagi sovg'alari`;
      actionBtn.textContent = '🎁 Sovg\'a yuborish';
      actionBtn.onclick = () => {
        modal.classList.add('hidden');
        openDigiGiftShopModal();
      };
    }

    // Serverdan o'yinchi kolleksiyasini yuklash
    fetch('/api/tg/gifts/player/' + encodeURIComponent(targetId))
      .then(res => res.json())
      .then(data => {
        if (data && data.ok) {
          renderPlayerCollectionData(data, isSelf);
        } else {
          // Fallback lokal
          renderPlayerCollectionFallback(targetId, isSelf);
        }
      })
      .catch(() => {
        renderPlayerCollectionFallback(targetId, isSelf);
      });

    modal.classList.remove('hidden');
  }

  function renderPlayerCollectionData(data, isSelf) {
    const p = data.player || {};
    const gifts = data.gifts || [];
    const catalog = getGiftsCatalog();

    document.getElementById('collecUserName').textContent = p.name || 'O\'yinchi';
    document.getElementById('collecUserElo').textContent = `${p.elo || 1000} ELO`;
    document.getElementById('collecUserId').textContent = p.id || 'DOOM-XXXX';
    document.getElementById('collecUserPrestige').textContent = `👑 ${(p.prestige || 0).toLocaleString('en-US')}`;
    document.getElementById('collecUserCount').textContent = `🎁 ${gifts.length} ta`;

    const avatarBox = document.getElementById('collecUserAvatarBox');
    if (p.photoUrl) {
      avatarBox.innerHTML = `<img src="${p.photoUrl}" alt="Avatar" class="w-full h-full object-cover" />`;
    } else {
      avatarBox.textContent = (p.name || 'U').charAt(0).toUpperCase();
    }

    const grid = document.getElementById('playerCollectionGrid');
    const emptyBox = document.getElementById('playerCollectionEmpty');
    grid.innerHTML = '';

    if (gifts.length === 0) {
      emptyBox.classList.remove('hidden');
      return;
    }
    emptyBox.classList.add('hidden');

    gifts.forEach(item => {
      const giftObj = catalog.find(g => g.id === item.giftId) || {
        id: item.giftId,
        name: item.giftName || 'Sovg\'a',
        rarity: item.rarity || 'common',
        icon: '🎁',
        glow: '#f59e0b'
      };
      const rarity = RARITY_MAP[giftObj.rarity] || RARITY_MAP.common;
      const imgUrl = getGiftImageUrl(giftObj.id);

      const card = document.createElement('div');
      card.className = `relative rounded-xl p-2 flex flex-col justify-between gap-1.5 select-none bg-gradient-to-b from-slate-900/90 to-slate-950 border ${rarity.border}`;

      let sourceText = '';
      if (item.source === 'bonus_case') {
        sourceText = '🧰 Oltin Sandiqdan';
      } else if (item.fromName) {
        sourceText = `👤 Kimdan: ${item.fromName}`;
      } else {
        sourceText = '🛒 Do\'kondan xarid';
      }

      card.innerHTML = `
        <div class="flex items-center justify-between gap-1 min-w-0">
          <span class="text-[10.5px] font-bold text-white truncate" title="${giftObj.name}">${giftObj.name}</span>
          <span class="text-[7.5px] font-bold px-1.5 py-0.2 rounded-full uppercase shrink-0 ${rarity.badge}">${rarity.name}</span>
        </div>

        <div class="h-[74px] w-full flex items-center justify-center relative overflow-hidden rounded-lg bg-[#050914]">
          <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(circle at 50% 50%, ${giftObj.glow}2e 0%, transparent 74%);"></div>
          <img src="${imgUrl}" alt="${giftObj.name}" class="max-h-[70px] max-w-[70px] scale-[1.08] object-contain relative z-10" style="-webkit-mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%); mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%);" />
        </div>

        <div class="space-y-1 pt-0.5 border-t border-white/5 text-[9px]">
          <div class="flex items-center justify-between text-amber-300 font-mono font-bold">
            <span>👑 +${(item.prestige || giftObj.prestige || 0).toLocaleString('en-US')}</span>
            <span class="text-[8px] text-slate-400 font-sans truncate max-w-[90px]">${sourceText}</span>
          </div>
          ${item.note ? `<p class="text-[8.5px] text-sky-200 italic truncate" title="${item.note}">"${item.note}"</p>` : ''}
          ${isSelf ? `
            <button type="button" class="btn-transfer-gift ios-btn-blue w-full py-1 text-[9px] font-bold rounded-lg mt-0.5">
              ✈️ Hadya qilish
            </button>
          ` : ''}
        </div>
      `;

      if (isSelf) {
        const trBtn = card.querySelector('.btn-transfer-gift');
        if (trBtn) {
          trBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openTransferGiftPanel(item, giftObj);
          });
        }
      }

      grid.appendChild(card);
    });
  }

  function renderPlayerCollectionFallback(targetId, isSelf) {
    const me = getCurrentPlayerIdentity();
    const uStats = window.userStats || { gifts: [], prestige: 0, elo: 1000 };
    renderPlayerCollectionData({
      player: {
        id: targetId,
        name: isSelf ? me.name : targetId,
        elo: uStats.elo || 1000,
        prestige: uStats.prestige || 0,
        photoUrl: isSelf ? me.photoUrl : ''
      },
      gifts: isSelf && Array.isArray(uStats.gifts) ? uStats.gifts : []
    }, isSelf);
  }

  let _transferTargetFriend = null;

  function openTransferGiftPanel(item, giftObj) {
    _activeTransferItem = item;
    _transferTargetFriend = null;
    const panel = document.getElementById('collecTransferPanel');
    const nameLabel = document.getElementById('transferGiftNameLabel');
    if (!panel) return;

    if (nameLabel) nameLabel.textContent = `${giftObj.icon} ${giftObj.name} (UID: ${item.uid || 'standart'})`;
    panel.classList.remove('hidden');

    const list = document.getElementById('transferFriendsList');
    list.innerHTML = '<div class="py-2 text-center text-slate-500">Do\'stlar ro\'yxati yuklanmoqda...</div>';

    const me = getCurrentPlayerIdentity();
    fetch('/api/tg/directory?myId=' + encodeURIComponent(me.id))
      .then(res => res.json())
      .then(data => {
        const friends = (data && data.myFriends) || [];
        if (friends.length === 0) {
          list.innerHTML = '<div class="py-2 text-center text-slate-500">Hozircha do\'stlar yo\'q. Avval Do\'stlar Hubidan do\'st qo\'shing.</div>';
          return;
        }

        list.innerHTML = '';
        friends.forEach(f => {
          const div = document.createElement('div');
          const isSel = _transferTargetFriend && _transferTargetFriend.id === f.id;
          div.className = `p-1.5 rounded-lg flex items-center justify-between cursor-pointer transition ${isSel ? 'bg-sky-950/90 border border-sky-400' : 'bg-slate-950/80 hover:bg-slate-900 border border-slate-800'}`;
          div.innerHTML = `
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs">👤</span>
              <span class="font-bold text-white truncate max-w-[120px]">${f.name || f.username || f.id}</span>
            </div>
            <span class="text-[9px] font-mono text-amber-300">👑 ${(f.prestige || 0).toLocaleString('en-US')}</span>
          `;
          div.addEventListener('click', () => {
            _transferTargetFriend = { id: f.id, name: f.name || f.username || f.id };
            openTransferGiftPanel(item, giftObj);
          });
          list.appendChild(div);
        });
      })
      .catch(() => {
        list.innerHTML = '<div class="py-2 text-center text-slate-500">Do\'stlarni yuklab bo\'lmadi</div>';
      });
  }

  function executeGiftTransfer() {
    if (!_activeTransferItem) return;
    if (!_transferTargetFriend) {
      if (typeof window.showToast === 'function') window.showToast('Iltimos, sovg\'a hadya qilinadigan do\'stni tanlang!', '⚠️');
      return;
    }

    const me = getCurrentPlayerIdentity();
    const btn = document.getElementById('btnConfirmTransfer');
    btn.disabled = true;
    btn.textContent = '⏳ Yuborilmoqda...';

    const payload = {
      fromId: me.id,
      toId: _transferTargetFriend.id,
      giftUid: _activeTransferItem.uid,
      note: (document.getElementById('inputTransferNote')?.value || '').trim().slice(0, 80)
    };

    fetch('/api/tg/gifts/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      btn.disabled = false;
      btn.textContent = '✈️ Hadya qilishni tasdiqlash';

      if (data && data.ok) {
        document.getElementById('collecTransferPanel').classList.add('hidden');
        if (data.fromStats && window.userStats) {
          if (Array.isArray(data.fromStats.gifts)) window.userStats.gifts = data.fromStats.gifts;
          if (typeof data.fromStats.prestige === 'number') window.userStats.prestige = data.fromStats.prestige;
          if (data.fromStats.giftSummary) window.userStats.giftSummary = data.fromStats.giftSummary;
        }

        if (typeof window.saveUserData === 'function') window.saveUserData();
        if (typeof window.updateMainMenuWidgets === 'function') window.updateMainMenuWidgets();
        renderDigiGiftShop();

        if (typeof window.playSound === 'function') window.playSound('victory_fanfare');
        if (typeof window.showToast === 'function') {
          window.showToast(`✈️ Sovg'a ${_transferTargetFriend.name} ga hadya qilindi!`, '🎁');
        }

        openPlayerCollectionModal(me.id);
      } else {
        const errMsg = (data && (data.message || data.error)) || 'Hadya qilib bo\'lmadi';
        if (typeof window.showToast === 'function') window.showToast(errMsg, '⚠️');
      }
    })
    .catch(err => {
      btn.disabled = false;
      btn.textContent = '✈️ Hadya qilishni tasdiqlash';
      console.error('Transfer error:', err);
      if (typeof window.showToast === 'function') window.showToast('Server bilan aloqa uzildi', '⚠️');
    });
  }

  function openDigiGiftShopModal() {
    if (typeof window.updateMainMenuWidgets === 'function') window.updateMainMenuWidgets();
    renderDigiGiftShop();
    const modalShop = document.getElementById('modalShop');
    if (modalShop) modalShop.classList.remove('hidden');
  }

  function onDigiGiftsUpdated() {
    renderDigiGiftShop();
    if (_currentGiftId && document.getElementById('modalGiftDetail') && !document.getElementById('modalGiftDetail').classList.contains('hidden')) {
      openGiftDetailModal(_currentGiftId);
    }
  }

  // 9. GLOBAL EXPORTS
  window.renderDigiGiftShop = renderDigiGiftShop;
  window.openDigiGiftShopModal = openDigiGiftShopModal;
  window.openGiftDetailModal = openGiftDetailModal;
  window.openBuyGemsModal = openBuyGemsModal;
  window.openPlayerCollectionModal = openPlayerCollectionModal;
  window.onDigiGiftsUpdated = onDigiGiftsUpdated;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureGiftsCustomStyles();
    });
  } else {
    ensureGiftsCustomStyles();
  }

})();
