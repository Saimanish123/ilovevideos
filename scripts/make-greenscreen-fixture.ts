// Writes the green screen fixtures from the synthetic scene in tests/e2e/greenscreen-scene.ts:
// greenscreen.mp4 (the camera shot, H.264 at CRF 16 with a tone, as a phone or camera would hand
// it over) and backdrop.png (the picture to put behind it). The right answer is computed by the
// test from the same scene. Run by scripts/make-fixtures.sh. Never used in production.
import { spawn } from "node:child_process";
import { backdropFrame, FPS, greenFrame, H, SECONDS, W } from "../tests/e2e/greenscreen-scene";

const out = "tests/fixtures/overlay";

function encode(args: string[], frames: () => Generator<Uint8Array>) {
  return new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    for (const f of frames()) ff.stdin.write(f);
    ff.stdin.end();
  });
}

const raw = ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`];
await encode(
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...raw,
    "-r",
    String(FPS),
    "-i",
    "-",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=330:duration=${SECONDS}`,
    "-vf",
    "format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "16",
    "-g",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    "-movflags",
    "+faststart",
    `${out}/greenscreen.mp4`,
  ],
  function* () {
    for (let f = 0; f < FPS * SECONDS; f++) yield greenFrame(f / FPS, f);
  },
);
await encode(
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...raw,
    "-i",
    "-",
    "-frames:v",
    "1",
    `${out}/backdrop.png`,
  ],
  function* () {
    yield backdropFrame();
  },
);
