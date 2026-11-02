// "The Army That Lost a War to Birds" (Emu War, Western Australia, 1932): shots timed to episodes/ep001_emu_war/voice/words.json.
// Camera grammar kept from the engine's measured reference: symmetric smootherstep glides of 18-40 f, cuts on big
// reframes, every hold creeps in, impacts are 7-frame flip kicks, no hand-held float.
export const FPS = 30;
export const TOTAL = 2150; // voice 70.0 s + 1.7 s tail on the emblem
export const D0 = 0; // flat ground (build.ts helpers sit on D0)
export type V3 = [number, number, number];
export const at = (p: V3, dx: number, dy: number, dz: number): V3 => [p[0] + dx, p[1] + dy, p[2] + dz];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;

// ---------------- places (world metres, ground y = 0) ----------------
export const WHEAT_RECTS: [number, number, number, number][] = [[-60, 14, -40, 60], [23, 60, -40, 2]]; // x0 x1 z0 z1
export const WHEAT_H = 0.72;
export const TRACK = { x0: 14, x1: 23 }; // stubble track through the wheat, along z
export const FENCE_Z = -60; // farm fence; the outback (red dirt) lies beyond, toward -z
export const PADDOCK = { x0: 80, x1: 300, z0: -80, z1: 80 }; // open stubble paddock east of the wheat
export const DAM: V3 = [-120, 0, -20]; export const DAM_R = 15;
export const CAMP: V3 = [32, 0, 16]; // army camp: truck, tent, ammo crates
export const HOUSE: V3 = [-6, 0, 78]; // farmhouse (front door faces -z)
export const MAILBOX: V3 = [12, 0, 66];
export const PARK: V3 = [-300, 0, 300]; // a little town park corner (pigeon beat)
export const MONUMENT: V3 = [300, 0, 300]; // "today": sandstone wall with the emblem

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light; sunAz?: number; sunEl?: number };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 128, light: "day" },
  { id: 2, a: 128, b: 318, light: "day", sunAz: 110 },
  { id: 3, a: 318, b: 420, light: "day" },
  { id: 4, a: 420, b: 540, light: "day" },
  { id: 5, a: 540, b: 682, light: "day" },
  { id: 6, a: 682, b: 856, light: "day", sunAz: 120 },
  { id: 7, a: 856, b: 1062, light: "day" },
  { id: 8, a: 1062, b: 1170, light: "day", sunAz: 110 },
  { id: 9, a: 1170, b: 1240, light: "golden" },
  { id: 10, a: 1240, b: 1350, light: "day" },
  { id: 11, a: 1350, b: 1464, light: "day" },
  { id: 12, a: 1464, b: 1630, light: "day" },
  { id: 13, a: 1630, b: 1800, light: "golden" },
  { id: 14, a: 1800, b: 1970, light: "day" },
  { id: 15, a: 1970, b: TOTAL, light: "day", sunAz: 140 },
];
export const XFADE: Record<number, number> = { 9: 8, 10: 8, 13: 8, 14: 8, 15: 10 };
export const FLASH_AT = 128;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- story motion (t = seconds) ----------------
/** the chase: truck from x = 100 along z = 0 at 8 m/s from t = 30.6; the emus run at 13.4 m/s (30 mph) */
export const CHASE_T0 = 30.6;
export const truckX = (t: number) => 100 + 8 * Math.max(0, t - CHASE_T0);
export const bump = (t: number, k = 1) => {
  const s = Math.max(0, t - CHASE_T0);
  return { heave: k * (0.07 * Math.abs(Math.sin(9.1 * s)) + 0.05 * Math.abs(Math.sin(13.7 * s + 1))), pitch: k * 0.05 * Math.sin(7.3 * s + 0.4), roll: k * 0.04 * Math.sin(5.1 * s + 2) };
};
export const CHASE2_T0 = 53.1;

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

// shot 1: the gunner sits at HOOK (paddock) facing -z, the emu stands 8 m ahead
export const HOOK: V3 = [120, 0, 20];
export const S1_EMU: V3 = at(HOOK, 0.7, 0, -8);
const S1a = (f: number) => dolly(at(HOOK, 0.6, 1.55, 3.9), at(HOOK, 0.45, 1.0, -3.5), pushK(f, 0, 0.0022), { fov: 42 });
const S1b = (f: number) => dolly(at(HOOK, 0.4, 1.55, 2.6), at(HOOK, 0.6, 1.2, -5.5), pushK(f, 52, 0.0015), { fov: 38, roll: -0.035 });
const S1c = (f: number) => dolly(at(HOOK, 1.05, 1.5, -4.6), at(HOOK, 0.7, 1.52, -8), pushK(f, 85, 0.002, 0.006, 30), { fov: 34, roll: 0.03 });
// shot 2: the stream of emus through the fence gap into the wheat
const S2a = (f: number) => zoom([42, 30, -18], [0, 0, -112], 46, pushK(f, 124, 0.002));
const S2b = (f: number) => dolly([22, 8.5, -44], [0, 1.0, -92], pushK(f, 188, 0.002), { fov: 42, roll: -0.03 });
const S2c = (f: number) => dolly([2.6, 0.95, -27.5], [0.2, 1.15, -44], pushK(f, 291, 0.003), { fov: 40 });
// shot 3: the farmer on the track, emus in the wheat behind him
export const FARMER3: V3 = [18.5, 0, -30];
const S3a = (f: number) => dolly(at(FARMER3, 2.2, 1.65, 5.6), at(FARMER3, -0.4, 1.4, -1.5), pushK(f, 318, 0.0025), { fov: 40 });
const S3b = (f: number) => dolly(at(FARMER3, 0.7, 1.75, 2.7), at(FARMER3, 0, 1.78, 0), pushK(f, 376, 0.002, 0.005, 30), { fov: 36, roll: 0.035 });
// shot 4: the camp
export const SOLDIERS4: V3[] = [at(CAMP, -1.3, 0, 0), at(CAMP, 0, 0, -0.2), at(CAMP, 1.3, 0, 0)];
export const CRATE_GUNS: V3 = at(CAMP, -4.5, 0, -2.5);
export const AMMO: V3 = at(CAMP, 4.5, 0, -3.5);
const S4a = (f: number) => dolly(at(CAMP, 0.2, 1.6, -9.8), at(CAMP, 0, 1.3, 0.5), pushK(f, 420, 0.0015), { fov: 44 });
const S4b = (f: number) => dolly(at(CRATE_GUNS, 1.2, 1.25, -2.6), at(CRATE_GUNS, 0, 0.95, 0), pushK(f, 470, 0.003), { fov: 36, roll: -0.035 });
const S4c = (f: number) => zoom(at(AMMO, -2.6, 0.45, -5.8), at(AMMO, 0, 2.0, 0), 48, pushK(f, 500, 0.002, 0.005, 30), { roll: 0.04 });
// shot 5: day one in the paddock, the gunner at GUN5 facing -z, emus ~95 m away
export const GUN5: V3 = [150, 0, 40];
const S5a = (f: number) => zoom(at(GUN5, 0.4, 1.6, 3.0), at(GUN5, 0, 1.0, -80), 34, pushK(f, 540, 0.0015));
const S5b = (f: number) => dolly(at(GUN5, 3.4, 1.15, -1.0), at(GUN5, 0, 1.0, -0.4), pushK(f, 618, 0.0025), { fov: 40, roll: 0.03 });
const S5c = (f: number) => zoom(at(GUN5, 0.6, 1.5, -38), at(GUN5, 0, 1.0, -100), 30, pushK(f, 650, 0.002), { roll: -0.03 });
// shot 6: the dam; three soldiers crouch behind its south bank, the gun on the bank top
export const HIDE6: V3 = at(DAM, 0, 0, DAM_R + 6.5);
const S6a = (f: number) => zoom(at(DAM, 26, 28, 40), at(DAM, 0, 0, -2), 44, pushK(f, 682, 0.002));
const S6b = (f: number) => dolly(at(HIDE6, 2.6, 1.1, 6.0), at(HIDE6, 0, 0.95, 0), pushK(f, 776, 0.0025), { fov: 38 });
const S6c = (f: number) => dolly(at(HIDE6, 0.9, 1.75, 3.6), at(HIDE6, 0, 1.35, -1.2), pushK(f, 820, 0.0025, 0.005, 25), { fov: 40, roll: -0.04 });
// shot 7: bolting the gun on (parked), then the chase along +x
const S7a = (f: number) => dolly([101.0, 2.0, 9.2], [99.7, 1.4, 0.5], pushK(f, 856, 0.0015), { fov: 44 });
const S7b = (f: number): Shot => { const x = truckX(T(f)); return { pos: [x + 5.0, 2.4, 17.5], look: [x + 6.5, 1.1, 0], fov: 46, roll: 0 }; };
const S7c = (f: number): Shot => { const x = truckX(T(f)), b = bump(T(f)); return { pos: [x - 2.2, 2.75 + b.heave, 3.0], look: [x - 0.6, 2.15 + b.heave * 0.6, 0], fov: 40, roll: b.roll * 0.6 }; };
// shot 8: groups, then one lookout
export const LEADER8: V3 = [190, 0, -8];
const S8a = (f: number) => zoom([150, 46, 64], [185, 0, -12], 46, pushK(f, 1062, 0.002));
const S8b = (f: number) => dolly(at(LEADER8, 0.35, 1.75, 3.4), at(LEADER8, 0, 1.85, 0), pushK(f, 1122, 0.002, 0.005, 30), { fov: 34 });
// shot 9: golden retreat to the truck (parked at 100, 0, 0)
const S9a = (f: number) => dolly([107.5, 1.9, 16], [106.2, 1.1, 2.5], pushK(f, 1166, 0.0018), { fov: 42 });
// shot 10: the truck comes back down the track; then a soldier in the wheat, emus rising all around
export const SOLDIER10: V3 = [18.5, 0, -12];
export const TRUCK10Z = (t: number) => -80 + 9 * Math.min(1.9, Math.max(0, t - 41.2));
const S10a = (f: number) => dolly([20.5, 1.45, -46], [18.5, 1.6, -66], pushK(f, 1236, 0.0025), { fov: 40 });
const S10b = (f: number) => dolly(at(SOLDIER10, 0.5, 1.6, 4.4), at(SOLDIER10, 0, 1.5, 0), pushK(f, 1300, 0.002, 0.005, 30), { fov: 42, roll: -0.03 });
// shot 11: the major (camp), then "like tanks"
export const MAJOR11: V3 = at(CAMP, -1.0, 0, 3.2);
export const TANK11: V3 = [230, 0, -6];
const S11a = (f: number) => dolly(at(MAJOR11, 0.35, 1.72, 3.5), at(MAJOR11, 0, 1.68, 0), pushK(f, 1350, 0.0022), { fov: 38 });
const S11b = (f: number) => dolly(at(TANK11, 0.25, 0.42, 6.4), at(TANK11, 0, 1.35, 0), pushK(f, 1418, 0.002), { fov: 42, roll: 0.035 });
// shot 12: the park corner (pigeon), the towering crowd, the truck overtaken
const S12a = (f: number) => dolly(at(PARK, 0.4, 1.3, 6.2), at(PARK, -0.6, 0.85, 0), pushK(f, 1464, 0.0018), { fov: 42 });
export const WALL12: V3 = [250, 0, 0];
const S12b = (f: number) => dolly(at(WALL12, 0, 0.3, 7.5), at(WALL12, 0, 2.3, 0), pushK(f, 1534, 0.002, 0.005, 30), { fov: 50 });
const S12c = (f: number): Shot => { const x = truckX(T(f) - CHASE2_T0 + CHASE_T0); return { pos: [x + 4.5, 1.6, 13], look: [x + 6, 1.2, 0], fov: 46 }; };
// shot 13: golden camp, exhausted gunners on empty crates; then one emu and ten falling cartridge cases
export const EMU13: V3 = [182, 0, -20];
const S13a = (f: number) => dolly(at(CAMP, 1.0, 1.35, -6.6), at(CAMP, 1.4, 0.9, 0.2), pushK(f, 1626, 0.002), { fov: 42 });
const S13b = (f: number) => dolly(at(EMU13, 0.3, 1.62, 3.5), at(EMU13, 0, 1.55, 0), pushK(f, 1754, 0.002), { fov: 36 });
// shot 14: the farmer at his mailbox; the years land as push pops; then the empty track, emus crossing
const S14a = (f: number) => {
  const pops = [1842, 1874, 1901].reduce((a, p) => a + 0.09 * glide((f - p + 3) / 8), 0);
  return dolly(at(MAILBOX, 2.1, 1.7, -4.2), at(MAILBOX, -0.6, 1.55, 0.3), pushK(f, 1796, 0.0018) * (1 - pops), { fov: 40 });
};
const S14b = (f: number) => dolly(at(MAILBOX, 10, 2.4, -14), at(MAILBOX, -2, 0.9, 1), pushK(f, 1934, 0.002), { fov: 44, roll: 0.03 });
// shot 15: the monument
const S15a = (f: number) => dolly(at(MONUMENT, 0.3, 3.0, 19), at(MONUMENT, 0, 2.9, 0), pushK(f, 1964, 0.0018), { fov: 46 });
const S15b = (f: number) => dolly(at(MONUMENT, -1.5, 2.6, 10.5), at(MONUMENT, -1.5, 2.6, 0.6), pushK(f, 2030, 0.0015), { fov: 42 });
const S15c = (f: number) => dolly(at(MONUMENT, -2.7, 2.75, 3.6), at(MONUMENT, -3.0, 2.72, 0.7), pushK(f, 2084, 0.0025, 0.005, 30), { fov: 34, roll: 0.03 });

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }, { f: 52, dur: 30, s: S1b }, { f: 85, cut: true, s: S1c }],
  2: [{ f: 124, s: S2a }, { f: 188, dur: 32, s: S2b }, { f: 291, cut: true, s: S2c }],
  3: [{ f: 314, s: S3a }, { f: 376, cut: true, s: S3b }],
  4: [{ f: 416, s: S4a }, { f: 470, cut: true, s: S4b }, { f: 500, cut: true, s: S4c }],
  5: [{ f: 536, s: S5a }, { f: 618, cut: true, s: S5b }, { f: 650, cut: true, s: S5c }],
  6: [{ f: 678, s: S6a }, { f: 776, cut: true, s: S6b }, { f: 820, cut: true, s: S6c }],
  7: [{ f: 852, s: S7a }, { f: 925, cut: true, s: S7b }, { f: 981, cut: true, s: S7c }],
  8: [{ f: 1058, s: S8a }, { f: 1122, cut: true, s: S8b }],
  9: [{ f: 1166, s: S9a }],
  10: [{ f: 1236, s: S10a }, { f: 1300, cut: true, s: S10b }],
  11: [{ f: 1346, s: S11a }, { f: 1418, cut: true, s: S11b }],
  12: [{ f: 1460, s: S12a }, { f: 1534, cut: true, s: S12b }, { f: 1594, cut: true, s: S12c }],
  13: [{ f: 1626, s: S13a }, { f: 1754, cut: true, s: S13b }],
  14: [{ f: 1796, s: S14a }, { f: 1934, cut: true, s: S14b }],
  15: [{ f: 1964, s: S15a }, { f: 2030, dur: 34, s: S15b }, { f: 2084, cut: true, s: S15c }],
};

/** impact kicks: the gun jamming, the bolting hammer, the years, "no" */
const KICKS: [number, number][] = [[27.58, 0.8], [29.24, 0.5], [30.22, 0.6], [61.42, 0.5], [62.48, 0.5], [63.38, 0.6], [64.86, 0.4]];
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
  { f: 0, cInf: 10, focus: () => [120.7, 1.4, 12] },
  { f: 85, cInf: 15 },
  { f: 128, cInf: 0 },
  { f: 291, cInf: 8, focus: () => [0.2, 1.3, -40] },
  { f: 318, cInf: 11, focus: () => [18.5, 1.6, -30] },
  { f: 376, cInf: 14, focus: () => [18.5, 1.78, -30] },
  { f: 420, cInf: 0 },
  { f: 470, cInf: 12 },
  { f: 500, cInf: 0 },
  { f: 618, cInf: 10 },
  { f: 650, cInf: 0 },
  { f: 776, cInf: 10 },
  { f: 820, cInf: 13 },
  { f: 856, cInf: 0 },
  { f: 981, cInf: 9 },
  { f: 1062, cInf: 0 },
  { f: 1122, cInf: 15 },
  { f: 1170, cInf: 5 },
  { f: 1240, cInf: 0 },
  { f: 1300, cInf: 10 },
  { f: 1350, cInf: 12 },
  { f: 1418, cInf: 8 },
  { f: 1464, cInf: 9 },
  { f: 1534, cInf: 0 },
  { f: 1630, cInf: 6 },
  { f: 1754, cInf: 15 },
  { f: 1800, cInf: 10 },
  { f: 1934, cInf: 0 },
  { f: 2084, cInf: 12 },
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
export const FOREGROUND: Fg[] = [
  { a: 318, b: 376, kit: "plant_bushDetailed", pos: [21.4, 0, -25.8], s: 0.9, yaw: 0.4 },
  { a: 1464, b: 1534, kit: "plant_bushLarge", pos: [-297.6, 0, 303.2], s: 0.8, yaw: 1.1 },
];
