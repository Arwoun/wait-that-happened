"""One frame per shot (and per camera key) from a rendered episode, as a labelled contact sheet.

usage: python tools/qa_sheet.py <video.mp4> <out.jpg> <frame> [<frame> ...]
"""
import subprocess, sys, os, tempfile
from PIL import Image, ImageDraw

vid, out, frames = sys.argv[1], sys.argv[2], [int(f) for f in sys.argv[3:]]
tmp = tempfile.mkdtemp()
ims = []
for f in frames:
    p = os.path.join(tmp, f"{f}.jpg")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{f / 30:.3f}", "-i", vid, "-frames:v", "1", "-vf", "scale=270:480", p], check=True)
    im = Image.open(p).convert("RGB"); ImageDraw.Draw(im).text((6, 6), f"f{f}", fill=(255, 0, 0)); ims.append(im)
cols = min(8, len(ims)); rows = -(-len(ims) // cols)
sheet = Image.new("RGB", (270 * cols, 480 * rows), "white")
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * 270, (i // cols) * 480))
sheet.save(out, quality=85)
print(out, len(ims))
