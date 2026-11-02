// Episode 1 cast that is not a person: emus (side + front), the Lewis gun, a park pigeon and the closing emblem.
// Same drawing language as toon.ts: flat fills with a soft crescent away from the light, plum ink, thick-thin outlines.
// Design space: 600 x 1000 units, soles at y = 975 (1000 units = 2.16 m), so an emu ~1.75 m tall reaches y ~165.
import { Pen, INK, mul, shade, mix, thickAngle } from "./toon";

type P2 = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const DEF_LIGHT = rad(-120);
const ell = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0, n = 48): P2[] => {
  const r = rad(rot), pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return pts;
};
const qcurve = (a: P2, k: P2, b: P2, n = 16): P2[] =>
  Array.from({ length: n + 1 }, (_, i) => { const t = i / n, s = 1 - t; return [s * s * a[0] + 2 * s * t * k[0] + t * t * b[0], s * s * a[1] + 2 * s * t * k[1] + t * t * b[1]] as P2; });
const rotP = (q: P2, a: number, c: P2): P2 => { const s = Math.sin(a), co = Math.cos(a); return [c[0] + (q[0] - c[0]) * co - (q[1] - c[1]) * s, c[1] + (q[0] - c[0]) * s + (q[1] - c[1]) * co]; };


/** filled ribbon along a polyline with width w(t); colour switches from c0 to c1 at t = split (no seam ink) */
const ribbon = (p: Pen, pts: P2[], w: (t: number) => number, c0: string, c1: string, split: number, ol = 9) => {
  const n = pts.length, L: P2[] = [], R: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const h = w(i / (n - 1)) / 2, nx = -dy / l, ny = dx / l;
    L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]); R.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
  }
  const k = Math.round(split * (n - 1));
  p.poly([...L.slice(k), ...R.slice(k).reverse()], c1, 0);
  p.poly([...L.slice(0, k + 1), ...R.slice(0, k + 1).reverse()], c0, 0);
  // feather fringe along the colour change
  const m = pts[k];
  for (let j = -2; j <= 2; j++) p.stroke([[m[0] + j * w(split) * 0.18, m[1] - 2], [m[0] + j * w(split) * 0.2 + 3, m[1] - 16]], 4, c0);
  p.stroke(L, ol); p.stroke(R, ol);
};

// ---------------- emu ----------------
export const PLUME = "#7b6651", PLUME_SH = "#4f4036", PLUME_DK = "#3e3129";
export const NECK = "#8ea2c2", NECK_SH = "#64779a";
export const LEG = "#8d8781", LEG_SH = "#5f5a56";
export type EmuPose = "stand" | "walk" | "run" | "peck" | "watch" | "drink";
export type EmuExpr = "deadpan" | "smug" | "alarm" | "blink" | "proud";
export type EmuOpts = { pose?: EmuPose; phase?: number; expr?: EmuExpr; light?: number; seed?: number; lid?: number; look?: number };

/** shaggy body contour: smooth back, ragged fringe underneath (tufts every ~25 units) */
const plumage = (cx: number, cy: number, rx: number, ry: number, tilt: number, seed: number): P2[] => {
  const pts: P2[] = [], n = 90;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
    let r = 1 + 0.025 * Math.cos(3 * t + seed);
    if (s > 0.05) r += 0.075 * s * Math.abs(Math.sin(7.5 * t + seed * 1.7)); // fringe on the underside
    if (c < -0.55 && s > -0.4) r += 0.05 * Math.abs(Math.sin(6 * t)); // rump tufts
    pts.push(rotP([cx + rx * c * r, cy + ry * s * r], tilt, [cx, cy]));
  }
  return pts;
};

/** emu leg: hip -> backward joint -> foot, three forward toes */
const emuLeg = (p: Pen, hip: P2, foot: P2, l1: number, l2: number, col: string, lift: number) => {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.5);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), k = Math.atan2(dy, dx) + A; // joint bends back (-x)
  const J: P2 = [hip[0] + l1 * Math.cos(k), hip[1] + l1 * Math.sin(k)];
  p.line([hip, J], col, 30);
  p.line([J, foot], col, 21);
  p.dot(J[0], J[1], 15, col);
  const curl = lift * 0.6;
  for (const [a, L] of [[-8, 46], [10, 40], [-28, 30]] as const) {
    const ang = rad(a + 40 * curl);
    p.line([foot, [foot[0] + L * Math.cos(ang), foot[1] + L * Math.sin(ang)]], col, 11);
  }
};

const emuEye = (p: Pen, x: number, y: number, expr: EmuExpr, lid: number, look: number, skin: string) => {
  const big = expr === "alarm";
  const rx = big ? 17 : 13, ry = big ? 20 : 15;
  if (expr === "blink" || lid >= 0.99) { p.arc(x, y + 2, rx, 5, 10, 170, 4); return; }
  p.ell(x, y, rx, ry, "#fbf6ec", 4);
  const px = x + look * 4 + 2, py = y + 1;
  if (!big) p.dot(px, py, 8.5, "#c7692a");
  p.dot(px, py, big ? 4.5 : 5, INK);
  p.dot(px - 3, py - 3, big ? 1.6 : 1.8, "#ffffff");
  // eyelid: deadpan / smug half-closed, proud a little lower
  const k = expr === "deadpan" || expr === "smug" ? 0.52 : expr === "proud" ? 0.38 : 0;
  const kk = Math.max(k, lid);
  if (kk > 0) {
    const yl = y - ry + 2 * ry * kk;
    const lidPts: P2[] = [...ell(x, y, rx + 1, ry + 1, 180, 360), [x + rx + 1, yl], [x - rx - 1, yl]];
    p.poly(lidPts, skin, 0);
    p.stroke([[x - rx - 2, yl + (expr === "smug" ? 3 : 0)], [x + rx + 2, yl - (expr === "smug" ? 3 : 0)]], 4.5);
    p.poly(ell(x, y, rx, ry), null, 4);
  }
};

/** side view facing screen-right. phase 0..1 per stride cycle (walk 1 cycle = 2 steps). */
export const emuSide = (p: Pen, o: EmuOpts = {}) => {
  const { pose = "stand", phase = 0, expr = "deadpan", light = DEF_LIGHT, seed = 1, lid = 0, look = 0 } = o;
  const two = Math.PI * 2, thick = thickAngle(light);
  const run = pose === "run", walk = pose === "walk" || run, down = pose === "peck" || pose === "drink";
  const S = run ? 420 : walk ? 230 : 0; // stride (units), run ~ planted feet long strides
  const bob = walk ? (run ? 26 : 12) * Math.cos(2 * two * phase) : 0;
  const tilt = rad(run ? -13 : down ? 12 : pose === "watch" ? -6 : -3);
  const bx = 268 + (run ? -20 : 0), by = (run ? 545 : down ? 560 : 520) + bob;
  const l1 = 205, l2 = 200;
  // legs (far first, darker)
  const feet: { foot: P2; lift: number; near: boolean }[] = [];
  for (const near of [false, true]) {
    const ph = ((phase + (near ? 0 : 0.5)) % 1 + 1) % 1;
    let fx = 0, lift = 0;
    if (!walk) fx = near ? 18 : -22;
    else if (ph < 0.58) fx = S * (0.5 - ph / 0.58); // planted: slides back at walking speed
    else { const u = (ph - 0.58) / 0.42; fx = S * (-0.5 + u); lift = Math.sin(Math.PI * u); }
    const lh = lift * (run ? 120 : 70);
    feet.push({ foot: [bx + 20 + fx, 960 - lh], lift, near });
  }
  for (const L of feet) {
    const hip: P2 = [bx + (L.near ? 22 : -2), by + 45];
    emuLeg(p, hip, L.foot, l1, l2, L.near ? LEG : mul(LEG, [0.72, 0.72, 0.76]), L.lift);
  }
  // neck: base at the body's front shoulder, to the head
  const NB = rotP([bx + 122, by - 62], tilt, [bx, by]);
  let H: P2, headRot = 0;
  if (pose === "run") H = [bx + 285, 330 + bob * 0.5];
  else if (down) { H = [bx + 238, pose === "drink" ? 905 : 880]; headRot = rad(62); }
  else if (pose === "watch") H = [bx + 150, 128];
  else H = [bx + 175 + (walk ? 10 * Math.sin(two * phase * 2) : 0), 178 + bob * 0.6];
  const K: P2 = down ? [NB[0] + 110, NB[1] - 30] : run ? [NB[0] + 70, NB[1] - 120] : [H[0] - 30, (NB[1] + H[1]) * 0.55];
  const neck = qcurve(NB, K, H, 24);
  ribbon(p, neck, (t) => 78 - 44 * Math.min(1, t / 0.6), PLUME_SH, NECK, 0.52, 9);
  // body
  const body = plumage(bx, by, 172, 112, tilt, seed);
  p.shadedFill(body, PLUME, PLUME_SH, light, 172, 0.42);
  // feather streaks
  for (let i = 0; i < 9; i++) {
    const a = rnd(seed, i) * 1.9 + 0.35, rr = 0.35 + 0.45 * rnd(seed, i + 20);
    const c0 = rotP([bx - 120 + 240 * rnd(seed, i + 40), by - 50 + 110 * rnd(seed, i + 60)], tilt, [bx, by]);
    p.arc(c0[0], c0[1], 26 * rr + 12, 14 * rr + 6, 20 + 60 * a, 120 + 60 * a, 3.5, PLUME_DK);
  }
  p.inkRing(body, 11, thick);
  // head (rotated as a whole when pecking)
  const save = p.rot;
  p.rot = headRot ? [headRot, H[0], H[1]] : null;
  const hx = H[0], hy = H[1];
  const tuft: P2[] = [[hx - 30, hy - 14], [hx - 22, hy - 44], [hx - 10, hy - 30], [hx - 2, hy - 50], [hx + 8, hy - 30], [hx + 20, hy - 38], [hx + 22, hy - 16]];
  if (expr === "alarm") tuft.splice(1, 5, [hx - 26, hy - 62], [hx - 10, hy - 36], [hx - 2, hy - 70], [hx + 8, hy - 36], [hx + 22, hy - 58]);
  p.poly(tuft, PLUME_DK, 4);
  const head = ell(hx, hy, 50, 40);
  p.shadedFill(head, NECK, NECK_SH, light, 50, 0.4);
  p.inkRing(head, 7, thick);
  const beak: P2[] = [[hx + 36, hy - 6], [hx + 70, hy - 2], [hx + 96, hy + 9], [hx + 68, hy + 16], [hx + 34, hy + 15]];
  p.poly(beak, "#4b4642", 5);
  p.stroke([[hx + 38, hy + 6], [hx + 86, hy + 9]], 3);
  if (expr === "smug" || expr === "proud") p.arc(hx + 24, hy + 8, 9, 8, 20, 120, 3.5); // beak-corner smirk
  emuEye(p, hx + 10, hy - 8, expr, lid, look, NECK);
  p.rot = save;
};

/** front view (facing the camera), for close-ups, the lookout and the emblem */
export const emuFront = (p: Pen, o: EmuOpts = {}) => {
  const { pose = "stand", phase = 0, expr = "deadpan", light = DEF_LIGHT, seed = 2, lid = 0, look = 0 } = o;
  const thick = thickAngle(light), tall = pose === "watch";
  const bob = pose === "walk" ? 10 * Math.cos(4 * Math.PI * phase) : 0;
  const bx = 300, by = 545 + bob;
  for (const s of [-1, 1]) {
    const lift = pose === "walk" ? Math.max(0, Math.sin(2 * Math.PI * (phase + (s > 0 ? 0 : 0.5)))) * 40 : 0;
    const hip: P2 = [bx + s * 52, by + 60], foot: P2 = [bx + s * 66, 958 - lift];
    p.line([hip, [bx + s * 74, 790 - lift * 0.5], foot], s < 0 ? mul(LEG, [0.8, 0.8, 0.84]) : LEG, 26);
    for (const a of [-60, 0, 60]) p.line([foot, [foot[0] + 22 * Math.sin(rad(a)) + s * 4, foot[1] + 14]], LEG, 11);
  }
  const H: P2 = [bx + look * 6, tall ? 150 : 200 + bob];
  const neck = qcurve([bx, by - 40], [H[0], (by - 40 + H[1]) / 2], H, 20);
  ribbon(p, neck, (t) => 92 - 52 * Math.min(1, t / 0.6), PLUME_SH, NECK, 0.5, 9);
  const body = plumage(bx, by, 150, 128, 0, seed);
  p.shadedFill(body, PLUME, PLUME_SH, light, 150, 0.42);
  for (let i = 0; i < 8; i++) {
    const cx = bx - 100 + 200 * rnd(seed, i + 3), cy = by - 60 + 120 * rnd(seed, i + 9);
    p.arc(cx, cy, 22, 12, 30, 150, 3.5, PLUME_DK);
  }
  p.inkRing(body, 11, thick);
  const tuft: P2[] = [[H[0] - 30, H[1] - 18], [H[0] - 16, H[1] - (expr === "alarm" ? 66 : 48)], [H[0] - 4, H[1] - 30], [H[0] + 6, H[1] - (expr === "alarm" ? 72 : 52)],
    [H[0] + 16, H[1] - 30], [H[0] + 28, H[1] - (expr === "alarm" ? 62 : 42)], [H[0] + 32, H[1] - 16]];
  p.poly(tuft, PLUME_DK, 4);
  const head = ell(H[0], H[1], 46, 38);
  p.shadedFill(head, NECK, NECK_SH, light, 46, 0.4);
  p.inkRing(head, 7, thick);
  p.poly(ell(H[0], H[1] + 26, 24, 13), "#4b4642", 5); // beak end-on
  p.stroke([[H[0] - 20, H[1] + 26], [H[0] + 20, H[1] + 26]], 3);
  if (expr === "smug" || expr === "proud") p.arc(H[0] + 20, H[1] + 24, 8, 7, -30, 80, 3.5);
  for (const s of [-1, 1]) emuEye(p, H[0] + s * 24, H[1] - 6, expr, lid, look, NECK);
};

// ---------------- Lewis gun (side view, muzzle to screen-right; base of the bipod at the soles line) ----------------
export const lewisGun = (p: Pen, o: { fire?: number; jam?: number; light?: number } = {}) => {
  const { fire = 0, jam = 0, light = DEF_LIGHT } = o;
  const thick = thickAngle(light), y = 760;
  const metal = "#3b3f48", metalSh = "#24272e", wood = "#7c5434";
  // bipod
  p.line([[430, y + 10], [395, 975]], metal, 12);
  p.line([[430, y + 10], [470, 975]], mul(metal, [0.8, 0.8, 0.8]), 12);
  // stock
  const stock: P2[] = [[30, y + 6], [150, y - 14], [175, y + 4], [175, y + 36], [60, y + 66], [26, y + 58]];
  p.gradFill(stock, wood, shade(wood, 0.7), light);
  p.poly(stock, null, 7);
  // receiver + grip
  const rec: P2[] = [[160, y - 34], [270, y - 34], [270, y + 30], [160, y + 30]];
  p.gradFill(rec, metal, metalSh, light);
  p.poly(rec, null, 7);
  p.poly([[205, y + 28], [228, y + 28], [216, y + 84], [196, y + 82]], wood, 6);
  // cooling shroud (the fat barrel)
  const sh = [...ell(270, y - 2, 0.1, 36, 90, 270), [540, y - 26] as P2, [540, y + 22] as P2];
  const shroud: P2[] = [[268, y - 38], [520, y - 30], [545, y - 18], [545, y + 16], [520, y + 28], [268, y + 34]];
  p.gradFill(shroud, metal, metalSh, light);
  for (let x = 290; x < 515; x += 22) p.stroke([[x, y - 33], [x, y + 30]], 3, metalSh);
  p.poly(shroud, null, 7);
  void sh;
  // muzzle
  p.poly([[545, y - 9], [585, y - 7], [585, y + 6], [545, y + 8]], metalSh, 6);
  // drum magazine on top (seen edge-on)
  p.poly(ell(220, y - 52, 92, 20), metal, 7);
  p.poly(ell(220, y - 60, 92, 20), shade(metal, 1.2), 7);
  p.ell(220, y - 60, 22, 6, metalSh, 4);
  p.inkRing(stock, 0.1, thick);
  // muzzle flash / jam smoke
  if (fire > 0) {
    const r = 46 + 40 * fire;
    const star: P2[] = [];
    for (let i = 0; i < 12; i++) { const a = rad(i * 30 + 15 * fire), rr = i % 2 ? r * 0.45 : r; star.push([592 + rr * Math.cos(a) * 1.2, y + rr * Math.sin(a) * 0.8]); }
    p.poly(star, "#ffd35a", 5);
    p.poly(ell(592, y, r * 0.35, r * 0.25), "#fff6c9", 0);
  }
  if (jam > 0) for (let k = 0; k < 3; k++) {
    const u = (jam + k * 0.33) % 1;
    p.ell(250 + 30 * k, y - 100 - 160 * u, 28 + 40 * u, 24 + 30 * u, mix("#8e8a90", "#d8d6da", u), 5);
  }
};

// ---------------- pigeon (side view, small card; 1000 units = 0.6 m on its own canvas) ----------------
export const pigeon = (p: Pen, o: { peck?: number; flap?: number } = {}) => {
  const { peck = 0, flap = 0 } = o;
  const body = ell(280, 700, 150, 105, 0, 360, -12);
  for (const s of [-1, 1]) p.line([[270 + s * 30, 790], [262 + s * 34, 945]], "#d76a5a", 16);
  p.shadedFill(body, "#9ea3b3", "#6f7487", rad(-120), 150, 0.4);
  p.poly(body, null, 10);
  p.poly([[160, 700], [40, 650], [60, 720], [170, 745]], "#5f6476", 8); // tail
  const wing = flap > 0 ? [[270, 640], [200, 380 - 120 * flap], [140, 600]] as P2[] : [[330, 650], [200, 640], [150, 740], [300, 730]] as P2[];
  p.poly(wing, "#8a8fa1", 8);
  const H: P2 = [420, 500 + 260 * peck];
  p.line([[380, 640], H], "#6f8f86", 70);
  p.ell(H[0], H[1], 60, 52, "#a3a8b8", 8);
  p.poly([[470, H[1] - 6], [520, H[1] + 6], [470, H[1] + 16]], "#e6b98a", 6);
  p.ell(442, H[1] - 12, 11, 12, "#fbf6ec", 4); p.dot(445, H[1] - 11, 6, INK);
};

// ---------------- the closing emblem: a shield held by an emu and a kangaroo (our own drawing) ----------------
export const kangaroo = (p: Pen, light = DEF_LIGHT) => {
  const fur = "#c98a4e", furSh = "#91603a", thick = thickAngle(light);
  p.line([[230, 760], [80, 950], [20, 960]], fur, 46); // tail
  const legs: P2[] = [[240, 650], [330, 700], [360, 900], [450, 960], [300, 965], [250, 820]];
  p.gradFill(legs, fur, furSh, light); p.poly(legs, null, 9);
  const body = ell(270, 560, 110, 190, 0, 360, -10);
  p.shadedFill(body, fur, furSh, light, 150, 0.4); p.inkRing(body, 10, thick);
  p.ell(300, 600, 58, 120, "#e8c79a", 0);
  for (const s of [0, 1]) p.line([[330, 470 + s * 20], [390, 560 + s * 16], [405, 530 + s * 18]], fur, 22);
  const H: P2 = [310, 300];
  for (const s of [-1, 1]) p.poly([[H[0] + s * 18, H[1] - 30], [H[0] + s * 40, H[1] - 120], [H[0] + s * 52, H[1] - 30]], fur, 8);
  p.poly(ell(H[0] + 20, H[1], 70, 52, 0, 360, 8), fur, 9);
  p.ell(H[0] + 76, H[1] + 14, 14, 10, INK, 0);
  p.ell(H[0] + 26, H[1] - 12, 11, 13, "#fbf6ec", 4); p.dot(H[0] + 29, H[1] - 11, 5.5, INK);
  p.stroke([[H[0] + 14, H[1] - 26], [H[0] + 40, H[1] - 24]], 4);
};

export const emblem = (p: Pen) => {
  // gold seven-point star
  const star: P2[] = [];
  for (let i = 0; i < 14; i++) { const a = rad(-90 + i * (360 / 14)), r = i % 2 ? 34 : 78; star.push([500 + r * Math.cos(a), 110 + r * Math.sin(a)]); }
  p.poly(star, "#f2c13a", 7);
  // wattle sprigs at the base
  for (const s of [-1, 1]) {
    p.line([[500 + s * 60, 905], [500 + s * 330, 860]], "#5c7f3a", 16);
    for (let i = 0; i < 9; i++) p.dot(500 + s * (110 + i * 26), 896 - i * 4 + (i % 2 ? -14 : 12), 15, "#f2c63c");
  }
  // shield: six quarters in muted heraldic colours
  const sh: P2[] = [[330, 230], [670, 230], [670, 560], [500, 760], [330, 560]];
  const cols = ["#c8453a", "#f1e7d0", "#3f6fb5", "#e3b23c", "#f1e7d0", "#4e8a4f"];
  p.clip(sh, () => {
    for (let i = 0; i < 6; i++) { const cx = 330 + (i % 3) * 113.3, cy = 230 + Math.floor(i / 3) * 265; p.poly([[cx, cy], [cx + 114, cy], [cx + 114, cy + 266], [cx, cy + 266]], cols[i], 0); }
  });
  p.poly(sh, null, 10);
  for (const x of [443, 557]) p.stroke([[x, 232], [x, 700]], 5);
  p.stroke([[332, 495], [668, 495]], 5);
};
