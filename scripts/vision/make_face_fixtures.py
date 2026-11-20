"""
Dev-only: face video fixtures with exact ground truth for Find faces (tests/e2e/blur-faces.spec.ts).
Nothing here ships.

Sources (all public domain, works of NASA; downloaded from images.nasa.gov, "~large.jpg"):
    iss075-s-002        Expedition 75 crew portrait (NASA/Josh Valcarcel), 7 faces
    iss072e098007       Expedition 72 crew in the station, taken on orbit, 11 faces
    iss073-s-002        Expedition 73 crew portrait (NASA/Josh Valcarcel), 7 faces
    iss059-s-002        Expedition 59 crew portrait (NASA/Robert Markowitz), 6 faces
    iss040e105139       Expedition 40 crew on orbit (Steve Swanson, NASA), 6 faces
    jsc2019e022584_alt  Expedition 61 crew portrait (NASA/Robert Markowitz), 3 faces
and scikit-image's `astronaut` (Eileen Collins, NASA, public domain) and `chelsea` and `coffee`
(CC0). The face boxes of each still (gt.json) were drafted with OpenCV's YuNet at three scales and
checked by eye, one false box (an elbow) removed: 41 faces.

Usage (Python 3.10+, numpy, opencv-python-headless, scikit-image; ffmpeg on PATH):
    python scripts/vision/make_face_fixtures.py <dir with the NASA jpgs and gt.json> tests/fixtures/faces
then `pnpm exec biome format --write` the JSON files it wrote (the repository formats JSON).

Writes, each with a JSON of every frame's faces as corner quads in display pixels, plus how much of
each face is in the picture ("vis"):
    faces-pan.mp4      1280x720, 30 fps, 8 s, H.264: a slow zoom over 7 faces (0-3 s), a pan at
                       133 px/s over a busy cabin with 11 faces of 37-73 px (3-6 s), no faces (a cat
                       and a coffee cup, 6-7 s), one 230 px face moving 400 px/s and tilting
                       -12 to +12 degrees (7-8 s)
    faces-small.mp4    1920x1080, 30 fps, 3 s: 37 faces 15 to 24 px tall drifting slowly
    faces-rotated.mp4  a phone-style file: coded 640x360 with a 90 degree display rotation, shown
                       360x640, 2 s, 3 faces
"""

import json
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from skimage import data as skdata

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
GT = json.load(open(os.path.join(SRC, "gt.json")))
ASTRONAUT_FACE = [178.2, 62.9, 89.9, 113.3]


def load(name):
    return cv2.imread(os.path.join(SRC, name))


def affine(scale, angle_deg, src_centre, dst_centre):
    """Matrix taking source pixels to frame pixels: scale and rotate about src_centre, put at dst_centre."""
    a = math.radians(angle_deg)
    c, s = math.cos(a) * scale, math.sin(a) * scale
    cx, cy = src_centre
    dx, dy = dst_centre
    return np.array([[c, -s, dx - c * cx + s * cy], [s, c, dy - s * cx - c * cy]], np.float64)


def quads(boxes, m):
    out = []
    for x, y, w, h in boxes:
        pts = np.array([[x, y, 1], [x + w, y, 1], [x + w, y + h, 1], [x, y + h, 1]], np.float64)
        out.append((pts @ m.T).reshape(-1))
    return out


def visible(q, W, H):
    """Share of the face quad's bounding box inside the frame."""
    xs, ys = q[0::2], q[1::2]
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    ix = max(0.0, min(W, x1) - max(0.0, x0))
    iy = max(0.0, min(H, y1) - max(0.0, y0))
    return ix * iy / max(1e-6, (x1 - x0) * (y1 - y0))


class Writer:
    def __init__(self, path, W, H, fps=30, extra=()):
        self.W, self.H, self.path = W, H, path
        self.p = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
             "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", *extra, "-c:v", "libx264", "-preset", "slow",
             "-crf", "24", "-g", "60", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path],
            stdin=subprocess.PIPE,
        )
        self.frames = []

    def add(self, img, faces):
        assert img.shape[:2] == (self.H, self.W)
        self.p.stdin.write(np.ascontiguousarray(img).tobytes())
        self.frames.append([[round(float(v), 1) for v in q] + [round(visible(q, self.W, self.H), 3)] for q in faces])

    def close(self, meta):
        self.p.stdin.close()
        assert self.p.wait() == 0
        json.dump({**meta, "frames": self.frames}, open(self.path.replace(".mp4", ".json"), "w"), separators=(",", ":"))
        print(self.path, os.path.getsize(self.path), "bytes,", len(self.frames), "frames")


def place(canvas_wh, img, m, bg=88):
    W, H = canvas_wh
    return cv2.warpAffine(img, m[:2], (W, H), flags=cv2.INTER_AREA if m[0, 0] < 1 else cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(bg, bg, bg))


def centroid(boxes):
    return (float(np.mean([b[0] + b[2] / 2 for b in boxes])), float(np.mean([b[1] + b[3] / 2 for b in boxes])))


def ease(k):
    return 0.5 - 0.5 * math.cos(math.pi * k)


# 1. faces-pan.mp4 -----------------------------------------------------------------------------
W, H = 1280, 720
w = Writer(os.path.join(OUT, "faces-pan.mp4"), W, H)
a = load("iss075-s-002.jpg")
ga = GT["iss075-s-002.jpg"]
for i in range(90):
    k = ease(i / 89)
    m = affine(0.55 + 0.13 * k, 0, centroid(ga), (W / 2 - 40 + 80 * k, H / 2 + 20))
    w.add(place((W, H), a, m), quads(ga, m))
b = load("iss072e098007.jpg")
gb = GT["iss072e098007.jpg"]
for i in range(90):
    m = affine(0.75, 0, centroid(gb), (W / 2 + 200 - 400 * i / 89, H / 2))
    w.add(place((W, H), b, m), quads(gb, m))
cat = cv2.cvtColor(skdata.chelsea(), cv2.COLOR_RGB2BGR)
cup = cv2.cvtColor(skdata.coffee(), cv2.COLOR_RGB2BGR)
for i in range(30):
    f = np.full((H, W, 3), 88, np.uint8)
    f = np.maximum(f, place((W, H), cat, affine(2.2, 0, (225, 150), (330 + 2 * i, H / 2))))
    c2 = place((W, H), cup, affine(1.2, 0, (300, 200), (960 - 2 * i, H / 2)), bg=0)
    f = np.where(c2.sum(axis=2, keepdims=True) > 0, c2, f)
    w.add(f, [])
astro = cv2.cvtColor(skdata.astronaut(), cv2.COLOR_RGB2BGR)
fc = (ASTRONAUT_FACE[0] + ASTRONAUT_FACE[2] / 2, ASTRONAUT_FACE[1] + ASTRONAUT_FACE[3] / 2)
for i in range(30):
    k = i / 29
    m = affine(2.0, -12 + 24 * k, fc, (440 + 400 * k, H / 2))
    w.add(place((W, H), astro, m), quads([ASTRONAUT_FACE], m))
w.close({"width": W, "height": H, "fps": 30, "segments": [[0, 3, "7 faces, slow zoom"], [3, 6, "11 faces, pan 133 px/s"], [6, 7, "no faces"], [7, 8, "1 face 230 px, 400 px/s, tilting"]]})

# 2. faces-small.mp4 ---------------------------------------------------------------------------
W, H = 1920, 1080
w = Writer(os.path.join(OUT, "faces-small.mp4"), W, H)
layout = [
    ("iss075-s-002.jpg", 0.16, (360, 260)),
    ("iss040e105139.jpg", 0.17, (1000, 250)),
    ("iss073-s-002.jpg", 0.13, (1600, 300)),
    ("iss059-s-002.jpg", 0.2, (450, 800)),
    ("iss072e098007.jpg", 0.3, (1250, 780)),
]
imgs = {n: load(n) for n, _, _ in layout}
for i in range(90):
    f = np.full((H, W, 3), 88, np.uint8)
    faces = []
    for j, (n, s, (cx, cy)) in enumerate(layout):
        m = affine(s, 0, centroid(GT[n]), (cx + (i * 0.7 if j % 2 else -i * 0.7), cy))
        part = place((W, H), imgs[n], m, bg=0)
        f = np.where(part.sum(axis=2, keepdims=True) > 0, part, f)
        faces += quads(GT[n], m)
    w.add(f, faces)
w.close({"width": W, "height": H, "fps": 30})

# 3. faces-rotated.mp4: displayed 360x640 (portrait), stored 640x360 with a 90 degree rotation ----
DW, DH = 360, 640
c = load("jsc2019e022584_alt.jpg")
gc = GT["jsc2019e022584_alt.jpg"]
path = os.path.join(OUT, "faces-rotated.mp4")
raw = path.replace(".mp4", ".raw.mp4")
w = Writer(raw, DH, DW)
display_frames = []
for i in range(60):
    m = affine(0.32, 0, centroid(gc), (DW / 2 + 30 - i, DH / 2 - 120))
    disp = place((DW, DH), c, m)
    # Stored picture: the displayed one turned 90 degrees clockwise; the player turns it back.
    w.add(cv2.rotate(disp, cv2.ROTATE_90_CLOCKWISE), [])
    display_frames.append([[round(float(v), 1) for v in q] + [round(visible(q, DW, DH), 3)] for q in quads(gc, m)])
w.p.stdin.close()
assert w.p.wait() == 0
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-display_rotation", "90", "-i", raw,
                "-c", "copy", "-movflags", "+faststart", path], check=True)
os.remove(raw)
json.dump({"width": DW, "height": DH, "fps": 30, "frames": display_frames}, open(path.replace(".mp4", ".json"), "w"), separators=(",", ":"))
print(path, os.path.getsize(path), "bytes")
