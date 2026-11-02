// Burned-in subtitles timed word by word to the narration (words.json from tools/align.py).
// Chunks of up to 3 words / 20 characters, broken at punctuation and beat changes; the spoken word is highlighted.
// Placed at 64 % of the frame height, clear of TikTok's caption and button areas.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import "@fontsource/montserrat/800.css";

export type Word = { w: string; s: number; e: number; beat: number };
type Chunk = { words: Word[]; a: number; b: number };

export const chunkWords = (words: Word[], maxW = 3, maxC = 20): Chunk[] => {
  const out: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) out.push({ words: cur, a: cur[0].s, b: cur[cur.length - 1].e }); cur = []; };
  for (const w of words) {
    const len = [...cur, w].map((x) => x.w).join(" ").length;
    if (cur.length && (cur.length >= maxW || len > maxC || w.beat !== cur[0].beat)) flush();
    cur.push(w);
    if (/[.,?!;:]$/.test(w.w)) flush();
  }
  flush();
  // each chunk stays up until the next one starts (at most 0.6 s past its last word)
  out.forEach((c, i) => { const nx = out[i + 1]; c.b = nx ? Math.min(nx.a, c.b + 0.6) : c.b + 0.6; });
  return out;
};

export const Subtitles: React.FC<{ words: Word[]; fps?: number; offset?: number }> = ({ words, fps = 30, offset = 0 }) => {
  const f = useCurrentFrame(), t = f / fps - offset;
  const chunks = React.useMemo(() => chunkWords(words), [words]);
  const c = chunks.find((k) => t >= k.a - 0.04 && t < k.b);
  if (!c) return null;
  const age = (t - (c.a - 0.04)) * fps, pop = Math.min(1, age / 4);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", top: "68%", width: "86%", textAlign: "center",
        fontFamily: "Montserrat", fontWeight: 800, fontSize: 78, lineHeight: 1.12, letterSpacing: 0.5, textTransform: "uppercase",
        transform: `scale(${0.88 + 0.12 * pop})`, opacity: 0.4 + 0.6 * pop,
      }}>
        {c.words.map((w, i) => {
          const on = t >= w.s - 0.03 && (t < w.e + 0.05 || i === c.words.length - 1);
          return (
            <span key={i} style={{
              color: on ? "#ffd84d" : "#ffffff", WebkitTextStroke: "14px #1b1420", paintOrder: "stroke fill",
              textShadow: "0 6px 0 rgba(27,20,32,0.85)", margin: "0 0.16em", display: "inline-block",
            }}>{w.w.replace(/[,;:]$/, "")}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
