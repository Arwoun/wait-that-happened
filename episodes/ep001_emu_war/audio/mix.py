"""Episode 1 sound: an original comic march score + synthesized SFX, mixed under the narration.

Run from the repo root (GitHub Actions assemble job): python episodes/ep001_emu_war/audio/mix.py
Reads voice/voice.wav + voice/words.json next to this folder, writes audio/mix.wav (48 kHz stereo, 24-bit).
Timing: every cue is in seconds of the final picture (picture time = voice time; the voice starts at 0).
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EP = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(EP, "..", "..", "tools", "audio"))
from dsp import SR, ns, rng, pan, place, fades, lp, hp, bp, colored, read_wav, write_wav, integrated, true_peak, dbg, make_ir, convolve_st  # noqa: E402
import instruments as I  # noqa: E402
import sfx_gen as G  # noqa: E402

DUR = 2150 / 30
N = ns(DUR)
R = rng(1932)
F = I.m2f

# ---------------------------------------------------------------- score
# F major, comic two-step. Theme (bar, beat, quarters, midi) for an 8-bar phrase.
THEME = [(1, 0, 1, 72), (1, 1, .5, 74), (1, 1.5, .5, 76), (1, 2, 1, 77), (1, 3, 1, 72),
         (2, 0, 1.5, 69), (2, 1.5, .5, 70), (2, 2, 2, 72),
         (3, 0, .5, 74), (3, .5, .5, 76), (3, 1, 1, 77), (3, 2, .5, 79), (3, 2.5, .5, 77), (3, 3, 1, 76),
         (4, 0, 3, 74), (4, 3, 1, 72),
         (5, 0, 1, 72), (5, 1, .5, 74), (5, 1.5, .5, 76), (5, 2, 1, 77), (5, 3, 1, 81),
         (6, 0, 1, 79), (6, 1, .5, 77), (6, 1.5, .5, 76), (6, 2, 2, 74),
         (7, 0, .5, 76), (7, .5, .5, 77), (7, 1, 1, 79), (7, 2, 1, 76), (7, 3, 1, 72),
         (8, 0, 3, 77)]
CHORDS = {1: "F", 2: "F", 3: "Bb", 4: "C7", 5: "F", 6: "Bb", 7: "C7", 8: "F"}
OOM = {"F": (41, 48), "Bb": (46, 41), "C7": (36, 43), "Dm": (38, 45), "Gm": (43, 38)}
PAH = {"F": [57, 60, 65], "Bb": [58, 62, 65], "C7": [55, 58, 64], "Dm": [57, 62, 65], "Gm": [55, 58, 62]}

music = np.zeros((2, N))


def band(t0, t1, bpm=120, mel="glock", vel=0.55, drums=True, oom=True, transpose=0, swing=0.0):
    """play the theme in a loop from t0 to t1 (cut at t1 with a short fade)"""
    q = 60 / bpm
    buf = np.zeros((2, N))
    bar = 0
    while True:
        tb = t0 + bar * 4 * q
        if tb >= t1:
            break
        b8 = bar % 8 + 1
        ch = CHORDS[b8]
        if oom:
            for beat in range(4):
                tq = tb + beat * q
                if tq >= t1: break
                if beat % 2 == 0:
                    place(buf, pan(I.brass(F(OOM[ch][beat // 2 % 2] + transpose), q * 0.8, 0.55, R, "tuba"), -0.1), tq, 0.9)
                else:
                    for m in PAH[ch]:
                        place(buf, pan(I.pluck(F(m + transpose), 0.35, R, 0.4), 0.25), tq, 0.5)
        if drums:
            for k in range(8):
                tq = tb + k * q / 2
                if tq >= t1: break
                if k % 2 == 1: place(buf, pan(I.snare(0.35, R, 0.18), 0.15), tq + (swing * q / 2 if k % 2 else 0), 0.55)
            place(buf, pan(I.brush(0.4, R), -0.2), tb, 0.5)
        if mel:
            for (bb, beat, ln, m) in THEME:
                if bb != b8: continue
                tn = tb + beat * q
                if tn >= t1: continue
                d = min(ln * q, t1 - tn)
                if mel == "glock": x = I.glock(F(m + transpose), vel, R, dur=max(0.5, d + 0.6))
                elif mel == "fife": x = I.fife(F(m + transpose), d * 0.92, vel, R)
                else: x = I.brass(F(m + transpose - 12), d * 0.9, vel, R, "horn")
                place(buf, pan(x, 0.05), tn, 0.8)
        bar += 1
    a, b = ns(t0), min(N, ns(t1) + ns(0.12))
    env = np.ones(b - a); k = min(len(env), ns(0.12)); env[-k:] = np.linspace(1, 0, k)
    music[:, a:b] += buf[:, a:b] * env


def roll(t0, t1, v0, v1, gain=0.6):
    for (tk, vk) in I.snare_roll(t0, t1, v0, v1, R): place(music, pan(I.snare(vk, R, 0.12, buzz=True), 0.1), tk, gain)


def stab(t, chord="F", vel=0.8, low=True, cym=False):
    for m in PAH[chord]: place(music, pan(I.brass(F(m + 12), 0.35, vel, R, "stab"), 0.1), t, 0.6)
    if low: place(music, I.brass(F(OOM[chord][0]), 0.5, vel, R, "tuba"), t, 1.0)
    if cym: place(music, pan(I.cymbal(0.5, R, 2.0), 0.3), t, 0.5)


def wah(t, notes=(67, 66, 65, 64), q=0.32):
    """sad 'wah-wah' trombone-ish fall"""
    for i, m in enumerate(notes):
        place(music, pan(I.brass(F(m - 12), q * (2.6 if i == len(notes) - 1 else 0.95), 0.6, R, "soft", fall=0.6 if i == len(notes) - 1 else 0), -0.1), t + i * q, 0.9)


def boom(t, vel=1.0):
    """timpani hit"""
    place(music, I.timpani(F(41), vel, R, 2.2), t, 1.0)


# hook: drum roll into a confident stab, deflates on "And lost."
roll(0.15, 2.05, 0.15, 0.6)
stab(2.18, "F", 0.8, cym=True)
wah(3.0)
# 4.3 - 14.0: the story march (glock theme)
band(4.27, 14.1, 120, "glock", 0.5)
# 14.0 - 18.2: the army: roll, then stabs on three / two / ten thousand
roll(14.2, 16.75, 0.2, 0.75)
stab(14.76, "C7", 0.7, False); stab(15.76, "C7", 0.75, False); stab(16.76, "F", 0.95, True, True)
# 18.3 - 27.65: day one / day three, fife march, dead stop on "jams"
band(18.3, 27.62, 126, "fife", 0.45)
# 28.6 - 35.5: the chase galop (fast)
band(28.6, 35.45, 168, "horn", 0.5, swing=0.0, transpose=2)
# 35.5 - 39: sneaky lookouts: plucked bass walk
for k, m in enumerate([41, 44, 48, 51, 50, 48, 44, 43] * 2):
    tk = 35.55 + k * 0.22
    if tk < 39.0: place(music, pan(I.pluck(F(m), 0.6, R, 0.5), -0.2), tk, 0.8)
# 39 - 41.3: the retreat
wah(39.4, (65, 64, 62, 60), 0.45)
# 41.4 - 43.4: second try (brave restart) ... cut on "Unluckily", timpani on "so did the emus"
band(41.4, 43.42, 126, "horn", 0.5)
boom(44.55, 1.0)
# 45.3 - 54.3: the major + pigeon + truck: light march
band(45.3, 50.9, 120, "glock", 0.42, drums=False)
band(50.9, 54.3, 140, "horn", 0.5)
stab(53.3, "C7", 0.8, False)
# 54.3 - 60: a month later: slow pad, a glock clink per "ten bullets"
place(music, I.pad([F(53), F(57), F(60), F(65)], 5.6, 0.35, R), 54.4, 0.9)
# 60 - 65.6: the years: tuba plods, "no"
for ty in (61.42, 62.48, 63.38): place(music, I.brass(F(36), 0.5, 0.8, R, "tuba"), ty, 1.2)
wah(64.9, (60, 59), 0.4)
# 65.7 - end: proud finale, ends on a button
band(65.7, 69.9, 104, "horn", 0.55, drums=False)
place(music, I.pad([F(53), F(57), F(60), F(65), F(69)], 4.6, 0.4, R), 65.7, 0.8)
stab(69.98, "F", 1.0, True, True)

# ---------------------------------------------------------------- SFX
sfx = np.zeros((2, N))


def shot_crack(r, k=1.0):
    n = ns(0.16)
    t = np.arange(n) / SR
    crack = bp(r.standard_normal(n), 900, 7000, 2) * np.exp(-t / 0.012)
    thump = np.sin(2 * np.pi * 95 * t * (1 + 0.6 * np.exp(-t / 0.01))) * np.exp(-t / 0.035)
    return fades((crack * 0.9 + thump * 0.8) * k, 0.0, 0.02)


def burst(t0, t1, gain=1.0, rate=9.2, p=0.0):
    t = t0
    while t < t1:
        place(sfx, pan(shot_crack(R, 0.8 + 0.3 * R.uniform()), p), t, gain)
        t += 1 / rate * (0.92 + 0.16 * R.uniform())


def engine(t0, t1, gain=0.6):
    n = ns(t1 - t0)
    t = np.arange(n) / SR
    f = 36 + 4 * np.sin(2 * np.pi * 0.7 * t)
    saw = 2 * ((np.cumsum(f) / SR) % 1) - 1
    y = lp(saw, 220) * 0.6 + lp(colored(n, R, 1.0), 300) * 0.4
    env = np.minimum(1, np.minimum(t / 0.4, (t[-1] - t) / 0.4 + 0.01))
    place(sfx, y * env, t0, gain)


def boomer(t, gain=0.9):
    """emu drumming: a soft low 'oomp' (emus really do drum)"""
    n = ns(0.5); tt = np.arange(n) / SR
    y = np.sin(2 * np.pi * 78 * tt * (1 - 0.15 * tt)) * np.exp(-tt / 0.16) * np.minimum(1, tt / 0.03)
    place(sfx, y, t, gain)


def clinks(times, gain=0.7):
    for t in times: place(sfx, pan(G.clink(R, 2400 + 1600 * R.uniform(), 0.18), R.uniform(-0.4, 0.4)), t, gain)


def wh(t, dur=0.5, gain=0.5, peak=0.25):
    place(sfx, pan(G.whoosh(dur, R, peak), R.uniform(-0.3, 0.3)), t - peak, gain)


# ambience: breeze + birds through the day shots, crickets in the golden ones
place(sfx, G.breeze(DUR, R, 0.5), 0, 0.35)
place(sfx, pan(G.bird_chirps(DUR, R, 0.35), 0.4), 0, 0.25)
for a, b in ((39.0, 41.3), (54.3, 60.0)): place(sfx, G.crickets(b - a, R, 3), a, 0.35)
# cut whooshes (camera keys that cut)
for f in (85, 291, 376, 470, 500, 618, 650, 776, 820, 925, 981, 1122, 1300, 1418, 1534, 1594, 1754, 1934, 2084): wh(f / 30, 0.45, 0.32, 0.2)
wh(128 / 30, 0.7, 0.55, 0.3)  # the flash
# hook
burst(2.2, 2.75, 0.5)
boomer(3.02, 1.0)
# day one: bursts, dust thuds far off
burst(19.9, 22.6, 0.45)
for k in range(14): place(sfx, lp(colored(ns(0.4), R, 1.5), 300) * np.exp(-np.arange(ns(0.4)) / SR / 0.08), 19.95 + k * 0.19 + 0.3, 0.25)
# the dam: three shots then the jam: clunk + fizz
burst(27.2, 27.62, 0.55)
place(sfx, G.clink(R, 900, 0.3), 27.64, 1.0)
place(sfx, hp(colored(ns(1.2), R, 0.0), 2500) * np.exp(-np.arange(ns(1.2)) / SR / 0.4) * 0.3, 27.7, 0.8)
# the truck: hammer, engine, bumps, bursts
for th in (29.24, 30.22): place(sfx, G.hammer_hit(R, 0.8), th, 0.8)
engine(30.5, 35.5, 0.55)
for k in range(30): place(sfx, G.clink(R, 300 + 200 * R.uniform(), 0.15), 30.9 + k * 0.155 + 0.05 * R.uniform(), 0.35)
burst(31.2, 35.4, 0.35, p=-0.2)
# lookout: a single boom
boomer(37.62, 0.7)
# second try: truck returns
engine(41.2, 43.4, 0.45)
for k in range(5): boomer(44.3 + k * 0.09, 0.5)
# like tanks: distant bursts
burst(47.3, 48.9, 0.22, 7.0, 0.3)
# pigeon: wing flutter
place(sfx, hp(colored(ns(0.6), R, 0.3), 800) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * np.arange(ns(0.6)) / SR)) * np.exp(-np.arange(ns(0.6)) / SR / 0.3), 49.6, 0.5)
# the second chase
engine(53.0, 54.4, 0.5)
# ten cases, then the years and "no"
clinks([58.7 + k * 0.075 + 0.33 for k in range(10)], 0.8)
for ty in (61.42, 62.48, 63.38): place(sfx, G.push_thump(R), ty, 0.7)
# finale sparkle
place(sfx, pan(I.triangle(0.5, R, 2.0), 0.3), 67.84, 0.6)

# ---------------------------------------------------------------- mix
v, sr = read_wav(os.path.join(EP, "voice", "voice.wav"))
assert sr == SR, sr
v = v[0] if v.shape[0] == 1 else v.mean(0)
voice = np.zeros(N); voice[: min(N, len(v))] = v[:N]
words = json.load(open(os.path.join(EP, "voice", "words.json")))
# voice to -16 LUFS integrated
gv = dbg(-16.0 - integrated(np.stack([voice, voice])))
V2 = np.stack([voice, voice]) * gv
# duck music + sfx under speech (-7 dB / -4 dB), 80 ms attack, 350 ms release
speak = np.zeros(N)
for w in words:
    a, b = ns(max(0, w["s"] - 0.05)), ns(w["e"] + 0.1)
    speak[a:b] = 1
k_att, k_rel = 1 - np.exp(-1 / (0.08 * SR)), 1 - np.exp(-1 / (0.35 * SR))
env = np.zeros(N); e = 0.0
for i in range(0, N, 64):  # block-wise smoothing (fast enough)
    target = speak[i]
    e += (target - e) * (1 - (1 - (k_att if target > e else k_rel)) ** 64)
    env[i:i + 64] = e
reverb = make_ir(1.1, 7)
music = convolve_st(music, reverb) * 0.25 + music
gm = dbg(-27.0 - integrated(music))
gs = dbg(-25.0 - integrated(sfx))
mix = V2 + music * gm * dbg(-7.0 * env) + sfx * gs * dbg(-4.0 * env)
# master: gain to about -14 LUFS, soft limit at -1 dBTP
mix *= dbg(-14.0 - integrated(mix))
peak = np.max(np.abs(mix))
ceil = dbg(-1.2)
mix = np.where(np.abs(mix) > ceil * 0.8, np.sign(mix) * (ceil * 0.8 + (ceil * 0.2) * np.tanh((np.abs(mix) - ceil * 0.8) / (ceil * 0.2))), mix)
write_wav(os.path.join(HERE, "mix.wav"), mix)
print(f"mix: {N / SR:.2f}s, integrated {integrated(mix):.1f} LUFS, true peak {20 * np.log10(true_peak(mix) + 1e-9):.1f} dBTP (pre-limit peak {peak:.2f})")
