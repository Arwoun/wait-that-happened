// Episode 2 cast that is not a person: Hans the horse (side + front), the blackboard, a sniffer dog, suitcases and a computer.
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

// ---------------- Hans (our own cartoon horse) ----------------
// Side view faces screen-right. Drawn at HALF the people's scale: on its card 1 m = 231 units (place it with scale 2),
// so a 1.55 m horse at the withers fills the lower half of the 600 x 1000 canvas; hooves on the soles line (y = 975).
export const COAT = "#9a6440", COAT_SH = "#66402c", MANE = "#2f2326", MANE_SH = "#1e1618", MUZZLE = "#6e4c40", HOOF = "#3a3036";
export type HorseExpr = "deadpan" | "proud" | "alarm" | "dazed" | "wink" | "focus";
export type HorseOpts = { tap?: number; expr?: HorseExpr; lid?: number; look?: number; blinders?: boolean; headDown?: number; light?: number; seed?: number; walk?: number };
/** side view: horse metres -> canvas (1 m = 215 units, the horse's x = 0 sits 0.302 m left of the card centre) */
export const HORSE_SCALE = 1 / (215 * 0.00216), HORSE_X0 = (300 - 235) / 215;
const HM = (x: number, y: number): P2 => [235 + x * 215, 975 - y * 215];
const HMF = (x: number, y: number): P2 => [300 + x * 215, 975 - y * 215];

const horseEye = (p: Pen, x: number, y: number, r: number, expr: HorseExpr, lid: number, look: number, skin: string) => {
  if (expr === "wink" || lid >= 0.99) { p.arc(x, y + 2, r, r * 0.6, 15, 165, 4.5); return; }
  if (expr === "dazed") { const s: P2[] = []; for (let t = 1; t < 16; t++) s.push([x + Math.cos(t * 0.9) * t * 0.06 * r * 2, y + Math.sin(t * 0.9) * t * 0.06 * r * 2]); p.ell(x, y, r, r * 1.05, "#fbf6ec", 4); p.stroke(s, 3.2); return; }
  const big = expr === "alarm";
  const rx = r * (big ? 1.2 : 1), ry = r * (big ? 1.3 : 1.08);
  p.ell(x, y, rx, ry, "#fbf6ec", 4);
  const px = x + look * r * 0.38 + r * 0.12, py = y + r * 0.1;
  p.dot(px, py, r * (big ? 0.42 : 0.56), "#3b2a24");
  p.dot(px, py, r * (big ? 0.3 : 0.36), INK);
  p.dot(px - r * 0.2, py - r * 0.22, r * 0.12, "#ffffff");
  const k = expr === "deadpan" ? 0.5 : expr === "proud" ? 0.42 : expr === "focus" ? 0.3 : 0, kk = Math.max(k, lid);
  if (kk > 0) {
    const yl = y - ry + 2 * ry * kk;
    p.poly([...ell(x, y, rx + 1, ry + 1, 180, 360), [x + rx + 1, yl], [x - rx - 1, yl]], skin, 0);
    p.stroke([[x - rx - 2, yl + (expr === "proud" ? 3 : 0)], [x + rx + 2, yl - (expr === "proud" ? 4 : 0)]], 5);
    p.poly(ell(x, y, rx, ry), null, 4);
  }
};

/** a foreleg / hind leg as a tapered limb with a hoof; pts: top, joint, fetlock (canvas units) */
const hleg = (p: Pen, top: P2, j: P2, f: P2, w0: number, col: string, hind: boolean) => {
  p.line([top, j], col, w0);
  p.line([j, f], col, w0 * 0.62);
  if (hind) p.dot(j[0], j[1], w0 * 0.42, col);
  const a = Math.atan2(f[1] - j[1], f[0] - j[0]) - Math.PI / 2, c = Math.cos(a), s = Math.sin(a), hw = w0 * 0.42, hh = w0 * 0.48;
  const R2 = (x: number, y: number): P2 => [f[0] + x * c - y * s, f[1] + x * s + y * c];
  p.poly([R2(-hw, 2), R2(hw * 1.15, 2), R2(hw * 1.5, hh), R2(-hw * 1.05, hh)], HOOF, 5);
};

export const horseSide = (p: Pen, o: HorseOpts = {}) => {
  const { tap = 0, expr = "deadpan", lid = 0, look = 0, blinders = false, headDown = 0, light = DEF_LIGHT, seed = 1, walk = -1 } = o;
  const thick = thickAngle(light), far = mul(COAT, [0.74, 0.72, 0.76]);
  const wph = walk >= 0 ? walk : 0, wk = walk >= 0 ? 1 : 0, two = Math.PI * 2;
  const bob = wk * 6 * Math.cos(2 * two * wph);
  // tail (behind everything)
  const T0 = HM(-0.8, 1.35 + bob / 215);
  p.line(qcurve(T0, [T0[0] - 30, T0[1] + 30], [T0[0] - 22 + 6 * Math.sin(seed), T0[1] + 170], 12), MANE_SH, 34);
  p.poly([[T0[0] - 14, T0[1] + 20], [T0[0] - 50, T0[1] + 120], [T0[0] - 40, T0[1] + 205], [T0[0] - 22, T0[1] + 180], [T0[0] - 8, T0[1] + 214], [T0[0] + 6, T0[1] + 150], [T0[0] + 8, T0[1] + 30]], MANE, 7);
  // legs: far pair first (darker), then near
  const swing = (ph: number) => wk * Math.sin(two * (wph + ph));
  const leg = (x: number, near: boolean, hind: boolean, lift: number, ph: number) => {
    const col = near ? COAT : far, sw = swing(ph) * 0.12;
    const top = HM(x, 0.98 + bob / 215), w0 = hind ? 46 : 36;
    if (hind) { const j = HM(x - 0.12 + sw * 0.5, 0.45), f = HM(x - 0.06 + sw, 0.09 + Math.max(0, swing(ph)) * 0.08 * wk); hleg(p, top, j, f, w0, col, true); return; }
    const j = HM(x + 0.02 + 0.2 * lift + sw * 0.5, 0.48 + 0.16 * lift), f = HM(x + 0.03 + 0.1 * lift + sw, 0.09 + 0.3 * lift + Math.max(0, swing(ph)) * 0.08 * wk);
    hleg(p, top, j, f, w0, col, false);
  };
  leg(-0.7, false, true, 0, 0.5); leg(0.34, false, false, 0, 0);
  leg(-0.58, true, true, 0, 0); leg(0.46, true, false, clamp(tap, 0, 1), 0.5);
  // barrel + chest + rump
  const by = 1.17 + bob / 215;
  const body = ell(HM(-0.12, by)[0], HM(-0.12, by)[1], 0.74 * 215, 0.36 * 215, 0, 360, -2);
  // neck (ribbon from the chest to the poll), drawn before the body so the body overlaps its base
  const dn = clamp(headDown, 0, 1);
  const poll = HM(0.86 - 0.02 * dn, 1.93 - 0.5 * dn + bob / 215), NB = HM(0.42, 1.25 + bob / 215);
  const neck = qcurve(NB, [NB[0] + 40 + 30 * dn, (NB[1] + poll[1]) / 2 - 10], poll, 18);
  ribbon(p, neck, (t) => 128 - 62 * t, COAT_SH, COAT, 0.02, 9);
  p.shadedFill(body, COAT, COAT_SH, light, 0.74 * 215, 0.42);
  // rump and shoulder masses
  p.shadedFill(ell(HM(-0.62, by + 0.04)[0], HM(-0.62, by + 0.04)[1], 0.3 * 215, 0.34 * 215), COAT, COAT_SH, light, 0.34 * 215, 0.42);
  p.inkRing(body, 11, thick);
  p.arc(HM(-0.6, by)[0], HM(-0.6, by)[1], 0.26 * 215, 0.3 * 215, 260, 330, 4, COAT_SH); // haunch crease
  p.arc(HM(0.28, by)[0], HM(0.28, by)[1], 0.2 * 215, 0.26 * 215, 200, 260, 4, COAT_SH); // shoulder crease
  // mane along the neck crest
  const crest: P2[] = [];
  for (let i = 0; i <= 10; i++) { const t = 0.15 + 0.85 * (i / 10), q2 = neck[Math.round(t * (neck.length - 1))]; crest.push([q2[0] - 30 * (1 - t) - 8, q2[1] - 24 + 10 * t]); }
  const mane = [...crest.map(([x, y]) => [x - 6, y - 10] as P2), ...crest.slice().reverse().map(([x, y], i) => [x - 30 + 10 * Math.sin(i * 1.9 + seed), y + 44 + 12 * Math.sin(i * 2.7)] as P2)];
  p.poly(mane, MANE, 6);
  // head: rotated as a whole about the poll
  const save = p.rot;
  const hr = rad(-4 + 30 * dn);
  const HS = 1.18; // head scale about the poll
  p.rot = [hr, poll[0], poll[1]];
  const hx = poll[0], hy = poll[1];
  p.g.save(); p.g.translate(hx, hy); p.g.scale(HS, HS); p.g.translate(-hx, -hy);
  for (const [dx, k] of [[-4, 0.9], [12, 1]] as const) p.poly([[hx + dx - 14, hy + 6], [hx + dx - 6, hy - 62 * k], [hx + dx + 18, hy + 4]], k < 1 ? COAT_SH : COAT, 6); // ears
  const headP: P2[] = [[hx - 30, hy - 4], [hx + 24, hy - 12], [hx + 74, hy + 30], [hx + 112, hy + 86], [hx + 128, hy + 116], [hx + 122, hy + 142], [hx + 96, hy + 150],
    [hx + 62, hy + 132], [hx + 22, hy + 112], [hx - 30, hy + 96], [hx - 52, hy + 52]];
  p.shadedFill(headP, COAT, COAT_SH, light, 80, 0.4);
  p.clip(headP, () => {
    p.ell(hx + 112, hy + 128, 40, 34, MUZZLE, 0); // dark soft muzzle
    p.poly([[hx + 20, hy - 6], [hx + 38, hy + 8], [hx + 70, hy + 46], [hx + 60, hy + 52], [hx + 26, hy + 18]], "#f4ead8", 0); // white blaze
  });
  p.poly(headP, null, 9);
  p.arc(hx - 14, hy + 50, 40, 44, 20, 160, 4, COAT_SH); // cheek
  p.ell(hx + 108, hy + 114, 7, 9, INK, 0); // nostril
  p.stroke([[hx + 92, hy + 140], [hx + 118, hy + 142]], 4); // mouth
  if (expr === "proud" || expr === "wink") p.arc(hx + 96, hy + 132, 10, 8, 30, 120, 3.5);
  // forelock
  p.poly([[hx - 8, hy - 8], [hx + 30, hy - 2], [hx + 26, hy + 26], [hx + 12, hy + 14], [hx + 4, hy + 30], [hx - 6, hy + 6]], MANE, 5);
  // halter: noseband + cheek strap
  p.band([[hx + 60, hy + 96], [hx + 70, hy + 136]], "#b0473a", 6, 2);
  p.band([[hx - 20, hy + 22], [hx + 62, hy + 98]], "#b0473a", 5, 1.8);
  const ex = hx + 30, ey = hy + 42;
  horseEye(p, ex, ey, 17, expr, lid, look, COAT);
  if (blinders) {
    p.poly([[ex - 26, ey - 30], [ex + 22, ey - 34], [ex + 28, ey + 24], [ex - 22, ey + 28]], "#2a2226", 5);
    p.stroke([[ex - 20, ey - 22], [ex + 18, ey - 25]], 3, "#5a4a50");
  }
  p.g.restore();
  p.rot = save;
};

/** front view (facing the camera): long face, eyes on the sides, chest and forelegs; same half scale */
export const horseFront = (p: Pen, o: HorseOpts = {}) => {
  const { expr = "deadpan", lid = 0, look = 0, blinders = false, light = DEF_LIGHT, tap = 0 } = o;
  const thick = thickAngle(light), far = mul(COAT, [0.8, 0.78, 0.82]);
  for (const s of [-1, 1]) {
    const lift = s > 0 ? clamp(tap, 0, 1) : 0;
    const top = HMF(s * 0.17, 1.0), j = HMF(s * 0.19, 0.5 + 0.22 * lift), f = HMF(s * 0.19, 0.09 + 0.3 * lift);
    hleg(p, top, j, f, 38, s < 0 ? far : COAT, false);
  }
  const chest = ell(HMF(0, 1.2)[0], HMF(0, 1.2)[1], 0.4 * 215, 0.38 * 215);
  const NB = HMF(0, 1.38), H = HMF(look * 0.03, 2.05);
  p.line([NB, H], COAT_SH, 120, true);
  p.shadedFill(chest, COAT, COAT_SH, light, 0.36 * 215, 0.4);
  p.inkRing(chest, 11, thick);
  const hx = H[0], hy = H[1];
  for (const s of [-1, 1]) p.poly([[hx + s * 30, hy - 50], [hx + s * 52, hy - 118], [hx + s * 62, hy - 40]], COAT, 6);
  const face: P2[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const yy = sn < 0 ? sn * 62 : sn * 150, w = sn < 0 ? 62 : 62 - 22 * sn; // broad brow, long narrowing face
    face.push([hx + c * w, hy + 20 + yy]);
  }
  p.shadedFill(face, COAT, COAT_SH, light, 90, 0.35);
  p.clip(face, () => {
    p.ell(hx, hy + 160, 52, 34, MUZZLE, 0);
    p.poly([[hx - 10, hy - 20], [hx + 10, hy - 20], [hx + 5, hy + 80], [hx - 5, hy + 80]], "#f4ead8", 0);
  });
  p.inkRing(face, 9, thick);
  for (const s of [-1, 1]) p.ell(hx + s * 22, hy + 156, 7, 11, INK, 0);
  p.arc(hx, hy + 168, 18, 6, 20, 160, 4);
  if (expr === "proud" || expr === "wink") p.arc(hx + 14, hy + 166, 12, 7, -20, 70, 3.5);
  p.poly([[hx - 30, hy - 40], [hx + 30, hy - 40], [hx + 20, hy + 6], [hx + 6, hy - 10], [hx - 6, hy + 10], [hx - 20, hy - 6]], MANE, 5); // forelock
  p.band([[hx - 56, hy + 96], [hx + 56, hy + 96]], "#b0473a", 8, 2.2); // noseband
  for (const s of [-1, 1]) {
    const ex = hx + s * 48, ey = hy + 6;
    horseEye(p, ex, ey, 15, expr === "wink" && s > 0 ? "wink" : expr === "wink" ? "proud" : expr, lid, look, COAT);
    if (blinders) p.poly([[ex + s * 4, ey - 34], [ex + s * 30, ey - 30], [ex + s * 30, ey + 28], [ex + s * 4, ey + 32]], "#2a2226", 5);
  }
};

// ---------------- the blackboard on its easel (people scale: 1000 units = 2.16 m), chalk drawn as strokes ----------------
const G: Record<string, P2[][]> = {
  "0": [[[0, 0], [1, 0], [1, 2], [0, 2], [0, 0]]], "1": [[[0.3, 0.4], [0.7, 0], [0.7, 2]]], "2": [[[0, 0.3], [0.4, 0], [1, 0.2], [1, 0.8], [0, 2], [1.1, 2]]],
  "3": [[[0, 0.1], [1, 0.1], [0.4, 0.9], [1, 1.3], [0.9, 1.9], [0, 1.9]]], "5": [[[1, 0], [0.1, 0], [0, 0.9], [0.8, 0.9], [1, 1.5], [0.7, 2], [0, 1.9]]],
  "+": [[[0, 1], [1, 1]], [[0.5, 0.5], [0.5, 1.5]]], "/": [[[1, 0], [0, 2]]], "=": [[[0, 0.75], [1, 0.75]], [[0, 1.25], [1, 1.25]]], "?": [[[0, 0.4], [0.4, 0], [1, 0.3], [0.5, 1.2], [0.5, 1.5]], [[0.5, 1.9], [0.5, 2]]],
  H: [[[0, 0], [0, 2]], [[1, 0], [1, 2]], [[0, 1], [1, 1]]], A: [[[0, 2], [0.5, 0], [1, 2]], [[0.2, 1.3], [0.8, 1.3]]], N: [[[0, 2], [0, 0], [1, 2], [1, 0]]],
  S: [[[1, 0.2], [0.5, 0], [0, 0.4], [1, 1.5], [0.5, 2], [0, 1.8]]],
};
const chalk = (p: Pen, txt: string, x: number, y: number, sz: number, gap = 0.6) => {
  let cx = x;
  for (const ch of txt) {
    if (ch === " ") { cx += sz * 0.8; continue; }
    for (const st of G[ch] ?? []) p.stroke(st.map(([a, b]) => [cx + a * sz, y + b * sz * 0.9] as P2), sz * 0.16, "#f2f0e6");
    cx += sz * (1 + gap);
  }
};
export type BoardKind = "blank" | "sum" | "frac" | "clock" | "name" | "q";
/** board 1.15 m x 0.85 m on an A-frame easel; tally = chalk taps counted beside the sum (0..5) */
export const blackboard = (p: Pen, kind: BoardKind = "blank", tally = 0) => {
  const x0 = 110, x1 = 490, y0 = 150, y1 = 470, wood = "#9a6a3e";
  p.line([[170, 450], [128, 975]], wood, 16); p.line([[430, 450], [472, 975]], wood, 16); p.line([[300, 140], [300, 960]], shade(wood, 0.75), 12);
  p.poly([[x0 - 12, y0 - 12], [x1 + 12, y0 - 12], [x1 + 12, y1 + 12], [x0 - 12, y1 + 12]], wood, 7);
  p.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], "#2f4a3e", 5);
  p.g.save(); p.g.globalAlpha = 0.18; p.stroke([[x0 + 20, y0 + 250], [x0 + 150, y0 + 270]], 24, "#c9d6cc"); p.stroke([[x1 - 120, y0 + 50], [x1 - 30, y0 + 34]], 18, "#c9d6cc"); p.g.restore();
  p.poly([[x0 - 6, y1 + 12], [x1 + 6, y1 + 12], [x1 + 6, y1 + 26], [x0 - 6, y1 + 26]], shade(wood, 0.85), 5); // chalk ledge
  p.poly([[400, y1 + 2], [436, y1], [436, y1 + 12], [400, y1 + 12]], "#f4f1e6", 3);
  if (kind === "sum") chalk(p, "3+2", 140, 190, 72, 0.45);
  if (kind === "q") chalk(p, "?", 250, 180, 110);
  if (kind === "frac") { chalk(p, "1", 170, 170, 54); p.stroke([[146, 296], [252, 296]], 10, "#f2f0e6"); chalk(p, "2", 170, 312, 54); chalk(p, "+", 272, 250, 48); chalk(p, "1", 380, 170, 50); p.stroke([[356, 290], [456, 290]], 9, "#f2f0e6"); chalk(p, "3", 380, 306, 50); }
  if (kind === "clock") {
    const cx = 300, cy = 300, R0 = 118;
    p.arc(cx, cy, R0, R0, 0, 360, 11, "#f2f0e6");
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; p.stroke([[cx + 92 * Math.cos(a), cy + 92 * Math.sin(a)], [cx + 106 * Math.cos(a), cy + 106 * Math.sin(a)]], 8, "#f2f0e6"); }
    p.stroke([[cx, cy], [cx, cy - 80]], 11, "#f2f0e6"); p.stroke([[cx, cy], [cx + 58, cy + 30]], 11, "#f2f0e6");
  }
  if (kind === "name") chalk(p, "HANS", 132, 210, 64, 0.32);
  for (let i = 0; i < Math.min(5, tally); i++) p.stroke([[150 + i * 30, 400], [150 + i * 30, 448]], 9, "#f2f0e6");
};

// ---------------- today: a sniffer dog, suitcases, a computer ----------------
const DOGC = "#b8854e", DOGC_SH = "#7a5634", DOG_DK = "#3a2c28";
/** dog side view facing right on its own scale (1000 units = 1.2 m, place with scale 0.555); sniff 0..1 lowers the nose */
export const dogSide = (p: Pen, o: { sniff?: number; tail?: number; light?: number; expr?: "focus" | "proud" } = {}) => {
  const { sniff = 0, tail = 0, light = DEF_LIGHT, expr = "focus" } = o;
  const thick = thickAngle(light), Y = (m: number) => 975 - m * 480, X = (m: number) => 300 + m * 480;
  const far = mul(DOGC, [0.72, 0.7, 0.74]);
  const tb: P2 = [X(-0.36), Y(0.52)];
  p.line(qcurve(tb, [tb[0] - 50, tb[1] - 20 - 30 * tail], [tb[0] - 80, tb[1] - 80 * tail + 10], 10), DOGC_SH, 30);
  for (const [x, near] of [[-0.24, false], [0.22, false], [-0.3, true], [0.28, true]] as const) {
    const col = near ? DOGC : far;
    p.line([[X(x), Y(0.42)], [X(x - (x < 0 ? 0.06 : 0)), Y(0.2)], [X(x + 0.02), Y(0.02)]], col, 22);
    p.ell(X(x + 0.04), Y(0.02) - 3, 16, 8, DOG_DK, 3);
  }
  const body = ell(X(0), Y(0.46), 0.42 * 480, 0.15 * 480, 0, 360, -3);
  p.shadedFill(body, DOGC, DOGC_SH, light, 0.42 * 480, 0.42);
  p.clip(body, () => p.ell(X(-0.05), Y(0.6), 0.32 * 480, 0.1 * 480, DOG_DK, 0)); // dark saddle
  p.inkRing(body, 10, thick);
  const hy = Y(0.72 - 0.42 * sniff), hx = X(0.46 + 0.08 * sniff);
  p.line([[X(0.3), Y(0.5)], [hx - 14, hy + 14]], DOGC, 60);
  p.g.save(); p.g.translate(hx, hy); p.g.scale(0.85, 0.85); p.g.translate(-hx, -hy);
  for (const dx of [-36, -6]) p.poly([[hx + dx - 18, hy - 30], [hx + dx - 4, hy - 112], [hx + dx + 22, hy - 32]], dx < -20 ? DOGC_SH : DOGC, 6);
  const head: P2[] = [[hx - 60, hy - 30], [hx + 20, hy - 46], [hx + 70, hy - 10], [hx + 128, hy + 6], [hx + 130, hy + 40], [hx + 60, hy + 52], [hx - 40, hy + 50]];
  p.shadedFill(head, DOGC, DOGC_SH, light, 70, 0.4); p.poly(head, null, 8);
  p.ell(hx + 124, hy + 16, 16, 13, DOG_DK, 4);
  p.stroke([[hx + 70, hy + 40], [hx + 112, hy + 36]], 4);
  horseEye(p, hx + 34, hy - 6, 13, expr === "proud" ? "proud" : "focus", 0, 0.5, DOGC);
  p.band([[hx - 40, hy + 30], [hx - 20, hy - 30]], "#2f5fa8", 12, 2.5); // collar
  p.g.restore();
};
/** three suitcases in a row (people scale), the middle one dark */
export const suitcases = (p: Pen) => {
  const cs = [["#c8453a", 60, 250], ["#3f4f6a", 230, 230], ["#d9a441", 400, 200]] as const;
  for (const [c, x, w] of cs) {
    const y0 = 975 - (c === "#3f4f6a" ? 300 : 260);
    p.poly([[x, y0], [x + w * 0.62, y0], [x + w * 0.62, 975], [x, 975]], c, 7);
    p.band([[x + w * 0.2, y0], [x + w * 0.2, y0 - 26], [x + w * 0.42, y0 - 26], [x + w * 0.42, y0]], "#2f2a30", 8, 2);
    p.stroke([[x + 14, y0 + 40], [x + w * 0.62 - 14, y0 + 40]], 4, shade(c, 0.7));
  }
};
/** a desk computer with a camera eye on its screen; look -1..1 follows the person */
export const computer = (p: Pen, o: { look?: number; blink?: number } = {}) => {
  const { look = 0, blink = 0 } = o;
  for (const x of [84, 500]) p.poly([[x, 650], [x + 18, 650], [x + 18, 975], [x, 975]], "#7a5232", 5);
  p.poly([[60, 620], [540, 620], [540, 655], [60, 655]], "#9a6a3e", 6); // desk top
  p.poly([[250, 560], [350, 560], [370, 620], [230, 620]], "#c9ccd2", 6);
  p.poly([[110, 240], [490, 240], [490, 560], [110, 560]], "#e9ecef", 8);
  p.poly([[134, 264], [466, 264], [466, 536], [134, 536]], "#1f2a44", 5);
  if (blink > 0.5) p.stroke([[220, 400], [380, 400]], 12, "#7fd6ff");
  else { p.ell(300, 400, 92, 70, "#d9f3ff", 6); p.dot(300 + look * 40, 404, 34, "#2f6fb5"); p.dot(300 + look * 40, 404, 16, INK); p.dot(288 + look * 40, 392, 6, "#ffffff"); }
  p.dot(300, 252, 6, "#3a3036");
};
