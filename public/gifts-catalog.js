(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const api = factory();
    root.DIGI_GIFTS_CATALOG = api.GIFTS_CATALOG;
    root.DIGI_GEMS_CONFIG = api.GEMS_CONFIG;
    root.DIGI_GIFTS_API = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const GEMS_CONFIG = {
    uzsPerGem: 1000,
    adminTgId: 5155194813,
    adminUsername: 'Abror444',
    adminDeepLink: 'tg://user?id=5155194813',
    adminFallbackUrl: 'https://t.me/Abror444',
    packages: [
      { gems: 15, uzs: 15000, label: 'Start Paket', badge: '' },
      { gems: 35, uzs: 35000, label: 'Mashhur', badge: '🔥 OMMABOP' },
      { gems: 75, uzs: 75000, label: 'VIP Paket', badge: '👑 VIP' },
      { gems: 150, uzs: 150000, label: 'Elita Paket', badge: '⚡ ELITA' },
      { gems: 300, uzs: 300000, label: 'Imperator', badge: '💎 MAX' }
    ]
  };

  const GIFTS_CATALOG = [
    // === 1-TOIFA: O'YIN TANGALARIGA SOTIB OLINADIGAN 6 TA SOVG'A ===
    {
      id: 'rose_red',
      name: 'Qizil Atirgul',
      icon: '🌹',
      category: 'coins',
      currency: 'coins',
      price: 49000,
      prestige: 50,
      rarity: 'common',
      color: '#ef4444',
      glow: '#f43f5e',
      modelType: 'rose_red',
      desc: 'Baxmal qizil gulbargli 3D atirgul — ehtirom va samimiy sovg\'a.'
    },
    {
      id: 'teddy_bear',
      name: 'Teddi Ayiqcha',
      icon: '🧸',
      category: 'coins',
      currency: 'coins',
      price: 99000,
      prestige: 110,
      rarity: 'common',
      color: '#d97706',
      glow: '#f59e0b',
      modelType: 'teddy_bear',
      desc: 'Oltin tasmali 3D yumshoq ayiqcha — do\'stlar orasida eng sevimli sovg\'a.'
    },
    {
      id: 'royal_bouquet',
      name: 'Qirollik Guldastasi',
      icon: '💐',
      category: 'coins',
      currency: 'coins',
      price: 175000,
      prestige: 200,
      rarity: 'uncommon',
      color: '#ec4899',
      glow: '#f472b6',
      modelType: 'royal_bouquet',
      desc: 'Qizil va oltin atirgullardan yig\'ilgan hashamatli 3D buket.'
    },
    {
      id: 'party_cake',
      name: 'Bayram Torti',
      icon: '🎂',
      category: 'coins',
      currency: 'coins',
      price: 250000,
      prestige: 300,
      rarity: 'uncommon',
      color: '#fb7185',
      glow: '#fda4af',
      modelType: 'party_cake',
      desc: 'Yonib turgan oltin shamchali 3 qavatli 3D bayram torti.'
    },
    {
      id: 'gold_champagne',
      name: 'Oltin Shampan',
      icon: '🍾',
      category: 'coins',
      currency: 'coins',
      price: 390000,
      prestige: 500,
      rarity: 'rare',
      color: '#eab308',
      glow: '#facc15',
      modelType: 'gold_champagne',
      desc: 'Muzli oltin chelakdagi g\'alaba shampani va billur qadah.'
    },
    {
      id: 'diamond_ring',
      name: 'Olmos Uzuk',
      icon: '💍',
      category: 'coins',
      currency: 'coins',
      price: 550000,
      prestige: 750,
      rarity: 'rare',
      color: '#38bdf8',
      glow: '#7dd3fc',
      modelType: 'diamond_ring',
      desc: 'Baxmal qutichada yarqirab turgan 3D brilliant uzuk.'
    },

    // === 2-TOIFA: FAQAT BONUS SANDIG'IDAN CHIQADIGAN 4 TA EKSKLYUZIV ===
    {
      id: 'tactical_medal',
      name: 'Oltin Taktik Medalyon',
      icon: '🎖️',
      category: 'bonus',
      currency: 'bonus',
      price: 0,
      prestige: 400,
      rarity: 'rare',
      bonusWeight: 42,
      color: '#f59e0b',
      glow: '#fbbf24',
      modelType: 'tactical_medal',
      desc: 'Faqat 3D Oltin Sandiqdan chiqadi! 24K oltin jangovar medalyon.'
    },
    {
      id: 'karambit_neon',
      name: 'Karambit Neon',
      icon: '🗡️',
      category: 'bonus',
      currency: 'bonus',
      price: 0,
      prestige: 900,
      rarity: 'epic',
      bonusWeight: 28,
      color: '#a855f7',
      glow: '#c084fc',
      modelType: 'karambit_neon',
      desc: 'Faqat 3D Oltin Sandiqdan chiqadi! Moviy-binafsha xrom 3D karambit.'
    },
    {
      id: 'titan_shield',
      name: 'Titan Qalqon',
      icon: '🛡️',
      category: 'bonus',
      currency: 'bonus',
      price: 0,
      prestige: 1500,
      rarity: 'epic',
      bonusWeight: 20,
      color: '#0ea5e9',
      glow: '#38bdf8',
      modelType: 'titan_shield',
      desc: 'Faqat 3D Oltin Sandiqdan chiqadi! Oltin burgut naqshli qora titan qalqon.'
    },
    {
      id: 'golden_dragon',
      name: 'Oltin Ajdar',
      icon: '🐉',
      category: 'bonus',
      currency: 'bonus',
      price: 0,
      prestige: 3000,
      rarity: 'mythic',
      bonusWeight: 10,
      color: '#facc15',
      glow: '#fde047',
      modelType: 'golden_dragon',
      desc: 'Eng kamyob Sandiq afsonasi! Yoqut ko\'zli 3D 24K oltin ajdar haykalchasi.'
    },

    // === 3-TOIFA: FAQAT KRISTALGA SOTIB OLINADIGAN 5 TA VIP SOVG'A (1 💎 = 1,000 SO'M) ===
    {
      id: 'gold_watch',
      name: 'Oltin Soat',
      icon: '⌚',
      category: 'gems',
      currency: 'gems',
      price: 15,
      uzsPrice: 15000,
      prestige: 1000,
      rarity: 'epic',
      color: '#fbbf24',
      glow: '#f59e0b',
      modelType: 'gold_watch',
      desc: 'Sapfir oynali 24K oltin lyuks 3D xronograf soat.'
    },
    {
      id: 'blue_brilliant',
      name: 'Moviy Brilliant',
      icon: '💎',
      category: 'gems',
      currency: 'gems',
      price: 35,
      uzsPrice: 35000,
      prestige: 2500,
      rarity: 'epic',
      color: '#38bdf8',
      glow: '#0ea5e9',
      modelType: 'blue_brilliant',
      desc: 'Nur taratib aylanuvchi ulkan 3D elektr-ko\'k brilliant.'
    },
    {
      id: 'emperor_crown',
      name: 'Imperator Toji',
      icon: '👑',
      category: 'gems',
      currency: 'gems',
      price: 75,
      uzsPrice: 75000,
      prestige: 6000,
      rarity: 'legendary',
      color: '#facc15',
      glow: '#fbbf24',
      modelType: 'emperor_crown',
      desc: 'Yoqut va zumrad toshlar bilan bezatilgan 3D qirollik toji.'
    },
    {
      id: 'gold_hypercar',
      name: 'Oltin Giperkar',
      icon: '🏎️',
      category: 'gems',
      currency: 'gems',
      price: 150,
      uzsPrice: 150000,
      prestige: 14000,
      rarity: 'legendary',
      color: '#f97316',
      glow: '#fb923c',
      modelType: 'gold_hypercar',
      desc: 'Qora-oltin karbon va neon chiroqli 3D elita giperkari.'
    },
    {
      id: 'private_jet',
      name: 'Shaxsiy Biznes-Jet',
      icon: '✈️',
      category: 'gems',
      currency: 'gems',
      price: 300,
      uzsPrice: 300000,
      prestige: 30000,
      rarity: 'mythic',
      color: '#e2e8f0',
      glow: '#38bdf8',
      modelType: 'private_jet',
      desc: 'Eng oliy maqom ramzi! Platina-oltin 3D shaxsiy biznes samolyoti.'
    }
  ];

  const GIFTS_MAP = {};
  GIFTS_CATALOG.forEach(g => { GIFTS_MAP[g.id] = g; });

  function getGiftById(id) {
    return GIFTS_MAP[String(id || '').trim()] || null;
  }

  function computePrestigeFromGifts(gifts) {
    if (!Array.isArray(gifts)) return 0;
    let total = 0;
    for (let i = 0; i < gifts.length; i++) {
      const g = GIFTS_MAP[gifts[i] && gifts[i].giftId];
      if (g) total += g.prestige;
    }
    return total;
  }

  function summarizeGifts(gifts) {
    const arr = Array.isArray(gifts) ? gifts : [];
    const counts = {};
    let prestige = 0;
    for (let i = 0; i < arr.length; i++) {
      const gid = arr[i] && arr[i].giftId;
      const g = GIFTS_MAP[gid];
      if (!g) continue;
      counts[gid] = (counts[gid] || 0) + 1;
      prestige += g.prestige;
    }
    const topGifts = Object.keys(counts)
      .map(gid => ({
        id: gid,
        name: GIFTS_MAP[gid].name,
        icon: GIFTS_MAP[gid].icon,
        rarity: GIFTS_MAP[gid].rarity,
        prestige: GIFTS_MAP[gid].prestige,
        count: counts[gid]
      }))
      .sort((a, b) => b.prestige - a.prestige)
      .slice(0, 6);

    return {
      prestige,
      totalCount: arr.length,
      uniqueCount: Object.keys(counts).length,
      counts,
      topGifts
    };
  }

  return {
    GEMS_CONFIG,
    GIFTS_CATALOG,
    GIFTS_MAP,
    getGiftById,
    computePrestigeFromGifts,
    summarizeGifts
  };
});
