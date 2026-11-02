"""Word timings for the narration (faster-whisper, English), matched back onto the script words.

usage: python tools/align.py episodes/<id>/script.json voice.wav episodes/<id>/voice/words.json
Writes [{"w": word, "s": start, "e": end, "beat": k}, ...] (seconds). Words Whisper wrote differently
(numbers as digits, names) get times spread over the matching heard span or interpolated from neighbours.
"""
import difflib, json, os, re, subprocess, sys, unicodedata
import numpy as np


def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", w)


def transcribe(wav):
    from faster_whisper import WhisperModel
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small.en"), device="cpu", compute_type="int8")
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    segs, _ = model.transcribe(audio, language="en", word_timestamps=True, beam_size=5, vad_filter=False,
                               condition_on_previous_text=False)
    return [(w.word.strip(), float(w.start), float(w.end)) for s in segs for w in (s.words or [])]


def align(sw, heard):
    heard = [h for h in heard if norm(h[0])]
    a = [norm(w) or f"\x00{i}" for i, (_, w) in enumerate(sw)]
    b = [norm(w) for w, _, _ in heard]
    times = [None] * len(sw)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            for i, j in zip(range(i1, i2), range(j1, j2)):
                times[i] = [heard[j][1], heard[j][2]]
        elif tag == "replace":
            t0, t1 = heard[j1][1], heard[j2 - 1][2]
            L = [max(1, len(a[i])) for i in range(i1, i2)]; tot = sum(L); t = t0
            for i, l in zip(range(i1, i2), L):
                d = (t1 - t0) * l / tot; times[i] = [t, t + d]; t += d
    matched = sum(t is not None for t in times)
    n = len(times); i = 0
    while i < n:
        if times[i] is not None: i += 1; continue
        j = i
        while j < n and times[j] is None: j += 1
        left = times[i - 1][1] if i > 0 else max(0.0, (times[j][0] if j < n else 0.3 * (j - i)) - 0.3 * (j - i))
        right = times[j][0] if j < n else left + 0.3 * (j - i)
        L = [max(1, len(a[k])) for k in range(i, j)]; tot = sum(L); t = left
        for k, l in zip(range(i, j), L):
            d = max(0.0, right - left) * l / tot; times[k] = [t, t + d]; t += d
        i = j
    for k in range(1, n):
        times[k][0] = max(times[k][0], times[k - 1][0]); times[k][1] = max(times[k][1], times[k][0])
    return times, matched


def main():
    script, wav, out = sys.argv[1:4]
    beats = json.load(open(script, encoding="utf-8"))["beats"]
    sw = [(k, w) for k, b in enumerate(beats) for w in b["vo"].split()]
    heard = transcribe(wav)
    times, matched = align(sw, heard)
    words = [{"w": w, "s": round(t[0], 3), "e": round(t[1], 3), "beat": k} for (k, w), t in zip(sw, times)]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(words, open(out, "w", encoding="utf-8"), indent=0)
    print(f"aligned {matched}/{len(sw)} words exactly; heard {len(heard)}; voice ends at {words[-1]['e']:.2f}s")
    if matched < 0.6 * len(sw):
        print("::warning::low alignment match rate, check words.json by hand")


if __name__ == "__main__":
    main()
