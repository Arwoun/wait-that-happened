// usage: npx tsx tools/framing.ts <episode> "<json checks>"   checks: [[shot, frame, name, [x,y,z]], ...]
// Projects each point with the episode camera: x -1..1 (left..right), y -1..1 (bottom..top). MISS = out of frame.
const EP = process.argv[2];
const S = await import(`../src/episodes/${EP}/story.ts`);
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
/** screen coords: x -1..1 left->right, y -1..1 bottom->top; null if behind */
const proj = (id: number, f: number, p: V3) => {
  const c = S.camAt(id, f), fw = norm(sub(c.look, c.pos)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
  const d = sub(p, c.pos), z = dot(d, fw);
  if (z <= 0) return null;
  const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * 9 / 16;
  return [dot(d, rt) / z / tx, dot(d, up) / z / ty, z].map((v) => Math.round(v * 100) / 100);
};
const at = S.at;
const checks: [number, number, string, V3][] = JSON.parse(process.argv[3] ?? "[]");
for (const [id, f, name, p] of checks) {
  const r = proj(id, f, p);
  const ok = r && Math.abs(r[0]) < 0.9 && r[1] > -0.95 && r[1] < 0.95;
  console.log(`${ok ? "  ok" : "MISS"} shot ${id} f${f} ${name}: ${JSON.stringify(r)}`);
}
void at;
