/**
 * The vision kit's parity and speed checks, run in a real browser by tests/e2e/vision.spec.ts.
 * Fixtures come from /__vision-fixtures/<name>, which the test serves from tests/fixtures/vision.
 * Dev only.
 */
import { regionsFromTracks } from "@/tools/engines/blur-region/faces";
import { inspect } from "@/tools/engines/mediabunny/shared";
import { runCpu, tensor, toHwc } from "@/tools/engines/vision/cpu";
import { createGlNet, type Precision, visionContext } from "@/tools/engines/vision/gl-net";
import { type ModelFile, readModelFile } from "@/tools/engines/vision/model-file";
import { trackFaces } from "@/tools/engines/vision/track";
import { BOX_OUTPUTS, decodeYunet, LANDMARK_OUTPUTS, nms } from "@/tools/engines/vision/yunet";
import { findFacesInWorker } from "@/tools/workers/face-find-client";

const MODEL = "/models/yunet/yunet-2026may.vnn";

async function file(url: string): Promise<ModelFile> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return readModelFile(await r.arrayBuffer());
}

function relErr(got: Float32Array, want: Float32Array) {
  if (got.length !== want.length) return Number.POSITIVE_INFINITY;
  let diff = 0;
  let range = 1e-6;
  for (let i = 0; i < want.length; i++) {
    diff = Math.max(diff, Math.abs((got[i] ?? 0) - (want[i] ?? 0)));
    range = Math.max(range, Math.abs(want[i] ?? 0));
  }
  return diff / range;
}

/** A CHW BGR 0..255 tensor as an RGBA image (exact: the values are whole numbers). */
function bgrToImage(data: Float32Array, h: number, w: number): ImageData {
  const img = new ImageData(w, h);
  const plane = h * w;
  for (let i = 0; i < plane; i++) {
    img.data[i * 4] = data[2 * plane + i] ?? 0;
    img.data[i * 4 + 1] = data[plane + i] ?? 0;
    img.data[i * 4 + 2] = data[i] ?? 0;
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

const YUNET_INPUT = {
  scale: [255, 255, 255] as [number, number, number],
  bias: [0, 0, 0] as [number, number, number],
  order: "bgr" as const,
};

async function decodeImage(url: string) {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
}

export const bench = {
  /** Every layer and output of the GL net and the CPU reference against onnxruntime (64×64). */
  async layers(precision: Precision) {
    const model = await file(MODEL);
    const ref = await file("/__vision-fixtures/yunet-layers.f32");
    const input = ref.tensor("input");
    const gl = visionContext();
    const net = createGlNet(gl, model, { precision });
    net.keepAll(true);
    const outputs = net.run(
      {
        source: bgrToImage(input, 64, 64),
        sourceWidth: 64,
        sourceHeight: 64,
        width: 64,
        height: 64,
        ...YUNET_INPUT,
      },
      model.outputs.map((o) => o.name),
    );
    const outNames = new Set(model.outputs.map((o) => o.tensor));
    const layers = model.layers.map((l) => {
      const got = net.readLayer(l.out);
      const want = ref.tensor(l.out);
      const data = outNames.has(l.out) ? toHwc(tensor(got.c, got.h, got.w, got.data)) : got.data;
      return { name: l.name, op: l.op, err: relErr(data, want) };
    });
    const inputErr = relErr(net.readLayer("input").data, input);
    const finals = model.outputs.map((o) => ({
      name: o.name,
      err: relErr(outputs.get(o.name)?.data ?? new Float32Array(), ref.tensor(o.name)),
    }));
    // The CPU reference on the same input, for the record.
    const cpu = runCpu(model, tensor(3, 64, 64, input));
    const cpuWorst = Math.max(
      ...model.outputs.map((o) => {
        const t = cpu.get(o.tensor);
        return t ? relErr(toHwc(t), ref.tensor(o.name)) : Number.POSITIVE_INFINITY;
      }),
    );
    net.dispose();
    return { precision: net.precision, inputErr, layers, finals, cpuWorst };
  },

  /** The whole astronaut (512×512): outputs against onnxruntime, faces against OpenCV. */
  async astronaut(precision: Precision) {
    const model = await file(MODEL);
    const ref = await file("/__vision-fixtures/yunet-astronaut.f32");
    const opencv = (await (await fetch("/__vision-fixtures/yunet-opencv.json")).json()) as {
      faces: { box: number[]; score: number }[];
    };
    const bmp = await decodeImage("/__vision-fixtures/astronaut.png");
    const gl = visionContext();
    const net = createGlNet(gl, model, { precision });
    const names = [...BOX_OUTPUTS, ...LANDMARK_OUTPUTS];
    const outs = net.run(
      { source: bmp, sourceWidth: 512, sourceHeight: 512, width: 512, height: 512, ...YUNET_INPUT },
      names,
    );
    // Against onnxruntime (fp32 weights): relative to the range and absolute. Against the CPU path
    // with the same half-float weights: what the kernels alone add.
    const cpuInput = new Float32Array(3 * 512 * 512);
    {
      const c = new OffscreenCanvas(512, 512).getContext("2d");
      if (!c) throw new Error("no 2d");
      c.drawImage(bmp, 0, 0);
      const px = c.getImageData(0, 0, 512, 512).data;
      for (let i = 0; i < 512 * 512; i++) {
        cpuInput[i] = px[i * 4 + 2] ?? 0;
        cpuInput[512 * 512 + i] = px[i * 4 + 1] ?? 0;
        cpuInput[2 * 512 * 512 + i] = px[i * 4] ?? 0;
      }
    }
    const cpu = runCpu(
      model,
      tensor(3, 512, 512, cpuInput),
      names.map((n) => model.outputs.find((o) => o.name === n)?.tensor ?? n),
    );
    const finals = names.map((n) => {
      const got = outs.get(n)?.data ?? new Float32Array();
      const want = ref.tensor(n);
      let abs = 0;
      for (let i = 0; i < want.length; i++)
        abs = Math.max(abs, Math.abs((got[i] ?? 0) - (want[i] ?? 0)));
      const t = cpu.get(model.outputs.find((o) => o.name === n)?.tensor ?? n);
      return {
        name: n,
        err: relErr(got, want),
        abs,
        kernel: t ? relErr(got, toHwc(t)) : Number.POSITIVE_INFINITY,
      };
    });
    const faces = nms(
      decodeYunet((n) => outs.get(n)?.data ?? new Float32Array(), 512, 512, 0.5),
      0.3,
    ).map((f) => ({ box: [f.x, f.y, f.width, f.height], score: f.score }));
    net.dispose();
    return { finals, faces, opencv: opencv.faces };
  },

  /** Milliseconds per run (upload, all layers, read back of the box outputs) at w×h. */
  async speed(width: number, height: number, runs: number, precision: Precision = "float32") {
    const model = await file(MODEL);
    const gl = visionContext();
    const net = createGlNet(gl, model, { precision });
    const canvas = new OffscreenCanvas(width, height);
    const c2d = canvas.getContext("2d");
    if (!c2d) throw new Error("no 2d");
    const times: number[] = [];
    for (let i = 0; i < runs + 3; i++) {
      c2d.fillStyle = `rgb(${(i * 37) % 255}, 90, 140)`;
      c2d.fillRect(0, 0, width, height);
      const t0 = performance.now();
      net.run(
        { source: canvas, sourceWidth: width, sourceHeight: height, width, height, ...YUNET_INPUT },
        BOX_OUTPUTS,
      );
      if (i >= 3) times.push(performance.now() - t0);
    }
    net.dispose();
    times.sort((a, b) => a - b);
    const renderer = (() => {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
    })();
    return { median: times[Math.floor(times.length / 2)], min: times[0], renderer };
  },

  /** Find faces on a fixture video, end to end as the page does it, with the regions it makes. */
  async findFaces(name: string, sampleFps: number) {
    const blob = await (await fetch(`/__vision-fixtures/${name}`)).blob();
    const file = new File([blob], name, { type: "video/mp4" });
    const info = await inspect(file);
    const v = info.video;
    if (!v) throw new Error("no video");
    const result = await findFacesInWorker(file, name, {
      durationSec: info.durationSec,
      startSec: info.startSec ?? 0,
      width: v.width,
      height: v.height,
      sampleFps,
    });
    const tracks = trackFaces(result.samples, undefined, result.cuts);
    const regions = regionsFromTracks({
      tracks,
      source: { width: v.width, height: v.height },
      durationSec: info.durationSec,
      sampleSec: result.sampleSec,
      firstId: 1,
    });
    return {
      result,
      cuts: result.cuts,
      tracks: tracks.length,
      regions,
      width: v.width,
      height: v.height,
      duration: info.durationSec,
    };
  },

  /** Whether the blur renderer's shaders compile here (a check for the region renderer). */
  async blurRenderer() {
    const { createBlurRenderer } = await import("@/tools/engines/blur-region/render");
    try {
      const r = createBlurRenderer(new OffscreenCanvas(64, 64), { width: 64, height: 64 }, 1);
      r?.dispose();
      return r ? "ok" : "null";
    } catch (e) {
      return String(e);
    }
  },
};
