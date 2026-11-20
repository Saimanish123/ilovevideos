import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * The WebGL 2 vision kit against the official YuNet ONNX model (tests/fixtures/vision, made
 * offline by scripts/vision/make_references.py with onnxruntime and OpenCV). Runs the dev-only
 * bench at /dev/vision. Tolerances are relative to each tensor's range; the half-float weights
 * account for about 3e-3 of it (the CPU reference shows the same).
 */

const FIXTURES = "tests/fixtures/vision";

async function openBench(page: Page) {
  await page.route("**/__vision-fixtures/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    route.fulfill({ body: readFileSync(`${FIXTURES}/${name}`) });
  });
  await page.goto("/dev/vision");
  await expect(page.locator("[data-bench]")).toHaveAttribute("data-bench", "ready", {
    timeout: 30_000,
  });
}

type Bench = {
  layers(p: string): Promise<{
    precision: string;
    inputErr: number;
    layers: { name: string; op: string; err: number }[];
    finals: { name: string; err: number }[];
    cpuWorst: number;
  }>;
  astronaut(p: string): Promise<{
    finals: { name: string; err: number; abs: number; kernel: number }[];
    faces: { box: number[]; score: number }[];
    opencv: { box: number[]; score: number }[];
  }>;
  speed(
    w: number,
    h: number,
    runs: number,
    p?: string,
  ): Promise<{
    median: number;
    min: number;
    renderer: string;
  }>;
};

const call = <K extends keyof Bench>(page: Page, name: K, ...args: Parameters<Bench[K]>) =>
  page.evaluate(
    ([n, a]) =>
      // biome-ignore lint/suspicious/noExplicitAny: the bench is a dev-only window global
      (window as any).__vision[n](...a),
    [name, args] as const,
  ) as ReturnType<Bench[K]>;

for (const precision of ["float32", "float16"] as const) {
  test(`every layer matches onnxruntime (${precision})`, async ({ page }) => {
    await openBench(page);
    const r = await call(page, "layers", precision);
    const worst = Math.max(...r.layers.map((l) => l.err));
    test.info().annotations.push({
      type: "measured",
      description: `${test.info().project.name} ${r.precision}: input ${r.inputErr}, worst layer ${worst.toExponential(2)}, worst output ${Math.max(...r.finals.map((f) => f.err)).toExponential(2)}, CPU ${r.cpuWorst.toExponential(2)}`,
    });
    expect(r.inputErr).toBeLessThan(1e-6);
    const limit = precision === "float32" ? 5e-3 : 2e-2;
    for (const l of r.layers) expect(l.err, l.name).toBeLessThan(limit);
    for (const f of r.finals) expect(f.err, f.name).toBeLessThan(limit);
  });

  test(`the astronaut gives OpenCV's face (${precision})`, async ({ page }) => {
    await openBench(page);
    const r = await call(page, "astronaut", precision);
    const worst = (k: "err" | "abs" | "kernel") =>
      Math.max(...r.finals.map((f) => f[k])).toExponential(2);
    test.info().annotations.push({
      type: "measured",
      description: `${test.info().project.name} ${precision}: astronaut vs onnxruntime ${worst("err")} of range (${worst("abs")} absolute), kernels alone ${worst("kernel")}`,
    });
    for (const f of r.finals) {
      // A near-empty output (obj_16 peaks at 0.002 here) is judged by its absolute error.
      expect(Math.min(f.err, f.abs), f.name).toBeLessThan(precision === "float32" ? 5e-3 : 2e-2);
      expect(f.kernel, f.name).toBeLessThan(precision === "float32" ? 1e-4 : 2e-2);
    }
    expect(r.faces).toHaveLength(r.opencv.length);
    r.faces.forEach((f, i) => {
      const want = r.opencv[i];
      f.box.forEach((v, j) => {
        expect(Math.abs(v - (want?.box[j] ?? 0))).toBeLessThan(0.5);
      });
      expect(Math.abs(f.score - (want?.score ?? 0))).toBeLessThan(0.01);
    });
  });
}

test("speed at 640×384", async ({ page }) => {
  await openBench(page);
  const r = await call(page, "speed", 640, 384, 20);
  test.info().annotations.push({
    type: "measured",
    description: `${test.info().project.name}: 640×384 median ${r.median.toFixed(1)} ms, min ${r.min.toFixed(1)} ms on ${r.renderer}`,
  });
  expect(r.median).toBeGreaterThan(0);
});
