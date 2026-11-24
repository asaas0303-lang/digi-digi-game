// ==============================================================================
// DIGI DIGI — ULTRA 3D SOVG'ALAR DO'KONI VA KRISTAL OYNASI (GIFTS-UI.JS)
// 2B-BOSQICH: Ultra-3D Renders, Telegram Star Gifts 3D Tilt, Safe-Area & 60 FPS
// ==============================================================================
(function () {
  'use strict';

  // 1. STATIK KONSTANTALAR VA VERSİYALASH
  const GIFT_IMG_VER = '20261124_2';
  const GIFT_IMG_EXT = 'webp';

  function getGiftImageUrl(giftId) {
    return '/img/gifts/' + encodeURIComponent(giftId) + '.' + GIFT_IMG_EXT + '?v=' + GIFT_IMG_VER;
  }
  window.getDigiGiftThumb = getGiftImageUrl;

  // Telegram Admin Lichkasi (Kristal sotib olish)
  const TELEGRAM_ADMIN_DEEP_LINK = 'tg://user?id=5155194813';
  const TELEGRAM_ADMIN_FALLBACK_URL = 'https://t.me/Abror444';

  // 5 ta Rasmiy Kristal Paketi
  const GEMS_PACKAGES = [
    { id: 'gems_50', gems: 50, priceUzs: 50000, bonus: '', badge: 'Boshlang\'ich' },
    { id: 'gems_120', gems: 120, priceUzs: 100000, bonus: '+20% BONUS', badge: 'Ommabop' },
    { id: 'gems_300', gems: 300, priceUzs: 250000, bonus: '+25% BONUS', badge: 'Tejamkor' },
    { id: 'gems_650', gems: 650, priceUzs: 50000, bonus: '+30% BONUS', badge: 'Yulduz' },
    { id: 'gems_1500', gems: 1500, priceUzs: 1000000, bonus: '+50% VIP BONUS', badge: '👑 VIP Elita' }
  ];

  // Nodirlik Ranglari va Nomlari
  const RARITY_MAP = {
    common: { name: 'Oddiy', color: '#94a3b8', border: 'border-slate-700/60', badge: 'bg-slate-800 text-slate-300' },
    rare: { name: 'Nodir', color: '#38bdf8', border: 'border-sky-500/50', badge: 'bg-sky-950/80 text-sky-300' },
    epic: { name: 'Epik', color: '#c084fc', border: 'border-purple-500/50', badge: 'bg-purple-950/80 text-purple-300' },
    legendary: { name: 'Afsonaviy', color: '#f59e0b', border: 'border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]', badge: 'bg-amber-950/80 text-amber-300' },
    mythic: { name: 'Mifik', color: '#f43f5e', border: 'border-rose-500/70 shadow-[0_0_16px_rgba(244,63,94,0.35)]', badge: 'bg-rose-950/80 text-rose-300' }
  };

  // 2. SOVG'ALAR KATALOGINI ANIQLASH (gifts-catalog.js dan yoki zaxira)
  function getGiftsCatalog() {
    if (Array.isArray(window.DIGI_GIFTS_CATALOG) && window.DIGI_GIFTS_CATALOG.length > 0) {
      return window.DIGI_GIFTS_CATALOG;
    }
    return [
      { id: 'rose_red', name: 'Qizil Atirgul', icon: '🌹', category: 'coins', price: 1500, rarity: 'common', prestige: 5, desc: 'Muhabbat va ehtirom ramzi bo\'lgan baxmal bargli qizil atirgul.', glow: '#ef4444' },
      { id: 'teddy_bear', name: 'Teddi Ayiqcha', icon: '🧸', category: 'coins', price: 3500, rarity: 'common', prestige: 12, desc: 'Yumshoq va do\'stona ayiqcha, oltin bantikli.', glow: '#f59e0b' },
      { id: 'royal_bouquet', name: 'Qirollik Guldastasi', icon: '💐', category: 'coins', price: 7000, rarity: 'rare', prestige: 25, desc: 'Eng sara qizil va oltin gullardan yasalgan hashamatli guldasta.', glow: '#ec4899' },
      { id: 'party_cake', name: 'Bayram Torti', icon: '🎂', category: 'coins', price: 12000, rarity: 'rare', prestige: 45, desc: '3 qavatli qulupnayli shirin bayram torti.', glow: '#fb7185' },
      { id: 'gold_champagne', name: 'Oltin Shampan', icon: '🍾', category: 'coins', price: 20000, rarity: 'epic', prestige: 75, desc: 'Muzli oltin chelakda taqdim etiladigan elita shampan vinosi.', glow: '#facc15' },
      { id: 'diamond_ring', name: 'Olmos Uzuk', icon: '💍', category: 'coins', price: 35000, rarity: 'epic', prestige: 140, desc: 'Toza olmos bilan bezatilgan 18K oq oltin uzuk.', glow: '#38bdf8' },
      { id: 'tactical_medal', name: 'Oltin Taktik Medalyon', icon: '🎖️', category: 'bonus', price: 0, rarity: 'rare', prestige: 50, desc: 'Jang maydonidagi jasorat uchun beriladigan qanotli yulduzli medal.', glow: '#f59e0b' },
      { id: 'karambit_neon', name: 'Karambit Neon', icon: '🗡️', category: 'bonus', price: 0, rarity: 'epic', prestige: 100, desc: 'Kiberpank neon moviy jiloli taktik karambit pichog\'i.', glow: '#06b6d4' },
      { id: 'titan_shield', name: 'Titan Qalqon', icon: '🛡️', category: 'bonus', price: 0, rarity: 'legendary', prestige: 200, desc: 'Oltin burgutli, singmas titan va moviy neon himoyasi.', glow: '#38bdf8' },
      { id: 'golden_dragon', name: 'Oltin Ajdar', icon: '🐉', category: 'bonus', price: 0, rarity: 'mythic', prestige: 500, desc: 'Qizil yoqut ko\'zli, 24K toza oltindan quyilgan ulug\'vor ajdar.', glow: '#eab308' },
      { id: 'gold_watch', name: 'Oltin Soat', icon: '⌚', category: 'gems', price: 35, uzsPrice: 35000, rarity: 'epic', prestige: 150, desc: 'Skelet siferblatli, mukammal mexanizmga ega 24K oltin soat.', glow: '#f59e0b' },
      { id: 'blue_brilliant', name: 'Moviy Brilliant', icon: '💎', category: 'gems', price: 80, uzsPrice: 80000, rarity: 'legendary', prestige: 350, desc: 'Noyob 57 qirrali nur taratuvchi moviy olmos marvaridi.', glow: '#00f2fe' },
      { id: 'emperor_crown', name: 'Imperator Toji', icon: '👑', category: 'gems', price: 150, uzsPrice: 150000, rarity: 'legendary', prestige: 700, desc: 'Qizil baxmalli, yoqut-zumradli imperatorlik toji.', glow: '#fbbf24' },
      { id: 'gold_hypercar', name: 'Oltin Giperkar', icon: '🏎️', category: 'gems', price: 300, uzsPrice: 300000, rarity: 'mythic', prestige: 1500, desc: 'Aerodinamik karbon-oltin korpusli 1500 ot kuchli superkar.', glow: '#f59e0b' },
      { id: 'private_jet', name: 'Shaxsiy Biznes-Jet', icon: '✈️', category: 'gems', price: 600, uzsPrice: 60000, rarity: 'mythic', prestige: 3000, desc: 'Platina va oltin qanotli hashamatli shaxsiy samolyot.', glow: '#e2e8f0' }
    ];
  }

  // 3. MAXSUS CSS STILLARNI SAHNAGA JOYLASHTIRISH (SAFE-AREA VA 3D TILT UCHUN)
  function ensureGiftsCustomStyles() {
    if (document.getElementById('digi-gifts-custom-css')) return;
    const style = document.createElement('style');
    style.id = 'digi-gifts-custom-css';
    style.textContent = `
      /* Telegram Star Gifts Uslubidagi Silliq 3D Suzish */
      @keyframes digiGiftIdleFloat {
        0%, 100% {
          transform: rotateY(-5deg) rotateX(3deg) translateY(0px);
        }
        50% {
          transform: rotateY(5deg) rotateX(-3deg) translateY(-5px);
        }
      }
      .digi-gift-card-idle {
        animation: digiGiftIdleFloat 4.2s ease-in-out infinite;
      }

      /* Golografik Yorug'lik Chizig'i */
      .digi-gift-sheen {
        pointer-events: none;
        transition: opacity 0.2s ease-out, transform 0.1s ease-out;
      }

      /* Uchqunlar */
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

      /* 90° Yonbosh rejimda Telegram Safe-Area Himoyasi (#modalGiftDetail, #modalBuyGems, #modalShop) */
      #lobbyView.digi-lobby-rot90 #modalGiftDetail,
      #lobbyView.digi-lobby-rot90 #modalBuyGems,
      #lobbyView.digi-lobby-rot90 #modalShop {
        padding: 8px 14px 8px max(66px, calc(var(--digi-safe-left, 58px) + 8px)) !important;
      }
      #lobbyView.digi-lobby-rot90 #modalGiftDetail > div,
      #lobbyView.digi-lobby-rot90 #modalBuyGems > div,
      #lobbyView.digi-lobby-rot90 #modalShop > div {
        height: 95% !important;
        max-height: 95% !important;
      }
    `;
    document.head.appendChild(style);
  }

  // 4. DO'KON VITRINASI (#modalShop -> #giftShopGrid)
  let _activeFilter = 'all';

  function renderDigiGiftShop() {
    ensureGiftsCustomStyles();
    const container = document.getElementById('giftShopGrid');
    if (!container) return;

    const catalog = getGiftsCatalog();
    const uStats = window.userStats || { coins: 0, gems: 0, gifts: [] };
    const myGiftsMap = {};
    if (Array.isArray(uStats.gifts)) {
      uStats.gifts.forEach(g => {
        const gid = typeof g === 'string' ? g : g.id;
        myGiftsMap[gid] = (myGiftsMap[gid] || 0) + (g.count || 1);
      });
    }

    // Filtr tablari listenerlarini o'rnatish
    const tabsContainer = document.getElementById('giftShopTabs');
    if (tabsContainer && !tabsContainer._bound) {
      tabsContainer._bound = true;
      tabsContainer.querySelectorAll('button[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          _activeFilter = btn.getAttribute('data-filter') || 'all';
          tabsContainer.querySelectorAll('button[data-filter]').forEach(b => {
            b.classList.remove('active', 'bg-white/15', 'text-white', 'border-white/20');
            b.classList.add('text-slate-300', 'border-white/10');
          });
          btn.classList.add('active', 'bg-white/15', 'text-white', 'border-white/20');
          btn.classList.remove('text-slate-300', 'border-white/10');
          renderDigiGiftShop();
        });
      });
    }

    container.innerHTML = '';

    const filtered = catalog.filter(g => {
      if (_activeFilter === 'all') return true;
      return g.category === _activeFilter;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-span-3 py-10 text-center text-slate-400 text-xs">
          Bu bo'limda hozircha sovg'alar mavjud emas
        </div>
      `;
      return;
    }

    filtered.forEach(gift => {
      const rarity = RARITY_MAP[gift.rarity] || RARITY_MAP.common;
      const ownedCount = myGiftsMap[gift.id] || 0;
      const imgUrl = getGiftImageUrl(gift.id);

      let priceHtml = '';
      if (gift.category === 'coins') {
        priceHtml = `<span class="text-amber-300 font-mono font-extrabold text-[10px]">$${gift.price.toLocaleString('en-US')}</span>`;
      } else if (gift.category === 'bonus') {
        priceHtml = `<span class="text-amber-400 font-bold text-[9px] flex items-center gap-0.5">🎰 Sandiq</span>`;
      } else if (gift.category === 'gems') {
        priceHtml = `<span class="text-cyan-300 font-mono font-extrabold text-[10px] flex items-center gap-0.5">💎 ${gift.price}</span>`;
      }

      const card = document.createElement('div');
      card.className = `relative rounded-xl p-2 flex flex-col justify-between gap-1.5 cursor-pointer active:scale-95 transition-all duration-150 select-none bg-gradient-to-b from-slate-900/90 to-slate-950 border ${rarity.border} hover:border-sky-400/70`;

      card.innerHTML = `
        <!-- Tepada: Nomi va Nodirlik belgisi -->
        <div class="flex items-center justify-between gap-1 min-w-0">
          <span class="text-[11px] font-bold text-white truncate" title="${gift.name}">${gift.name}</span>
          <span class="text-[8px] font-bold px-1.5 py-0.2 rounded-full uppercase shrink-0 ${rarity.badge}">${rarity.name}</span>
        </div>

        <!-- O'rtada: Seamless Ultra-3D Rasm Sahna (Radial Niqob va Aura bilan) -->
        <div class="h-[92px] w-full flex items-center justify-center relative overflow-hidden rounded-lg bg-[#050914]" style="box-shadow: inset 0 2px 10px rgba(0,0,0,0.85);">
          <!-- Radial Aura -->
          <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(circle at 50% 50%, ${gift.glow}2e 0%, transparent 74%);"></div>
          
          <!-- Ultra-3D Rasm -->
          <img src="${imgUrl}" 
               alt="${gift.name}" 
               class="max-h-[82px] max-w-[82px] object-contain relative z-10 transition-transform duration-200 group-hover:scale-105"
               style="-webkit-mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%); mask-image: radial-gradient(circle at 50% 50%, #000 62%, transparent 98%);"
               loading="lazy" 
               decoding="async" 
               draggable="false"
               onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-3xl select-none\\'>${gift.icon}</span>';" />

          ${ownedCount > 0 ? `
            <span class="absolute bottom-1 right-1 z-20 text-[8.5px] font-mono font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 px-1.5 py-0.2 rounded-full shadow">
              x${ownedCount}
            </span>
          ` : ''}
        </div>

        <!-- Pastda: Narx va Obro' -->
        <div class="flex items-center justify-between gap-1 pt-0.5 border-t border-white/5 text-[9.5px]">
          <div class="min-w-0 truncate">${priceHtml}</div>
          <span class="text-amber-400/90 font-mono font-bold shrink-0 text-[8.5px]">+${gift.prestige} ⭐</span>
        </div>
      `;

      card.addEventListener('click', () => {
        openGiftDetailModal(gift.id);
      });

      container.appendChild(card);
    });
  }

  // 5. 360° INTERAKTIV 3D DETAIL VA SOVG'A YUBORISH MODALI (#modalGiftDetail)
  let _currentGiftId = null;
  let _detailMode = 'buy'; // 'buy' yoki 'send'
  let _selectedFriend = null;

  function ensureGiftDetailModalDOM() {
    if (document.getElementById('modalGiftDetail')) return;

    // #modalShop bilan aynan bir xil ota-elementga inject qilish (90° rotatsiya va Safe-Area to'g'ri ishlashi uchun)
    const parent = document.getElementById('modalShop')?.parentElement || document.getElementById('lobbyView') || document.body;

    const modal = document.createElement('div');
    modal.id = 'modalGiftDetail';
    modal.className = 'hidden fixed inset-0 z-[55] flex items-center justify-center p-2.5';
    modal.innerHTML = `
      <div class="ios-fh-sheet w-full max-w-4xl h-[94%] flex flex-col overflow-hidden">
        
        <!-- Yuqori Sarlavha (Safe-Area chekinish bilan pl-4) -->
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

        <!-- 2 Ustunli Asosiy Tarkib: Chap — 3D Tilt Sahnasi | O'ng — Xarid / Yuborish -->
        <div class="grid grid-cols-2 gap-3 p-3 flex-1 min-h-0 overflow-hidden">
          
          <!-- CHAP USTUN: Telegram Star Gifts Uslubidagi 3D Tilt + Parallax Sahna -->
          <div class="ios-bonus-stage relative flex-1 min-h-0 overflow-hidden flex flex-col justify-between items-center p-2.5 rounded-2xl bg-gradient-to-b from-[#070c18] to-[#03060d] border border-white/10 min-w-0">
            
            <!-- Yuqori qism: 3D Tilt Sahnasi -->
            <div id="giftDetailStage" class="flex-1 min-h-0 w-full flex items-center justify-center relative select-none" style="perspective: 850px; touch-action: none;">
              <div id="giftDetail3DCard" class="digi-gift-card-idle relative flex items-center justify-center" style="transform-style: preserve-3d; transition: transform 0.12s ease-out; will-change: transform;">
                <!-- 1) Orqa neon aura -->
                <div id="giftDetailAura" class="absolute w-[210px] h-[210px] rounded-full pointer-events-none" style="filter: blur(28px); opacity: 0.45; transform: translateZ(-20px);"></div>
                
                <!-- 2) Ultra-3D Sovg'a Rasmi (175x175 + radial niqob) -->
                <img id="giftDetailImg" 
                     src="" 
                     alt="Gift" 
                     class="w-[175px] h-[175px] object-contain pointer-events-none select-none relative z-10" 
                     style="-webkit-mask-image: radial-gradient(circle at 50% 50%, #000 64%, transparent 98%); mask-image: radial-gradient(circle at 50% 50%, #000 64%, transparent 98%); transform: translateZ(26px);" 
                     draggable="false" />
                
                <!-- 3) Dinamik golografik jilo -->
                <div id="giftDetailSheen" class="digi-gift-sheen absolute inset-0 rounded-2xl pointer-events-none z-20" style="mix-blend-mode: screen; opacity: 0.28; background: linear-gradient(135deg, transparent 20%, rgba(255,255,255,0.7) 48%, rgba(255,215,0,0.6) 52%, transparent 75%); transform: translateZ(32px);"></div>
                
                <!-- 4) Uchqunlar (Sparks) -->
                <div id="giftDetailSparks" class="absolute inset-0 pointer-events-none z-20"></div>
              </div>
            </div>

            <!-- Pastki qism: Izoh + To'liq Tavsif (kesilmaydi!) + Obro' -->
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

          <!-- O'NG USTUN: Xarid va Boshqa O'yinchiga Yuborish Paneli -->
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

              <!-- Faqat 3D Oltin Sandiqdan chiqadigan sovg'alar uchun ogohlantirish -->
              <div id="giftBonusOnlyBox" class="hidden p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-center space-y-1">
                <div class="text-xs font-bold text-amber-300">🎰 Maxsus Sandiq Sovg'asi!</div>
                <p class="text-[10px] text-slate-300">Bu sovg'ani to'g'ridan-to'g'ri sotib olib bo'lmaydi. Uni <b>Bosh menyu -> BONUS</b> bo'limidagi 3D Oltin Sandiqni ochib yutib olishingiz mumkin!</p>
                <button id="btnGoToBonusCase" type="button" class="ios-btn-gold px-4 py-1.5 text-xs font-bold mt-1 inline-block">
                  🧰 Oltin Sandiqqa o'tish
                </button>
              </div>

              <!-- Hadya Yuborish Bo'limi (send rejimida ko'rinadi) -->
              <div id="giftSendPanel" class="hidden space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Kimga yuborasiz?</label>
                  <span id="selectedFriendNameLabel" class="text-[10px] text-sky-400 font-semibold truncate max-w-[140px]">Tanlanmagan</span>
                </div>

                <!-- O'yinchilar qidirish / tanlash tablari -->
                <div class="flex gap-1 text-[10px]">
                  <button id="subTabFriends" type="button" class="px-2.5 py-1 rounded-md bg-white/10 text-white font-bold">Do'stlar</button>
                  <button id="subTabOnline" type="button" class="px-2.5 py-1 rounded-md text-slate-400 hover:text-white">Barchasi</button>
                  <button id="subTabId" type="button" class="px-2.5 py-1 rounded-md text-slate-400 hover:text-white">ID orqali</button>
                </div>

                <!-- O'yinchilar ro'yxati -->
                <div id="giftFriendsList" class="max-h-28 overflow-y-auto space-y-1 p-1 rounded-xl bg-slate-950/90 border border-slate-800 text-[10px]">
                  <div class="py-3 text-center text-slate-500">O'yinchilar ro'yxati yuklanmoqda...</div>
                </div>

                <!-- Telegram ID qo'lda kiritish -->
                <div id="giftCustomIdBox" class="hidden">
                  <input id="inputGiftTargetId" type="text" placeholder="Telegram ID yoki @username" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
                </div>

                <!-- Sovg'a tilagi (ixtiyoriy) -->
                <div>
                  <label class="text-[9.5px] text-slate-400 block mb-1">Tilak yoki xabar (ixtiyoriy):</label>
                  <input id="inputGiftMessage" type="text" maxlength="60" placeholder="Tabriklayman! 🎉" class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
                </div>
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

    // Event listenerlar
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

    document.getElementById('btnGoToBonusCase').addEventListener('click', () => {
      closeGiftDetailModal();
      document.getElementById('modalShop').classList.add('hidden');
      const bonusBtn = document.getElementById('menuBtnBonus');
      if (bonusBtn) bonusBtn.click();
    });

    // 3D Tilt Gesture Handler o'rnatish
    initGiftDetail3DTilt();

    // Harakat tugmasi (Sotib olish / Yuborish)
    document.getElementById('btnConfirmGiftAction').addEventListener('click', handleGiftActionSubmit);
  }

  // 6. 3D TILT VA PARALLAX GESTURE HANDLER
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
        // 90° soat strelkasi bo'yicha burilgan ekranda o'qlar almashinadi
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

    fetch('/api/tg/directory?limit=25')
      .then(res => res.json())
      .then(data => {
        const players = (data && data.players) || [];
        if (players.length === 0) {
          list.innerHTML = '<div class="py-2 text-center text-slate-500 text-[10px]">Hozircha o\'yinchilar topilmadi</div>';
          return;
        }

        const myId = String((window.telegramUser && window.telegramUser.id) || '');
        const otherPlayers = players.filter(p => String(p.id) !== myId);

        list.innerHTML = '';
        otherPlayers.forEach(p => {
          const item = document.createElement('div');
          const isSel = _selectedFriend && String(_selectedFriend.id) === String(p.id);
          item.className = `p-1.5 rounded-lg flex items-center justify-between cursor-pointer transition ${isSel ? 'bg-sky-950/80 border border-sky-400/60' : 'bg-slate-900/60 hover:bg-slate-800/80 border border-transparent'}`;
          item.innerHTML = `
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">👤</span>
              <span class="font-bold text-white truncate max-w-[110px]">${p.firstName || p.username || 'O\'yinchi'}</span>
            </div>
            <span class="text-[9px] font-mono text-amber-300">${p.elo || 1000} ELO</span>
          `;
          item.addEventListener('click', () => {
            _selectedFriend = { id: p.id, name: p.firstName || p.username || 'O\'yinchi' };
            document.getElementById('selectedFriendNameLabel').textContent = _selectedFriend.name;
            updateDetailModeUI();
            loadGiftRecipients();
          });
          list.appendChild(item);
        });
      })
      .catch(() => {
        list.innerHTML = '<div class="py-2 text-center text-slate-500 text-[10px]">Do\'stlar ro\'yxatini yuklab bo\'lmadi</div>';
      });
  }

  function openGiftDetailModal(giftId) {
    ensureGiftDetailModalDOM();
    const catalog = getGiftsCatalog();
    const gift = catalog.find(g => g.id === giftId);
    if (!gift) return;

    _currentGiftId = giftId;
    _detailMode = 'buy';
    _selectedFriend = null;

    const modal = document.getElementById('modalGiftDetail');
    const rarity = RARITY_MAP[gift.rarity] || RARITY_MAP.common;
    const uStats = window.userStats || { coins: 0, gems: 0, gifts: [] };

    document.getElementById('giftDetailIcon').textContent = gift.icon;
    document.getElementById('giftDetailTitle').textContent = gift.name;
    const rBadge = document.getElementById('giftDetailRarityBadge');
    rBadge.textContent = rarity.name;
    rBadge.className = `text-[9px] font-bold uppercase tracking-wider ${rarity.badge}`;

    // 3D Sahnaga rasmni yuklash
    const imgEl = document.getElementById('giftDetailImg');
    if (imgEl) {
      imgEl.src = getGiftImageUrl(gift.id);
    }

    // Aura rangini sovg'aga moslash
    const aura = document.getElementById('giftDetailAura');
    if (aura) {
      aura.style.background = `radial-gradient(circle, ${gift.glow}80 0%, ${gift.glow}15 65%, transparent 75%)`;
    }

    // Uchqunlar (Nodir/Epik/Afsonaviy/Mifik uchun)
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

    // Tavsif va Obro'
    document.getElementById('giftDetailDesc').textContent = gift.desc || '';
    document.getElementById('giftDetailPrestige').textContent = `👑 +${gift.prestige} Obro'`;

    let ownedCount = 0;
    if (Array.isArray(uStats.gifts)) {
      uStats.gifts.forEach(g => {
        const gid = typeof g === 'string' ? g : g.id;
        if (gid === gift.id) ownedCount += (g.count || 1);
      });
    }
    document.getElementById('giftDetailOwnedBadge').textContent = `Sizda bor: ${ownedCount} ta`;

    // Narx va Balans
    const priceLbl = document.getElementById('giftDetailPriceLabel');
    const balLbl = document.getElementById('giftDetailBalanceLabel');
    const bonusBox = document.getElementById('giftBonusOnlyBox');
    const btnAction = document.getElementById('btnConfirmGiftAction');

    if (gift.category === 'coins') {
      priceLbl.textContent = `$${gift.price.toLocaleString('en-US')}`;
      balLbl.textContent = `$${(uStats.coins || 0).toLocaleString('en-US')}`;
      bonusBox.classList.add('hidden');
      btnAction.classList.remove('hidden');
    } else if (gift.category === 'gems') {
      priceLbl.textContent = `💎 ${gift.price} Kristal`;
      balLbl.textContent = `💎 ${(uStats.gems || 0).toLocaleString('en-US')}`;
      bonusBox.classList.add('hidden');
      btnAction.classList.remove('hidden');
    } else if (gift.category === 'bonus') {
      priceLbl.textContent = '🎰 Faqat Sandiqdan';
      balLbl.textContent = 'Oltin Sandiq';
      bonusBox.classList.remove('hidden');
      btnAction.classList.add('hidden');
    }

    updateDetailModeUI();
    modal.classList.remove('hidden');
  }

  function closeGiftDetailModal() {
    const modal = document.getElementById('modalGiftDetail');
    if (modal) modal.classList.add('hidden');
    _currentGiftId = null;
  }

  // Sotib olish yoki Yuborish API chaqiruvi
  function handleGiftActionSubmit() {
    const catalog = getGiftsCatalog();
    const gift = catalog.find(g => g.id === _currentGiftId);
    if (!gift) return;

    const uStats = window.userStats || { coins: 0, gems: 0, gifts: [] };
    const btn = document.getElementById('btnConfirmGiftAction');

    // Valyuta tekshiruvi
    if (gift.category === 'coins') {
      if ((uStats.coins || 0) < gift.price) {
        if (typeof window.showToast === 'function') {
          window.showToast('Tangalar yetarli emas! 777 Ruletkani aylantiring.', '⚠️');
        }
        return;
      }
    } else if (gift.category === 'gems') {
      if ((uStats.gems || 0) < gift.price) {
        if (typeof window.showToast === 'function') {
          window.showToast('Kristallar yetarli emas! Kristal do\'konidan xarid qiling.', '💎');
        }
        openBuyGemsModal();
        return;
      }
    }

    if (_detailMode === 'send' && !_selectedFriend) {
      if (typeof window.showToast === 'function') {
        window.showToast('Iltimos, sovg\'a yuboriladigan o\'yinchini tanlang!', '⚠️');
      }
      return;
    }

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '⏳ Bajarilmoqda...';

    const endpoint = _detailMode === 'buy' ? '/api/gifts/buy' : '/api/gifts/send';
    const tgEndpoint = _detailMode === 'buy' ? '/api/tg/gifts/buy' : '/api/tg/gifts/send';

    const payload = {
      giftId: gift.id,
      recipientId: _selectedFriend ? _selectedFriend.id : null,
      message: (document.getElementById('inputGiftMessage')?.value || '').trim()
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .catch(() => {
      // Telegram endpointiga zaxira urinish
      return fetch(tgEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    })
    .then(res => res.json())
    .then(data => {
      btn.disabled = false;
      btn.innerHTML = oldText;

      if (data && data.success) {
        if (_detailMode === 'buy') {
          if (gift.category === 'coins') uStats.coins -= gift.price;
          else if (gift.category === 'gems') uStats.gems -= gift.price;
          if (!Array.isArray(uStats.gifts)) uStats.gifts = [];
          uStats.gifts.push({ id: gift.id, count: 1 });
        } else {
          if (gift.category === 'coins') uStats.coins -= gift.price;
          else if (gift.category === 'gems') uStats.gems -= gift.price;
        }

        if (typeof window.saveUserData === 'function') window.saveUserData();
        if (typeof window.updateMainMenuWidgets === 'function') window.updateMainMenuWidgets();
        renderDigiGiftShop();

        if (typeof window.playSound === 'function') window.playSound('victory_fanfare');
        if (typeof window.showToast === 'function') {
          if (_detailMode === 'buy') {
            window.showToast(`🎉 ${gift.name} kolleksiyangizga qo'shildi!`, '🎁');
          } else {
            window.showToast(`🎉 ${gift.name} ${_selectedFriend.name} ga yuborildi!`, '✈️');
          }
        }
        closeGiftDetailModal();
      } else {
        const errMsg = (data && data.error) || 'Xaridni amalga oshirib bo\'lmadi';
        if (typeof window.showToast === 'function') window.showToast(errMsg, '⚠️');
      }
    })
    .catch(err => {
      btn.disabled = false;
      btn.innerHTML = oldText;
      console.error('Gift action error:', err);
      // Agar oflayn rejimda bo'lsa lokal sinov uchun
      if (gift.category === 'coins') {
        uStats.coins -= gift.price;
        if (!Array.isArray(uStats.gifts)) uStats.gifts = [];
        uStats.gifts.push({ id: gift.id, count: 1 });
        if (typeof window.saveUserData === 'function') window.saveUserData();
        if (typeof window.updateMainMenuWidgets === 'function') window.updateMainMenuWidgets();
        renderDigiGiftShop();
        if (typeof window.showToast === 'function') window.showToast(`🎉 ${gift.name} qabul qilindi!`, '🎁');
        closeGiftDetailModal();
      }
    });
  }

  // 7. 💎 KRISTAL SOTIB OLISH MODALI (#modalBuyGems)
  let _selectedGemsPackage = GEMS_PACKAGES[0];

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
            <div class="ios-fh-stat-pill px-3 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-mono font-extrabold text-cyan-300 border border-cyan-400/50">
              <span>💎</span>
              <span id="buyGemsModalBalance">0</span>
            </div>
            <button id="btnCloseBuyGemsModal" type="button" class="ios-btn-circle" title="Yopish" aria-label="Yopish">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- 2 Ustunli Tarkib: Chap — Paketlar | O'ng — Buyurtma va Telegram Admin Lichkasi -->
        <div class="grid grid-cols-2 gap-3 p-3 flex-1 min-h-0 overflow-hidden">
          
          <!-- CHAP: 5 ta Tayyor Paket Ro'yxati -->
          <div class="ios-fh-group p-3 flex flex-col justify-between gap-2 min-h-0 overflow-y-auto">
            <div>
              <div class="flex items-center justify-between px-1 mb-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-amber-300">Kristal Paketlari</span>
                <span class="text-[9.5px] text-slate-400">Kerakli paketni tanlang:</span>
              </div>
              <div id="gemsPackagesList" class="space-y-2"></div>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[9.5px] text-slate-400 leading-relaxed">
              ℹ️ <b>Eslatma:</b> Kristallar faqat admin orqali rasmiy ravishda hisobingizga qo'shiladi. O'yin ichida to'lov cheki yuborilgach, 1 daqiqa ichida hisobingiz to'ldiriladi!
            </div>
          </div>

          <!-- O'NG: Buyurtma Tafsilotlari va Adminga Yuborish -->
          <div class="ios-fh-group p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-y-auto">
            <div class="space-y-3">
              
              <!-- Tanlangan Paket Xulosasi -->
              <div class="p-3 rounded-2xl bg-gradient-to-b from-sky-950/60 to-slate-950 border border-sky-400/40 text-center relative overflow-hidden">
                <span class="text-[10px] font-bold text-sky-300 uppercase tracking-wider">Tanlangan Paket</span>
                <div id="summaryGemsAmount" class="text-3xl font-black font-mono text-cyan-200 mt-1">💎 50</div>
                <div id="summaryGemsPrice" class="text-sm font-extrabold text-amber-300 font-mono mt-0.5">50,000 so'm</div>
              </div>

              <!-- Foydalanuvchi ID si va Nusxalash -->
              <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="text-[9.5px] text-slate-400 block">Sizning O'yin ID:</span>
                  <span id="buyGemsUserIdLabel" class="text-xs font-mono font-bold text-white truncate block">--</span>
                </div>
                <button id="btnCopyOrderId" type="button" class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold shrink-0 transition">
                  📋 Nusxalash
                </button>
              </div>

              <!-- Adminga yuboriladigan tayyor matn -->
              <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                <span class="text-[9.5px] text-slate-400 block">Adminga yuboriladigan buyurtma:</span>
                <div id="buyGemsOrderTextPreview" class="text-[10.5px] font-mono text-cyan-100 bg-slate-900/90 p-2 rounded-lg border border-slate-800 whitespace-pre-wrap leading-tight">
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

    document.getElementById('btnCopyOrderId').addEventListener('click', () => {
      const txt = document.getElementById('buyGemsOrderTextPreview').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt);
        if (typeof window.showToast === 'function') window.showToast('Buyurtma xabari nusxalandi!', '📋');
      }
    });

    document.getElementById('btnOpenTelegramAdmin').addEventListener('click', () => {
      const orderTxt = document.getElementById('buyGemsOrderTextPreview').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(orderTxt);
      }
      if (typeof window.showToast === 'function') {
        window.showToast('Buyurtma nusxalandi, Telegram ochilmoqda...', '✈️');
      }

      // Telegram chuqur havolasi
      try {
        window.location.href = TELEGRAM_ADMIN_DEEP_LINK;
      } catch (e) {
        window.open(TELEGRAM_ADMIN_FALLBACK_URL, '_blank');
      }
      setTimeout(() => {
        window.open(TELEGRAM_ADMIN_FALLBACK_URL, '_blank');
      }, 500);
    });
  }

  function renderGemsPackages() {
    const list = document.getElementById('gemsPackagesList');
    if (!list) return;

    list.innerHTML = '';
    GEMS_PACKAGES.forEach(pkg => {
      const isSel = _selectedGemsPackage && _selectedGemsPackage.id === pkg.id;
      const card = document.createElement('div');
      card.className = `p-2 rounded-xl flex items-center justify-between cursor-pointer transition select-none ${isSel ? 'bg-cyan-950/70 border border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-900/60 hover:bg-slate-850 border border-slate-800'}`;

      card.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xl">💎</span>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-mono font-black text-white">${pkg.gems} Kristal</span>
              ${pkg.bonus ? `<span class="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/50">${pkg.bonus}</span>` : ''}
            </div>
            <span class="text-[9px] text-slate-400">${pkg.badge}</span>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs font-mono font-extrabold text-amber-300">${pkg.priceUzs.toLocaleString('en-US')} so'm</div>
          <span class="text-[8.5px] text-cyan-300">${(pkg.priceUzs / pkg.gems).toFixed(0)} so'm/💎</span>
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
    if (summaryPrice) summaryPrice.textContent = `${_selectedGemsPackage.priceUzs.toLocaleString('en-US')} so'm`;

    const uId = (window.telegramUser && window.telegramUser.id) || (window.userStats && window.userStats.id) || 'Noma\'lum';
    const uName = (window.telegramUser && (window.telegramUser.username || window.telegramUser.first_name)) || 'O\'yinchi';
    if (userLabel) userLabel.textContent = `${uName} (ID: ${uId})`;

    if (orderPreview) {
      orderPreview.textContent = 
`Assalomu alaykum, DIGI DIGI Kristal buyurtmasi:
💎 Paket: ${_selectedGemsPackage.gems} Kristal (${_selectedGemsPackage.priceUzs.toLocaleString('en-US')} so'm)
👤 O'yinchi: ${uName}
🆔 Telegram ID: ${uId}
To'lov rekvizitlarini yuborsangiz.`;
    }
  }

  function openBuyGemsModal() {
    ensureBuyGemsModalDOM();
    const modal = document.getElementById('modalBuyGems');
    if (!modal) return;

    const uStats = window.userStats || { gems: 0 };
    const balEl = document.getElementById('buyGemsModalBalance');
    if (balEl) balEl.textContent = (uStats.gems || 0).toLocaleString('en-US');

    renderGemsPackages();
    modal.classList.remove('hidden');
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

  // 8. GLOBAL EXPORTS
  window.renderDigiGiftShop = renderDigiGiftShop;
  window.openDigiGiftShopModal = openDigiGiftShopModal;
  window.openGiftDetailModal = openGiftDetailModal;
  window.openBuyGemsModal = openBuyGemsModal;
  window.onDigiGiftsUpdated = onDigiGiftsUpdated;

  // Sahifa yuklanganda do'konni tayyorlab qo'yish
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureGiftsCustomStyles();
    });
  } else {
    ensureGiftsCustomStyles();
  }

})();
