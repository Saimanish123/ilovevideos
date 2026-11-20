/**
 * The person finder on TensorFlow.js (ADR-0118): tfjs-core, the WebGL backend with only the kernels
 * this graph uses registered, and the graph-model converter. The model files come from this origin
 * (../../workers/segmenter-assets) and are handed to TF.js from memory, so TF.js itself never
 * fetches anything. Runs in a worker on an OffscreenCanvas WebGL context; no eval (the CSP has no
 * 'unsafe-eval'). Preprocessing as MediaPipe's own graph: the frame stretched to the model's input,
 * RGB in 0 to 1; the output's second channel is the person.
 */
import { addConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Add";
import { avgPoolConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/AvgPool";
import { castConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Cast";
import { concatConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Concat";
import { conv2DConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Conv2D";
import { conv2DBackpropInputConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Conv2DBackpropInput";
import { depthwiseConv2dNativeConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/DepthwiseConv2dNative";
import { fromPixelsConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/FromPixels";
import { fusedConv2DConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/FusedConv2D";
import { fusedDepthwiseConv2DConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/FusedDepthwiseConv2D";
import { identityConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Identity";
import { meanConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Mean";
import { multiplyConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Multiply";
import { packConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Pack";
import { realDivConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/RealDiv";
import { reluConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Relu";
import { relu6Config } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Relu6";
import { reshapeConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Reshape";
import { resizeBilinearConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/ResizeBilinear";
import { sigmoidConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Sigmoid";
import { sliceConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Slice";
import { stridedSliceConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/StridedSlice";
import { subConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Sub";
import { sumConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Sum";
import { transposeConfig } from "@tensorflow/tfjs-backend-webgl/dist/kernels/Transpose";
import "@tensorflow/tfjs-backend-webgl/dist/base";
import { type GraphModel, loadGraphModel } from "@tensorflow/tfjs-converter";
import * as tf from "@tensorflow/tfjs-core";
import { loadSelfieModel } from "../../workers/segmenter-assets";
import type { ModelKind } from "./options";
import type { Segmenter } from "./segmenter";

let kernelsRegistered = false;
let backendReady: Promise<void> | undefined;

/** The WebGL backend with the kernels the selfie graph and its pre- and post-processing use. */
function ready(): Promise<void> {
  if (!kernelsRegistered) {
    for (const k of [
      addConfig,
      avgPoolConfig,
      castConfig,
      concatConfig,
      conv2DConfig,
      conv2DBackpropInputConfig,
      depthwiseConv2dNativeConfig,
      fromPixelsConfig,
      fusedConv2DConfig,
      fusedDepthwiseConv2DConfig,
      identityConfig,
      meanConfig,
      multiplyConfig,
      packConfig,
      realDivConfig,
      reluConfig,
      relu6Config,
      reshapeConfig,
      resizeBilinearConfig,
      sigmoidConfig,
      sliceConfig,
      stridedSliceConfig,
      subConfig,
      sumConfig,
      transposeConfig,
    ])
      tf.registerKernel(k);
    kernelsRegistered = true;
  }
  if (!backendReady) {
    backendReady = (async () => {
      // No CPU backend is shipped: small tensors stay on the GPU too.
      tf.env().set("WEBGL_CPU_FORWARD", false);
      tf.env().set("PROD", true);
      if (!(await tf.setBackend("webgl")))
        throw new Error("no-webgl: the person finder backend did not start");
      await tf.ready();
    })();
    backendReady.catch(() => {
      backendReady = undefined;
    });
  }
  return backendReady;
}

interface ModelJson {
  modelTopology: unknown;
  format?: string;
  generatedBy?: string;
  convertedBy?: string;
  signature?: unknown;
  userDefinedMetadata?: Record<string, unknown>;
  weightsManifest: { weights: tf.io.WeightsManifestEntry[] }[];
}

/** The first run compiles about 150 shader programs (a second or more); done once, before any frame. */
async function warmUp(model: GraphModel, width: number, height: number) {
  const zeros = tf.zeros([1, height, width, 3]);
  const out = model.execute(zeros) as tf.Tensor;
  try {
    await out.data();
  } finally {
    out.dispose();
    zeros.dispose();
  }
}

export async function createTfjsSegmenter(
  kind: ModelKind,
  size: { width: number; height: number },
): Promise<Segmenter> {
  const [, files] = await Promise.all([ready(), loadSelfieModel(kind)]);
  const json = files.json as ModelJson;
  const model: GraphModel = await loadGraphModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology as tf.io.ModelArtifacts["modelTopology"],
      format: json.format,
      generatedBy: json.generatedBy,
      convertedBy: json.convertedBy,
      signature: json.signature as tf.io.ModelArtifacts["signature"],
      userDefinedMetadata: json.userDefinedMetadata,
      weightSpecs: json.weightsManifest.flatMap((g) => g.weights),
      weightData: files.weights,
    }),
  );
  const { width, height } = size;
  // The model's input when a picture arrives at another size: one small canvas, reused.
  const scratch = new OffscreenCanvas(width, height);
  const c2d = scratch.getContext("2d");
  if (!c2d) throw new Error("no-2d-context: the scratch canvas has no 2D context");
  await warmUp(model, width, height);
  return {
    kind,
    width,
    height,
    async segment(input) {
      // A picture already at the model's size goes to the GPU as it is; others are scaled here.
      let pixels: ImageBitmap | OffscreenCanvas = input;
      if (input.width !== width || input.height !== height) {
        c2d.clearRect(0, 0, width, height);
        c2d.drawImage(input, 0, 0, width, height);
        pixels = scratch;
      }
      const person = tf.tidy(() => {
        // TF.js takes any canvas (it checks for getContext); its types list only the DOM ones.
        const x = tf.div(
          tf.cast(tf.browser.fromPixels(pixels as unknown as HTMLCanvasElement, 3), "float32"),
          255,
        );
        const out = model.execute(tf.reshape(x, [1, height, width, 3])) as tf.Tensor;
        return tf.slice(out, [0, 0, 0, 1], [1, height, width, 1]);
      });
      try {
        return (await person.data()) as Float32Array;
      } finally {
        person.dispose();
      }
    },
    dispose() {
      model.dispose();
    },
  };
}
