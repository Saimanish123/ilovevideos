// Fixtures for the picture-quality tools (stabilize, sharpen, denoise, remove black bars), with the
// local ffmpeg plus a texture drawn here: a "dead leaves" picture (discs of every size, the
// statistics of natural images) that ffmpeg's own sources lack. Deterministic (fixed seeds). Run by
// scripts/make-fixtures.sh; `node scripts/make-quality-fixtures.mjs --clean <out.mp4>` writes only the
// grain-free reference of sample-grainy.mp4 (the e2e spec measures against it). Never used in production.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "quality-fixtures-"));
const ff = (args, input) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    input,
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(r.stderr.toString());
};

/** Dead leaves, front to back, drawn at twice the size and halved by ffmpeg (smooth edges). */
function leaves(W, H, seed) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const img = new Float32Array(W * H * 3).fill(-1);
  let left = W * H;
  for (let n = 0; n < 200000 && left > 0; n++) {
    const r = Math.min(4 / (1 - rnd() * 0.995), 160);
    const cx = rnd() * W;
    const cy = rnd() * H;
    const base = [rnd(), rnd(), rnd()];
    const lum = 0.15 + 0.8 * rnd();
    const col = base.map((c) => Math.min(1, 0.55 * lum + 0.45 * c * lum * 1.6));
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const i = (y * W + x) * 3;
        if (d > r || img[i] >= 0) continue;
        const sh = 0.9 + 0.1 * Math.cos((d / r) * 3);
        img[i] = col[0] * sh;
        img[i + 1] = col[1] * sh;
        img[i + 2] = col[2] * sh;
        left--;
      }
  }
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.max(0, img[i]) * 255);
  return out;
}

const texture = join(dir, "leaves.png");
ff(
  [
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    "3200x1800",
    "-i",
    "-",
    "-vf",
    "scale=1600:900:flags=area",
    texture,
  ],
  leaves(3200, 1800, 3),
);

/** The grain-free scene: a slow pan over the leaves with a moving test pattern and a fractal. */
function clean(out, seconds = 2) {
  ff([
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    texture,
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=30",
    "-f",
    "lavfi",
    "-i",
    "mandelbrot=size=240x160:rate=30",
    "-filter_complex",
    "[0:v]format=gbrp,crop=1000:600:x='200+60*t':y='100+25*t',scale=640:384:flags=lanczos,crop=640:360:0:0[b];[b][1:v]overlay=400:160[c];[c][2:v]overlay=40:30,format=yuv420p",
    "-t",
    String(seconds),
    // Lossless either way; MP4 keeps exact frame times (Matroska rounds them to milliseconds).
    ...(out.endsWith(".mp4") ? ["-c:v", "libx264", "-qp", "0"] : ["-c:v", "ffv1"]),
    out,
  ]);
}

const cleanArg = process.argv.indexOf("--clean");
if (cleanArg > 0) {
  clean(process.argv[cleanArg + 1]);
  process.exit(0);
}

const fx = "tests/fixtures";
const tone = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"];
const ref = join(dir, "clean.mkv");
clean(ref);
// Denoise: 2 s of the scene with Gaussian grain (luma sigma about 9 levels after the encode), kept by
// a high-quality encode, with a tone.
ff([
  "-i",
  ref,
  ...tone,
  "-vf",
  "noise=c0s=16:c1s=10:c2s=10:allf=t,format=yuv420p",
  "-c:v",
  "libx264",
  "-crf",
  "12",
  "-preset",
  "medium",
  "-g",
  "30",
  "-c:a",
  "aac",
  "-b:a",
  "96k",
  "-shortest",
  "-movflags",
  "+faststart",
  `${fx}/sample-grainy.mp4`,
]);
// Sharpen: the scene softened by a Gaussian blur (sigma 1.2), as a slightly out-of-focus lens.
ff([
  "-i",
  ref,
  ...tone,
  "-vf",
  "gblur=sigma=1.2,format=yuv420p",
  "-c:v",
  "libx264",
  "-crf",
  "12",
  "-g",
  "30",
  "-c:a",
  "aac",
  "-b:a",
  "96k",
  "-shortest",
  "-movflags",
  "+faststart",
  `${fx}/sample-soft.mp4`,
]);

// Stabilize: a 640×360 view moving over the 1600×900 leaves with a slow pan, hand-shake (sums of
// sines from 1.5 to 8 Hz: about ±9 px across, ±7 px down, ±1.2°) and a box moving on its own.
{
  const scene = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", texture, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    {
      maxBuffer: 1 << 30,
    },
  );
  const SW = 1600,
    SH = 900,
    W = 640,
    H = 360,
    FPS = 30,
    F = 4 * FPS;
  let s = 12345;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  const comp = (amp) =>
    Array.from({ length: 6 }, (_, i) => ({
      f: 1.5 + i * 1.3 + rnd(),
      p: rnd() * 7,
      a: (amp / Math.sqrt(6)) * (1 + rnd() * 0.6),
    }));
  const sx = comp(9),
    sy = comp(7),
    sr = comp((1.2 * Math.PI) / 180);
  const shake = (c, t) =>
    c.reduce((acc, k) => acc + k.a * Math.sin(2 * Math.PI * k.f * t + k.p), 0);
  const frames = Buffer.alloc(W * H * 3 * F);
  for (let n = 0; n < F; n++) {
    const t = n / FPS;
    const cx = 600 + 40 * t + shake(sx, t),
      cy = 420 + 10 * t + shake(sy, t),
      th = shake(sr, t);
    const a = 1.25 * Math.cos(th),
      b = 1.25 * Math.sin(th);
    const tx = cx - ((a * W) / 2 - (b * H) / 2),
      ty = cy - ((b * W) / 2 + (a * H) / 2);
    const ox = 700 + 120 * t,
      oy = 480 + 30 * Math.sin(t * 2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const X = a * x - b * y + tx,
          Y = b * x + a * y + ty;
        const o = n * W * H * 3 + (y * W + x) * 3;
        if (X > ox && X < ox + 90 && Y > oy && Y < oy + 70) {
          const k = (Math.floor((X - ox) / 15) + Math.floor((Y - oy) / 15)) & 1 ? 230 : 30;
          frames[o] = k;
          frames[o + 1] = k * 0.8;
          frames[o + 2] = 40;
          continue;
        }
        const x0 = Math.max(0, Math.min(SW - 2, Math.floor(X))),
          y0 = Math.max(0, Math.min(SH - 2, Math.floor(Y)));
        const fx1 = Math.min(1, Math.max(0, X - x0)),
          fy1 = Math.min(1, Math.max(0, Y - y0));
        for (let c = 0; c < 3; c++) {
          const p = (xx, yy) => scene[(yy * SW + xx) * 3 + c];
          frames[o + c] =
            (p(x0, y0) * (1 - fx1) + p(x0 + 1, y0) * fx1) * (1 - fy1) +
            (p(x0, y0 + 1) * (1 - fx1) + p(x0 + 1, y0 + 1) * fx1) * fy1;
        }
      }
  }
  const raw = join(dir, "shaky.rgb");
  writeFileSync(raw, frames);
  ff([
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${W}x${H}`,
    "-r",
    String(FPS),
    "-i",
    raw,
    ...tone,
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "60",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    "-movflags",
    "+faststart",
    `${fx}/sample-shaky.mp4`,
  ]);
}

// Remove black bars: 640×360 with a 640×268 picture (46 px bars above and below, 2.39:1), 3 s.
// 1.0–1.6 s is a night scene (the picture dimmed to near black at its edges), and 2.0–2.6 s has
// white subtitle strokes inside the bottom bar, 14 to 24 px above the bottom.
ff([
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x268:rate=30:duration=3",
  ...tone,
  "-filter_complex",
  "[0:v]lutyuv=y='val*0.08':u='128+(val-128)*0.1':v='128+(val-128)*0.1':enable='between(t,1,1.6)',drawbox=x=220:y=94:w=200:h=80:color=gray:t=fill:enable='between(t,1,1.6)',pad=640:360:0:46:black,drawbox=x=200:y=322:w=240:h=10:color=white:t=fill:enable='between(t,2,2.6)',format=yuv420p[v]",
  "-map",
  "[v]",
  "-map",
  "1:a",
  "-c:v",
  "libx264",
  "-crf",
  "18",
  "-g",
  "30",
  "-c:a",
  "aac",
  "-b:a",
  "96k",
  "-shortest",
  "-movflags",
  "+faststart",
  `${fx}/sample-letterbox.mp4`,
]);
console.log("quality fixtures written");
