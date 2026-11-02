// usage: node tools/stills.mjs <outPrefix> <frame,frame,...> [scale]
// Renders still frames of the current episode (composition "Short") with software WebGL (works without a GPU).
// CHROME=/path/to/chrome to use a local Chrome instead of Remotion's headless shell.
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
const [prefix, frames, scale = "0.5"] = process.argv.slice(2);
const tmp = path.resolve("tmp"); fs.mkdirSync(tmp, { recursive: true }); process.env.TMPDIR = process.env.TEMP = process.env.TMP = tmp;
fs.mkdirSync(path.dirname(prefix), { recursive: true });
const browserExecutable = process.env.CHROME || null;
const chromiumOptions = { gl: process.env.GL || "swangle" };
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.tsx"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: "Short", browserExecutable, chromiumOptions, timeoutInMilliseconds: 600000 });
const onBrowserLog = (l) => { if ((l.type === "error" || l.type === "warning") && !l.text.includes("404")) console.log(`[${l.type}]`, l.text.slice(0, 300)); };
for (const f of frames.split(",").map(Number)) {
  const t0 = Date.now();
  await renderStill({ composition, serveUrl, frame: f, output: `${prefix}${f}.jpg`, imageFormat: "jpeg", jpegQuality: 88, scale: Number(scale),
    browserExecutable, chromiumOptions, timeoutInMilliseconds: 600000, onBrowserLog });
  console.log("still", f, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}
