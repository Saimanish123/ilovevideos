import { readFileSync } from "node:fs";
import { keyAt, keyRect, type Region, showsAt } from "../../src/tools/engines/blur-region/options";
import type { SampleFaces } from "../../src/tools/engines/vision/track";
import { iou } from "../../src/tools/engines/vision/yunet";

/**
 * Scores Find faces against a fixture's ground truth (scripts/vision/make_face_fixtures.py): every
 * frame's faces as corner quads in display pixels, with the share of each in the picture. A face
 * counts when at least 60% of it is in the picture; partly visible ones never count as false.
 */

export interface Truth {
  width: number;
  height: number;
  fps: number;
  segments?: [number, number, string][];
  /** Per frame, per face: 8 corner coordinates, then the share visible. */
  frames: number[][][];
}

export const readTruth = (name: string): Truth =>
  JSON.parse(readFileSync(`tests/fixtures/faces/${name.replace(".mp4", ".json")}`, "utf8"));

const bbox = (q: number[]) => {
  const xs = [q[0], q[2], q[4], q[6]] as number[];
  const ys = [q[1], q[3], q[5], q[7]] as number[];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/**
 * Share of the face quad's visible part (a 9×9 grid of points, those inside the frame) inside the
 * region's ellipse or rectangle: what is outside the picture needs no hiding.
 */
function covered(
  q: number[],
  r: { x: number; y: number; width: number; height: number },
  ellipse: boolean,
  frame: { width: number; height: number },
) {
  const [x0, y0, x1, y1, , , x3, y3] = q as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  let inside = 0;
  let n = 0;
  const a = r.width / 2;
  const b = r.height / 2;
  const cx = r.x + a;
  const cy = r.y + b;
  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 8; j++) {
      const u = i / 8;
      const v = j / 8;
      const px = x0 + (x1 - x0) * u + (x3 - x0) * v;
      const py = y0 + (y1 - y0) * u + (y3 - y0) * v;
      if (px < 0 || py < 0 || px > frame.width || py > frame.height) continue;
      const ok = ellipse
        ? ((px - cx) / a) ** 2 + ((py - cy) / b) ** 2 <= 1
        : px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
      if (ok) inside++;
      n++;
    }
  return n ? inside / n : 1;
}

const segmentOf = (t: Truth, sec: number) =>
  t.segments ? t.segments.findIndex(([a, b]) => sec >= a && sec < b) : 0;

export function scoreFind(
  truth: Truth,
  samples: SampleFaces[],
  regions: Region[],
  sampleSec: number,
) {
  const src = { width: truth.width, height: truth.height };
  // Detection on the sampled frames.
  let found = 0;
  let faces = 0;
  let stray = 0;
  for (const s of samples) {
    const f = Math.min(truth.frames.length - 1, Math.round(s.t * truth.fps));
    const all = (truth.frames[f] ?? []).map((q) => ({ box: bbox(q), vis: q[8] ?? 0 }));
    const must = all.filter((g) => g.vis >= 0.6);
    faces += must.length;
    const used = new Set<number>();
    for (const g of must) {
      let best = -1;
      let bestIou = 0.3;
      s.faces.forEach((d, i) => {
        const o = iou(g.box, d);
        if (!used.has(i) && o >= bestIou) {
          best = i;
          bestIou = o;
        }
      });
      if (best >= 0) {
        found++;
        used.add(best);
      }
    }
    s.faces.forEach((d, i) => {
      if (!used.has(i) && all.every((g) => iou(g.box, d) < 0.1)) stray++;
    });
  }
  // Coverage on every frame, with the regions as the engine places them.
  let frames = 0;
  let full = 0;
  let mostly = 0;
  let sum = 0;
  let worst = 1;
  let strayRegionFrames = 0;
  let regionFrames = 0;
  const coverers = new Map<string, Set<number>>();
  const misses: { t: number; face: number; share: number }[] = [];
  truth.frames.forEach((fr, f) => {
    const t = f / truth.fps;
    const placed = regions
      .filter((r) => showsAt(r, t))
      .map((r) => ({ id: r.id, rect: keyRect(keyAt(r, t), src), ellipse: r.shape === "ellipse" }));
    fr.forEach((q, j) => {
      if ((q[8] ?? 0) < 0.6) return;
      frames++;
      let best = 0;
      let by = -1;
      for (const p of placed) {
        const c = covered(q, p.rect, p.ellipse, src);
        if (c > best) {
          best = c;
          by = p.id;
        }
      }
      sum += best;
      worst = Math.min(worst, best);
      if (best >= 0.99) full++;
      if (best >= 0.9) mostly++;
      else
        misses.push({ t: Math.round(t * 100) / 100, face: j, share: Math.round(best * 100) / 100 });
      if (by >= 0) {
        const key = `${segmentOf(truth, t)}:${j}`;
        const set = coverers.get(key) ?? new Set<number>();
        set.add(by);
        coverers.set(key, set);
      }
    });
    for (const p of placed) {
      regionFrames++;
      if (fr.every((q) => iou(bbox(q), p.rect) === 0)) strayRegionFrames++;
    }
  });
  const fragments = [...coverers.values()].map((s) => s.size);
  return {
    samples: samples.length,
    sampleSec,
    recall: faces ? found / faces : 1,
    faces,
    strayPerSample: samples.length ? stray / samples.length : 0,
    frames,
    fullyHidden: frames ? full / frames : 1,
    mostlyHidden: frames ? mostly / frames : 1,
    meanCover: frames ? sum / frames : 1,
    worstCover: worst,
    regions: regions.length,
    strayRegionShare: regionFrames ? strayRegionFrames / regionFrames : 0,
    /** Regions that covered each true face (1 is unbroken). */
    meanRegionsPerFace: fragments.length
      ? fragments.reduce((a, b) => a + b, 0) / fragments.length
      : 0,
    misses: misses.slice(0, 12),
  };
}
