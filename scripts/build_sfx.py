import asyncio
import math
import os
import random
import struct
import subprocess
import tempfile
import wave
import edge_tts
import imageio_ffmpeg

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SFX_DIR = os.path.join(ROOT_DIR, "public", "sfx")
WEAPONS_DIR = os.path.join(SFX_DIR, "weapons")
RADIO_UZ_DIR = os.path.join(SFX_DIR, "radio", "uz")
RADIO_RU_DIR = os.path.join(SFX_DIR, "radio", "ru")

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100

RADIO_UZ = {
    "go": "Olg'a, yigitlar! Pozitsiyani oling!",
    "right": "O'ngdan chiqyapti! Ehtiyot bo'l!",
    "left": "Chap tarafdan! Qara!",
    "behind": "Orqangdan! Orqaga qara!",
    "front": "Oldinda dushman!",
    "grenade": "Granata! Yerga yoting!",
    "kill": "Bittasi quladi!",
    "headshot": "Aniq boshga!",
    "reload": "O'qlayapman, yopib turing!",
    "need_help": "Yaralandim, yordam kerak!",
    "win": "G'alaba bizniki! Zo'r ish!",
    "lose": "Keyingi raundda olamiz!"
}

RADIO_RU = {
    "go": "Погнали! Занимаем позиции!",
    "right": "Справа! Осторожно!",
    "left": "Слева, держи!",
    "behind": "Враг сзади!",
    "front": "Враг впереди!",
    "grenade": "Граната!",
    "kill": "Минус один!",
    "headshot": "Чётко в голову!",
    "reload": "Меняю магазин!",
    "need_help": "Я ранен, нужна помощь!",
    "win": "Победа!",
    "lose": "Раунд проигран!"
}


def ensure_dirs():
    for d in (WEAPONS_DIR, RADIO_UZ_DIR, RADIO_RU_DIR):
        os.makedirs(d, exist_ok=True)


def write_wav_float(path, samples, sr=SR):
    peak = max((abs(x) for x in samples), default=1.0)
    scale = 0.96 / peak if peak > 0.96 else 1.0
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s * scale))
            frames += struct.pack("<h", int(v * 32767))
        wf.writeframes(bytes(frames))


def add_room_reflections(samples, taps, sr=SR):
    out = list(samples)
    n = len(out)
    for delay_ms, gain in taps:
        off = int(sr * delay_ms / 1000.0)
        for i in range(n - off):
            out[i + off] += samples[i] * gain
    return out


def one_pole_lp(samples, cutoff_hz, sr=SR):
    rc = 1.0 / (2.0 * math.pi * max(20.0, cutoff_hz))
    dt = 1.0 / sr
    alpha = dt / (rc + dt)
    out = [0.0] * len(samples)
    y = 0.0
    for i, x in enumerate(samples):
        y += alpha * (x - y)
        out[i] = y
    return out


def one_pole_hp(samples, cutoff_hz, sr=SR):
    rc = 1.0 / (2.0 * math.pi * max(20.0, cutoff_hz))
    dt = 1.0 / sr
    alpha = rc / (rc + dt)
    out = [0.0] * len(samples)
    y = 0.0
    prev_x = 0.0
    for i, x in enumerate(samples):
        y = alpha * (y + x - prev_x)
        prev_x = x
        out[i] = y
    return out


def encode_weapon_mp3(samples, out_mp3, af_extra=""):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        wav_path = tf.name
    try:
        write_wav_float(wav_path, samples, SR)
        af = "acompressor=threshold=-12dB:ratio=4:attack=1:release=45,alimiter=limit=0.96"
        if af_extra:
            af = af_extra + "," + af
        cmd = [
            FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
            "-i", wav_path,
            "-af", af,
            "-ac", "1", "-ar", "22050", "-b:a", "64k",
            out_mp3
        ]
        subprocess.run(cmd, check=True)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def synth_m4a1():
    # Taktik M4A1-S (CS uslubida o'tkir, ixcham va metall zatvorli zarba)
    rng = random.Random(401)
    n = int(SR * 0.34)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    hp_noise = one_pole_hp(noise_arr, 1800)
    lp_noise = one_pole_lp(noise_arr, 900)
    phase = 0.0
    for i in range(n):
        t = i / SR
        # 1) 0ms boshlang'ich o'tkir gaz-port portlashi
        crack = math.exp(-t * 320.0) * (0.95 if i < 90 else 0.5) * hp_noise[i] * 2.2
        # 2) Suppressor ichki bosim zarbasi (240Hz -> 58Hz)
        f = 58.0 + 185.0 * math.exp(-t * 85.0)
        phase += 2.0 * math.pi * f / SR
        thump = math.sin(phase) * math.exp(-t * 52.0) * 1.15
        # 3) Gaz chiqishi (pff-tsh!)
        hiss = hp_noise[i] * math.exp(-t * 28.0) * 0.65 + lp_noise[i] * math.exp(-t * 36.0) * 0.55
        # 4) Metall zatvor urilishi (+26ms)
        bolt = 0.0
        if 0.024 <= t <= 0.068:
            bt = t - 0.024
            bolt = (math.sin(2 * math.pi * 2350 * bt) + 0.6 * math.sin(2 * math.pi * 4120 * bt)) * math.exp(-bt * 110.0) * 0.28
        raw[i] = math.tanh((crack + thump + hiss + bolt) * 1.7)
    raw = add_room_reflections(raw, [(24, 0.22), (51, 0.13), (84, 0.07)])
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "m4a1.mp3"), "equalizer=f=120:t=q:w=1.2:g=3,equalizer=f=3200:t=q:w=1.4:g=2.5")


def synth_ak47():
    # Xom, og'ir 7.62mm Kalashnikov (CS 1.6 / CS2 kuchli zarbasi)
    rng = random.Random(4747)
    n = int(SR * 0.44)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    mid_noise = one_pole_hp(one_pole_lp(noise_arr, 2600), 420)
    hi_noise = one_pole_hp(noise_arr, 2800)
    lo_noise = one_pole_lp(noise_arr, 480)
    phase = 0.0
    for i in range(n):
        t = i / SR
        # 1) Ballistik zarba to'lqini
        f = 38.0 + 165.0 * math.exp(-t * 55.0)
        phase += 2.0 * math.pi * f / SR
        punch = (math.sin(phase) + 0.35 * math.sin(phase * 2.0)) * math.exp(-t * 28.0) * 1.35
        # 2) O'tkir 7.62 stvol portlashi + o'rta bark
        blast = (hi_noise[i] * math.exp(-t * 95.0) * 1.9 +
                 mid_noise[i] * math.exp(-t * 24.0) * 1.35 +
                 lo_noise[i] * math.exp(-t * 16.0) * 1.1)
        # 3) AK porshen/temir jaranglashi
        clank = (math.sin(2 * math.pi * 1820 * t) * 0.5 + math.sin(2 * math.pi * 3180 * t) * 0.35) * math.exp(-t * 58.0) * 0.35
        raw[i] = math.tanh((punch + blast + clank) * 2.2)
    raw = add_room_reflections(raw, [(29, 0.28), (62, 0.17), (105, 0.10), (165, 0.05)])
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "ak47.mp3"), "equalizer=f=95:t=q:w=1.1:g=4,equalizer=f=1400:t=q:w=1.2:g=3")


def synth_shotgun():
    # 12-kalibr XM1014 og'ir zarbasi + mexanik zatvor ovozi
    rng = random.Random(1014)
    n = int(SR * 0.58)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    lo_noise = one_pole_lp(noise_arr, 520)
    mid_noise = one_pole_hp(one_pole_lp(noise_arr, 2400), 320)
    hi_noise = one_pole_hp(noise_arr, 2400)
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 26.0 + 125.0 * math.exp(-t * 32.0)
        phase += 2.0 * math.pi * f / SR
        boom = math.sin(phase) * math.exp(-t * 15.0) * 1.55
        roar = (hi_noise[i] * math.exp(-t * 60.0) * 1.7 +
                mid_noise[i] * math.exp(-t * 14.0) * 1.35 +
                lo_noise[i] * math.exp(-t * 9.5) * 1.45)
        # Avto-shotgun zatvor chiqillashi (+240ms)
        mech = 0.0
        if 0.23 <= t <= 0.31:
            mt = t - 0.23
            mech = (hi_noise[i] * 0.55 + math.sin(2 * math.pi * 2700 * mt) * 0.35) * math.exp(-mt * 85.0) * 0.45
        raw[i] = math.tanh((boom + roar + mech) * 2.1)
    raw = add_room_reflections(raw, [(34, 0.30), (74, 0.19), (128, 0.11)])
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "shotgun.mp3"), "equalizer=f=70:t=q:w=1.0:g=5")


def synth_usps():
    # USP-S taktik to'pponcha (qisqa, qattiq "pht-tık")
    rng = random.Random(45)
    n = int(SR * 0.24)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    hp_noise = one_pole_hp(noise_arr, 2200)
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 75.0 + 245.0 * math.exp(-t * 140.0)
        phase += 2.0 * math.pi * f / SR
        pop = math.sin(phase) * math.exp(-t * 85.0) * 1.05
        air = hp_noise[i] * math.exp(-t * 52.0) * 0.85
        slide = 0.0
        if 0.018 <= t <= 0.052:
            st = t - 0.018
            slide = math.sin(2 * math.pi * 3450 * st) * math.exp(-st * 130.0) * 0.32
        raw[i] = math.tanh((pop + air + slide) * 1.6)
    raw = add_room_reflections(raw, [(19, 0.18), (42, 0.09)])
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "usps.mp3"))


def synth_reload():
    # 3 bosqichli metall reload: mag chiqish (0.04s) -> mag kirish (0.40s) -> zatvor tortish-qo'yib yuborish (0.76s, 0.89s)
    rng = random.Random(909)
    n = int(SR * 1.08)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    hp_n = one_pole_hp(noise_arr, 1900)
    def add_click(t0, f1, f2, dur, amp):
        s0 = int(t0 * SR)
        ln = int(dur * SR)
        for k in range(ln):
            idx = s0 + k
            if idx >= n:
                break
            lt = k / SR
            env = math.exp(-lt * (8.0 / dur))
            sig = (hp_n[idx] * 0.7 + math.sin(2 * math.pi * f1 * lt) * 0.6 + math.sin(2 * math.pi * f2 * lt) * 0.45)
            raw[idx] += sig * env * amp
    add_click(0.03, 1850, 3200, 0.07, 0.85)  # Mag release
    add_click(0.11, 950, 2100, 0.06, 0.45)   # Mag slide out
    add_click(0.40, 620, 1650, 0.09, 1.05)   # Mag slap in
    add_click(0.46, 2400, 4100, 0.05, 0.65)  # Mag lock
    add_click(0.75, 2100, 3650, 0.09, 0.90)  # Bolt pull
    add_click(0.88, 1750, 3950, 0.11, 1.15)  # Bolt release snap
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "reload.mp3"))


def synth_headshot():
    # CS klassik temir kaska "DINK!" + o'q yorib kirishi
    rng = random.Random(777)
    n = int(SR * 0.28)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    hp_n = one_pole_hp(noise_arr, 2600)
    for i in range(n):
        t = i / SR
        ping = (math.sin(2 * math.pi * 1790 * t) * 0.95 +
                math.sin(2 * math.pi * 2680 * t) * 0.65 +
                math.sin(2 * math.pi * 4180 * t) * 0.45) * math.exp(-t * 22.0)
        crunch = hp_n[i] * math.exp(-t * 68.0) * 1.1
        raw[i] = math.tanh((ping + crunch) * 1.8)
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "headshot.mp3"))


def synth_grenade():
    # HE granata kuchli portlashi + shrapnel/tosh tushishi
    rng = random.Random(888)
    n = int(SR * 0.96)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    lo_n = one_pole_lp(noise_arr, 340)
    mid_n = one_pole_lp(one_pole_hp(noise_arr, 300), 1800)
    hi_n = one_pole_hp(noise_arr, 2400)
    phase = 0.0
    debris_times = [0.22, 0.31, 0.38, 0.49, 0.58, 0.67, 0.78]
    for i in range(n):
        t = i / SR
        f = 22.0 + 98.0 * math.exp(-t * 14.0)
        phase += 2.0 * math.pi * f / SR
        sub = math.sin(phase) * math.exp(-t * 5.8) * 1.5
        roar = lo_n[i] * math.exp(-t * 4.5) * 1.5 + mid_n[i] * math.exp(-t * 7.5) * 1.2 + hi_n[i] * math.exp(-t * 32.0) * 1.5
        deb = 0.0
        for dt in debris_times:
            if dt <= t <= dt + 0.035:
                deb += hi_n[i] * math.exp(-(t - dt) * 140.0) * 0.35
        raw[i] = math.tanh((sub + roar + deb) * 1.85)
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "grenade.mp3"), "equalizer=f=60:t=q:w=1.0:g=5")


def synth_smoke():
    # Tutun granatasi bosim shivirlashi
    rng = random.Random(303)
    n = int(SR * 0.88)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    bp_n = one_pole_hp(one_pole_lp(noise_arr, 3800), 1100)
    for i in range(n):
        t = i / SR
        pop = math.sin(2 * math.pi * 420 * t) * math.exp(-t * 90.0) * 0.85
        env = min(1.0, t / 0.08) * math.exp(-max(0.0, t - 0.12) * 3.1)
        raw[i] = math.tanh((pop + bp_n[i] * env * 1.2) * 1.3)
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "smoke.mp3"))


def synth_hit():
    # Tanaga / zirhga o'q tegish zarbasi
    rng = random.Random(111)
    n = int(SR * 0.12)
    raw = [0.0] * n
    noise_arr = [rng.uniform(-1.0, 1.0) for _ in range(n)]
    bp_n = one_pole_hp(one_pole_lp(noise_arr, 2400), 700)
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 75.0 + 180.0 * math.exp(-t * 95.0)
        phase += 2.0 * math.pi * f / SR
        raw[i] = math.tanh((math.sin(phase) * math.exp(-t * 55.0) * 1.1 + bp_n[i] * math.exp(-t * 70.0) * 0.9) * 1.6)
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "hit.mp3"))


def synth_shell():
    # Jez gilza betonga tushib ikki marta sakrashi
    n = int(SR * 0.24)
    raw = [0.0] * n
    for t0, amp in ((0.01, 0.85), (0.105, 0.42)):
        s0 = int(t0 * SR)
        for k in range(int(0.09 * SR)):
            idx = s0 + k
            if idx >= n:
                break
            lt = k / SR
            env = math.exp(-lt * 65.0)
            raw[idx] += (math.sin(2 * math.pi * 5180 * lt) + 0.7 * math.sin(2 * math.pi * 6840 * lt) + 0.4 * math.sin(2 * math.pi * 8320 * lt)) * env * amp * 0.45
    encode_weapon_mp3(raw, os.path.join(WEAPONS_DIR, "shell.mp3"))


def build_radio_click(sr=22050, is_start=True):
    rng = random.Random(101 if is_start else 202)
    dur = 0.065 if is_start else 0.042
    n = int(sr * dur)
    out = []
    for i in range(n):
        t = i / sr
        burst = rng.uniform(-1.0, 1.0) * math.exp(-t * 55.0) * 0.42
        if is_start:
            # Qisqa harbiy ratsiya ochilish signali (1150Hz beep + squelch)
            beep = math.sin(2 * math.pi * 1150 * t) * (1.0 if t < 0.032 else 0.0) * 0.22
            out.append(burst + beep)
        else:
            # Yopilish "tık" ovozi
            click = math.sin(2 * math.pi * 680 * t) * math.exp(-t * 120.0) * 0.35
            out.append(burst * 0.6 + click)
    return out


async def build_radio_pack(phrases, voice, rate, out_dir):
    radio_sr = 22050
    start_fx = build_radio_click(radio_sr, True)
    end_fx = build_radio_click(radio_sr, False)
    rng = random.Random(555)

    for key, text in phrases.items():
        out_mp3 = os.path.join(out_dir, f"{key}.mp3")
        if os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 1000:
            print(f"[SKIP] {os.path.relpath(out_mp3, ROOT_DIR)} ({os.path.getsize(out_mp3)} B)")
            continue

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf1, \
             tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf2, \
             tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf3:
            raw_mp3 = tf1.name
            raw_wav = tf2.name
            comb_wav = tf3.name

        try:
            saved = False
            for attempt in range(8):
                try:
                    comm = edge_tts.Communicate(text=text, voice=voice, rate=rate)
                    await comm.save(raw_mp3)
                    if os.path.exists(raw_mp3) and os.path.getsize(raw_mp3) > 500:
                        saved = True
                        break
                except Exception as ex:
                    if attempt < 7:
                        await asyncio.sleep(2.5 * (attempt + 1))
                    else:
                        raise ex

            # 1) Sukunatni qirqib 22050Hz Mono WAV ga ochish
            subprocess.run([
                FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                "-i", raw_mp3,
                "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-42dB:stop_periods=-1:stop_silence=0.08:stop_threshold=-42dB",
                "-ac", "1", "-ar", str(radio_sr),
                raw_wav
            ], check=True)

            with wave.open(raw_wav, "rb") as wf:
                raw_bytes = wf.readframes(wf.getnframes())
                speech = [s[0] / 32768.0 for s in struct.iter_unpack("<h", raw_bytes)]

            # 2) Ratsiya boshi + yengil radio fon shovqini bilan nutq + ratsiya yopilishi
            mixed_speech = [s + rng.uniform(-1.0, 1.0) * 0.016 for s in speech]
            combined = start_fx + mixed_speech + end_fx
            write_wav_float(comb_wav, combined, radio_sr)

            # 3) CS 1.6 harbiy ratsiya EQ (360-2800Hz bandpass + qattiq kompressor + limiter)
            subprocess.run([
                FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                "-i", comb_wav,
                "-af", "highpass=f=360,lowpass=f=2800,acompressor=threshold=-16dB:ratio=4.5:attack=4:release=55,volume=1.35,alimiter=limit=0.95",
                "-ac", "1", "-ar", str(radio_sr), "-b:a", "48k",
                out_mp3
            ], check=True)
            print(f"[OK] {os.path.relpath(out_mp3, ROOT_DIR)} ({os.path.getsize(out_mp3)} B)")
            await asyncio.sleep(1.0)
        finally:
            for p in (raw_mp3, raw_wav, comb_wav):
                if os.path.exists(p):
                    os.remove(p)


async def main():
    ensure_dirs()
    print("FFmpeg:", FFMPEG)
    print("--- 1. Qurol va jang SFX yaratilmoqda ---")
    synth_m4a1()
    synth_ak47()
    synth_shotgun()
    synth_usps()
    synth_reload()
    synth_headshot()
    synth_grenade()
    synth_smoke()
    synth_hit()
    synth_shell()
    print("--- 2. O'zbekcha CS 1.6 Radio yaratilmoqda ---")
    await build_radio_pack(RADIO_UZ, "uz-UZ-SardorNeural", "+14%", RADIO_UZ_DIR)
    print("--- 3. Ruscha CS 1.6 Radio yaratilmoqda ---")
    await build_radio_pack(RADIO_RU, "ru-RU-DmitryNeural", "+12%", RADIO_RU_DIR)

    total_bytes = 0
    total_files = 0
    for root, _, files in os.walk(SFX_DIR):
        for fn in files:
            if fn.endswith(".mp3"):
                total_files += 1
                total_bytes += os.path.getsize(os.path.join(root, fn))
    print(f"=== TAYYOR: {total_files} ta MP3 fayl, jami {total_bytes / 1024:.1f} KB ===")


if __name__ == "__main__":
    asyncio.run(main())
