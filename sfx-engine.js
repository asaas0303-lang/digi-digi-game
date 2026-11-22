// DIGI DIGI — 0-Lag Web AudioBuffer SFX & CS 1.6 Tactical Radio Engine
(function initDigiSfxEngine() {
  const LS_RADIO_LANG = 'digi_radio_lang';
  const VALID_LANGS = ['uz', 'ru', 'off'];

  let radioLang = 'uz';
  try {
    const saved = localStorage.getItem(LS_RADIO_LANG);
    if (saved && VALID_LANGS.indexOf(saved) !== -1) radioLang = saved;
  } catch (e) {}

  // Qurol va jang SFX xaritasi (public/sfx/weapons/ ichidagi .mp3 fayllar)
  const WEAPON_MAP = {
    shoot_m4a1:      { url: '/sfx/weapons/m4a1.mp3',     gain: 0.96, pMin: 0.96, pMax: 1.04, delay: 0 },
    shoot_plasma:    { url: '/sfx/weapons/m4a1.mp3',     gain: 0.96, pMin: 0.96, pMax: 1.04, delay: 0 },
    shoot_ak47:      { url: '/sfx/weapons/ak47.mp3',     gain: 1.00, pMin: 0.95, pMax: 1.05, delay: 0 },
    shoot_shotgun:   { url: '/sfx/weapons/shotgun.mp3',  gain: 1.00, pMin: 0.95, pMax: 1.04, delay: 0 },
    shoot_pistol:    { url: '/sfx/weapons/usps.mp3',     gain: 0.88, pMin: 0.96, pMax: 1.04, delay: 0 },
    reload:          { url: '/sfx/weapons/reload.mp3',   gain: 0.90, pMin: 0.99, pMax: 1.01, delay: 0 },
    headshot:        { url: '/sfx/weapons/headshot.mp3', gain: 1.00, pMin: 0.97, pMax: 1.03, delay: 0 },
    grenade_explode: { url: '/sfx/weapons/grenade.mp3',  gain: 1.00, pMin: 0.94, pMax: 1.04, delay: 0 },
    smoke_hiss:      { url: '/sfx/weapons/smoke.mp3',    gain: 0.78, pMin: 0.97, pMax: 1.03, delay: 0 },
    hit:             { url: '/sfx/weapons/hit.mp3',      gain: 0.85, pMin: 0.93, pMax: 1.07, delay: 0 },
    shell_drop:      { url: '/sfx/weapons/shell.mp3',    gain: 0.40, pMin: 0.92, pMax: 1.10, delay: 0.16 }
  };

  const RADIO_KEYS = [
    'go', 'right', 'left', 'behind', 'front',
    'grenade', 'kill', 'headshot', 'reload', 'need_help', 'win', 'lose'
  ];

  const bufferCache = Object.create(null); // url -> AudioBuffer
  const loadingMap = Object.create(null);  // url -> Promise

  let activeSfxVoices = 0;
  const MAX_SFX_VOICES = 10;

  let activeRadioSource = null;
  let lastRadioAt = 0;
  const lastRadioKeyAt = Object.create(null);

  function loadBuffer(url, ctx) {
    if (!ctx || !url) return Promise.resolve(null);
    if (bufferCache[url]) return Promise.resolve(bufferCache[url]);
    if (loadingMap[url]) return loadingMap[url];

    const p = fetch(url, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then((ab) => {
        return new Promise((resolve, reject) => {
          const dec = ctx.decodeAudioData(ab, resolve, reject);
          if (dec && typeof dec.then === 'function') dec.then(resolve, reject);
        });
      })
      .then((buf) => {
        bufferCache[url] = buf;
        delete loadingMap[url];
        return buf;
      })
      .catch(() => {
        delete loadingMap[url];
        return null;
      });

    loadingMap[url] = p;
    return p;
  }

  function preloadWeapons(ctx) {
    if (!ctx) return;
    const seen = Object.create(null);
    const keys = Object.keys(WEAPON_MAP);
    for (let i = 0; i < keys.length; i++) {
      const url = WEAPON_MAP[keys[i]].url;
      if (!seen[url]) {
        seen[url] = true;
        loadBuffer(url, ctx);
      }
    }
  }

  function preloadRadio(ctx, lang) {
    const l = lang || radioLang;
    if (!ctx || l === 'off') return;
    for (let i = 0; i < RADIO_KEYS.length; i++) {
      loadBuffer('/sfx/radio/' + l + '/' + RADIO_KEYS[i] + '.mp3', ctx);
    }
  }

  function preload(ctx) {
    if (!ctx) return;
    preloadWeapons(ctx);
    preloadRadio(ctx, radioLang);
  }

  function playWeapon(type, ctx, dest, panVal, vol) {
    const spec = WEAPON_MAP[type];
    if (!spec || !ctx || !dest) return false;

    const buf = bufferCache[spec.url];
    if (!buf) {
      // Hali RAM ga tushmagan bo'lsa, fonda yuklashni boshlaydi va zaxira sintezga o'tadi
      loadBuffer(spec.url, ctx);
      return false;
    }

    if (activeSfxVoices >= MAX_SFX_VOICES) return true;
    activeSfxVoices++;

    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const rate = spec.pMin + Math.random() * (spec.pMax - spec.pMin);
      src.playbackRate.value = rate;

      const gain = ctx.createGain();
      const v = Math.max(0.08, Math.min(1.0, typeof vol === 'number' ? vol : 1.0));
      gain.gain.value = spec.gain * v;

      src.connect(gain);
      let panner = null;
      if (ctx.createStereoPanner && typeof panVal === 'number' && !isNaN(panVal) && Math.abs(panVal) > 0.06) {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, panVal));
        gain.connect(panner);
        panner.connect(dest);
      } else {
        gain.connect(dest);
      }

      let cleaned = false;
      src.onended = function () {
        if (cleaned) return;
        cleaned = true;
        activeSfxVoices = Math.max(0, activeSfxVoices - 1);
        try {
          src.disconnect();
          gain.disconnect();
          if (panner) panner.disconnect();
        } catch (e) {}
      };

      const startAt = ctx.currentTime + (spec.delay || 0);
      src.start(startAt);
      return true;
    } catch (e) {
      activeSfxVoices = Math.max(0, activeSfxVoices - 1);
      return false;
    }
  }

  function stopRadio() {
    if (activeRadioSource) {
      try { activeRadioSource.stop(); } catch (e) {}
      try { activeRadioSource.disconnect(); } catch (e) {}
      activeRadioSource = null;
    }
  }

  function playRadio(key, ctx, dest, isPriority, chance) {
    if (radioLang === 'off' || !key || !ctx || !dest) return false;
    if (typeof chance === 'number' && chance < 1.0 && Math.random() > chance) return false;

    const now = performance.now();
    const minGlobalGap = isPriority ? 1400 : 4200;
    const minSameKeyGap = isPriority ? 3000 : 7200;

    if (!isPriority && activeRadioSource) return false;
    if (now - lastRadioAt < minGlobalGap) return false;
    if (lastRadioKeyAt[key] && (now - lastRadioKeyAt[key]) < minSameKeyGap) return false;

    const url = '/sfx/radio/' + radioLang + '/' + key + '.mp3';
    const buf = bufferCache[url];

    const startPlayback = (audioBuf) => {
      if (!audioBuf || radioLang === 'off') return;
      if (isPriority) stopRadio();
      else if (activeRadioSource) return;

      try {
        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        const gain = ctx.createGain();
        gain.gain.value = 0.92;
        src.connect(gain);
        gain.connect(dest);

        activeRadioSource = src;
        lastRadioAt = performance.now();
        lastRadioKeyAt[key] = lastRadioAt;

        let cleaned = false;
        src.onended = function () {
          if (cleaned) return;
          cleaned = true;
          if (activeRadioSource === src) activeRadioSource = null;
          try {
            src.disconnect();
            gain.disconnect();
          } catch (e) {}
        };
        src.start(ctx.currentTime);
      } catch (e) {
        activeRadioSource = null;
      }
    };

    if (buf) {
      startPlayback(buf);
      return true;
    } else {
      loadBuffer(url, ctx).then((loaded) => {
        if (loaded && isPriority) startPlayback(loaded);
      });
      return false;
    }
  }

  // Dushmanning o'yinchiga nisbatan yo'nalishini hisoblab CS 1.6 ratsiya ogohlantirishini berish
  function calloutEnemyDir(enemyX, enemyY, playerX, playerY, playerAngle, ctx, dest) {
    if (radioLang === 'off' || !ctx || !dest) return false;
    const dist = Math.hypot(enemyX - playerX, enemyY - playerY);
    if (dist > 11.5) return false;

    let rel = Math.atan2(enemyY - playerY, enemyX - playerX) - playerAngle;
    while (rel < -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;

    let key = 'front';
    let priority = false;
    if (Math.abs(rel) >= 2.20) {
      key = 'behind';
      priority = true; // Orqadan hujum doim ustuvor!
    } else if (rel > 0.52) {
      key = 'right';
    } else if (rel < -0.52) {
      key = 'left';
    } else {
      key = 'front';
    }
    return playRadio(key, ctx, dest, priority, priority ? 0.90 : 0.55);
  }

  function updateRadioUI() {
    const btns = document.querySelectorAll('.radio-lang-btn');
    const badge = document.getElementById('radioStatusBadge');
    btns.forEach((btn) => {
      const lang = btn.getAttribute('data-radio-lang');
      const active = lang === radioLang;
      btn.className = active
        ? 'radio-lang-btn px-2 py-1.5 rounded-lg text-[10px] font-extrabold border border-sky-400 bg-sky-500/20 text-sky-300 transition'
        : 'radio-lang-btn px-2 py-1.5 rounded-lg text-[10px] font-extrabold border border-slate-700 bg-slate-900 text-slate-300 transition';
    });
    if (badge) {
      if (radioLang === 'uz') {
        badge.textContent = "O'zbekcha";
        badge.className = 'text-[10px] font-mono text-emerald-400';
      } else if (radioLang === 'ru') {
        badge.textContent = 'Русский';
        badge.className = 'text-[10px] font-mono text-sky-400';
      } else {
        badge.textContent = "O'chiq";
        badge.className = 'text-[10px] font-mono text-slate-400';
      }
    }
  }

  function bindRadioSettingsUI() {
    const btns = document.querySelectorAll('.radio-lang-btn');
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-radio-lang') || 'off';
        if (VALID_LANGS.indexOf(next) === -1) return;
        radioLang = next;
        try { localStorage.setItem(LS_RADIO_LANG, radioLang); } catch (e) {}
        updateRadioUI();

        if (radioLang === 'off') {
          stopRadio();
          if (typeof showToast === 'function') showToast("Askarlar radiosi o'chirildi", '📻');
        } else {
          // Tanlangan tilni darhol RAM ga yuklash va 1 ta sinov buyrug'ini eshittirish
          const audio = (typeof window._digiEnsureAudio === 'function') ? window._digiEnsureAudio() : null;
          if (audio && audio.ctx && audio.dest) {
            preloadRadio(audio.ctx, radioLang);
            lastRadioAt = 0;
            lastRadioKeyAt.go = 0;
            playRadio('go', audio.ctx, audio.dest, true, 1.0);
          }
          if (typeof showToast === 'function') {
            showToast(radioLang === 'uz' ? "Radio: O'zbekcha (CS 1.6)" : 'Радио: Русский (CS 1.6)', '📻');
          }
        }
      });
    });
    updateRadioUI();
  }

  window.DIGI_SFX = {
    preload: preload,
    preloadRadio: preloadRadio,
    playWeapon: playWeapon,
    playRadio: playRadio,
    stopRadio: stopRadio,
    calloutEnemyDir: calloutEnemyDir,
    getLang: function () { return radioLang; },
    bindUI: bindRadioSettingsUI
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindRadioSettingsUI);
  } else {
    bindRadioSettingsUI();
  }
})();
