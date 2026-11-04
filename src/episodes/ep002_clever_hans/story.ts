// "The Horse That Fooled the Experts" (Clever Hans, Berlin, 1904): shots timed to episodes/ep002_clever_hans/voice/words.json.
// Camera grammar kept from the engine's measured reference: symmetric smootherstep glides of 18-40 f, cuts on big
// reframes, every hold creeps in, impacts are 7-frame flip kicks, no hand-held float.
export const FPS = 30;
export const TOTAL = 2141; // voice ends 69.64 s + 1.7 s tail
export const D0 = 0; // flat ground (build.ts helpers sit on D0)
export type V3 = [number, number, number];
export const at = (p: V3, dx: number, dy: number, dz: number): V3 => [p[0] + dx, p[1] + dy, p[2] + dz];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- places (world metres, ground y = 0) ----------------
// the Berlin courtyard (Hinterhof) around the origin: Hans stands at HANS facing +x, the blackboard to his right,
// the thirteen experts in a row behind him (z = -6), the crowd behind them and along the sides
export const COURT = { x0: -15, x1: 15, z0: -13, z1: 12 };
export const HANS: V3 = [0, 0, -2];
export const BOARD: V3 = [2.25, 0, -2.6];
export const OSTEN0: V3 = [3.05, 0, -1.6];
export const ROW_Z = -5;
/** the thirteen stand in three staggered rows behind Hans: front 1 3 4 5 6 (the named ones), then 0 2 7 8, then 9-12 */
const GROUP: [number, number, number][] = [[1, -1.0, 0], [3, -0.2, 0], [4, 0.6, 0], [5, 1.4, 0], [6, 2.2, 0], [0, -0.6, 1], [2, 0.2, 1], [7, 1.0, 1], [8, 1.8, 1],
  [9, -0.6, 2], [10, 0.2, 2], [11, 1.0, 2], [12, 1.8, 2]];
export const expertPos = (i: number): V3 => { const g = GROUP.find((e) => e[0] === i)!; return [g[1], 0, ROW_Z - 0.8 * g[2]]; };
export const PFUNGST0: V3 = [3.0, 0, -1.35];
export const ASKER: V3 = [3.0, 0, -1.35];
export const PARK: V3 = [200, 0, 0];   // the analogy: two friends and a card trick on a lawn
export const LAB: V3 = [400, 0, 0];    // today: a lab room (partition, sniffer dog, computer)
export const LAB_ROOM = { x0: 393, x1: 407, z0: -6, z1: 9, h: 4.2 };
export const PANEL = { x: 400, z0: -3.4, z1: 0.2, h: 1.95 };
export const SCI1: V3 = [399.0, 0, -1.4];
export const SCI2: V3 = [401.0, 0, -1.4];
export const DOG: V3 = [396.6, 0, 3.4];
export const BAGS: V3 = [397.55, 0, 3.05];
export const HANDLER0: V3 = [395.95, 0, 3.95];
export const DESK: V3 = [403.3, 0, 3.1];
export const USER: V3 = [404.3, 0, 2.6];

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light; sunAz?: number; sunEl?: number };
const C = { sunEl: 62 }; // a high sun so the courtyard walls do not shade the yard
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 164, light: "day", ...C },
  { id: 2, a: 164, b: 330, light: "day", ...C, sunAz: 100 },
  { id: 3, a: 330, b: 437, light: "day", ...C },
  { id: 4, a: 437, b: 546, light: "day", ...C },
  { id: 5, a: 546, b: 650, light: "day", ...C, sunAz: 110 },
  { id: 6, a: 650, b: 832, light: "day", ...C },
  { id: 7, a: 832, b: 928, light: "golden", sunAz: 20 },
  { id: 8, a: 928, b: 1088, light: "day", ...C },
  { id: 9, a: 1088, b: 1272, light: "day", ...C },
  { id: 10, a: 1272, b: 1512, light: "day", ...C },
  { id: 11, a: 1512, b: 1657, light: "day", ...C, sunAz: 110 },
  { id: 12, a: 1657, b: 1768, light: "day", sunAz: 120 },
  { id: 13, a: 1768, b: 1885, light: "day", sunEl: 70 },
  { id: 14, a: 1885, b: 1985, light: "day", sunEl: 70 },
  { id: 15, a: 1985, b: TOTAL, light: "golden", sunAz: 30, sunEl: 12 },
];
export const XFADE: Record<number, number> = { 7: 8, 8: 8, 12: 8, 13: 8, 15: 10 };
export const FLASH_AT = 164;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- story motion (t = seconds) ----------------
/** hoof taps (strike times in seconds): the hoof lifts over 0.17 s and strikes at the listed time */
export const TAPS: number[] = [
  0.9, 1.25, 1.6, 1.95, 2.3,                                   // hook
  12.76, 12.96, 13.16, 13.36, 13.56,                           // three plus two: five taps
  14.85, 15.2, 15.55, 16.25, 16.6, 16.95, 17.3, 17.65,         // fractions, the time, names
  36.95, 37.25, 37.55, 37.85, 38.15,                           // could see someone who knew
  40.75, 41.0, 41.25, 41.5, 41.75, 42.0, 42.25,                // blinders: he never stops
  45.0, 45.35, 45.7, 46.05, 46.4, 46.75, 47.1, 47.45, 47.8, 48.15, 48.5, // as his taps got close... on the right tap
];
export const tapLift = (t: number) => {
  let k = 0;
  for (const ts of TAPS) { const u = (t - ts + 0.17) / 0.17; if (u > 0 && u < 1) k = Math.max(k, Math.sin(Math.PI * u)); }
  return k;
};
export const tapsBefore = (t: number, t0: number, t1: number) => TAPS.filter((x) => x >= t0 && x <= Math.min(t, t1)).length;
/** the thirteen experts walk in along +x (z = ROW_Z) and stop at their places by t = 23.4 */
export const expertWalkX = (i: number, t: number) => { const xe = expertPos(i)[0], u = clamp01((t - 21.6 - 0.08 * (i % 5)) / 1.7); return xe - (1 - easeOut(u)) * 7; };
/** Pfungst walks in from +x and stops at PFUNGST0 by t = 32.6 */
export const pfungstX = (t: number) => PFUNGST0[0] + 3.2 * (1 - smooth((t - 30.9) / 1.7));
/** the crowd pours through the gate in the north row (z = -13) toward the yard */
export const crowdZ = (i: number, t: number) => -13.5 - (i % 7) * 0.9 - Math.floor(i / 7) * 0.5 + 2.4 * (t - 18.2);

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });

// shot 1: hook. Hans tapping at the board, the experts behind; their faces; Hans, front
const S1a = (f: number) => dolly([0.8, 2.75, 7.6], [0.8, 1.15, -3.0], pushK(f, 0, 0.0012), { fov: 42 });
const S1b = (f: number) => dolly([0.6, 1.72, -2.45], [0.6, 1.6, ROW_Z], pushK(f, 112, 0.003), { fov: 40, roll: -0.03 });
const S1c = (f: number) => dolly([0.05, 1.95, 1.6], [0, 1.85, -2], pushK(f, 140, 0.002, 0.007, 20), { fov: 38, roll: 0.03 });
// shot 2: Berlin from above, then down into the yard: von Osten at the board with his cane
const S2a = (f: number) => zoom([3, 19, 21], [0.4, 1.2, -6], 50, pushK(f, 160, 0.0018));
const S2b = (f: number) => dolly([2.05, 1.65, 5.2], [2.05, 1.35, -2.0], pushK(f, 268, 0.0015), { fov: 42 });
// shot 3: "3 + 2" on the board and Hans's head; the hoof, five taps; the board with the tally
const S3a = (f: number) => dolly([1.6, 1.75, 3.2], [1.6, 1.5, -2.4], pushK(f, 326, 0.0015), { fov: 42, roll: 0.03 });
const S3b = (f: number) => dolly([1.6, 0.75, 2.6], [0.45, 0.6, -2], pushK(f, 382, 0.002), { fov: 40 });
const S3c = (f: number) => dolly([1.65, 1.7, 3.0], [1.65, 1.45, -2.4], pushK(f, 414, 0.0015, 0.005, 20), { fov: 40, roll: -0.03 });
// shot 4: fractions, the time, a name: the board and Hans's head, a push pop on each change
const S4a = (f: number) => {
  const pops = [453, 483, 503].reduce((a, p) => a + 0.07 * glide((f - p + 3) / 6), 0);
  return dolly([1.6, 1.8, 4.0], [1.6, 1.5, -2.4], pushK(f, 433, 0.0012) * (1 - pops), { fov: 42 });
};
// shot 5: the crowd pours in through the gate; then von Osten refuses a coin
const S5a = (f: number) => dolly([0.6, 2.4, 5.0], [0.3, 1.4, -13], pushK(f, 542, 0.0018), { fov: 46 });
const S5b = (f: number) => dolly([3.35, 1.65, 2.9], [3.35, 1.45, -1.4], pushK(f, 598, 0.0025), { fov: 40, roll: 0.03 });
// shot 6: the thirteen walk in; then the front row from close, gliding to each one as he is named
const S6a = (f: number) => dolly([0.6, 2.9, 5.6], [0.6, 1.0, -5.6], pushK(f, 646, 0.0016), { fov: 46 });
const rowCam = (x: number) => (f: number) => dolly([x, 1.66, ROW_Z + 2.5], [x, 1.55, ROW_Z], pushK(f, 708, 0.001), { fov: 40 });
// shot 7: September, golden: the professor reads the verdict in front of the others
export const PROF7: V3 = [0.6, 0, -3.9];
const S7a = (f: number) => dolly([0.6, 1.75, -1.2], [0.6, 1.5, -4.4], pushK(f, 828, 0.0025, 0.006, 25), { fov: 42 });
// shot 8: Pfungst walks in; then his face: he does not know the answer
const S8a = (f: number) => dolly([2.0, 1.7, 5.0], [2.0, 1.3, -1.8], pushK(f, 924, 0.0012), { fov: 44 });
const S8b = (f: number) => dolly([3.0, 1.75, 0.9], [3.0, 1.65, -1.35], pushK(f, 1018, 0.0025), { fov: 40, roll: -0.03 });
// shot 9: a questioner who knows, Hans taps right; then blinders, the questioner shrugs, Hans keeps going
const S9a = (f: number) => dolly([1.8, 1.7, 6.6], [1.8, 1.15, -1.8], pushK(f, 1084, 0.0012), { fov: 44 });
const S9b = (f: number) => dolly([1.3, 1.75, 2.8], [1.2, 1.6, -2.0], pushK(f, 1216, 0.0015, 0.005, 25), { fov: 42, roll: 0.03 });
// shot 10: his eye; the questioner tenses and relaxes; the hoof stops
const S10a = (f: number) => dolly([1.2, 1.85, 0.6], [1.0, 1.7, -2], pushK(f, 1268, 0.0025), { fov: 40 });
const S10b = (f: number) => dolly([1.08, 1.75, -0.9], [1.02, 1.71, -2], pushK(f, 1326, 0.002), { fov: 36 });
const S10c = (f: number) => dolly([3.05, 1.6, 1.0], [3.0, 1.5, -1.35], pushK(f, 1347, 0.0015), { fov: 40 });
const S10d = (f: number) => dolly([0.4, 1.5, 6.0], [0.4, 1.05, -2], pushK(f, 1481, 0.0025), { fov: 42, roll: -0.03 });
// shot 11: von Osten and Pfungst; then von Osten, arms crossed
export const OSTEN11: V3 = [2.25, 0, -1.4], PF11: V3 = [3.15, 0, -1.15];
const S11a = (f: number) => dolly([2.7, 1.65, 2.6], [2.7, 1.4, -1.3], pushK(f, 1508, 0.002), { fov: 42 });
const S11b = (f: number) => dolly([2.3, 1.68, 1.7], [2.25, 1.55, -1.4], pushK(f, 1561, 0.0022, 0.005, 25), { fov: 40, roll: 0.035 });
// shot 12: the park, the card trick; then your face lights up
const S12a = (f: number) => dolly(at(PARK, 0.05, 1.45, 3.9), at(PARK, 0.05, 1.15, -0.2), pushK(f, 1653, 0.002), { fov: 42 });
const S12b = (f: number) => dolly(at(PARK, 0.55, 1.62, 2.0), at(PARK, 0.5, 1.55, -0.35), pushK(f, 1714, 0.002, 0.007, 20), { fov: 40, roll: -0.03 });
// shot 13: today, a lab: a scientist; then the partition and both sides
const S13a = (f: number) => dolly(at(SCI1, 0.2, 1.62, 2.8), at(SCI1, 0, 1.5, 0), pushK(f, 1764, 0.002), { fov: 40 });
const S13b = (f: number) => dolly([401.8, 3.4, 5.2], [400, 1.0, -1.4], pushK(f, 1851, 0.002), { fov: 44 });
// shot 14: the sniffer dog and the suitcases; then a computer watching a face
const S14a = (f: number) => dolly([396.85, 1.1, 8.6], [396.85, 0.75, 3.0], pushK(f, 1881, 0.0012), { fov: 42 });
const S14b = (f: number) => dolly([403.75, 1.35, 7.6], [403.75, 1.1, 2.9], pushK(f, 1944, 0.0015), { fov: 42, roll: 0.03 });
// shot 15: back in the yard at sunset: Hans, hoof up; pull back to the thirteen; a wink
const S15a = (f: number) => dolly([0.3, 1.5, 6.4], [0.3, 1.1, -2], pushK(f, 1980, 0.002), { fov: 42 });
const S15b = (f: number) => dolly([0.05, 1.95, 1.6], [0, 1.85, -2.2], 1, { fov: 38 });
const S15c = (f: number) => dolly([0.4, 2.3, 7.6], [0.4, 1.4, -4.0], pushK(f, 2060, 0.0018), { fov: 42 });

const ROWX = (i: number) => expertPos(i)[0];
const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }, { f: 112, cut: true, s: S1b }, { f: 140, cut: true, s: S1c }],
  2: [{ f: 160, s: S2a }, { f: 200, dur: 66, s: S2b }],
  3: [{ f: 326, s: S3a }, { f: 382, cut: true, s: S3b }, { f: 414, cut: true, s: S3c }],
  4: [{ f: 433, s: S4a }],
  5: [{ f: 542, s: S5a }, { f: 598, cut: true, s: S5b }],
  6: [{ f: 646, s: S6a }, { f: 708, cut: true, s: rowCam(ROWX(1)) }, { f: 714, dur: 12, s: rowCam(ROWX(3)) }, { f: 736, dur: 14, s: rowCam(ROWX(4)) },
    { f: 760, dur: 16, s: rowCam(ROWX(5)) }, { f: 784, dur: 18, s: rowCam(ROWX(6)) }],
  7: [{ f: 828, s: S7a }],
  8: [{ f: 924, s: S8a }, { f: 1018, cut: true, s: S8b }],
  9: [{ f: 1084, s: S9a }, { f: 1216, cut: true, s: S9b }],
  10: [{ f: 1268, s: S10a }, { f: 1300, dur: 30, s: S10b }, { f: 1347, cut: true, s: S10c }, { f: 1481, cut: true, s: S10d }],
  11: [{ f: 1508, s: S11a }, { f: 1561, cut: true, s: S11b }],
  12: [{ f: 1653, s: S12a }, { f: 1714, cut: true, s: S12b }],
  13: [{ f: 1764, s: S13a }, { f: 1851, cut: true, s: S13b }],
  14: [{ f: 1881, s: S14a }, { f: 1944, cut: true, s: S14b }],
  15: [{ f: 1980, s: S15a }, { f: 2029, cut: true, s: S15b }, { f: 2036, dur: 40, s: S15c }],
};

/** impact kicks: "no trick", the blinders' first tap, "stopped", "book" */
const KICKS: [number, number][] = [[29.7, 0.5], [40.74, 0.4], [49.74, 0.5], [69.5, 0.4]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 8, focus: () => [0.6, 1.4, -2] },
  { f: 112, cInf: 13 },
  { f: 140, cInf: 15 },
  { f: 164, cInf: 0 },
  { f: 268, cInf: 9, focus: () => [1.6, 1.5, -1.2] },
  { f: 330, cInf: 10 },
  { f: 382, cInf: 12 },
  { f: 414, cInf: 10 },
  { f: 437, cInf: 9 },
  { f: 546, cInf: 0 },
  { f: 598, cInf: 11 },
  { f: 650, cInf: 0 },
  { f: 708, cInf: 12 },
  { f: 832, cInf: 9 },
  { f: 928, cInf: 5 },
  { f: 1018, cInf: 13 },
  { f: 1088, cInf: 6 },
  { f: 1216, cInf: 10 },
  { f: 1272, cInf: 15 },
  { f: 1347, cInf: 12 },
  { f: 1481, cInf: 9 },
  { f: 1512, cInf: 8 },
  { f: 1561, cInf: 13 },
  { f: 1657, cInf: 8 },
  { f: 1714, cInf: 14 },
  { f: 1768, cInf: 11 },
  { f: 1851, cInf: 0 },
  { f: 1885, cInf: 9 },
  { f: 1944, cInf: 11 },
  { f: 1985, cInf: 9 },
  { f: 2029, cInf: 14 },
  { f: 2060, dur: 20, cInf: 6, focus: () => [0, 1.6, -2] },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => { const d = dofAt(f); return d.focus ? d.focus(f) : camAt(id, f).look; };

/** near framing props (Kenney names), shown only inside their own shot */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = []; // (Kenney foreground props read as green balls without the kit)
