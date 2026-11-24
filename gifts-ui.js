/**
 * DIGI DIGI — 3D PBR Sovg'alar Do'koni, 360° Ko'rish va Kristal Tizimi (gifts-ui.js)
 * 15 ta 3D PBR Sovg'a Modeli + Offscreen Thumbnail Baker + Detail/Yuborish + Kristal Do'koni
 */
(function () {
  'use strict';

  const _giftThumbCache = {};
  let _bakingStarted = false;
  let _detailRenderer = null;
  let _detailScene = null;
  let _detailCamera = null;
  let _detailModelGroup = null;
  let _detailAnimId = null;
  let _detailEnvMap = null;
  let _activeDetailGift = null;
  let _detailYaw = 0;
  let _detailPitch = 0.1;
  let _isDraggingDetail = false;
  let _lastPointerX = 0;
  let _lastPointerY = 0;
  let _currentShopTab = 'all';
  let _cachedDirectory = [];
  let _selectedRecipient = null;
  let _buyGiftMode = 'self'; // 'self' | 'send'
  let _selectedGemPackage = null;

  // 1. Yordamchi Funksiyalar
  function isRot90Active() {
    try {
      const b = document.body;
      const lv = document.getElementById('lobbyView');
      return !!(
        (b && b.classList.contains('digi-lobby-rot90')) ||
        (lv && lv.classList.contains('digi-lobby-rot90')) ||
        window._digiRot90
      );
    } catch (e) {
      return false;
    }
  }

  function getMyDoomId() {
    try {
      if (window.DIGI_TG_PROFILE && window.DIGI_TG_PROFILE.myId) return window.DIGI_TG_PROFILE.myId;
      const el = document.getElementById('myDoomId');
      if (el && el.textContent) return el.textContent.trim();
    } catch (e) {}
    return 'DOOM-PLAYER';
  }

  function getMyCoins() {
    if (window.userStats && typeof window.userStats.coins === 'number') return window.userStats.coins;
    if (window.DIGI_TG_PROFILE && typeof window.DIGI_TG_PROFILE.coins === 'number') return window.DIGI_TG_PROFILE.coins;
    return 0;
  }

  function getMyGems() {
    if (window.userStats && typeof window.userStats.gems === 'number') return window.userStats.gems;
    if (window.DIGI_TG_PROFILE && typeof window.DIGI_TG_PROFILE.gems === 'number') return window.DIGI_TG_PROFILE.gems;
    return 0;
  }

  function getOwnedGiftCount(giftId) {
    try {
      const gifts = (window.userStats && Array.isArray(window.userStats.gifts)) ? window.userStats.gifts :
                    (window.DIGI_TG_PROFILE && Array.isArray(window.DIGI_TG_PROFILE.gifts)) ? window.DIGI_TG_PROFILE.gifts : [];
      let cnt = 0;
      for (let i = 0; i < gifts.length; i++) {
        if (gifts[i] && gifts[i].giftId === giftId) cnt++;
      }
      return cnt;
    } catch (e) {
      return 0;
    }
  }

  function playUiSound(name) {
    try {
      if (typeof window.playSound === 'function') window.playSound(name);
    } catch (e) {}
  }

  function showUiToast(msg, emoji) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(msg, emoji || '🎁');
        return;
      }
      if (typeof window.showBridgeToast === 'function') {
        window.showBridgeToast((emoji ? emoji + ' ' : '') + msg);
        return;
      }
    } catch (e) {}
    const tb = document.getElementById('toastBox');
    const tm = document.getElementById('toastMsg');
    const te = document.getElementById('toastEmoji');
    if (tb && tm) {
      tm.textContent = msg;
      if (te) te.textContent = emoji || '⚡';
      tb.classList.remove('hidden');
      setTimeout(() => tb.classList.add('hidden'), 3200);
    }
  }

  // 2. Studiya Yengil EnvMap Generator
  function createGiftStudioEnvMap(renderer) {
    if (!renderer || typeof THREE === 'undefined') return null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();

      const cvs = document.createElement('canvas');
      cvs.width = 256;
      cvs.height = 128;
      const ctx = cvs.getContext('2d');
      if (!ctx) return null;

      // Fon gradienti: to'q po'lat ko'k
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#0c1322');
      grad.addColorStop(0.5, '#050811');
      grad.addColorStop(1, '#020409');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);

      // Tepada softbox oq nuri
      const topLight = ctx.createRadialGradient(128, 20, 2, 128, 20, 60);
      topLight.addColorStop(0, 'rgba(255,255,255,0.95)');
      topLight.addColorStop(0.4, 'rgba(224,242,254,0.6)');
      topLight.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topLight;
      ctx.fillRect(60, 0, 136, 65);

      // Chapda elektr-ko'k aks
      const leftLight = ctx.createRadialGradient(40, 64, 4, 40, 64, 55);
      leftLight.addColorStop(0, 'rgba(56,189,248,0.7)');
      leftLight.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = leftLight;
      ctx.fillRect(0, 20, 90, 90);

      // O'ngda 24K oltin iliq nuri
      const rightLight = ctx.createRadialGradient(216, 64, 4, 216, 64, 55);
      rightLight.addColorStop(0, 'rgba(245,158,11,0.8)');
      rightLight.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rightLight;
      ctx.fillRect(166, 20, 90, 90);

      const tex = new THREE.CanvasTexture(cvs);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const rt = pmrem.fromEquirectangular(tex);
      tex.dispose();
      pmrem.dispose();
      return rt.texture;
    } catch (e) {
      console.warn('createGiftStudioEnvMap error:', e);
      return null;
    }
  }

  // 3. 15 TA HAQIQIY 3D PBR SOVG'A MODELLARI
  function buildGift3DModel(giftId, envMap) {
    if (typeof THREE === 'undefined') return new THREE.Group();
    const g = new THREE.Group();
    g.name = 'gift_' + giftId;

    const mkMat = (params) => {
      const cfg = Object.assign({ roughness: 0.35, metalness: 0.1 }, params);
      if (envMap && !cfg.envMap) cfg.envMap = envMap;
      return new THREE.MeshStandardMaterial(cfg);
    };

    const goldMat = mkMat({ color: 0xf59e0b, metalness: 0.92, roughness: 0.18 });
    const chromeMat = mkMat({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.12 });
    const darkTitanMat = mkMat({ color: 0x0f172a, metalness: 0.85, roughness: 0.28 });

    switch (giftId) {
      // 1. 🌹 Qizil Atirgul
      case 'rose_red': {
        const stemMat = mkMat({ color: 0x15803d, roughness: 0.6, metalness: 0.05 });
        const petalMat = mkMat({ color: 0xbe123c, roughness: 0.72, metalness: 0.08 });
        const dewMat = mkMat({ color: 0xffffff, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.85 });

        // Egik poya
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 12), stemMat);
        stem.position.set(0, -0.3, 0);
        stem.rotation.z = 0.08;
        g.add(stem);

        // 2 ta barg
        const leaf1 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 6), stemMat);
        leaf1.position.set(0.18, -0.25, 0.05);
        leaf1.rotation.set(0.2, 0, -1.1);
        leaf1.scale.set(1, 1, 0.3);
        g.add(leaf1);

        const leaf2 = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 6), stemMat);
        leaf2.position.set(-0.16, -0.45, -0.04);
        leaf2.rotation.set(-0.2, 0, 1.2);
        leaf2.scale.set(1, 1, 0.3);
        g.add(leaf2);

        // Ko'p qavatli baxmal g'uncha
        const budGroup = new THREE.Group();
        budGroup.position.set(0.05, 0.42, 0);

        const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), petalMat);
        budGroup.add(core);

        const pAngles = [0, 1.2, 2.4, 3.6, 4.8];
        pAngles.forEach((ang) => {
          const petal = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), petalMat);
          petal.position.set(Math.cos(ang) * 0.12, Math.sin(ang * 2) * 0.04, Math.sin(ang) * 0.12);
          petal.scale.set(0.85, 1.2, 0.35);
          petal.rotation.y = ang + 0.4;
          budGroup.add(petal);
        });

        // Shudring tomchisi
        const dew = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), dewMat);
        dew.position.set(0.12, 0.14, 0.18);
        budGroup.add(dew);

        g.add(budGroup);
        break;
      }

      // 2. 🧸 Teddi Ayiqcha
      case 'teddy_bear': {
        const furMat = mkMat({ color: 0x92400e, roughness: 0.88, metalness: 0.02 });
        const bellyMat = mkMat({ color: 0xb45309, roughness: 0.85, metalness: 0.02 });
        const blackGloss = mkMat({ color: 0x09090b, roughness: 0.15, metalness: 0.2 });

        // Tana
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 14), furMat);
        body.position.set(0, -0.15, 0);
        body.scale.set(1, 1.15, 0.95);
        g.add(body);

        // Qorin qismi
        const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), bellyMat);
        belly.position.set(0, -0.12, 0.22);
        belly.scale.set(0.85, 0.95, 0.4);
        g.add(belly);

        // Bosh
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 14), furMat);
        head.position.set(0, 0.42, 0.02);
        g.add(head);

        // Tumshuq
        const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), bellyMat);
        snout.position.set(0, 0.36, 0.28);
        snout.scale.set(1, 0.8, 0.8);
        g.add(snout);

        // Burun va ko'zlar
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), blackGloss);
        nose.position.set(0, 0.42, 0.42);
        g.add(nose);

        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), blackGloss);
        eyeL.position.set(-0.13, 0.49, 0.32);
        const eyeR = eyeL.clone();
        eyeR.position.x = 0.13;
        g.add(eyeL);
        g.add(eyeR);

        // Quloqlar
        const earL = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), furMat);
        earL.position.set(-0.28, 0.72, 0);
        const earR = earL.clone();
        earR.position.x = 0.28;
        g.add(earL);
        g.add(earR);

        // Panjalar (qo'l va oyoqlar)
        const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 10), furMat);
        armL.position.set(-0.46, 0.05, 0.08);
        armL.rotation.set(0.4, 0, 0.8);
        const armR = armL.clone();
        armR.position.x = 0.46;
        armR.rotation.z = -0.8;
        g.add(armL);
        g.add(armR);

        const legL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), furMat);
        legL.position.set(-0.24, -0.62, 0.2);
        legL.scale.set(0.9, 0.8, 1.2);
        const legR = legL.clone();
        legR.position.x = 0.24;
        g.add(legL);
        g.add(legR);

        // Oltin kapalak-tasma
        const bowtie = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), goldMat);
        bowtie.position.set(0, 0.12, 0.36);
        bowtie.rotation.x = 0.3;
        g.add(bowtie);
        break;
      }

      // 3. 💐 Qirollik Guldastasi
      case 'royal_bouquet': {
        const wrapMat = mkMat({ color: 0x0f172a, roughness: 0.4, metalness: 0.3 });
        const roseRed = mkMat({ color: 0xd91d38, roughness: 0.65, metalness: 0.1 });
        const rosePink = mkMat({ color: 0xec4899, roughness: 0.65, metalness: 0.1 });
        const leafMat = mkMat({ color: 0x166534, roughness: 0.55 });

        // Konussimon hashamatli o'ram
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.15, 18, 1, true), wrapMat);
        cone.position.set(0, -0.28, 0);
        cone.rotation.x = Math.PI;
        g.add(cone);

        // Oltin lenta
        const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 10, 24), goldMat);
        ribbon.position.set(0, -0.25, 0);
        ribbon.rotation.x = Math.PI * 0.5;
        g.add(ribbon);

        // 7 ta atirgul g'unchalari
        const rosePos = [
          [0, 0.52, 0, roseRed],
          [-0.22, 0.44, 0.12, rosePink],
          [0.22, 0.44, 0.12, roseRed],
          [0, 0.42, 0.26, goldMat],
          [-0.24, 0.38, -0.14, goldMat],
          [0.24, 0.38, -0.14, rosePink],
          [0, 0.34, -0.24, roseRed]
        ];

        rosePos.forEach(([x, y, z, m]) => {
          const bud = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 1), m);
          bud.position.set(x, y, z);
          g.add(bud);
        });

        // Yashil barglar
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const lf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), leafMat);
          lf.position.set(Math.cos(a) * 0.42, 0.32, Math.sin(a) * 0.42);
          lf.rotation.set(0.6 * Math.sin(a), a, -0.6 * Math.cos(a));
          lf.scale.set(1, 1, 0.3);
          g.add(lf);
        }
        break;
      }

      // 4. 🎂 Bayram Torti
      case 'party_cake': {
        const creamMat = mkMat({ color: 0xfdf4ff, roughness: 0.45, metalness: 0.02 });
        const berryMat = mkMat({ color: 0xf43f5e, roughness: 0.35, metalness: 0.1 });
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

        // 3 qavatli tort
        const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.34, 24), creamMat);
        tier1.position.set(0, -0.45, 0);
        g.add(tier1);

        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 28), goldMat);
        ring1.position.set(0, -0.28, 0);
        ring1.rotation.x = Math.PI * 0.5;
        g.add(ring1);

        const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.3, 24), berryMat);
        tier2.position.set(0, -0.13, 0);
        g.add(tier2);

        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 24), goldMat);
        ring2.position.set(0, 0.02, 0);
        ring2.rotation.x = Math.PI * 0.5;
        g.add(ring2);

        const tier3 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.26, 20), creamMat);
        tier3.position.set(0, 0.15, 0);
        g.add(tier3);

        // 3 ta shamcha
        [-0.14, 0, 0.14].forEach((x, idx) => {
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 10), goldMat);
          candle.position.set(x, 0.38, (idx === 1 ? -0.06 : 0.04));
          g.add(candle);

          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), flameMat);
          flame.position.set(x, 0.54, (idx === 1 ? -0.06 : 0.04));
          g.add(flame);
        });
        break;
      }

      // 5. 🍾 Oltin Shampan
      case 'gold_champagne': {
        const bottleMat = mkMat({ color: 0x064e3b, roughness: 0.15, metalness: 0.2 });
        const iceMat = mkMat({ color: 0xe0f2fe, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.75 });
        const glassMat = mkMat({ color: 0xffffff, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.65 });

        // Oltin chelak
        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.55, 20, 1, false), goldMat);
        bucket.position.set(-0.15, -0.32, 0);
        g.add(bucket);

        // Muz kubiklari
        for (let i = 0; i < 8; i++) {
          const ice = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), iceMat);
          const a = (i / 8) * Math.PI * 2;
          ice.position.set(-0.15 + Math.cos(a) * 0.22, -0.06 + Math.random() * 0.05, Math.sin(a) * 0.22);
          ice.rotation.set(Math.random(), Math.random(), 0);
          g.add(ice);
        }

        // Qiya shampan shishasi
        const bottleGroup = new THREE.Group();
        bottleGroup.position.set(-0.12, -0.05, 0);
        bottleGroup.rotation.z = -0.32;

        const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.65, 16), bottleMat);
        bottleGroup.add(bBody);

        const bNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.4, 16), bottleMat);
        bNeck.position.y = 0.48;
        bottleGroup.add(bNeck);

        const bFoil = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.2, 16), goldMat);
        bFoil.position.y = 0.58;
        bottleGroup.add(bFoil);

        g.add(bottleGroup);

        // Billur qadah
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.04, 0.38, 14, 1, true), glassMat);
        glass.position.set(0.42, 0.02, 0.1);
        g.add(glass);

        const stemG = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.35, 8), glassMat);
        stemG.position.set(0.42, -0.22, 0.1);
        g.add(stemG);

        const baseG = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 14), glassMat);
        baseG.position.set(0.42, -0.4, 0.1);
        g.add(baseG);
        break;
      }

      // 6. 💍 Olmos Uzuk
      case 'diamond_ring': {
        const boxMat = mkMat({ color: 0x0f172a, roughness: 0.82, metalness: 0.05 });
        const cushionMat = mkMat({ color: 0xffffff, roughness: 0.9, metalness: 0.0 });
        const diamondMat = mkMat({ color: 0xbae6fd, roughness: 0.04, metalness: 0.2, emissive: 0x0284c7, emissiveIntensity: 0.35 });

        // Quticha asosi
        const boxBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.72), boxMat);
        boxBase.position.set(0, -0.38, 0);
        g.add(boxBase);

        // Quticha ochiq qopqog'i
        const boxLid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.72), boxMat);
        boxLid.position.set(0, 0.05, -0.42);
        boxLid.rotation.x = -1.15;
        g.add(boxLid);

        // Yostiqcha
        const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.62), cushionMat);
        cushion.position.set(0, -0.22, 0);
        g.add(cushion);

        // Uzuk halqasi
        const ringBand = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 12, 32), goldMat);
        ringBand.position.set(0, -0.06, 0);
        ringBand.rotation.x = 0.25;
        g.add(ringBand);

        // Brilliant
        const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 2), diamondMat);
        diamond.position.set(0, 0.2, 0.06);
        diamond.scale.set(1.1, 0.8, 1.1);
        g.add(diamond);
        break;
      }

      // 7. 🎖️ Oltin Taktik Medalyon (Sandiq Eksklyuzivi)
      case 'tactical_medal': {
        const ribbonBlue = mkMat({ color: 0x1e3a8a, roughness: 0.65 });
        const ribbonRed = mkMat({ color: 0xb91c1c, roughness: 0.65 });

        // Harbiy lenta
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.05), ribbonBlue);
        r1.position.set(0, 0.42, 0);
        g.add(r1);

        const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.06), ribbonRed);
        r2.position.set(0, 0.42, 0);
        g.add(r2);

        // Osma halqa
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 16), goldMat);
        ring.position.set(0, 0.15, 0);
        g.add(ring);

        // Sakkizburchak medalyon
        const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8), goldMat);
        medal.position.set(0, -0.25, 0);
        medal.rotation.x = Math.PI * 0.5;
        g.add(medal);

        // Qavariq yulduz
        const star = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), chromeMat);
        star.position.set(0, -0.25, 0.06);
        star.scale.set(1.2, 1.2, 0.35);
        g.add(star);
        break;
      }

      // 8. 🗡️ Karambit Neon (Sandiq Eksklyuzivi)
      case 'karambit_neon': {
        const neonBlade = mkMat({
          color: 0x9333ea,
          metalness: 0.9,
          roughness: 0.12,
          emissive: 0x6366f1,
          emissiveIntensity: 0.45
        });
        const handleMat = mkMat({ color: 0x111827, roughness: 0.3, metalness: 0.8 });

        const bladeGroup = new THREE.Group();
        bladeGroup.position.set(-0.25, 0.1, 0);
        bladeGroup.rotation.z = -0.4;

        // Egik tig' segmentlari
        const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.55, 6), neonBlade);
        seg1.position.set(0.12, 0.18, 0);
        seg1.rotation.z = -0.55;
        bladeGroup.add(seg1);

        const seg2 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), neonBlade);
        seg2.position.set(0.32, -0.15, 0);
        seg2.rotation.z = -1.55;
        bladeGroup.add(seg2);

        // Dasta
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.58, 0.08), handleMat);
        handle.position.set(-0.12, 0.52, 0);
        handle.rotation.z = 0.25;
        bladeGroup.add(handle);

        // Barmoq halqasi
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 10, 20), goldMat);
        ring.position.set(-0.22, 0.85, 0);
        bladeGroup.add(ring);

        g.add(bladeGroup);
        break;
      }

      // 9. 🛡️ Titan Qalqon (Sandiq Eksklyuzivi)
      case 'titan_shield': {
        const coreMat = mkMat({
          color: 0x0284c7,
          metalness: 0.3,
          roughness: 0.1,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.9
        });

        // Titan qalqon korpusi
        const shieldBody = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.35, 1.25, 6), darkTitanMat);
        shieldBody.rotation.x = Math.PI * 0.5;
        shieldBody.scale.set(1, 0.16, 1);
        g.add(shieldBody);

        // Oltin rom
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 24), goldMat);
        rim.position.z = 0.11;
        g.add(rim);

        // Porlovchi elektr-ko'k yadro
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 1), coreMat);
        core.position.z = 0.14;
        core.scale.set(1, 1, 0.4);
        g.add(core);

        // Oltin burgut ramzi
        const eagleL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), goldMat);
        eagleL.position.set(-0.26, 0.18, 0.12);
        eagleL.rotation.set(0, 0, 0.85);
        const eagleR = eagleL.clone();
        eagleR.position.x = 0.26;
        eagleR.rotation.z = -0.85;
        g.add(eagleL);
        g.add(eagleR);
        break;
      }

      // 10. 🐉 Oltin Ajdar (Sandiq Eksklyuzivi)
      case 'golden_dragon': {
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

        // Poydevor
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.72, 0.18, 20), darkTitanMat);
        base.position.set(0, -0.62, 0);
        g.add(base);

        const baseRim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 8, 24), goldMat);
        baseRim.position.set(0, -0.53, 0);
        baseRim.rotation.x = Math.PI * 0.5;
        g.add(baseRim);

        // Spiral aylanuvchi tana segmentlari
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          const a = t * Math.PI * 2.8;
          const r = 0.36 * (1 - t * 0.4);
          const y = -0.42 + t * 0.85;
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.18 - t * 0.06, 10, 8), goldMat);
          seg.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
          g.add(seg);
        }

        // Ajdar boshi
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.48, 6), goldMat);
        head.position.set(0.12, 0.56, 0.18);
        head.rotation.set(-0.6, 0.3, 0.4);
        g.add(head);

        // Shoxlar
        const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.32, 4), goldMat);
        hornL.position.set(0.04, 0.8, 0.12);
        hornL.rotation.set(-0.4, 0, -0.5);
        const hornR = hornL.clone();
        hornR.position.x = 0.22;
        hornR.rotation.z = 0.5;
        g.add(hornL);
        g.add(hornR);

        // Yoqut ko'zlar
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
        eyeL.position.set(0.06, 0.62, 0.34);
        const eyeR = eyeL.clone();
        eyeR.position.x = 0.18;
        g.add(eyeL);
        g.add(eyeR);

        // Qanotlar
        const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.32, 0.04), goldMat);
        wingL.position.set(-0.38, 0.34, -0.15);
        wingL.rotation.set(0.4, 0.8, -0.5);
        const wingR = wingL.clone();
        wingR.position.x = 0.42;
        wingR.rotation.set(0.4, -0.8, 0.5);
        g.add(wingL);
        g.add(wingR);
        break;
      }

      // 11. ⌚ Oltin Soat (VIP)
      case 'gold_watch': {
        const dialMat = mkMat({ color: 0x0c2461, roughness: 0.1, metalness: 0.8 });
        const cushionMat = mkMat({ color: 0x18181b, roughness: 0.85 });

        // Qora yostiqcha
        const cush = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 18), cushionMat);
        cush.rotation.z = Math.PI * 0.5;
        cush.scale.set(0.85, 1, 0.7);
        g.add(cush);

        // Oltin tasma
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.09, 10, 32), goldMat);
        band.rotation.y = Math.PI * 0.5;
        g.add(band);

        // Soat korpusi
        const caseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 24), goldMat);
        caseMesh.position.set(0, 0, 0.38);
        caseMesh.rotation.x = Math.PI * 0.5;
        g.add(caseMesh);

        // Sapfir siferblat
        const dial = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), dialMat);
        dial.position.set(0, 0, 0.45);
        g.add(dial);

        // Oltin strelkalar
        const handH = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.01), goldMat);
        handH.position.set(0, 0.05, 0.46);
        handH.rotation.z = -0.7;
        g.add(handH);

        const handM = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.2, 0.01), goldMat);
        handM.position.set(0.05, 0.02, 0.46);
        handM.rotation.z = 1.1;
        g.add(handM);
        break;
      }

      // 12. 💎 Moviy Brilliant (VIP)
      case 'blue_brilliant': {
        const gemMat = mkMat({
          color: 0x0284c7,
          metalness: 0.15,
          roughness: 0.04,
          emissive: 0x0ea5e9,
          emissiveIntensity: 0.65
        });
        const auraMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });

        // Brilliant shakli: yuqori prizma + pastki konus
        const topFacet = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.68, 0.35, 8), gemMat);
        topFacet.position.y = 0.18;
        g.add(topFacet);

        const bottomFacet = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.75, 8), gemMat);
        bottomFacet.position.y = -0.37;
        bottomFacet.rotation.x = Math.PI;
        g.add(bottomFacet);

        // Aylanuvchi neon aura halqasi
        const aura = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.025, 8, 36), auraMat);
        aura.rotation.x = 1.2;
        aura.rotation.y = 0.4;
        g.add(aura);
        break;
      }

      // 13. 👑 Imperator Toji (VIP)
      case 'emperor_crown': {
        const velvetRed = mkMat({ color: 0x881337, roughness: 0.85, metalness: 0.05 });
        const rubyMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const emeraldMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });

        // Ichki baxmal gumbaz
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 14), velvetRed);
        dome.position.set(0, 0.05, 0);
        dome.scale.set(1, 0.78, 1);
        g.add(dome);

        // Oltin toj asosi
        const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.58, 0.18, 24, 1, true), goldMat);
        baseRing.position.set(0, -0.22, 0);
        g.add(baseRing);

        // 8 ta oltin uchlik va toshlar
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 5), goldMat);
          spike.position.set(Math.cos(a) * 0.52, 0.06, Math.sin(a) * 0.52);
          spike.rotation.y = a;
          g.add(spike);

          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), goldMat);
          ball.position.set(Math.cos(a) * 0.52, 0.28, Math.sin(a) * 0.52);
          g.add(ball);

          const gem = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), (i % 2 === 0 ? rubyMat : emeraldMat));
          gem.position.set(Math.cos(a) * 0.57, -0.22, Math.sin(a) * 0.57);
          g.add(gem);
        }

        // Markazdagi oltin shar va krest
        const topBall = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), goldMat);
        topBall.position.set(0, 0.46, 0);
        g.add(topBall);

        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.03), goldMat);
        crossV.position.set(0, 0.6, 0);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.03), goldMat);
        crossH.position.set(0, 0.62, 0);
        g.add(crossV);
        g.add(crossH);
        break;
      }

      // 14. 🏎️ Oltin Giperkar (VIP)
      case 'gold_hypercar': {
        const bodyMat = goldMat;
        const carbonMat = darkTitanMat;
        const wheelMat = mkMat({ color: 0x09090b, roughness: 0.6, metalness: 0.3 });
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

        // Aerodinamik shassi
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 1.45), carbonMat);
        chassis.position.set(0, -0.12, 0);
        g.add(chassis);

        // Kuzov yuqori qismi
        const bodyTop = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.15, 0.95), bodyMat);
        bodyTop.position.set(0, -0.02, -0.05);
        g.add(bodyTop);

        // Kabina
        const cabin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.55, 8), carbonMat);
        cabin.position.set(0, 0.1, -0.05);
        cabin.rotation.x = Math.PI * 0.5;
        cabin.scale.set(1, 0.8, 1);
        g.add(cabin);

        // Orqa spoyler
        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.18), bodyMat);
        spoiler.position.set(0, 0.16, -0.62);
        g.add(spoiler);

        // 4 ta g'ildiraklar
        const wPos = [
          [-0.36, -0.12, 0.42],
          [0.36, -0.12, 0.42],
          [-0.36, -0.12, -0.42],
          [0.36, -0.12, -0.42]
        ];
        wPos.forEach(([wx, wy, wz]) => {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 14), wheelMat);
          w.position.set(wx, wy, wz);
          w.rotation.z = Math.PI * 0.5;
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8), goldMat);
          cap.position.set(wx, wy, wz);
          cap.rotation.z = Math.PI * 0.5;
          g.add(w);
          g.add(cap);
        });

        // Faralar
        const fL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.04), ledMat);
        fL.position.set(-0.24, -0.08, 0.72);
        const fR = fL.clone();
        fR.position.x = 0.24;
        g.add(fL);
        g.add(fR);

        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.03), tailMat);
        tail.position.set(0, -0.06, -0.73);
        g.add(tail);
        break;
      }

      // 15. ✈️ Shaxsiy Biznes-Jet (VIP Afsona)
      case 'private_jet': {
        const whitePlat = mkMat({ color: 0xf8fafc, roughness: 0.25, metalness: 0.35 });
        const windowMat = mkMat({ color: 0x0284c7, roughness: 0.1, metalness: 0.8 });

        // Cho'zinchoq fyuzelyaj
        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.5, 16), whitePlat);
        fuse.rotation.x = Math.PI * 0.5;
        g.add(fuse);

        // Oltin burun konusi
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 16), goldMat);
        nose.position.set(0, 0, 0.95);
        nose.rotation.x = Math.PI * 0.5;
        g.add(nose);

        // Qanotlar
        const wings = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.03, 0.34), whitePlat);
        wings.position.set(0, -0.02, 0.08);
        wings.rotation.y = 0.08;
        g.add(wings);

        // Wingletlar (oltin)
        const wL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.18), goldMat);
        wL.position.set(-0.76, 0.08, 0.08);
        const wR = wL.clone();
        wR.position.x = 0.76;
        g.add(wL);
        g.add(wR);

        // 2 ta turbina
        [-0.26, 0.26].forEach((tx) => {
          const turb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.38, 12), goldMat);
          turb.position.set(tx, 0.08, -0.42);
          turb.rotation.x = Math.PI * 0.5;
          g.add(turb);
        });

        // T-dum qanoti
        const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.28), whitePlat);
        tailFin.position.set(0, 0.22, -0.68);
        tailFin.rotation.x = -0.3;
        g.add(tailFin);

        const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.16), goldMat);
        tailWing.position.set(0, 0.4, -0.74);
        g.add(tailWing);

        // Illyuminatorlar
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.16), windowMat);
        win.position.set(0, 0.1, 0.62);
        win.rotation.x = 0.4;
        g.add(win);
        break;
      }

      default: {
        const dflt = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 1), goldMat);
        g.add(dflt);
      }
    }

    return g;
  }

  // 4. TEZKOR OFFSCREEN 3D THUMBNAIL BAKER
  async function bakeGiftThumbnailsAsync() {
    if (_bakingStarted || typeof THREE === 'undefined') return;
    _bakingStarted = true;

    const catalog = (window.DIGI_GIFTS_CATALOG && Array.isArray(window.DIGI_GIFTS_CATALOG))
      ? window.DIGI_GIFTS_CATALOG : [];
    if (!catalog.length) return;

    try {
      const cvs = document.createElement('canvas');
      cvs.width = 160;
      cvs.height = 160;

      const renderer = new THREE.WebGLRenderer({
        canvas: cvs,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false
      });
      renderer.setPixelRatio(1);
      renderer.setSize(160, 160, false);
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;

      const scene = new THREE.Scene();
      const envMap = createGiftStudioEnvMap(renderer);
      scene.environment = envMap;

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      camera.position.set(1.4, 1.15, 2.3);
      camera.lookAt(0, 0, 0);

      const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.7);
      scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xfff7ed, 1.6);
      dir.position.set(2.5, 3.5, 2.5);
      scene.add(dir);
      const rim = new THREE.DirectionalLight(0x38bdf8, 1.1);
      rim.position.set(-2.5, 1.5, -2);
      scene.add(rim);

      let idx = 0;
      function renderNextBatch() {
        if (idx >= catalog.length) {
          // Tozalash
          try {
            renderer.dispose();
            renderer.forceContextLoss();
          } catch (e) {}
          return;
        }

        const end = Math.min(catalog.length, idx + 2);
        for (let i = idx; i < end; i++) {
          const item = catalog[i];
          if (_giftThumbCache[item.id]) continue;

          const model = buildGift3DModel(item.id, envMap);
          model.rotation.y = 0.45;
          scene.add(model);

          renderer.render(scene, camera);
          const dataUrl = cvs.toDataURL('image/png');
          _giftThumbCache[item.id] = dataUrl;

          // DOM dagi tegishli kartochkani yangilash
          const imgs = document.querySelectorAll(`img[data-gift-thumb="${item.id}"]`);
          imgs.forEach((img) => {
            img.src = dataUrl;
            img.classList.remove('opacity-0');
            const fallback = img.parentElement ? img.parentElement.querySelector('.gift-thumb-fallback') : null;
            if (fallback) fallback.classList.add('hidden');
          });

          scene.remove(model);
        }
        idx = end;
        requestAnimationFrame(renderNextBatch);
      }

      requestAnimationFrame(renderNextBatch);
    } catch (err) {
      console.warn('bakeGiftThumbnailsAsync xatolik:', err);
    }
  }

  // 5. DO'KON VITRINASI — RENDER QILISH
  function renderDigiGiftShop() {
    const grid = document.getElementById('giftShopGrid');
    const tabsContainer = document.getElementById('giftShopTabs');
    if (!grid) return;

    const catalog = (window.DIGI_GIFTS_CATALOG && Array.isArray(window.DIGI_GIFTS_CATALOG))
      ? window.DIGI_GIFTS_CATALOG : [];

    // Tablarni yangilash
    if (tabsContainer && !tabsContainer._rendered) {
      tabsContainer._rendered = true;
      const tabs = [
        { id: 'all', label: 'Barchasi (15)' },
        { id: 'coins', label: '💰 Tangaga (6)' },
        { id: 'bonus', label: '🧰 Sandiq (4)' },
        { id: 'gems', label: '💎 VIP (5)' }
      ];
      tabsContainer.innerHTML = '';
      tabs.forEach((t) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ios-fh-tab px-3 py-1 rounded-full text-[10.5px] font-bold transition shrink-0 ${
          _currentShopTab === t.id ? 'ios-fh-tab-active bg-sky-500 text-white shadow' : 'bg-slate-900/80 text-slate-300 hover:text-white'
        }`;
        btn.textContent = t.label;
        btn.addEventListener('click', () => {
          _currentShopTab = t.id;
          tabsContainer.querySelectorAll('button').forEach((b) => {
            b.className = 'ios-fh-tab px-3 py-1 rounded-full text-[10.5px] font-bold transition shrink-0 bg-slate-900/80 text-slate-300 hover:text-white';
          });
          btn.className = 'ios-fh-tab px-3 py-1 rounded-full text-[10.5px] font-bold transition shrink-0 ios-fh-tab-active bg-sky-500 text-white shadow';
          renderDigiGiftShop();
        });
        tabsContainer.appendChild(btn);
      });
    }

    const filtered = catalog.filter((g) => {
      if (_currentShopTab === 'coins') return g.category === 'coins';
      if (_currentShopTab === 'bonus') return g.category === 'bonus';
      if (_currentShopTab === 'gems') return g.category === 'gems';
      return true;
    });

    grid.innerHTML = '';
    filtered.forEach((gift) => {
      const card = document.createElement('div');
      card.className = 'ios-shop-card p-2 rounded-xl flex flex-col justify-between gap-1.5 cursor-pointer hover:border-amber-400/60 transition active:scale-[0.98] select-none';
      card.setAttribute('data-gift-id', gift.id);

      const ownedCount = getOwnedGiftCount(gift.id);
      const thumbUrl = _giftThumbCache[gift.id];

      // Narx ko'rinishi
      let priceHtml = '';
      if (gift.category === 'coins') {
        priceHtml = `<span class="text-[10px] font-mono font-extrabold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full">$${gift.price.toLocaleString('en-US')}</span>`;
      } else if (gift.category === 'bonus') {
        priceHtml = `<span class="text-[9.5px] font-bold text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full">🧰 Sandiq</span>`;
      } else if (gift.category === 'gems') {
        priceHtml = `<span class="text-[10px] font-mono font-extrabold text-cyan-200 bg-cyan-950/60 border border-cyan-400/50 px-2 py-0.5 rounded-full">💎 ${gift.price}</span>`;
      }

      card.innerHTML = `
        <div class="flex items-center justify-between gap-1">
          <span class="text-[8.5px] font-extrabold uppercase tracking-wider text-amber-400/90">${gift.rarity}</span>
          <div class="flex items-center gap-1">
            <span class="text-[9px] font-bold text-sky-300">👑 +${gift.prestige}</span>
            ${ownedCount > 0 ? `<span class="text-[9px] font-black text-emerald-300 bg-emerald-950/80 border border-emerald-400/60 px-1.5 rounded-full">×${ownedCount}</span>` : ''}
          </div>
        </div>

        <div class="ios-shop-preview h-[76px] flex items-center justify-center relative overflow-hidden rounded-lg bg-slate-950/70 border border-slate-800" style="box-shadow: inset 0 2px 8px rgba(0,0,0,0.8), 0 0 16px ${gift.glow}33;">
          <span class="gift-thumb-fallback ${thumbUrl ? 'hidden' : ''} text-3xl filter drop-shadow-[0_0_12px_${gift.glow}]">${gift.icon}</span>
          <img data-gift-thumb="${gift.id}" src="${thumbUrl || ''}" alt="${gift.name}" class="${thumbUrl ? '' : 'opacity-0'} w-full h-full object-contain pointer-events-none transition-opacity duration-300" />
        </div>

        <div class="flex items-center justify-between gap-1 pt-0.5">
          <span class="text-[10.5px] font-bold text-white truncate max-w-[58%]" title="${gift.name}">${gift.name}</span>
          ${priceHtml}
        </div>
      `;

      card.addEventListener('click', () => {
        playUiSound('btn_click');
        openGiftDetailModal(gift.id);
      });

      grid.appendChild(card);
    });

    // Thumbnail bakingni boshlash
    bakeGiftThumbnailsAsync();
  }

  // 6. 360° JONLI 3D DETAIL VA YUBORISH MODALI (#modalGiftDetail)
  function ensureGiftDetailModalDOM() {
    if (document.getElementById('modalGiftDetail')) return;

    const lobby = document.getElementById('lobbyView') || document.body;
    const modal = document.createElement('div');
    modal.id = 'modalGiftDetail';
    modal.className = 'hidden fixed inset-0 z-[55] flex items-center justify-center p-2.5';
    modal.innerHTML = `
      <div class="ios-fh-sheet w-full max-w-4xl h-[94%] flex flex-col overflow-hidden">
        <!-- Yuqori Sarlavha -->
        <div class="ios-fh-nav shrink-0 h-[44px] px-3.5 flex items-center justify-between gap-2 border-b border-slate-700/50">
          <div class="flex items-center gap-2 min-w-0">
            <span id="giftDetailIcon" class="text-lg">🎁</span>
            <h2 id="giftDetailTitle" class="text-[15px] font-bold tracking-tight text-white drop-shadow truncate">Sovg'a Ko'rinishi</h2>
            <span id="giftDetailRarityBadge" class="ios-fh-stat-pill text-[9.5px] font-bold px-2 py-0.5 rounded-full text-amber-300 uppercase">Oddiy</span>
          </div>
          <button id="btnCloseGiftDetailModal" type="button" class="ios-btn-circle" title="Yopish">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- 2 Ustunli Tarkib: Chap — 3D Sahna | O'ng — Xarid / Yuborish -->
        <div class="grid grid-cols-2 gap-3 p-3 flex-1 min-h-0 overflow-hidden">
          
          <!-- CHAP: 360° PBR 3D Studiya -->
          <div class="ios-bonus-stage relative flex-1 min-h-0 overflow-hidden flex flex-col justify-between p-2 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div class="relative w-full flex-1 min-h-0 overflow-hidden">
              <canvas id="giftDetail3DCanvas" class="w-full h-full block cursor-grab active:cursor-grabbing touch-none"></canvas>
            </div>
            <div class="shrink-0 pt-1 text-center select-none">
              <p class="text-[9.5px] text-sky-300 font-medium">👆 Barmoq bilan 360° erkin aylantiring</p>
              <p id="giftDetailDesc" class="text-[10px] text-slate-300 line-clamp-2 mt-0.5">Tavsif</p>
              <div class="flex items-center justify-center gap-2 mt-1">
                <span id="giftDetailPrestige" class="text-[10px] font-mono font-bold text-amber-300">👑 +0 Obro'</span>
                <span class="text-slate-500">•</span>
                <span id="giftDetailOwnedBadge" class="text-[10px] text-emerald-300 font-semibold">Sizda bor: 0 dona</span>
              </div>
            </div>
          </div>

          <!-- O'NG: Xarid va Do'stga Yuborish Paneli -->
          <div class="ios-fh-group p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-y-auto">
            <div class="space-y-2.5">
              
              <!-- Narx va Rejim tanlash -->
              <div class="flex items-center justify-between pb-1.5 border-b border-slate-700/60">
                <span class="text-[11px] font-bold text-slate-300">Narxi:</span>
                <span id="giftDetailPriceLabel" class="text-sm font-mono font-black text-amber-300">$0</span>
              </div>

              <!-- Faqat Sandiq sovg'alari uchun tushuntirish -->
              <div id="giftBonusOnlyBox" class="hidden p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2">
                <p class="text-[11px] text-amber-200 leading-snug">
                  🧰 <b>Eksklyuziv Sandiq Sovg'asi!</b><br>
                  Bu 3D sovg'ani sotib olib bo'lmaydi. Uni faqat <b>3D Oltin Sandiq</b> ochib yutib olish mumkin!
                </p>
                <button id="btnGoToBonusModal" type="button" class="w-full ios-btn-gold py-2 text-xs font-bold flex items-center justify-center gap-1.5">
                  <span>🧰</span>
                  <span>Oltin Sandiqni Ochish</span>
                </button>
              </div>

              <!-- Sotib olinadigan sovg'alar paneli -->
              <div id="giftBuyPanel" class="space-y-2.5">
                <!-- Rejimlar: O'zimga | Do'stga -->
                <div class="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
                  <button id="tabModeSelf" type="button" class="py-1.5 rounded-lg text-[11px] font-bold transition bg-sky-500 text-white shadow">
                    📥 O'zimga olish
                  </button>
                  <button id="tabModeSend" type="button" class="py-1.5 rounded-lg text-[11px] font-bold transition text-slate-300 hover:text-white">
                    🎁 Do'stga yuborish
                  </button>
                </div>

                <!-- Do'st tanlash qismi -->
                <div id="giftSendRecipientSection" class="hidden space-y-2 pt-1">
                  <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-300">Qabul qiluvchi o'yinchi:</label>
                  
                  <div class="relative">
                    <input id="inputGiftRecipientQuery" type="text" placeholder="Ism yoki DOOM-ID yozing..." class="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
                    <button id="btnSearchRecipient" type="button" class="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-sky-400 hover:text-white px-1.5 py-0.5">🔍</button>
                  </div>

                  <!-- Qidiruv / Do'stlar ixcham ro'yxati -->
                  <div id="giftRecipientList" class="max-h-28 overflow-y-auto space-y-1 p-1 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px]">
                    <div class="text-[10px] text-slate-400 p-1.5 text-center">Do'stlar yuklanmoqda...</div>
                  </div>

                  <!-- Ixtiyoriy tilak xabari -->
                  <input id="inputGiftNote" type="text" maxlength="80" placeholder="Tabrik yoki tilak yozing (ixtiyoriy)..." class="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400" />
                </div>

                <!-- Kristal sotib olish havolasi -->
                <div id="giftGemsPromoBox" class="hidden p-2 rounded-lg bg-cyan-950/40 border border-cyan-400/30 flex items-center justify-between text-[10.5px]">
                  <span class="text-cyan-200">💎 Kristal yetarli emasmi?</span>
                  <button id="btnOpenGemsFromGift" type="button" class="text-amber-300 hover:underline font-bold text-[11px]">Admindan olish ›</button>
                </div>
              </div>

            </div>

            <!-- Asosiy Xarid / Yuborish Tugmasi -->
            <button id="btnConfirmGiftBuy" type="button" class="w-full ios-btn-gold py-3 px-4 text-xs font-black flex items-center justify-center gap-2 shrink-0">
              <span>📥</span>
              <span id="btnConfirmGiftBuyText">XARID QILISH</span>
            </button>
          </div>

        </div>
      </div>
    `;

    lobby.appendChild(modal);

    // Hodisalarni ulash
    document.getElementById('btnCloseGiftDetailModal').addEventListener('click', closeGiftDetailModal);
    document.getElementById('btnGoToBonusModal').addEventListener('click', () => {
      closeGiftDetailModal();
      const shop = document.getElementById('modalShop');
      if (shop) shop.classList.add('hidden');
      const bonus = document.getElementById('modalBonus');
      if (bonus) bonus.classList.remove('hidden');
    });

    const tabSelf = document.getElementById('tabModeSelf');
    const tabSend = document.getElementById('tabModeSend');
    const sendSection = document.getElementById('giftSendRecipientSection');

    tabSelf.addEventListener('click', () => {
      _buyGiftMode = 'self';
      tabSelf.className = 'py-1.5 rounded-lg text-[11px] font-bold transition bg-sky-500 text-white shadow';
      tabSend.className = 'py-1.5 rounded-lg text-[11px] font-bold transition text-slate-300 hover:text-white';
      sendSection.classList.add('hidden');
      updateBuyButtonLabel();
    });

    tabSend.addEventListener('click', () => {
      _buyGiftMode = 'send';
      tabSend.className = 'py-1.5 rounded-lg text-[11px] font-bold transition bg-sky-500 text-white shadow';
      tabSelf.className = 'py-1.5 rounded-lg text-[11px] font-bold transition text-slate-300 hover:text-white';
      sendSection.classList.remove('hidden');
      loadDirectoryForGiftSend();
      updateBuyButtonLabel();
    });

    document.getElementById('btnOpenGemsFromGift').addEventListener('click', () => {
      openBuyGemsModal();
    });

    document.getElementById('btnConfirmGiftBuy').addEventListener('click', handleGiftPurchase);

    // 3D Canvas Pointer Events (360° erkin aylantirish)
    const cvs = document.getElementById('giftDetail3DCanvas');
    cvs.addEventListener('pointerdown', (e) => {
      _isDraggingDetail = true;
      _lastPointerX = e.clientX;
      _lastPointerY = e.clientY;
      try { cvs.setPointerCapture(e.pointerId); } catch (err) {}
    });

    cvs.addEventListener('pointermove', (e) => {
      if (!_isDraggingDetail) return;
      const rot90 = isRot90Active();
      // 90° ekranda gorizontal harakat Y koordinata orqali boshqariladi
      const dx = rot90 ? (e.clientY - _lastPointerY) : (e.clientX - _lastPointerX);
      const dy = rot90 ? -(e.clientX - _lastPointerX) : (e.clientY - _lastPointerY);

      _lastPointerX = e.clientX;
      _lastPointerY = e.clientY;

      _detailYaw += dx * 0.015;
      _detailPitch = Math.max(-0.6, Math.min(0.8, _detailPitch + dy * 0.01));
    });

    const stopDrag = () => { _isDraggingDetail = false; };
    cvs.addEventListener('pointerup', stopDrag);
    cvs.addEventListener('pointercancel', stopDrag);
  }

  // 7. DETAIL 3D SAHNA VA RENDER TSIKLI (60 FPS + To'xtatish Himoyasi)
  function initGiftDetail3DEngine() {
    if (_detailRenderer || typeof THREE === 'undefined') return;
    const cvs = document.getElementById('giftDetail3DCanvas');
    if (!cvs) return;

    _detailRenderer = new THREE.WebGLRenderer({
      canvas: cvs,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    });
    _detailRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    _detailRenderer.shadowMap.enabled = false;
    _detailRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    _detailRenderer.toneMappingExposure = 1.22;

    _detailScene = new THREE.Scene();
    _detailEnvMap = createGiftStudioEnvMap(_detailRenderer);
    _detailScene.environment = _detailEnvMap;

    _detailCamera = new THREE.PerspectiveCamera(35, 1.3, 0.1, 20);
    _detailCamera.position.set(0, 0.65, 2.75);
    _detailCamera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0b0f1a, 0.55);
    _detailScene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff3d1, 1.85);
    dir.position.set(2.5, 3.8, 3.2);
    _detailScene.add(dir);

    const rim = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rim.position.set(-2.8, 1.6, -2.4);
    _detailScene.add(rim);

    const goldBounce = new THREE.PointLight(0xf59e0b, 0.85, 6);
    goldBounce.position.set(1.5, -0.4, 2.0);
    _detailScene.add(goldBounce);

    _detailModelGroup = new THREE.Group();
    _detailScene.add(_detailModelGroup);
  }

  function syncGiftDetailViewport() {
    if (!_detailRenderer || !_detailCamera) return;
    const cvs = _detailRenderer.domElement;
    const stage = cvs.parentElement || cvs;
    const w = Math.floor(stage.clientWidth || cvs.clientWidth || 0);
    const h = Math.floor(stage.clientHeight || cvs.clientHeight || 0);
    if (w < 20 || h < 20) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const tw = Math.round(w * dpr);
    const th = Math.round(h * dpr);
    if (cvs.width !== tw || cvs.height !== th) {
      _detailRenderer.setPixelRatio(dpr);
      _detailRenderer.setSize(w, h, false);
    }
    const aspect = w / h;
    if (Math.abs(_detailCamera.aspect - aspect) > 0.002) {
      _detailCamera.aspect = aspect;
      _detailCamera.updateProjectionMatrix();
    }
  }

  function renderGiftDetailLoop() {
    const modal = document.getElementById('modalGiftDetail');
    // QAT'IY 60 FPS VA 0% YUK HIMOYASI:
    if (window.gameRunning || !modal || modal.classList.contains('hidden') || getComputedStyle(modal).display === 'none') {
      _detailAnimId = null;
      return;
    }

    initGiftDetail3DEngine();
    syncGiftDetailViewport();

    if (!_isDraggingDetail) {
      _detailYaw += 0.008; // Sekin jozibali aylanish
    }

    if (_detailModelGroup) {
      _detailModelGroup.rotation.y = _detailYaw;
      _detailModelGroup.rotation.x = _detailPitch;
    }

    if (_detailRenderer && _detailScene && _detailCamera) {
      _detailRenderer.render(_detailScene, _detailCamera);
    }

    _detailAnimId = requestAnimationFrame(renderGiftDetailLoop);
  }

  // 8. DETAIL OYNANI OCHISH / YOPISH
  function openGiftDetailModal(giftId) {
    ensureGiftDetailModalDOM();
    const catalog = (window.DIGI_GIFTS_CATALOG && Array.isArray(window.DIGI_GIFTS_CATALOG))
      ? window.DIGI_GIFTS_CATALOG : [];
    const gift = catalog.find((g) => g.id === giftId);
    if (!gift) return;

    _activeDetailGift = gift;
    _buyGiftMode = 'self';
    _selectedRecipient = null;
    _detailYaw = 0.3;
    _detailPitch = 0.08;

    // DOM qiymatlarini to'ldirish
    document.getElementById('giftDetailIcon').textContent = gift.icon;
    document.getElementById('giftDetailTitle').textContent = gift.name;
    document.getElementById('giftDetailRarityBadge').textContent = gift.rarity;
    document.getElementById('giftDetailDesc').textContent = gift.desc;
    document.getElementById('giftDetailPrestige').textContent = `👑 +${gift.prestige} Obro'`;
    document.getElementById('giftDetailOwnedBadge').textContent = `Sizda bor: ${getOwnedGiftCount(gift.id)} dona`;

    const priceLbl = document.getElementById('giftDetailPriceLabel');
    if (gift.category === 'coins') {
      priceLbl.textContent = `$${gift.price.toLocaleString('en-US')}`;
      priceLbl.className = 'text-sm font-mono font-black text-amber-300';
    } else if (gift.category === 'bonus') {
      priceLbl.textContent = '🔒 Faqat 3D Sandiqdan';
      priceLbl.className = 'text-xs font-bold text-amber-400';
    } else if (gift.category === 'gems') {
      priceLbl.textContent = `💎 ${gift.price} (${(gift.uzsPrice || gift.price * 1000).toLocaleString('en-US')} so'm)`;
      priceLbl.className = 'text-sm font-mono font-black text-cyan-300';
    }

    const bonusBox = document.getElementById('giftBonusOnlyBox');
    const buyPanel = document.getElementById('giftBuyPanel');
    const btnBuy = document.getElementById('btnConfirmGiftBuy');

    if (gift.category === 'bonus') {
      bonusBox.classList.remove('hidden');
      buyPanel.classList.add('hidden');
      btnBuy.classList.add('hidden');
    } else {
      bonusBox.classList.add('hidden');
      buyPanel.classList.remove('hidden');
      btnBuy.classList.remove('hidden');

      const gemsPromo = document.getElementById('giftGemsPromoBox');
      if (gift.category === 'gems') gemsPromo.classList.remove('hidden');
      else gemsPromo.classList.add('hidden');
    }

    // Rejimni reset qilish
    document.getElementById('tabModeSelf').className = 'py-1.5 rounded-lg text-[11px] font-bold transition bg-sky-500 text-white shadow';
    document.getElementById('tabModeSend').className = 'py-1.5 rounded-lg text-[11px] font-bold transition text-slate-300 hover:text-white';
    document.getElementById('giftSendRecipientSection').classList.add('hidden');
    updateBuyButtonLabel();

    // 3D Modelni yuklash
    initGiftDetail3DEngine();
    if (_detailModelGroup) {
      while (_detailModelGroup.children.length > 0) {
        _detailModelGroup.remove(_detailModelGroup.children[0]);
      }
      const newModel = buildGift3DModel(gift.id, _detailEnvMap);
      _detailModelGroup.add(newModel);
    }

    const modal = document.getElementById('modalGiftDetail');
    modal.classList.remove('hidden');

    if (!_detailAnimId) {
      _detailAnimId = requestAnimationFrame(renderGiftDetailLoop);
    }
    setTimeout(syncGiftDetailViewport, 120);
  }

  function closeGiftDetailModal() {
    const modal = document.getElementById('modalGiftDetail');
    if (modal) modal.classList.add('hidden');
    if (_detailAnimId) {
      cancelAnimationFrame(_detailAnimId);
      _detailAnimId = null;
    }
  }

  function updateBuyButtonLabel() {
    const btnText = document.getElementById('btnConfirmGiftBuyText');
    if (!btnText || !_activeDetailGift) return;

    const g = _activeDetailGift;
    if (_buyGiftMode === 'self') {
      if (g.category === 'coins') btnText.textContent = `O'ZIMGA OLISH — $${g.price.toLocaleString('en-US')}`;
      else if (g.category === 'gems') btnText.textContent = `O'ZIMGA OLISH — 💎 ${g.price}`;
    } else {
      const recName = _selectedRecipient ? (_selectedRecipient.name || _selectedRecipient.id) : 'DO\'STGA';
      if (g.category === 'coins') btnText.textContent = `🎁 ${recName} ga — $${g.price.toLocaleString('en-US')}`;
      else if (g.category === 'gems') btnText.textContent = `🎁 ${recName} ga — 💎 ${g.price}`;
    }
  }

  async function loadDirectoryForGiftSend() {
    const container = document.getElementById('giftRecipientList');
    if (!container) return;

    try {
      const myId = getMyDoomId();
      if (!_cachedDirectory.length) {
        const res = await fetch(`/api/tg/directory?myId=${encodeURIComponent(myId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.all)) _cachedDirectory = data.all;
        }
      }
      renderRecipientList(_cachedDirectory);
    } catch (e) {
      container.innerHTML = '<div class="text-[10px] text-slate-400 p-1.5 text-center">Do\'stlar ro\'yxati yuklanmadi. Quyiga ID yozishingiz mumkin.</div>';
    }

    const inp = document.getElementById('inputGiftRecipientQuery');
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) {
        renderRecipientList(_cachedDirectory);
        return;
      }
      const filtered = _cachedDirectory.filter((p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q)) ||
        (p.username && p.username.toLowerCase().includes(q))
      );
      renderRecipientList(filtered);
    };
  }

  function renderRecipientList(list) {
    const container = document.getElementById('giftRecipientList');
    if (!container) return;
    if (!list || !list.length) {
      container.innerHTML = '<div class="text-[10px] text-slate-400 p-1.5 text-center">O\'yinchi topilmadi. To\'g\'ridan-to\'g\'ri DOOM-ID yozishingiz mumkin.</div>';
      return;
    }

    container.innerHTML = '';
    list.slice(0, 15).forEach((p) => {
      const isSelected = _selectedRecipient && _selectedRecipient.id === p.id;
      const row = document.createElement('div');
      row.className = `flex items-center justify-between p-1.5 rounded cursor-pointer transition ${
        isSelected ? 'bg-sky-600/60 border border-sky-400/80 text-white' : 'hover:bg-slate-900 text-slate-200'
      }`;
      row.innerHTML = `
        <div class="flex items-center gap-1.5 truncate">
          <span class="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] shrink-0">👤</span>
          <span class="font-bold truncate">${p.name || p.id}</span>
          <span class="font-mono text-[9px] text-slate-400">(${p.id})</span>
        </div>
        <span class="text-[9.5px] font-mono text-amber-300 shrink-0">ELO: ${p.elo || 1000}</span>
      `;
      row.addEventListener('click', () => {
        _selectedRecipient = p;
        const inp = document.getElementById('inputGiftRecipientQuery');
        if (inp) inp.value = p.id;
        renderRecipientList(list);
        updateBuyButtonLabel();
      });
      container.appendChild(row);
    });
  }

  // 9. SOVG'ANI SOTIB OLISH HANDLERI
  let _isBuyingNow = false;
  async function handleGiftPurchase() {
    if (_isBuyingNow || !_activeDetailGift) return;
    const gift = _activeDetailGift;

    const myCoins = getMyCoins();
    const myGems = getMyGems();

    // Balans tekshiruvi
    if (gift.currency === 'coins' && myCoins < gift.price) {
      playUiSound('error');
      showUiToast('Tangalar yetarli emas! 5v5 jang o\'ynang yoki Oltin Sandiq oching.', '⚠️');
      return;
    }
    if (gift.currency === 'gems' && myGems < gift.price) {
      playUiSound('error');
      showUiToast('Kristallar yetarli emas! Admindan xarid qiling.', '💎');
      openBuyGemsModal();
      return;
    }

    let recipientId = '';
    let note = '';
    if (_buyGiftMode === 'send') {
      const inp = document.getElementById('inputGiftRecipientQuery');
      recipientId = _selectedRecipient ? _selectedRecipient.id : (inp ? inp.value.trim().toUpperCase() : '');
      if (!recipientId) {
        showUiToast('Qabul qiluvchi o\'yinchini tanlang yoki ID sini kiriting!', '⚠️');
        return;
      }
      const noteInp = document.getElementById('inputGiftNote');
      if (noteInp) note = noteInp.value.trim();
    }

    _isBuyingNow = true;
    const btn = document.getElementById('btnConfirmGiftBuy');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span><span>XARID QILINMOQDA...</span>';
    btn.disabled = true;

    try {
      const res = await fetch('/api/tg/gifts/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId: getMyDoomId(),
          giftId: gift.id,
          recipientId: recipientId,
          note: note
        })
      });

      const data = await res.json();
      if (data && data.ok) {
        // Muvaffaqiyatli xarid
        if (data.buyerStats) {
          if (window.userStats) {
            window.userStats.coins = data.buyerStats.coins;
            window.userStats.gems = data.buyerStats.gems;
            window.userStats.gifts = data.buyerStats.gifts;
            window.userStats.prestige = data.buyerStats.prestige;
            window.userStats.giftSummary = data.buyerStats.giftSummary;
          }
          if (window.DIGI_TG_PROFILE) {
            window.DIGI_TG_PROFILE.coins = data.buyerStats.coins;
            window.DIGI_TG_PROFILE.gems = data.buyerStats.gems;
            window.DIGI_TG_PROFILE.gifts = data.buyerStats.gifts;
            window.DIGI_TG_PROFILE.prestige = data.buyerStats.prestige;
          }
        }

        if (typeof window.saveUserData === 'function') window.saveUserData();
        if (typeof window.updateMainMenuWidgets === 'function') window.updateMainMenuWidgets();
        renderDigiGiftShop();

        playUiSound('victory_fanfare');
        if (data.mode === 'gift') {
          showUiToast(`🎉 ${gift.name} sovg'asi ${data.targetName} ga yuborildi!`, '🎁');
        } else {
          showUiToast(`🎉 ${gift.name} muvaffaqiyatli xarid qilindi! (+${gift.prestige} Obro')`, '✨');
        }

        closeGiftDetailModal();
      } else {
        playUiSound('error');
        if (data && data.error === 'NOT_ENOUGH_GEMS') {
          showUiToast('Kristallar yetarli emas! Admindan xarid qiling.', '💎');
          openBuyGemsModal();
        } else if (data && data.error === 'NOT_ENOUGH_COINS') {
          showUiToast('Tangalar yetarli emas!', '⚠️');
        } else {
          showUiToast(data.message || 'Xatolik yuz berdi. Qayta urinib ko\'ring.', '❌');
        }
      }
    } catch (err) {
      showUiToast('Tarmoq xatosi. Aloqani tekshiring.', '❌');
    } finally {
      _isBuyingNow = false;
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  }

  // 10. 💎 KRISTAL SOTIB OLISH MODALI (#modalBuyGems)
  function ensureBuyGemsModalDOM() {
    if (document.getElementById('modalBuyGems')) return;

    const lobby = document.getElementById('lobbyView') || document.body;
    const modal = document.createElement('div');
    modal.id = 'modalBuyGems';
    modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-2.5';
    modal.innerHTML = `
      <div class="ios-fh-sheet w-full max-w-4xl h-[94%] flex flex-col overflow-hidden">
        <!-- Yuqori Sarlavha + Jonli Kristal Balansi -->
        <div class="ios-fh-nav shrink-0 h-[44px] px-3.5 flex items-center justify-between gap-2 border-b border-slate-700/50">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xl">💎</span>
            <h2 class="text-[15px] font-bold tracking-tight text-white drop-shadow truncate">Kristal Do'koni</h2>
            <span class="ios-fh-stat-pill text-cyan-200 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">1 💎 = 1,000 so'm</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="ios-fh-stat-pill px-3 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-mono font-extrabold text-cyan-300 border border-cyan-400/50">
              <span>💎</span>
              <span id="buyGemsModalBalance">0</span>
            </div>
            <button id="btnCloseBuyGemsModal" type="button" class="ios-btn-circle" title="Yopish">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- 2 Ustunli Tarkib: Chap — 5 Paket | O'ng — Buyurtma va Telegram Admin Lichkasi -->
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
            <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[9.5px] text-slate-400 leading-snug">
              ℹ️ <b>Eslatma:</b> Kristallar faqat admin orqali rasmiy ravishda hisobingizga qo'shiladi. O'yinda bepul kristal generatorlari yo'q va bo'lmaydi.
            </div>
          </div>

          <!-- O'NG: Buyurtma Tafsilotlari va Adminga Yuborish -->
          <div class="ios-fh-group p-3 flex flex-col justify-between gap-2.5 min-h-0 overflow-y-auto">
            <div class="space-y-3">
              <!-- Tanlangan Paket Xulosasi -->
              <div class="p-3 rounded-2xl bg-gradient-to-b from-sky-950/60 to-slate-950 border border-sky-400/50 text-center">
                <span class="text-[10px] font-bold text-sky-300 uppercase tracking-wider">Tanlangan Paket</span>
                <div id="summaryGemsAmount" class="text-3xl font-black font-mono text-cyan-200 mt-1">💎 35</div>
                <div id="summaryGemsPrice" class="text-sm font-extrabold text-amber-300 font-mono mt-0.5">35,000 so'm</div>
              </div>

              <!-- Foydalanuvchi ID si va Nusxalash -->
              <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <span class="text-[9.5px] text-slate-400 block">Sizning O'yin ID:</span>
                  <span id="buyGemsMyId" class="font-mono text-xs font-black text-amber-300">DOOM-XXXX</span>
                </div>
                <button id="btnCopyIdForGems" type="button" class="ios-btn-gray py-1 px-2.5 text-[10px] font-bold flex items-center gap-1">
                  <span>📋</span>
                  <span>Nusxalash</span>
                </button>
              </div>

              <!-- 3 Qadamli Yo'riqnoma -->
              <div class="space-y-1.5 px-1 text-[10.5px] text-slate-300">
                <div class="flex items-start gap-1.5">
                  <span class="text-sky-400 font-bold">1.</span>
                  <span>Paketni tanlang va pastdagi tugmani bosing.</span>
                </div>
                <div class="flex items-start gap-1.5">
                  <span class="text-sky-400 font-bold">2.</span>
                  <span>Xabar va ID nusxalanadi, Telegramda admin ochiladi.</span>
                </div>
                <div class="flex items-start gap-1.5">
                  <span class="text-sky-400 font-bold">3.</span>
                  <span>To'lovdan so'ng admin kristalni darhol balansingizga o'tkazadi!</span>
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <!-- Admindan Sotib Olish Katta Tugmasi -->
              <button id="btnOrderGemsViaTelegram" type="button" class="w-full ios-btn-blue py-3 px-4 text-xs font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition">
                <span>💬</span>
                <span>ADMINDAN SOTIB OLISH (@Abror444)</span>
              </button>

              <!-- Balansni yangilash -->
              <button id="btnRefreshGemsBalance" type="button" class="w-full text-center text-[10.5px] text-slate-400 hover:text-white py-1">
                🔄 Balansni yangilash
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    lobby.appendChild(modal);

    document.getElementById('btnCloseBuyGemsModal').addEventListener('click', closeBuyGemsModal);

    document.getElementById('btnCopyIdForGems').addEventListener('click', () => {
      const id = getMyDoomId();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(() => {
          showUiToast(`📋 ID nusxalandi: ${id}`, '✓');
        });
      }
    });

    document.getElementById('btnOrderGemsViaTelegram').addEventListener('click', () => {
      const pkg = _selectedGemPackage || { gems: 35, uzs: 35000 };
      const myId = getMyDoomId();
      const msg = `Salom! DIGI DIGI o'yiniga ${pkg.gems} 💎 (${pkg.uzs.toLocaleString('en-US')} so'm) kristal olmoqchiman. Mening ID: ${myId}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).catch(() => {});
      }
      showUiToast('Adminga xabar matni nusxalandi!', '💎');

      const config = window.DIGI_GEMS_CONFIG || {};
      const deepLink = config.adminDeepLink || 'tg://user?id=5155194813';
      const fallbackUrl = config.adminFallbackUrl || 'https://t.me/Abror444';

      try {
        window.location.href = deepLink;
        setTimeout(() => {
          window.open(fallbackUrl, '_blank');
        }, 600);
      } catch (e) {
        window.open(fallbackUrl, '_blank');
      }
    });

    document.getElementById('btnRefreshGemsBalance').addEventListener('click', async () => {
      if (typeof window.tgBridgeRefreshFromServer === 'function') {
        showUiToast('Balans tekshirilmoqda...', '🔄');
        await window.tgBridgeRefreshFromServer();
        const curG = getMyGems();
        document.getElementById('buyGemsModalBalance').textContent = curG.toLocaleString('en-US');
        showUiToast(`Joriy balans: ${curG} 💎`, '💎');
      }
    });
  }

  function openBuyGemsModal() {
    ensureBuyGemsModalDOM();
    const config = window.DIGI_GEMS_CONFIG || {
      packages: [
        { gems: 15, uzs: 15000, label: 'Start Paket', badge: '' },
        { gems: 35, uzs: 35000, label: 'Mashhur', badge: '🔥 OMMABOP' },
        { gems: 75, uzs: 75000, label: 'VIP Paket', badge: '👑 VIP' },
        { gems: 150, uzs: 150000, label: 'Elita Paket', badge: '⚡ ELITA' },
        { gems: 300, uzs: 300000, label: 'Imperator', badge: '💎 MAX' }
      ]
    };

    if (!_selectedGemPackage) _selectedGemPackage = config.packages[1];

    document.getElementById('buyGemsMyId').textContent = getMyDoomId();
    document.getElementById('buyGemsModalBalance').textContent = getMyGems().toLocaleString('en-US');

    // Paketlar ro'yxati
    const container = document.getElementById('gemsPackagesList');
    container.innerHTML = '';
    config.packages.forEach((pkg) => {
      const isSelected = _selectedGemPackage && _selectedGemPackage.gems === pkg.gems;
      const card = document.createElement('div');
      card.className = `p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
        isSelected
          ? 'bg-gradient-to-r from-sky-950 to-slate-900 border-cyan-400/90 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
      }`;
      card.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">💎</span>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="font-black font-mono text-sm text-cyan-200">${pkg.gems} Kristal</span>
              ${pkg.badge ? `<span class="text-[8.5px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.2 rounded-full">${pkg.badge}</span>` : ''}
            </div>
            <span class="text-[9.5px] text-slate-400">${pkg.label}</span>
          </div>
        </div>
        <div class="text-right">
          <span class="font-mono font-bold text-xs text-amber-300 block">${pkg.uzs.toLocaleString('en-US')} so'm</span>
        </div>
      `;
      card.addEventListener('click', () => {
        _selectedGemPackage = pkg;
        document.getElementById('summaryGemsAmount').textContent = `💎 ${pkg.gems}`;
        document.getElementById('summaryGemsPrice').textContent = `${pkg.uzs.toLocaleString('en-US')} so'm`;
        openBuyGemsModal(); // re-render list highlight
      });
      container.appendChild(card);
    });

    document.getElementById('summaryGemsAmount').textContent = `💎 ${_selectedGemPackage.gems}`;
    document.getElementById('summaryGemsPrice').textContent = `${_selectedGemPackage.uzs.toLocaleString('en-US')} so'm`;

    const modal = document.getElementById('modalBuyGems');
    modal.classList.remove('hidden');
  }

  function closeBuyGemsModal() {
    const modal = document.getElementById('modalBuyGems');
    if (modal) modal.classList.add('hidden');
  }

  function openDigiGiftShopModal() {
    if (typeof window.updateMainMenuWidgets === 'function') window.updateMainMenuWidgets();
    renderDigiGiftShop();
    const modal = document.getElementById('modalShop');
    if (modal) modal.classList.remove('hidden');
  }

  function updateGiftAndGemLabels() {
    const curG = getMyGems();
    const f = curG.toLocaleString('en-US');
    ['userGemsLabel', 'shopGemsLabel', 'buyGemsModalBalance'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = f;
    });
  }

  // 11. GLOBAL EKSPORTLAR
  window.renderDigiGiftShop = renderDigiGiftShop;
  window.openDigiGiftShopModal = openDigiGiftShopModal;
  window.openGiftDetailModal = openGiftDetailModal;
  window.openBuyGemsModal = openBuyGemsModal;
  window.buildDigiGift3DModel = buildGift3DModel;
  window.getDigiGiftThumb = (id) => _giftThumbCache[id] || null;
  window.onDigiGiftsUpdated = function () {
    updateGiftAndGemLabels();
    const shop = document.getElementById('modalShop');
    if (shop && !shop.classList.contains('hidden')) {
      renderDigiGiftShop();
    }
  };

  // DOM yuklanganda avtomatik tayyorlash
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureGiftDetailModalDOM();
      ensureBuyGemsModalDOM();
    });
  } else {
    ensureGiftDetailModalDOM();
    ensureBuyGemsModalDOM();
  }
})();
