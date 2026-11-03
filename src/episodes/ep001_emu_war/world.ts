// Episode 1 world: the Western Australian wheatbelt in 1932 as one three.js scene. Red outback beyond a wire fence,
// golden wheat with a stubble track, an open paddock, a farm dam, a weatherboard farmhouse with a pump windmill,
// the army camp (tent, crates, a 1930s truck), a little town park corner and a sandstone monument for "today".
// update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import { Batch, boxGeo, V, lam, Kit, Ray, kitClone, prop, quad, setSight } from "./build";
import {
  ctex, rep, beam, stoneHD, cloudHD, wheatTopHD, wheatSideHD, stubbleHD, redDirtHD, lawnHD, weatherboardHD, corrugatedHD, crateHD, canvasHD, cobbleHD,
} from "./paint";
import { Pen } from "./toon";
import { emblem } from "./creatures";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import {
  FPS, SHOTS, camAt, V3, ShotDef, FOREGROUND, WHEAT_RECTS, WHEAT_H, TRACK, FENCE_Z, DAM, DAM_R, CAMP, HOUSE, MAILBOX, PARK, MONUMENT,
  CRATE_GUNS, AMMO, truckX, bump, CHASE_T0, CHASE2_T0, TRUCK10Z,
} from "./story";

// ---------------- assets ----------------
const KENNEY: string[] = []; // the episode's vegetation is procedural (build.ts VEG); no kit models are required
let kitP: Promise<Kit> | null = null;
export const loadKit = () => {
  if (!kitP) {
    const loader = new GLTFLoader();
    kitP = Promise.all(KENNEY.map((n) => loader.loadAsync(staticFile(`kenney/${n}.glb`)).then((g) => [n, g.scene] as const).catch(() => [n, null] as const)))
      .then((list) => Object.fromEntries(list.filter((e) => e[1]).map(([n, s]) => [n, s!])) as Kit);
  }
  return kitP;
};

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});

/** every lens position of the film looking at its subject (trees and props there are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 3) {
    const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = fw.length();
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};

/** horizontal quad facing up at height y covering x0..x1, z0..z1, uv repeat u x v */
function quadUp(x0: number, x1: number, z0: number, z1: number, u: number, v: number, y = 0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}
const rng = (seed: number) => { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

type Mats = Record<string, THREE.Material>;

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private fgs: { o: THREE.Object3D; a: number; b: number }[] = [];
  private truck = new THREE.Group(); private truckWheels: THREE.Object3D[] = [];
  private fan = new THREE.Group();
  private ammoStack = new THREE.Group(); private emptyCrates = new THREE.Group();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(kit: Kit) {
    const R = this.root, M: Mats = {};
    // ---- sky + light (as in the engine) ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 110 + (i % 4) * 34, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }

    // ---- materials ----
    const tex = (t: THREE.Texture) => { t.anisotropy = 16; t.needsUpdate = true; return t; };
    M.red = lam("redDirt", () => ({ map: tex(redDirtHD()) }));
    M.stubble = lam("stubble", () => ({ map: tex(stubbleHD()) }));
    M.wheatTop = lam("wheatTop", () => ({ map: tex(wheatTopHD()) }));
    M.wheatSide = lam("wheatSide", () => ({ map: tex(wheatSideHD()), side: THREE.DoubleSide }));
    M.lawn = lam("lawn", () => ({ map: tex(lawnHD()) }));
    M.paving = lam("paving", () => ({ map: tex(cobbleHD()) }));
    M.sand = lam("sandstone", () => ({ map: stoneHD("sandstoneHD", ["#e6c79a", "#dcbb8c", "#ecd2aa", "#d4b282"], "#b89468") }));
    M.board = lam("weatherboard", () => ({ map: weatherboardHD() }));
    M.iron = lam("corrugated", () => ({ map: corrugatedHD() }));
    M.ironRed = lam("corrugatedRed", () => ({ map: corrugatedHD("#b0563f") }));
    M.wood = lam("wood", () => ({ map: beam() }));
    M.post = lam("post", () => ({ color: "#7a5a3c" }));
    M.wire = twoTone(new THREE.MeshLambertMaterial({ color: "#6d6a66" }), 0.2);
    M.crate = lam("crate", () => ({ map: crateHD() }));
    M.canvas = lam("tentCanvas", () => ({ map: canvasHD() }));
    M.dark = lam("darkOpening", () => ({ color: "#3a3446" }));
    M.window = lam("window", () => ({ color: "#7f95c4" }));
    M.trim = lam("trim", () => ({ color: "#f4efe4" }));
    M.green = lam("truckGreen", () => ({ color: "#7aa262" }));
    M.black = lam("tyre", () => ({ color: "#2f2c33" }));
    M.steel = twoTone(new THREE.MeshPhongMaterial({ color: "#8b9099", specular: "#9a9a9a", shininess: 40 }), 0.2);
    M.water = lam("damWater", () => ({ color: "#4f97ad" }));
    M.bank = lam("damBank", () => ({ map: tex(redDirtHD()), side: THREE.DoubleSide }));
    M.mud = lam("damMud", () => ({ color: "#9a6a48" }));

    // ---- ground ----
    const b = new Batch();
    // outback (red) and farm (stubble) tile the ground without overlapping: no depth fighting at a distance
    b.add(quadUp(-1000, 1000, -1000, FENCE_Z, 250, 117.5, 0), M.red);
    b.add(quadUp(-1000, -400, FENCE_Z, 1000, 75, 132.5, 0), M.red);
    b.add(quadUp(400, 1000, FENCE_Z, 1000, 75, 132.5, 0), M.red);
    b.add(quadUp(-400, 400, FENCE_Z, 1000, 100, 132.5, 0), M.stubble);
    for (const [x0, x1, z0, z1] of WHEAT_RECTS) {
      const h = WHEAT_H;
      b.add(quadUp(x0, x1, z0, z1, (x1 - x0) / 4, (z1 - z0) / 4, h), M.wheatTop);
      const sides: [THREE.Vector3, THREE.Vector3][] = [[V(x0, 0, z0), V(x1, 0, z0)], [V(x1, 0, z0), V(x1, 0, z1)], [V(x1, 0, z1), V(x0, 0, z1)], [V(x0, 0, z1), V(x0, 0, z0)]];
      for (const [a, c] of sides) b.add(quad(a, c, c.clone().setY(h), a.clone().setY(h), a.distanceTo(c), 1), M.wheatSide);
    }
    b.add(quadUp(PARK[0] - 30, PARK[0] + 30, PARK[2] - 30, PARK[2] + 30, 15, 15, 0.05), M.lawn);
    b.add(quadUp(PARK[0] - 1.2, PARK[0] + 1.2, PARK[2] - 30, PARK[2] + 30, 1, 25, 0.1), M.paving);
    b.add(quadUp(MONUMENT[0] - 20, MONUMENT[0] + 20, MONUMENT[2] - 6, MONUMENT[2] + 30, 10, 9, 0.08), M.paving);

    // ---- fence (posts every 3 m, three wires) with a broken gap where the emus come through ----
    for (let x = -300; x <= 300; x += 3) {
      if (Math.abs(x) < 7 || (x > TRACK.x0 - 1 && x < TRACK.x1 + 1)) continue; // gap for the emus' break-in and a gate for the track
      b.add(boxGeo(V(x - 0.06, 0, FENCE_Z - 0.06), V(x + 0.06, 1.25, FENCE_Z + 0.06)), M.post);
    }
    for (const y of [0.45, 0.8, 1.12]) for (const [x0, x1] of [[-300, -6], [6, TRACK.x0 - 1], [TRACK.x1 + 1, 300]])
      b.add(boxGeo(V(x0, y - 0.012, FENCE_Z - 0.012), V(x1, y + 0.012, FENCE_Z + 0.012)), M.wire);
    b.add(boxGeo(V(5.6, 0, FENCE_Z - 0.4), V(5.75, 0.95, FENCE_Z + 0.1)), M.post); // a leaning broken post (stays short)

    // ---- the dam: water, mud ring, earth bank ----
    const water = new THREE.CircleGeometry(DAM_R, 48); water.rotateX(-Math.PI / 2);
    b.add(water, M.water, new THREE.Matrix4().makeTranslation(DAM[0], 0.06, DAM[2]));
    const mud = new THREE.RingGeometry(DAM_R - 0.2, DAM_R + 1.4, 48); mud.rotateX(-Math.PI / 2);
    b.add(mud, M.mud, new THREE.Matrix4().makeTranslation(DAM[0], 0.04, DAM[2]));
    const bank = new THREE.LatheGeometry([new THREE.Vector2(DAM_R + 1.4, 0.0), new THREE.Vector2(DAM_R + 2.6, 1.15), new THREE.Vector2(DAM_R + 3.6, 1.5),
      new THREE.Vector2(DAM_R + 4.6, 1.15), new THREE.Vector2(DAM_R + 6.0, 0.0)], 64, 1.4 * Math.PI, 1.2 * Math.PI); // open toward -z (north, lathe angle pi), where the emus walk in // open on the north side
    b.add(bank, M.bank, new THREE.Matrix4().makeTranslation(DAM[0], 0, DAM[2]));

    // ---- farmhouse: weatherboard box, hipped iron roof, verandah, tank stand and the pump windmill ----
    {
      const [hx, , hz] = HOUSE, w = 12, d = 9, h = 3.2;
      b.add(boxGeo(V(hx - w / 2, 0, hz - d / 2), V(hx + w / 2, h, hz + d / 2), 3), M.board);
      const roof = new THREE.ConeGeometry(1, 1, 4, 1, true); roof.rotateY(Math.PI / 4);
      b.add(roof, M.ironRed, new THREE.Matrix4().compose(V(hx, h + 1.4, hz), new THREE.Quaternion(), V((w + 1.2) / Math.SQRT2, 2.8, (d + 1.2) / Math.SQRT2)));
      // verandah along the front (-z): sloping iron roof on posts
      b.add(quad(V(hx - w / 2 - 0.6, h, hz - d / 2 - 0.4), V(hx + w / 2 + 0.6, h, hz - d / 2 - 0.4), V(hx + w / 2 + 0.6, 2.45, hz - d / 2 - 2.8), V(hx - w / 2 - 0.6, 2.45, hz - d / 2 - 2.8), 6, 2), M.iron);
      for (let k = 0; k <= 4; k++) b.add(boxGeo(V(hx - w / 2 + k * (w / 4) - 0.08, 0, hz - d / 2 - 2.7), V(hx - w / 2 + k * (w / 4) + 0.08, 2.45, hz - d / 2 - 2.55)), M.trim);
      b.add(boxGeo(V(hx - w / 2 - 0.6, 0, hz - d / 2 - 2.8), V(hx + w / 2 + 0.6, 0.25, hz - d / 2)), M.wood);
      b.add(boxGeo(V(hx - 0.55, 0.25, hz - d / 2 - 0.03), V(hx + 0.55, 2.3, hz - d / 2)), M.dark);
      for (const s of [-1, 1]) {
        b.add(boxGeo(V(hx + s * 3.2 - 0.75, 1.0, hz - d / 2 - 0.04), V(hx + s * 3.2 + 0.75, 2.2, hz - d / 2)), M.window);
        b.add(boxGeo(V(hx + s * 3.2 - 0.85, 0.92, hz - d / 2 - 0.08), V(hx + s * 3.2 + 0.85, 1.0, hz - d / 2)), M.trim);
      }
      b.add(boxGeo(V(hx + 3.5, h, hz + 1), V(hx + 4.3, h + 2.6, hz + 1.8), 2), M.sand); // chimney
      // tank on a stand
      const tank = new THREE.CylinderGeometry(1.5, 1.5, 2.2, 24, 1);
      b.add(tank, M.iron, new THREE.Matrix4().makeTranslation(hx - 10, 3.3, hz - 1));
      for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.add(boxGeo(V(hx - 10 + ox * 1.1 - 0.1, 0, hz - 1 + oz * 1.1 - 0.1), V(hx - 10 + ox * 1.1 + 0.1, 2.2, hz - 1 + oz * 1.1 + 0.1)), M.wood);
      // windmill: tapering steel lattice tower
      const wx = hx - 16, wz = hz + 3, top = 9;
      for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const a = V(wx + ox * 1.3, 0, wz + oz * 1.3), c = V(wx + ox * 0.25, top, wz + oz * 0.25);
        const g = new THREE.CylinderGeometry(0.05, 0.06, a.distanceTo(c), 6);
        b.add(g, M.steel, new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), c.clone().sub(a).normalize()), V(1, 1, 1)));
      }
      for (const y of [2.5, 5, 7.5]) { const k = 1.3 - (1.05 * y) / top; b.add(boxGeo(V(wx - k, y - 0.03, wz - k), V(wx + k, y + 0.03, wz + k)), M.steel); }
      this.fan.position.set(wx, top + 0.4, wz);
      for (let i = 0; i < 14; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.32), M.steel);
        blade.position.set(0, 0.85, 0); const pivot = new THREE.Group(); pivot.rotation.x = (i / 14) * Math.PI * 2; pivot.add(blade);
        blade.rotation.y = 0.5; blade.castShadow = true; this.fan.add(pivot);
      }
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 1.6), M.steel); vane.position.set(0, 0.2, -1.4);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12).rotateZ(Math.PI / 2), M.steel);
      const head = new THREE.Group(); head.position.copy(this.fan.position); head.add(vane, hub); head.rotation.y = Math.PI / 2;
      this.fan.rotation.y = Math.PI / 2; R.add(head, this.fan);
    }
    // mailbox: post + kerosene-tin box
    b.add(boxGeo(V(MAILBOX[0] - 0.06, 0, MAILBOX[2] - 0.06), V(MAILBOX[0] + 0.06, 1.05, MAILBOX[2] + 0.06)), M.post);
    b.add(boxGeo(V(MAILBOX[0] - 0.25, 1.05, MAILBOX[2] - 0.18), V(MAILBOX[0] + 0.25, 1.4, MAILBOX[2] + 0.18)), M.iron);

    // ---- army camp: tent, a crate for the guns, the ammunition stack (shot 4) and empty crates (shot 13) ----
    {
      const [cx, , cz] = CAMP, tx = cx - 5, tz = cz + 6;
      const tent = new THREE.CylinderGeometry(2.0, 2.0, 4.2, 3, 1); tent.rotateZ(Math.PI / 2); tent.rotateX(Math.PI);
      b.add(tent, M.canvas, new THREE.Matrix4().makeTranslation(tx, 1.0, tz));
      b.add(boxGeo(V(tx - 2.1, 0, tz - 0.05), V(tx - 2.05, 1.6, tz + 0.05)), M.post);
      b.add(boxGeo(V(CRATE_GUNS[0] - 0.7, 0, CRATE_GUNS[2] - 0.35), V(CRATE_GUNS[0] + 0.7, 0.62, CRATE_GUNS[2] + 0.35), 1), M.crate);
      const crate = (g: THREE.Group, x: number, y: number, z: number, yaw = 0, open = false) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.48, 0.5), M.crate);
        m.position.set(x, y + 0.24, z); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; g.add(m);
        if (open) { const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.52), M.crate); lid.position.set(x + 0.35, y + 0.2, z - 0.35); lid.rotation.set(0.9, yaw, 0.3); lid.castShadow = true; g.add(lid); }
      };
      for (let k = 0; k < 6; k++) for (let i = 0; i < 4 - (k > 3 ? 1 : 0); i++) for (let j = 0; j < 2; j++)
        crate(this.ammoStack, AMMO[0] - 1.35 + i * 0.92 + (k % 2) * 0.2, k * 0.48, AMMO[2] - 0.26 + j * 0.52);
      const r = rng(77);
      for (let i = 0; i < 9; i++) crate(this.emptyCrates, CAMP[0] - 1 + r() * 5, 0, CAMP[2] - 2.5 + r() * 4, r() * 3, true);
      R.add(this.ammoStack, this.emptyCrates);
    }

    // ---- the truck (1930s flatbed, local +x forward), posed per frame ----
    {
      const T = this.truck, add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; T.add(mesh); return mesh;
      };
      add(new THREE.BoxGeometry(4.8, 0.22, 1.5), M.black, 0, 0.62, 0); // chassis
      add(new THREE.BoxGeometry(1.25, 1.3, 1.75), M.green, 0.15, 1.42, 0); // cab
      add(new THREE.BoxGeometry(1.1, 0.48, 1.5), M.window, 0.2, 1.7, 0).scale.set(1.02, 1, 1.02);
      add(new THREE.BoxGeometry(1.3, 0.25, 1.85), M.green, 0.15, 2.18, 0); // cab roof
      add(new THREE.BoxGeometry(1.35, 0.7, 1.2), M.green, 1.45, 1.08, 0); // bonnet
      add(new THREE.BoxGeometry(0.12, 0.72, 1.0), M.steel, 2.15, 1.05, 0); // radiator
      add(new THREE.BoxGeometry(2.4, 0.12, 1.95), M.wood, -1.6, 0.86, 0); // tray
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(2.4, 0.4, 0.06), M.wood, -1.6, 1.12, s * 0.95);
      add(new THREE.BoxGeometry(0.06, 0.4, 1.95), M.wood, -2.78, 1.12, 0);
      for (const [x, s] of [[1.45, -1], [1.45, 1], [-1.6, -1], [-1.6, 1]] as const) {
        const w = add(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 18).rotateX(Math.PI / 2), M.black, x, 0.42, s * 0.82);
        this.truckWheels.push(w);
        add(new THREE.BoxGeometry(1.0, 0.08, 0.36), M.green, x, 0.88, s * 0.86); // mudguard
      }
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12).rotateZ(Math.PI / 2), M.trim, 2.2, 1.3, s * 0.48); // lamps
      R.add(T);
    }

    // ---- the park corner and the monument ----
    {
      const [px, , pz] = PARK;
      b.add(boxGeo(V(px - 1.0, 0.42, pz - 2.9), V(px + 1.0, 0.5, pz - 2.4)), M.wood); // bench seat
      b.add(boxGeo(V(px - 1.0, 0.5, pz - 2.95), V(px + 1.0, 0.95, pz - 2.88)), M.wood);
      for (const s of [-1, 1]) b.add(boxGeo(V(px + s * 0.9 - 0.04, 0, pz - 2.9), V(px + s * 0.9 + 0.04, 0.45, pz - 2.4)), M.steel);
      b.add(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), M.black, new THREE.Matrix4().makeTranslation(px + 2.4, 1.7, pz - 3.2));
      b.add(new THREE.SphereGeometry(0.22, 12, 8), M.trim, new THREE.Matrix4().makeTranslation(px + 2.4, 3.5, pz - 3.2));
      const [mx, , mz] = MONUMENT;
      b.add(boxGeo(V(mx - 6, 0, mz - 0.8), V(mx + 6, 5.4, mz), 2), M.sand);
      b.add(boxGeo(V(mx - 6.3, 5.4, mz - 1.0), V(mx + 6.3, 5.75, mz + 0.2), 2), M.sand);
      for (const s of [-1, 1]) b.add(boxGeo(V(mx + s * 3 - 0.9, 0, mz), V(mx + s * 3 + 0.9, 1.0, mz + 1.6), 2), M.sand); // plinths for the two supporters
      const em = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshLambertMaterial({ map: ctex("emblem", 1000, 1000, (g) => emblem(new Pen(g))), alphaTest: 0.5 }));
      em.position.set(mx, 3.0, mz + 0.03); em.layers.set(NOINK); R.add(em);
    }

    // ---- gum trees, shrubs (cartoon vegetation; skipped where a lens looks through) ----
    setSight(sightLines());
    const r = rng(1932);
    const tree = (x: number, z: number, h: number) => prop(b, kit, r() < 0.5 ? "tree_default" : "tree_oak", x, 0, z, h, r() * 6);
    for (let i = 0; i < 26; i++) tree(-60 + r() * 140, 62 + r() * 60, 7 + r() * 5);            // around the house
    for (let i = 0; i < 30; i++) tree(-300 + r() * 600, FENCE_Z - 8 - r() * 260, 5 + r() * 6);  // outback
    for (let i = 0; i < 70; i++) prop(b, kit, "plant_bush", -300 + r() * 600, 0, FENCE_Z - 3 - r() * 260, 0.6 + r() * 0.6, r() * 6);
    for (let i = 0; i < 12; i++) tree(DAM[0] - 40 + r() * 80, DAM[2] - 40 + r() * 30, 6 + r() * 4); // behind the dam
    for (let i = 0; i < 10; i++) tree(300 + r() * 30, -60 + r() * 140, 7 + r() * 4);            // paddock's far edge
    for (const [dx, dz, h] of [[-6, -8, 7], [7, -9, 8], [-9, 6, 6.5], [9, 7, 7.5]]) tree(PARK[0] + dx, PARK[2] + dz, h);
    for (let i = 0; i < 8; i++) prop(b, kit, "hedge", PARK[0] - 12 + i * 3.3, 0, PARK[2] - 12, 1.0, 0);
    for (const [dx, dz] of [[-12, -4], [12, -4], [-15, 8], [15, 8]]) tree(MONUMENT[0] + dx, MONUMENT[2] + dz, 8);
    setSight([]);
    b.build(R);

    // the CAM's near framing objects: built once, toggled per frame
    for (const fg of FOREGROUND) {
      const o = kitClone(kit, fg.kit, fg.s ?? 1);
      if (!o) continue;
      o.position.set(...fg.pos); o.rotation.y = fg.yaw ?? 0; o.visible = false;
      this.fgs.push({ o, a: fg.a, b: fg.b }); R.add(o);
    }
  }

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(s.sunAz ?? L.az), el = THREE.MathUtils.degToRad(s.sunEl ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  /** truck at (x, z) heading yaw (0 = +x), with the bumpy ride */
  private poseTruck(x: number, z: number, yaw: number, t: number, rideK: number, spin: number) {
    const b = bump(t, rideK);
    this.truck.visible = true;
    this.truck.position.set(x, b.heave, z);
    this.truck.rotation.set(b.roll, yaw, b.pitch, "YXZ");
    for (const w of this.truckWheels) w.rotation.z = -spin;
  }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.15; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    this.fill.intensity = 0;
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, sun disc, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar * 1.4;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    for (const g of this.fgs) g.o.visible = f >= g.a && f < g.b && g.a < s.b && g.b > s.a;
    // ---- set pieces per shot ----
    this.fan.rotation.x = t * 2.2;
    this.ammoStack.visible = id === 4;
    this.ammoStack.children.forEach((m, i) => { // the stack grows on "ten thousand bullets"
      const k = Math.floor(i / 7), show = f < 500 ? k < 2 : f >= 500 + k * 3;
      m.visible = show;
    });
    this.emptyCrates.visible = id === 13;
    this.truck.visible = false;
    if (id === 4) this.poseTruck(CAMP[0] + 1, CAMP[2] + 4.5, Math.PI, 0, 0, 0);
    else if (id === 7 && f < 925) this.poseTruck(100, 0, 0, 0, 0, 0);
    else if (id === 7) this.poseTruck(truckX(t), 0, 0, t, 1, (truckX(t) - 100) / 0.42);
    else if (id === 9) this.poseTruck(100, 0, 0, 0, 0, 0);
    else if (id === 10) this.poseTruck(18.5, TRUCK10Z(t), -Math.PI / 2, t, 0.35, (TRUCK10Z(t) + 80) / 0.42);
    else if (id === 13) this.poseTruck(CAMP[0] + 1, CAMP[2] + 4.5, Math.PI, 0, 0, 0);
    else if (id === 12 && f >= 1594) { const tt = t - CHASE2_T0 + CHASE_T0; this.poseTruck(truckX(tt), 0, 0, tt, 1, (truckX(tt) - 100) / 0.42); }
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right, sun: sunDir }, this.truck);
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 2.6 * sc2))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e3 of fused) e3.bind();
    void TRACK; void rep;
    return focus;
  }
}
