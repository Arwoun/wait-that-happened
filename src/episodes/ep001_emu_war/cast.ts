// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import { Pen, bodyFront, bodySide, digger, farmer, MAJOR, fxBurst, fxPuff, fxShadow, fxContact, Outfit, Expr, FrontOpts, SideOpts } from "./toon";
import { emuSide, emuFront, lewisGun, pigeon, kangaroo, crateCard, casing, EmuPose, EmuExpr } from "./creatures";
import {
  FPS, SHOTS, V3, smooth, clamp01, at, HOOK, S1_EMU, FARMER3, SOLDIERS4, CRATE_GUNS, AMMO, GUN5, DAM, DAM_R, HIDE6, LEADER8, SOLDIER10, TRUCK10Z,
  MAJOR11, TANK11, PARK, WALL12, EMU13, CAMP, MAILBOX, MONUMENT, FENCE_Z, truckX, CHASE_T0, CHASE2_T0,
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
const DIG = [0, 1, 2, 3].map((v) => digger(v));
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

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

// ---------------- episode 1 staging ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };

/** one emu: side view while it walks across the lens, front view when it comes at (or stands facing) the camera */
type EmuSpec = { pose?: EmuPose; phase?: number; expr?: EmuExpr; dir?: [number, number]; front?: boolean; look?: number; y?: number; scale?: number; blob?: boolean; lidOff?: boolean };
const emu = (cam: CamInfo, out: Stage, i: number, t: number, x: number, z: number, o: EmuSpec = {}) => {
  const [dx, dz] = o.dir ?? [0, 1], y = o.y ?? 0, sc = o.scale ?? 1;
  const view = viewOf(cam, x, z, dx, dz);
  const front = o.front ?? !view.side;
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / sc;
  const [w, h, k] = tier(d);
  const mirror = !front && view.mirror, light = light2D(cam, mirror);
  const lid = o.lidOff ? 0 : lidAt(t, i + 100);
  const spec = { pose: o.pose ?? "stand", phase: q(o.phase ?? 0, 8), expr: o.expr ?? "deadpan", lid, look: o.look ?? 0, light, seed: (i % 5) + 1 };
  out.places.push({
    key: `${front ? "EF" : "ES"}|${fkey(spec)}`, x, y, z, scale: sc, mirror, size: [w, h, k],
    draw: (p) => (front ? emuFront(p, spec) : emuSide(p, spec)),
  });
  if (o.blob !== false && y > -0.05) blob(out, x, y, z, 1.1 * sc);
};
/** walk phase from distance travelled: one cycle per stride (walk 1.0 m, run 3.9 m) */
const ph = (dist: number, run = false, i = 0) => (((dist / (run ? 3.9 : 1.0) + hh(i, 2)) % 1) + 1) % 1;

/** a person (front or side) standing / walking / sitting */
type PSpec = { o: Outfit; okey: string; expr?: Expr; mode?: "stand" | "march" | "stroll" | "sit"; dir?: [number, number]; phase?: number; y?: number; side?: boolean; prop?: FrontOpts["prop"]; tilt?: number; scale?: number; blob?: boolean };
const who = (i: number, o: Outfit, okey: string): Who => ({ i, o, okey });
const human = (cam: CamInfo, out: Stage, i: number, t: number, x: number, z: number, s: PSpec) => {
  const [dx, dz] = s.dir ?? [0, 1], y = s.y ?? 0, mode = s.mode ?? "stand";
  const v = viewOf(cam, x, z, dx, dz);
  const view = s.side === undefined ? (mode === "sit" ? { side: false, mirror: false } : v) : { side: s.side, mirror: v.mirror };
  const blink = lidAt(t, i);
  const fo: FrontOpts = { phase: s.phase ?? 0, expr: s.expr ?? "neutral", mode, blink, prop: s.prop ?? null, tilt: s.tilt ?? 0 };
  const so: SideOpts = { phase: s.phase ?? 0, expr: s.expr ?? "neutral", mode: mode === "march" || mode === "stroll" ? "march" : "stand", blink, stride: mode === "stroll" ? 0.6 * v.fs : v.fs };
  out.places.push(person(cam, who(i, s.o, s.okey), x, y, z, view, fo, so, s.scale ?? 1));
  if (s.blob !== false && mode !== "sit") blob(out, x, y, z, s.scale ?? 1);
};
/** the Lewis gun as a side-on card (muzzle toward dir); fire 0..1 flash, jam 0..1 smoke */
const gun = (cam: CamInfo, out: Stage, x: number, y: number, z: number, dir: [number, number], fire = 0, jam = 0, sc = 1) => {
  const v = viewOf(cam, x, z, dir[0], dir[1]);
  const d = cam.pos.distanceTo(tmp.set(x, y + 0.6, z));
  const [w, h, k] = tier(d);
  out.places.push({ key: `GUN|${q(fire, 6)}|${q(jam, 10)}|${v.mirror}`, x, y, z, scale: sc, mirror: v.mirror, size: [w, h, k], draw: (p) => lewisGun(p, { fire: q(fire, 6), jam: q(jam, 10) }) });
};
const crate = (cam: CamInfo, out: Stage, x: number, y: number, z: number) => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 0.3, z));
  const [w, h, k] = tier(d);
  out.places.push({ key: "CRATE", x, y, z, size: [w, h, k], draw: crateCard });
  blob(out, x, y, z, 1.2);
};
const puff = (out: Stage, x: number, z: number, u: number, s = 1) => {
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `puff${q(u, 20)}`, cw: 400, ch: 400, draw: (p) => fxPuff(p, q(u, 20)), x, y: 0.35 * s, z, w: 1.4 * s, h: 1.4 * s, soft: true });
};
const flash = (out: Stage, x: number, y: number, z: number, u: number, s = 0.5) => {
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `burst${q(u, 20)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 20)), x, y, z, w: s, h: s });
};
/** firing bursts: on for 2 frames of every 3 inside [t0, t1] */
const firing = (t: number, t0: number, t1: number) => (t >= t0 && t < t1 && Math.floor(t * FPS) % 3 !== 2 ? 0.4 + 0.6 * hh(Math.floor(t * FPS), 5) : 0);
/** a point on the truck (local metres) in world space */
const onTruck = (truck: THREE.Object3D, lx: number, ly: number, lz: number) => { truck.updateMatrixWorld(true); return tmp.set(lx, ly, lz).applyMatrix4(truck.matrixWorld).clone(); };

const EMU_N = 220;
/** shot 2: the stream from the outback, funnelled through the fence gap, spreading into the wheat */
const stream = (cam: CamInfo, out: Stage, t: number) => {
  for (let i = 0; i < EMU_N; i++) {
    const z0 = -230 + (i / EMU_N) * 200 + hh(i, 1) * 3, z = z0 + 1.4 * (t - 4.3);
    if (z > -28) continue;
    const funnel = z < FENCE_Z ? 1 - 0.85 * smooth((z + 125) / 60) : 0.15 + 0.85 * smooth((z - FENCE_Z) / 22);
    const x = (hh(i, 3) - 0.5) * 70 * funnel + Math.sin(t * 0.7 + i) * 0.3;
    const peck = z > -45 && hh(i, 4) < 0.35;
    emu(cam, out, i, t, x, z, { pose: peck ? "peck" : "walk", phase: ph(z, false, i), dir: [0, 1] });
  }
};
/** grazers in an area (pecking / slow walking), for backgrounds */
const grazers = (cam: CamInfo, out: Stage, t: number, n: number, cx: number, cz: number, rx: number, rz: number, seed = 0, y = 0) => {
  for (let i = 0; i < n; i++) {
    const k = i + seed * 37, x = cx + (hh(k, 6) - 0.5) * 2 * rx, z = cz + (hh(k, 7) - 0.5) * 2 * rz;
    const peck = ((t * 0.35 + hh(k, 8)) % 1) < 0.55;
    const dir: [number, number] = hh(k, 9) < 0.5 ? [1, 0.2] : [-1, 0.3];
    const walkX = peck ? 0 : 0.3 * ((t * 0.35 + hh(k, 8)) % 1);
    emu(cam, out, k, t, x + dir[0] * walkX, z, { pose: peck ? "peck" : "walk", phase: ph(walkX * 3, false, k), dir, y });
  }
};

export const stage = (id: number, t: number, cam: CamInfo, truck: THREE.Object3D): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], f = Math.round(t * FPS);
  LNAME = s.light;
  findSun(cam, SUN);
  switch (id) {
    case 1: { // one gunner behind a gun on a crate, one emu. "And lost."
      crate(cam, out, HOOK[0], 0, HOOK[2] - 0.9);
      gun(cam, out, HOOK[0], 0.48, HOOK[2] - 0.9, [0, -1], firing(t, 2.2, 2.75));
      human(cam, out, 0, t, HOOK[0] - 0.5, HOOK[2] - 0.2, { o: DIG[0], okey: "d0", expr: t < 2.9 ? "stern" : "pained", dir: [0, -1] });
      emu(cam, out, 1, t, S1_EMU[0], S1_EMU[2], { pose: "stand", front: true, expr: t < 2.85 ? "deadpan" : "smug" });
      grazers(cam, out, t, 6, HOOK[0] - 6, HOOK[2] - 40, 25, 10, 1);
      break;
    }
    case 2: stream(cam, out, t); break;
    case 3: {
      human(cam, out, 2, t, FARMER3[0], FARMER3[2], { o: farmer(0), okey: "f0", expr: t < 12.6 ? "stern" : "pained", dir: [0, 1], side: false });
      grazers(cam, out, t, 18, FARMER3[0] - 2, FARMER3[2] - 12, 12, 7, 2);
      break;
    }
    case 4: {
      SOLDIERS4.forEach(([x, , z], i) => human(cam, out, 10 + i, t, x, z, { o: DIG[(i + 1) % 4], okey: `d${(i + 1) % 4}`, expr: f < 500 ? "stern" : "shock", dir: [0, -1], side: false }));
      gun(cam, out, CRATE_GUNS[0] - 0.32, 0.62, CRATE_GUNS[2], [1, 0], 0, 0, 0.8);
      gun(cam, out, CRATE_GUNS[0] + 0.32, 0.62, CRATE_GUNS[2] + 0.05, [1, 0], 0, 0, 0.8);
      if (f >= 500) human(cam, out, 13, t, AMMO[0] - 2.2, AMMO[2] + 0.6, { o: DIG[3], okey: "d3", expr: "shock", dir: [0, -1], side: false });
      break;
    }
    case 5: { // day one: the gunner fires, the dust falls short, fifty emus jog off
      crate(cam, out, GUN5[0], 0, GUN5[2] - 0.9);
      const fire = firing(t, 19.9, 22.6);
      gun(cam, out, GUN5[0], 0.48, GUN5[2] - 0.9, [0, -1], fire);
      human(cam, out, 20, t, GUN5[0] - 0.5, GUN5[2] - 0.2, { o: DIG[1], okey: "d1", expr: t < 21.0 ? "stern" : "nervous", dir: [0, -1] });
      for (let i = 0; i < 50; i++) {
        const jog = Math.max(0, t - 21.5), z = GUN5[2] - 60 - hh(i, 1) * 12 - 3.2 * jog, x = GUN5[0] + (hh(i, 2) - 0.5) * 34;
        emu(cam, out, 30 + i, t, x, z, jog > 0 ? { pose: "run", phase: ph(3.2 * jog, true, i), dir: [0, -1] } : { pose: hh(i, 3) < 0.5 ? "peck" : "stand", dir: [hh(i, 4) - 0.5, 1] });
      }
      for (let k = 0; k < 14; k++) { const t0 = 19.95 + k * 0.19; puff(out, GUN5[0] + (hh(k, 9) - 0.5) * 22, GUN5[2] - 44 - hh(k, 10) * 8, (t - t0) / 0.9, 1.6); }
      break;
    }
    case 6: { // the dam: emus walk in and drink; three hidden gunners; the jam
      for (let i = 0; i < 150; i++) {
        const a = Math.PI * (1.15 + 0.7 * hh(i, 1)), rEnd = DAM_R + 0.6 + hh(i, 2) * 4;
        const arrive = 24.2 + hh(i, 3) * 2.5, u = clamp01((t - arrive + 6) / 6);
        const r = rEnd + (1 - u) * 45, x = DAM[0] + Math.cos(a) * r, z = DAM[2] + Math.sin(a) * r;
        const drinking = u >= 1 && hh(i, 4) < 0.6;
        emu(cam, out, 200 + i, t, x, z, drinking ? { pose: "drink", dir: [-Math.cos(a), -Math.sin(a)] } : { pose: u < 1 ? "walk" : "stand", phase: ph(r, false, i), dir: [-Math.cos(a), -Math.sin(a)] });
      }
      const jam = t >= 27.62 ? clamp01((t - 27.62) / 1.2) : 0;
      gun(cam, out, HIDE6[0], 1.42, HIDE6[2] - 2.9, [0, -1], firing(t, 27.2, 27.62), jam);
      [-1.5, 0, 1.5].forEach((dx, i) => human(cam, out, 40 + i, t, HIDE6[0] + dx, HIDE6[2] + (i === 1 ? -0.2 : 0), { o: DIG[i], okey: `d${i}`, expr: t < 27.55 ? (i === 1 ? "stern" : "grin") : "shock", dir: [0, -1], side: false }));
      break;
    }
    case 7: {
      if (t < 30.85) { // parked: hammering the mount; the gunner on the tray
        const strike = (tt: number) => Math.max(0, 1 - Math.abs(t - tt) * 6);
        const hammer = Math.max(strike(29.24), strike(30.22));
        human(cam, out, 50, t, 99.3, 1.7, { o: DIG[2], okey: "d2", expr: "stern", dir: [0, 1], side: false, prop: ["hammer", q(hammer, 6)] });
        const g0 = onTruck(truck, -1.6, 0.92, 0);
        gun(cam, out, g0.x, g0.y + 0.1, g0.z, [1, 0]);
        human(cam, out, 51, t, g0.x - 0.8, g0.z, { o: DIG[1], okey: "d1", y: g0.y, expr: "grin", side: false, blob: false });
      } else { // the chase
        const x = truckX(t), g0 = onTruck(truck, -1.6, 0.92, 0), fire = firing(t, 31.2, 35.4);
        gun(cam, out, g0.x, g0.y + 0.1, g0.z, [1, 0], fire);
        human(cam, out, 51, t, g0.x - 0.75, g0.z + 0.05, { o: DIG[1], okey: "d1", y: g0.y + 0.05 * Math.sin(t * 23), expr: t < 32.7 ? "stern" : "pained", side: false, blob: false, tilt: 6 * Math.sin(t * 9) });
        for (let i = 0; i < 26; i++) {
          const ex = x + 3 + hh(i, 1) * 9 + 5.4 * (t - 30.85), ez = (hh(i, 2) - 0.5) * 10;
          emu(cam, out, 60 + i, t, ex, ez, { pose: "run", phase: ph(ex, true, i), dir: [1, 0], expr: i % 4 ? "deadpan" : "smug" });
        }
        for (let k = 0; k < 6; k++) puff(out, x - 2.5 - k * 1.6, 1.2 * Math.sin(k), ((t * 1.6 + k / 6) % 1), 1.5);
      }
      break;
    }
    case 8: { // small groups, a lookout each
      for (let g = 0; g < 12; g++) {
        const gx = 140 + hh(g, 1) * 110, gz = -50 + hh(g, 2) * 80;
        for (let i = 0; i < 6; i++) {
          const k = 300 + g * 6 + i;
          if (i === 0) { emu(cam, out, k, t, gx, gz, { pose: "watch", dir: [Math.sin(t * 2 + g), 1], expr: "deadpan" }); continue; }
          const a = (i / 5) * 6.28 + g, x = gx + Math.cos(a) * 2.2, z = gz + Math.sin(a) * 2.2;
          emu(cam, out, k, t, x, z, { pose: hh(k, 3) < 0.6 ? "peck" : "stand", dir: [Math.cos(a + 1.6), Math.sin(a + 1.6)] });
        }
      }
      if (f >= 1122) {
        const look = Math.round(Math.sin((t - 37.4) * 3.2) * 1.4) / 1.4;
        emu(cam, out, 400, t, LEADER8[0], LEADER8[2], { pose: "watch", front: true, expr: "deadpan", look, lidOff: true });
        grazers(cam, out, t, 5, LEADER8[0], LEADER8[2] - 4, 3, 2, 8);
      }
      break;
    }
    case 9: { // golden retreat
      [0, 1, 2].forEach((i) => {
        const x = 109 - 1.1 * (t - 38.8) + i * 1.3, z = 2.4 + (i % 2) * 0.8;
        human(cam, out, 70 + i, t, x, z, { o: DIG[i], okey: `d${i}`, mode: "march", phase: ((x / 0.8) % 1 + 1) % 1, dir: [-1, 0], expr: i === 1 ? "pained" : "nervous" });
      });
      grazers(cam, out, t, 10, 112, -14, 14, 4, 9);
      break;
    }
    case 10: {
      if (f < 1300) {
        const g0 = onTruck(truck, -1.6, 0.92, 0), g1 = onTruck(truck, -1.6, 0.92, 0.6);
        human(cam, out, 80, t, g0.x, g0.z, { o: DIG[0], okey: "d0", y: g0.y, expr: "grin", side: false, blob: false });
        human(cam, out, 81, t, g1.x, g1.z, { o: DIG[2], okey: "d2", y: g1.y, expr: "stern", side: false, blob: false });
      } else {
        human(cam, out, 82, t, SOLDIER10[0], SOLDIER10[2], { o: DIG[0], okey: "d0", expr: t < 44.2 ? "grin" : "shock", dir: [0, 1], side: false });
        for (let i = 0; i < 16; i++) {
          const a = -Math.PI * (0.15 + 0.7 * hh(i, 1)), r = 3 + hh(i, 2) * 7;
          const rise = smooth((t - 43.5 - hh(i, 3) * 0.6) / 0.35);
          emu(cam, out, 90 + i, t, SOLDIER10[0] + Math.cos(a) * r * 1.4, SOLDIER10[2] + Math.sin(a) * r, { pose: "stand", front: true, expr: i % 3 ? "deadpan" : "smug", y: -1.7 * (1 - rise), blob: false });
        }
      }
      break;
    }
    case 11: {
      if (f < 1418) {
        human(cam, out, 110, t, MAJOR11[0], MAJOR11[2], { o: MAJOR, okey: "major", expr: "stern", dir: [0, 1], side: false });
        const ex = MAJOR11[0] - 4 + 1.1 * (t - 45.4);
        emu(cam, out, 111, t, ex, MAJOR11[2] - 3.2, { pose: "walk", phase: ph(ex, false, 1), dir: [1, 0], expr: "smug" });
      } else {
        const z = TANK11[2] + 0.9 * (t - 47.3);
        emu(cam, out, 112, t, TANK11[0], z, { pose: "walk", front: true, phase: ph(z, false, 2), dir: [0, 1], expr: "deadpan" });
        for (let k = 0; k < 7; k++) {
          const u = ((t * 1.7 + k / 7) % 1);
          flash(out, TANK11[0] + (hh(k, 1) - 0.5) * 7, 0.5 + hh(k, 2), TANK11[2] - 3 - hh(k, 3) * 4, u, 0.7);
          puff(out, TANK11[0] + (hh(k, 4) - 0.5) * 5, TANK11[2] - 1 - hh(k, 5) * 3, ((t * 1.2 + k / 7) % 1), 1.0);
        }
      }
      break;
    }
    case 12: {
      if (f < 1534) { // park: a digger on leave lunges at a pigeon, it hops off
        const lunge = smooth((t - 49.2) / 0.5), px = PARK[0] - 1.6 + 1.2 * lunge;
        human(cam, out, 120, t, px, PARK[2] + 0.2, { o: DIG[3], okey: "d3", mode: "march", phase: q(((t * 2) % 1), 8), dir: [1, 0], expr: lunge > 0.5 ? "shock" : "grin" });
        const hop = clamp01((t - 49.6) / 0.8), pgx = PARK[0] + 0.3 + 0.9 * hop, pgy = 0.9 * Math.sin(Math.PI * Math.min(1, hop * 1.2)) * (hop < 1 ? 1 : 0);
        const flap = hop > 0 && hop < 1 ? q(((t * 6) % 1), 4) : 0;
        out.places.push({ key: `PIG|${flap}|${q(1 - hop > 0.99 ? (t % 1 < 0.5 ? 0.3 : 0) : 0, 4)}`, x: pgx, y: pgy, z: PARK[2] + 0.4, scale: 0.28, size: [480, 800, 0.8],
          draw: (p) => pigeon(p, { flap, peck: hop === 0 && t % 1 < 0.5 ? 0.3 : 0 }) });
      } else if (f < 1594) { // twenty thousand of them, six feet tall
        for (let i = 0; i < 60; i++) {
          const row = Math.floor(i / 8), x = WALL12[0] + ((i % 8) - 3.5) * 1.35 + (row % 2) * 0.6, z = WALL12[2] - row * 1.6 + 0.6 * (t - 51.2);
          emu(cam, out, 130 + i, t, x, z, { pose: "walk", front: true, phase: ph(z, false, i), dir: [0, 1], expr: i % 5 ? "deadpan" : "smug" });
        }
      } else { // and they outrun your truck
        const tt = t - CHASE2_T0 + CHASE_T0, x = truckX(tt), g0 = onTruck(truck, -1.6, 0.92, 0);
        human(cam, out, 121, t, g0.x - 0.6, g0.z, { o: DIG[1], okey: "d1", y: g0.y, expr: "shock", side: false, blob: false });
        for (let i = 0; i < 14; i++) {
          const ex = x - 6 + hh(i, 1) * 4 + 7.5 * (t - CHASE2_T0), ez = 2.5 + hh(i, 2) * 4;
          emu(cam, out, 140 + i, t, ex, ez, { pose: "run", phase: ph(ex, true, i), dir: [1, 0], expr: "smug" });
        }
      }
      break;
    }
    case 13: {
      if (f < 1754) { // a month later: on the ground among the empty crates
        [[-0.2, 0.4], [1.3, -0.3], [2.6, 0.5]].forEach(([dx, dz], i) => human(cam, out, 150 + i, t, CAMP[0] + dx, CAMP[2] + dz, { o: DIG[i], okey: `d${i}`, mode: "sit", expr: i === 1 ? "dazed" : "pained" }));
        for (let k = 0; k < 40; k++) {
          const x = CAMP[0] + (hh(k, 1) - 0.3) * 4, z = CAMP[2] - 1.5 + hh(k, 2) * 2;
          out.fx.push({ key: "case", cw: 128, ch: 240, draw: casing, x, y: 0.02, z, w: 0.05, h: 0.1, flat: true, rot: hh(k, 3) * 6 });
        }
      } else { // one emu; ten cases fall around it
        emu(cam, out, 160, t, EMU13[0], EMU13[2], { pose: "stand", front: true, expr: "deadpan" });
        for (let k = 0; k < 10; k++) {
          const t0 = 58.7 + k * 0.075, u = t - t0;
          if (u < 0) continue;
          const x = EMU13[0] + (hh(k, 1) - 0.5) * 1.6, z = EMU13[2] + 0.3 + hh(k, 2) * 0.9;
          const y = Math.max(0.05, 2.6 - 4.9 * u * u * 2.2), landed = y <= 0.05;
          out.fx.push({ key: "case", cw: 128, ch: 240, draw: casing, x, y: landed ? 0.03 : y, z, w: 0.07, h: 0.13, flat: landed, rot: landed ? hh(k, 3) * 6 : u * 9 });
        }
      }
      break;
    }
    case 14: {
      if (f < 1934) {
        human(cam, out, 170, t, MAILBOX[0] - 0.6, MAILBOX[2] + 0.4, { o: farmer(1), okey: "f1", expr: t < 61.3 ? "neutral" : t < 64.8 ? "nervous" : "pained", dir: [0, -1], side: false });
        grazers(cam, out, t, 8, MAILBOX[0] - 3, MAILBOX[2] + 10, 9, 4, 11);
      } else {
        human(cam, out, 171, t, MAILBOX[0] - 0.6, MAILBOX[2] + 0.4, { o: farmer(1), okey: "f1", expr: "pained", dir: [0, -1], side: false });
        for (let i = 0; i < 10; i++) {
          const ex = MAILBOX[0] + 8 - 1.3 * (t - 64.5) - i * 1.7, ez = MAILBOX[2] - 5 + hh(i, 1) * 2;
          emu(cam, out, 180 + i, t, ex, ez, { pose: "walk", phase: ph(ex, false, i), dir: [-1, 0] });
        }
      }
      break;
    }
    case 15: { // today: the emu (left) and a kangaroo (right) on their plinths in front of the emblem
      emu(cam, out, 190, t, MONUMENT[0] - 3, MONUMENT[2] + 0.8, { pose: "stand", front: true, expr: "proud", y: 1.0, blob: false });
      const d = cam.pos.distanceTo(tmp.set(MONUMENT[0] + 3, 2.2, MONUMENT[2] + 0.8)), [w, h, k] = tier(d);
      out.places.push({ key: "ROO", x: MONUMENT[0] + 3, y: 1.0, z: MONUMENT[2] + 0.8, mirror: true, scale: 0.95, size: [w, h, k], draw: (p) => kangaroo(p) });
      break;
    }
  }
  void at; void DAM; void TRUCK10Z; void bodySide; void bodyFront; void fxShadow; void fxContact; void LIGHTS; void hexOf; void TAIL;
  return out;
};
export { FPS };
