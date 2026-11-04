"""Episode 2 sound: an original comic score + synthesized SFX (hoof taps, crowd, dog), mixed under the narration.

Run from the repo root (GitHub Actions assemble job): python episodes/ep002_clever_hans/audio/mix.py
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

DUR = 2141 / 30
N = ns(DUR)
R = rng(1904)
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


# hook: a tentative glock, a roll, a proud stab + cymbal on "he really could"
band(0.0, 3.7, 108, "glock", 0.42, drums=False, oom=False)
roll(3.75, 4.85, 0.2, 0.7)
stab(4.88, "F", 0.9, True, True)
# 5.6 - 18.1: the lessons: glock march; a triangle on "Five"
band(5.6, 18.1, 116, "glock", 0.48)
place(music, pan(I.triangle(0.6, R, 1.6), 0.2), 13.8, 0.7)
# 18.2 - 21.7: the crowds: the horn takes the tune
band(18.2, 21.7, 122, "horn", 0.45)
# 21.8 - 27.7: the thirteen experts: pompous slow march, an accent on each named one
band(21.8, 27.7, 100, "horn", 0.5, transpose=-2)
for tn, m in ((23.66, 76), (23.96, 77), (24.82, 79), (25.62, 81), (26.54, 84)): place(music, pan(I.glock(F(m), 0.7, R, dur=1.0), 0.2), tn, 0.9)
# 27.8 - 30.9: September, golden: warm pad; stab on "no trick"
place(music, I.pad([F(53), F(57), F(60), F(65)], 3.2, 0.35, R), 27.8, 0.9)
stab(29.72, "F", 0.95, True, True)
# 30.96 - 36.3: Pfungst: a sneaky plucked bass walk
for k, m in enumerate([41, 44, 48, 51, 50, 48, 44, 43] * 3):
    tk = 31.0 + k * 0.22
    if tk < 36.25: place(music, pan(I.pluck(F(m), 0.6, R, 0.5), -0.2), tk, 0.8)
# 36.4 - 40.5: the first test: light glock; a ding on "right"
band(36.4, 40.45, 116, "glock", 0.38, drums=False)
place(music, pan(I.triangle(0.6, R, 1.6), 0.2), 38.58, 0.7)
# 40.56 - 42.4: blindfolded: the sad fall on "six percent"
wah(41.42, (67, 66, 65, 62), 0.3)
# 42.4 - 50.4: suspense: low pad, a roll that rises through the taps, released on "relaxed", a button on "stopped"
place(music, I.pad([F(41), F(48), F(53)], 6.3, 0.3, R), 42.45, 0.9)
roll(44.96, 48.6, 0.08, 0.7, 0.5)
stab(48.72, "Bb", 0.7, False)
stab(49.76, "F", 0.85, True)
# 50.46 - 55.2: luckily (bright), unluckily (fall)
band(50.46, 52.0, 120, "glock", 0.45, drums=False)
wah(52.1, (65, 64, 62, 60), 0.4)
# 55.3 - 58.9: the card trick: music box, a sparkle when the face lights up
for k, m in enumerate([72, 76, 79, 76, 74, 77, 81, 77, 76, 79, 84]):
    tk = 55.3 + k * 0.3
    if tk < 58.9: place(music, pan(I.musicbox(F(m), 0.5, R), 0.15), tk, 0.7)
place(music, pan(I.triangle(0.6, R, 2.0), 0.3), 57.4, 0.7)
# 59.0 - 66.1: today: a cool pad and plucks
place(music, I.pad([F(50), F(57), F(62), F(65)], 7.1, 0.32, R), 59.0, 0.9)
for k in range(22):
    tk = 59.1 + k * 0.32
    if tk < 66.0: place(music, pan(I.pluck(F([62, 65, 69, 72][k % 4]), 0.4, R, 0.6), 0.25), tk, 0.45)
# 66.2 - end: proud finale, button on "book"
band(66.2, 69.5, 104, "horn", 0.55, drums=False)
place(music, I.pad([F(53), F(57), F(60), F(65), F(69)], 4.8, 0.4, R), 66.2, 0.8)
stab(69.55, "F", 1.0, True, True)

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


def clop(t, gain=0.8):
    """a hoof on cobbles: a hard knock plus a short low thud"""
    n = ns(0.18); tt = np.arange(n) / SR
    knock = bp(R.standard_normal(n), 700, 3200, 2) * np.exp(-tt / 0.012)
    thud = np.sin(2 * np.pi * 140 * tt * (1 - 0.3 * tt)) * np.exp(-tt / 0.04)
    place(sfx, pan(fades(knock * 0.8 + thud * 0.9, 0.0, 0.02), 0.1), t, gain)


def sniff(t, gain=0.45):
    n = ns(0.12); tt = np.arange(n) / SR
    place(sfx, bp(R.standard_normal(n), 1500, 6000, 2) * np.sin(np.pi * tt / tt[-1]), t, gain)


# ambience: breeze + sparrows in the yard and the park, a quiet room tone in the lab (59.0 - 66.2)
amb = G.breeze(DUR, R, 0.5); amb[ns(58.9):ns(66.2)] *= 0.25
place(sfx, amb, 0, 0.35)
birds = G.bird_chirps(DUR, R, 0.35); birds[ns(58.9):ns(66.2)] = 0
place(sfx, pan(birds, 0.4), 0, 0.22)
# cut whooshes
for f in (112, 140, 382, 414, 598, 708, 1018, 1216, 1347, 1481, 1561, 1714, 1851, 1944, 2029): wh(f / 30, 0.45, 0.3, 0.2)
wh(164 / 30, 0.7, 0.55, 0.3)  # the flash
# Hans's taps (same list as story.ts TAPS)
TAPS = [0.9, 1.25, 1.6, 1.95, 2.3, 12.76, 12.96, 13.16, 13.36, 13.56, 14.85, 15.2, 15.55, 16.25, 16.6, 16.95, 17.3, 17.65,
        36.95, 37.25, 37.55, 37.85, 38.15, 40.75, 41.0, 41.25, 41.5, 41.75, 42.0, 42.25,
        45.0, 45.35, 45.7, 46.05, 46.4, 46.75, 47.1, 47.45, 47.8, 48.15, 48.5]
for tp in TAPS: clop(tp, 0.75 if tp < 44 else 0.6)
# the crowd: murmur from the gate on, applause on "he really could" and "no trick at all"
for k in range(8): place(sfx, pan(G.babble(12.0, R, [110, 130, 180, 210, 150, 240, 120, 200][k], 1.0), -0.6 + 0.17 * k), 18.2 + 0.15 * k, 0.16)
place(sfx, G.applause(1.6, R, 24), 4.95, 0.45)
place(sfx, G.applause(1.4, R, 30), 29.85, 0.5)
# Pfungst's footsteps, the questioner's relief, the stop
for k in range(6): place(sfx, G.stroll_step(R), 31.0 + k * 0.28, 0.45)
place(sfx, pan(I.triangle(0.5, R, 2.0), 0.3), 49.76, 0.4)
# a coin refused
place(sfx, G.clink(R, 3200, 0.2), 20.98, 0.6)
# the sniffer dog, a computer beep
for k in range(10): sniff(63.0 + k * 0.17)
n = ns(0.18); place(sfx, np.sin(2 * np.pi * 1760 * np.arange(n) / SR) * np.exp(-np.arange(n) / SR / 0.08), 65.05, 0.35)
# finale sparkle
place(sfx, pan(I.triangle(0.5, R, 2.0), 0.3), 69.25, 0.6)

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
print(f"mix: {N / SR:.2f}s, integrated {integrated(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP (pre-limit peak {peak:.2f})")
