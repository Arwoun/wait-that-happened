// usage: npx tsx tools/sheet.ts <episode> <out.png>
// Contact sheet of an episode's character drawings without the 3D engine (needs `npm i canvas tsx` once).
// Edit ITEMS in src/episodes/<episode>/sheet_items.ts: export const ITEMS: [name, (p: Pen) => void][]
import fs from "node:fs";
import { createCanvas } from "canvas";
const [EP, OUT = "out/sheet.png"] = process.argv.slice(2);
const { Pen } = await import(`../src/episodes/${EP}/toon.ts`);
const { ITEMS } = await import(`../src/episodes/${EP}/sheet_items.ts`);
const W = 600, H = 1000, cols = 6, s = 0.4;
const cv = createCanvas(W * s * cols, H * s * Math.ceil(ITEMS.length / cols));
const g = cv.getContext("2d");
g.fillStyle = "#bfd6ea"; g.fillRect(0, 0, cv.width, cv.height);
ITEMS.forEach(([name, fn]: [string, (p: unknown) => void], i: number) => {
  g.save(); g.translate((i % cols) * W * s, Math.floor(i / cols) * H * s); g.scale(s, s);
  try { fn(new Pen(g)); } catch (e) { console.log(name, e); }
  g.fillStyle = "#000"; g.font = "36px sans-serif"; g.fillText(name, 10, 40); g.restore();
});
fs.writeFileSync(OUT, cv.toBuffer("image/png"));
