"""Clean up a raw TTS take using its word timings, so the picture can be timed to it.

usage: python tools/voice_post.py raw.wav words_raw.json out.wav [max_seconds]
- drops anything before the first script word (a TTS model sometimes reads its style instructions aloud)
  and after the last one (+0.6 s tail)
- shortens every pause longer than 0.55 s to 0.55 s (beat gaps), keeping 0.12 s of air on each side
- if still longer than max_seconds (default 70), speeds it up with ffmpeg atempo (pitch kept), at most x1.22
Writes 48 kHz mono 16-bit. Re-run tools/align.py on the result for the final words.json.
"""
import json, subprocess, sys, wave
import numpy as np

raw, wjs, out = sys.argv[1:4]
max_s = float(sys.argv[4]) if len(sys.argv) > 4 else 70.0
SR = 48000
x = np.frombuffer(subprocess.run(["ffmpeg", "-loglevel", "error", "-i", raw, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                                 check=True, capture_output=True).stdout, dtype="<i2").astype(np.float32)
words = json.load(open(wjs))
spans = []  # speech spans from word times, merged when the gap is short
for w in words:
    s, e = w["s"], w["e"]
    if spans and s - spans[-1][1] < 0.55: spans[-1][1] = max(spans[-1][1], e)
    else: spans.append([s, e])
PAD, GAP = 0.12, 0.55
pieces = []
for i, (s, e) in enumerate(spans):
    a = max(0.0, s - PAD); b = min(len(x) / SR, e + (0.6 if i == len(spans) - 1 else PAD))
    pieces.append(x[int(a * SR):int(b * SR)])
    if i < len(spans) - 1: pieces.append(np.zeros(int((GAP - 2 * PAD) * SR), np.float32))
y = np.concatenate(pieces)
# 5 ms fades at every join are not needed: cuts sit in silence (PAD of air on both sides)
dur = len(y) / SR
tmp = "/tmp/voice_post.tmp.wav"
with wave.open(tmp, "wb") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(np.clip(y, -32768, 32767).astype("<i2").tobytes())
tempo = min(1.22, dur / max_s) if dur > max_s else 1.0
af = f"atempo={tempo:.4f}" if tempo > 1.0 else "anull"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", af, "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", out], check=True)
print(f"voice: {len(x)/SR:.2f}s raw -> {dur:.2f}s trimmed -> {dur/tempo:.2f}s (tempo x{tempo:.3f})")
