// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import { Pen, bodyFront, bodySide, fxBurst, fxPuff, fxShadow, fxContact, fxStars, Outfit, Expr, FrontOpts, SideOpts, OSTEN, PFUNGST, expert, berliner, SCIENTIST, HANDLER, FRIEND_A, FRIEND_B } from "./toon";
import { horseSide, horseFront, blackboard, dogSide, suitcases, computer, HorseExpr, BoardKind, HORSE_SCALE, HORSE_X0 } from "./creatures";
import {
  FPS, SHOTS, V3, smooth, clamp01, at, HANS, BOARD, OSTEN0, ROW_Z, expertPos, PFUNGST0, ASKER, PARK, SCI1, SCI2, DOG, BAGS, HANDLER0, DESK, USER,
  tapLift, tapsBefore, TAPS, expertWalkX, pfungstX, crowdZ, PROF7, OSTEN11, PF11,
} from "./story";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1200, 2000, 2.0] : d < 6.5 ? [720, 1200, 1.2] : d < 16 ? [360, 600, 0.6] : [180, 300, 0.3]; // sized for the 1080x1920 final

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const SWAPS: Record<number, number[]> = {};
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

export type Stage = { places: Place[]; fx: FxPlace[] };

/** walk phase from distance travelled: one cycle per stride (walk 1.0 m, run 3.9 m) */
const ph = (dist: number, run = false, i = 0) => (((dist / (run ? 3.9 : 1.0) + hh(i, 2)) % 1) + 1) % 1;

/** a person (front or side) standing / walking / sitting */
type PSpec = { o: Outfit; okey: string; expr?: Expr; mode?: "stand" | "march" | "stroll" | "sit"; dir?: [number, number]; phase?: number; y?: number; side?: boolean; prop?: FrontOpts["prop"]; tilt?: number; scale?: number; blob?: boolean;
  wave?: number; headTilt?: number; look?: number; push?: { pose: number; hand: [number, number] } };
const who = (i: number, o: Outfit, okey: string): Who => ({ i, o, okey });
const human = (cam: CamInfo, out: Stage, i: number, t: number, x: number, z: number, s: PSpec) => {
  const [dx, dz] = s.dir ?? [0, 1], y = s.y ?? 0, mode = s.mode ?? "stand";
  const v = viewOf(cam, x, z, dx, dz);
  const view = s.side === undefined ? (mode === "sit" ? { side: false, mirror: false } : v) : { side: s.side, mirror: v.mirror };
  const blink = lidAt(t, i);
  const fo: FrontOpts = { phase: s.phase ?? 0, expr: s.expr ?? "neutral", mode, blink, prop: s.prop ?? null, tilt: s.tilt ?? 0, headTilt: s.headTilt ?? 0, look: s.look ?? 0,
    ...(s.wave !== undefined ? { wave: q(s.wave, 8) } : {}) };
  const so: SideOpts = s.push ? { expr: s.expr ?? "neutral", mode: "push", pose: q(s.push.pose, 12), hand: [q(s.push.hand[0], 0.5), q(s.push.hand[1], 0.5)], blink }
    : { phase: s.phase ?? 0, expr: s.expr ?? "neutral", mode: mode === "march" || mode === "stroll" ? "march" : "stand", blink, stride: mode === "stroll" ? 0.6 * v.fs : v.fs };
  out.places.push(person(cam, who(i, s.o, s.okey), x, y, z, view, fo, so, s.scale ?? 1));
  if (s.blob !== false && mode !== "sit") blob(out, x, y, z, s.scale ?? 1);
};
const puff = (out: Stage, x: number, z: number, u: number, s = 1) => {
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `puff${q(u, 20)}`, cw: 400, ch: 400, draw: (p) => fxPuff(p, q(u, 20)), x, y: 0.35 * s, z, w: 1.4 * s, h: 1.4 * s, soft: true });
};
const flash = (out: Stage, x: number, y: number, z: number, u: number, s = 0.5) => {
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `burst${q(u, 20)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 20)), x, y, z, w: s, h: s });
};


// ---------------- episode 2 staging ----------------
/** Hans: side view (facing +x unless dir says otherwise) or front; card at twice the people's scale */
type HSpec = { expr?: HorseExpr; tap?: number; look?: number; blinders?: boolean; front?: boolean; dir?: [number, number]; headDown?: number; lidOff?: boolean };
const horse = (cam: CamInfo, out: Stage, t: number, x: number, z: number, o: HSpec = {}) => {
  const [dx, dz] = o.dir ?? [1, 0], view = viewOf(cam, x, z, dx, dz), front = o.front ?? false;
  const d = cam.pos.distanceTo(tmp.set(x, 1.6, z)) / HORSE_SCALE, [w, h, k] = tier(d);
  const mirror = !front && view.mirror, light = light2D(cam, mirror);
  const spec = { expr: o.expr ?? "deadpan", tap: q(o.tap ?? 0, 10), look: q(o.look ?? 0, 4), blinders: !!o.blinders, lid: o.lidOff ? 0 : lidAt(t, 77), headDown: q(o.headDown ?? 0, 10), light };
  const cx = front ? x : x + HORSE_X0 * (dx >= 0 ? 1 : -1);
  out.places.push({ key: `${front ? "HF" : "HS"}|${fkey(spec)}`, x: cx, y: 0, z, scale: HORSE_SCALE, mirror, size: [w, h, k], draw: (p) => (front ? horseFront(p, spec) : horseSide(p, spec)) });
  if (front) blob(out, x, 0, z, 1.6); else { blob(out, x - 0.6, 0, z + 0.02, 1.5); blob(out, x + 0.45, 0, z - 0.02, 1.5); }
};
const board = (cam: CamInfo, out: Stage, kind: BoardKind, tally = 0) => {
  const d = cam.pos.distanceTo(tmp.set(BOARD[0], 1.3, BOARD[2])), [w, h, k] = tier(d);
  out.places.push({ key: `BOARD|${kind}|${tally}`, x: BOARD[0], y: 0, z: BOARD[2], size: [w, h, k], draw: (p) => blackboard(p, kind, tally) });
  blob(out, BOARD[0], 0, BOARD[2], 1.6, 0.8);
};
const card = (cam: CamInfo, out: Stage, key: string, x: number, z: number, draw: (p: Pen) => void, scale = 1, mirror = false) => {
  const d = cam.pos.distanceTo(tmp.set(x, 1.0, z)) / scale, [w, h, k] = tier(d);
  out.places.push({ key, x, y: 0, z, scale, mirror, size: [w, h, k], draw });
};
/** the thirteen experts; expr per index */
const row = (cam: CamInfo, out: Stage, t: number, ex: (i: number) => Expr, prop?: (i: number) => FrontOpts["prop"]) => {
  for (let i = 0; i < 13; i++) { const [x, , z] = expertPos(i); human(cam, out, 200 + i, t, x, z, { o: expert(i), okey: `x${i}`, expr: ex(i), side: false, prop: prop?.(i) ?? null }); }
};
/** the crowd's places in the yard (behind the row and along the sides) */
const CROWD_N = 26;
const crowdSpot = (i: number): [number, number] => {
  if (i < 14) return [-2.6 + (i % 7) * 0.95 + Math.floor(i / 7) * 0.45, -8.0 - Math.floor(i / 7) * 0.9 - (i % 2) * 0.25];
  const k = i - 14, s = k % 2 ? 1 : -1;
  return [0.6 + s * (3.4 + (k % 3) * 0.7), -2.8 - Math.floor(k / 2) * 1.0];
};
const crowd = (cam: CamInfo, out: Stage, t: number, exprOf: (i: number) => Expr = (i) => (i % 3 ? "smile" : "grin"), arriving = false) => {
  for (let i = 0; i < CROWD_N; i++) {
    const [xs, zs] = crowdSpot(i);
    if (!arriving) { human(cam, out, 300 + i, t, xs, zs, { o: berliner(i), okey: `c${i}`, expr: exprOf(i), side: false }); continue; }
    const z = Math.min(zs, crowdZ(i, t)), walking = z < zs - 0.01;
    const u = clamp01((z + 13) / 5), x = 0.3 + (xs - 0.3) * (0.35 + 0.65 * u); // through the gate, then spread out
    human(cam, out, 300 + i, t, x, z, walking ? { o: berliner(i), okey: `c${i}`, expr: "grin", mode: "march", phase: ((z / 0.8) % 1 + 1) % 1, dir: [0, 1] } : { o: berliner(i), okey: `c${i}`, expr: exprOf(i), side: false });
  }
};
const tapPuff = (out: Stage, t: number, x: number, z: number, t0: number, t1: number) => {
  for (const ts of TAPS) if (ts >= t0 && ts <= t1) puff(out, x, z, (t - ts) / 0.5, 0.45);
};
const stars = (out: Stage, x: number, y: number, z: number, u: number, s = 0.9) => {
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `stars${q(u, 20)}`, cw: 420, ch: 240, draw: (p) => fxStars(p, q(u, 20)), x, y, z, w: s, h: s * 0.57 });
};

export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], f = Math.round(t * FPS);
  LNAME = s.light;
  findSun(cam, SUN);
  const [hx, , hz] = HANS, hoof = hx + 0.5;
  switch (id) {
    case 1: {
      if (f < 140) {
        horse(cam, out, t, hx, hz, { expr: "focus", tap: tapLift(t), look: 0.5 });
        board(cam, out, "sum", tapsBefore(t, 0, 3));
        tapPuff(out, t, hoof, hz + 0.1, 0, 3);
        row(cam, out, t, (i) => (t < 4.0 ? (i % 3 ? "stern" : "neutral") : i % 2 ? "shock" : "grin"), (i) => (i === 2 || i === 9 ? "clipboard" : null));
        crowd(cam, out, t, () => "smile");
      } else horse(cam, out, t, hx, hz, { front: true, expr: "proud" });
      break;
    }
    case 2: {
      horse(cam, out, t, hx, hz, { expr: "focus", look: 0.6 });
      board(cam, out, "sum");
      human(cam, out, 10, t, OSTEN0[0], OSTEN0[2], { o: OSTEN, okey: "osten", expr: f < 268 ? "neutral" : "stern", side: false, prop: "pointer" });
      break;
    }
    case 3: case 4: {
      const kind: BoardKind = id === 3 ? "sum" : t < 15.1 ? "sum" : t < 16.1 ? "frac" : t < 16.76 ? "clock" : "name";
      horse(cam, out, t, hx, hz, { expr: id === 3 && f >= 414 ? "proud" : "focus", tap: tapLift(t), look: 0.6 });
      board(cam, out, kind, id === 3 ? tapsBefore(t, 12, 14) : kind === "sum" ? 5 : 0);
      tapPuff(out, t, hoof, hz + 0.1, 12, 18);
      human(cam, out, 10, t, OSTEN0[0], OSTEN0[2], { o: OSTEN, okey: "osten", expr: id === 3 && f >= 414 ? "smile" : "stern", side: false, prop: "pointer" });
      break;
    }
    case 5: {
      horse(cam, out, t, hx, hz, { expr: "proud", look: 0.3 });
      board(cam, out, "name");
      crowd(cam, out, t, (i) => (i % 3 ? "smile" : "grin"), true);
      const coin = t > 20.0;
      human(cam, out, 10, t, OSTEN0[0], OSTEN0[2], { o: OSTEN, okey: "osten", expr: t < 20.9 ? "stern" : "smile", side: false, ...(coin ? { wave: 0.5 + 0.5 * Math.sin((t - 20) * 14) } : { prop: "pointer" as const }) });
      if (f >= 598) human(cam, out, 11, t, 3.95, -1.75, { o: berliner(0), okey: "c0", expr: t < 20.9 ? "smile" : "nervous", side: false, prop: "coin" });
      break;
    }
    case 6: {
      horse(cam, out, t, hx, hz, { expr: "deadpan", look: -0.5 });
      board(cam, out, "name");
      crowd(cam, out, t, () => "smile");
      for (let i = 0; i < 13; i++) {
        const [xe, , ze] = expertPos(i), x = expertWalkX(i, t), walking = x < xe - 0.01;
        const named = ([[1, 23.6], [3, 23.9], [4, 24.76], [5, 25.56], [6, 26.48]] as [number, number][]).find(([k]) => k === i);
        const ex: Expr = named && t >= named[1] ? "grin" : "stern";
        human(cam, out, 200 + i, t, x, ze, walking ? { o: expert(i), okey: `x${i}`, expr: "stern", mode: "march", phase: ((x / 0.8) % 1 + 1) % 1, dir: [1, 0] }
          : { o: expert(i), okey: `x${i}`, expr: ex, side: false, prop: i === 2 ? "clipboard" : null });
      }
      break;
    }
    case 7: {
      for (let i = 0; i < 13; i++) {
        const [x, , z] = i === 9 ? PROF7 : expertPos(i);
        human(cam, out, 200 + i, t, x, z, { o: expert(i), okey: `x${i}`, expr: i === 9 ? (t < 29.7 ? "neutral" : "smile_closed") : t < 29.7 ? "stern" : "grin", side: false,
          prop: i === 9 ? "paper" : i === 2 || i === 11 ? "clipboard" : null });
      }
      crowd(cam, out, t, () => "smile");
      break;
    }
    case 8: {
      horse(cam, out, t, hx, hz, { expr: "deadpan", look: 0.6 });
      board(cam, out, "q");
      row(cam, out, t, (i) => (i % 2 ? "neutral" : "stern"));
      crowd(cam, out, t, () => "neutral");
      const x = pfungstX(t), walking = x > PFUNGST0[0] + 0.01;
      human(cam, out, 12, t, x, PFUNGST0[2], walking ? { o: PFUNGST, okey: "pf", expr: "neutral", mode: "march", phase: ((x / 0.8) % 1 + 1) % 1, dir: [-1, 0] }
        : { o: PFUNGST, okey: "pf", expr: t < 34.0 ? "neutral" : "nervous", side: false, prop: "notebook", headTilt: t < 34 ? 0 : -6 });
      break;
    }
    case 9: {
      const blind = f >= 1216;
      horse(cam, out, t, hx, hz, { expr: blind ? (t < 41.4 ? "focus" : "dazed") : t < 38.3 ? "focus" : "proud", tap: tapLift(t), look: 0.6, blinders: blind });
      board(cam, out, "sum", blind ? 0 : tapsBefore(t, 36, 39));
      tapPuff(out, t, hoof, hz + 0.1, 36, 43);
      human(cam, out, 13, t, ASKER[0], ASKER[2], { o: expert(0), okey: "x0", expr: blind ? (t < 41.4 ? "nervous" : "shock") : t < 38.25 ? "stern" : "grin", side: false });
      if (!blind) row(cam, out, t, () => (t < 38.3 ? "neutral" : "grin"));
      else row(cam, out, t, (i) => (i % 2 ? "nervous" : "shock"));
      break;
    }
    case 10: {
      if (f < 1347 || f >= 1481) {
        const stopped = f >= 1481;
        horse(cam, out, t, hx, hz, { expr: stopped ? "proud" : "focus", look: 1, tap: stopped ? 0 : tapLift(t) });
        board(cam, out, "sum", stopped ? 5 : 0);
        human(cam, out, 13, t, ASKER[0], ASKER[2], { o: expert(0), okey: "x0", expr: stopped ? "relief" : "nervous", side: false });
        if (stopped) row(cam, out, t, (i) => (i % 2 ? "relief" : "smile"));
      } else {
        const tense = smooth((t - 44.9) / 3.0), relax = t >= 48.62;
        human(cam, out, 13, t, ASKER[0], ASKER[2], { o: expert(0), okey: "x0", expr: relax ? "relief" : t < 46.5 ? "neutral" : "nervous", side: false,
          tilt: relax ? 0 : -5 * tense, headTilt: relax ? 0 : -4 * tense });
        board(cam, out, "sum");
        row(cam, out, t, () => (relax ? "relief" : "nervous"));
      }
      break;
    }
    case 11: {
      horse(cam, out, t, hx, hz, { expr: "deadpan", look: 0.4 });
      board(cam, out, "sum", 5);
      const late = f >= 1561;
      human(cam, out, 10, t, OSTEN11[0], OSTEN11[2], { o: OSTEN, okey: "osten", expr: late ? "stern" : "smile", side: false, prop: late ? "crossed" : null, headTilt: late ? 8 : 0 });
      human(cam, out, 12, t, PF11[0], PF11[2], { o: PFUNGST, okey: "pf", expr: late ? "nervous" : "smile", side: false, prop: "notebook" });
      row(cam, out, t, () => "neutral");
      break;
    }
    case 12: {
      const [px, , pz] = PARK, lit = t >= 57.32;
      human(cam, out, 20, t, px + 0.5, pz - 0.35, { o: FRIEND_B, okey: "fb", expr: lit ? "laugh" : "neutral", side: false, prop: "cards" });
      human(cam, out, 21, t, px - 0.45, pz + 0.1, { o: FRIEND_A, okey: "fa", expr: lit ? "grin" : "smile", side: false, prop: t > 55.6 ? "point" : null });
      if (lit) stars(out, px + 0.5, 2.05, pz - 0.3, (t - 57.32) / 1.2, 0.7);
      break;
    }
    case 13: {
      human(cam, out, 30, t, SCI1[0], SCI1[2], { o: SCIENTIST, okey: "sci", expr: "neutral", side: false, prop: "clipboard" });
      human(cam, out, 31, t, SCI2[0], SCI2[2], { o: { ...SCIENTIST, skin: "#f5c9a0", hair: "#c9a050", glasses: false }, okey: "sci2", expr: "neutral", side: false, prop: "clipboard" });
      break;
    }
    case 14: {
      if (f < 1944) {
        const sn = q(0.5 + 0.5 * Math.sin(t * 7), 6), tl = q(Math.sin(t * 11), 4);
        card(cam, out, `DOG|${sn}|${tl}`, DOG[0], DOG[2], (p) => dogSide(p, { sniff: 0.55 + 0.45 * sn, tail: 0.5 + 0.5 * tl }), 0.964);
        blob(out, DOG[0], 0, DOG[2], 1.2);
        card(cam, out, "BAGS", BAGS[0], BAGS[2], suitcases);
        human(cam, out, 32, t, HANDLER0[0], HANDLER0[2], { o: HANDLER, okey: "hd", expr: t < 63.3 ? "neutral" : "nervous", side: false });
      } else {
        const look = q(smooth((t - 64.9) / 0.4), 4);
        card(cam, out, `PC|${look}`, DESK[0], DESK[2], (p) => computer(p, { look }));
        human(cam, out, 33, t, USER[0], USER[2], { o: FRIEND_A, okey: "fa", expr: t < 65.3 ? "neutral" : "smile", side: false });
      }
      break;
    }
    case 15: {
      if (f < 2029) {
        horse(cam, out, t, hx, hz, { expr: "focus", tap: t < 67.0 ? 0.55 + 0.1 * Math.sin(t * 9) : 0, look: 0.6 });
        board(cam, out, "sum", 0);
      } else {
        horse(cam, out, t, hx, hz, { front: true, expr: t >= 69.2 ? "wink" : "proud" });
        row(cam, out, t, (i) => (i % 3 === 0 ? "shock" : i % 3 === 1 ? "nervous" : "pained"));
        crowd(cam, out, t, () => "shock");
        board(cam, out, "sum", 5);
      }
      break;
    }
  }
  void at; void bodySide; void bodyFront; void fxShadow; void fxContact; void LIGHTS; void hexOf; void TAIL; void fxBurst; void flash; void ROW_Z; void vOf; void ph; void SKIN_UNUSED;
  return out;
};
const SKIN_UNUSED = 0;
export { FPS };
