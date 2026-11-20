/**
 * The vision kit's WebGL 2 runtime: runs a `.vnn` network (./model-file) on the GPU with six
 * fragment-shader kernels (image to tensor, 1×1 convolution, k×k convolution, depthwise k×k
 * convolution, 2×2 max pool, nearest 2× upsample plus add), each fusing its bias and activation
 * (none, ReLU, sigmoid). Works in a worker (OffscreenCanvas) and on a page. No network access.
 *
 * Tensors live in float render targets (RGBA32F; RGBA16F where asked or where 32-bit float
 * targets are missing), four channels per texel. A tensor of C channels is ceil(C / 4) tiles of
 * W×H laid out in a grid `cols` wide, so a texture stays about the size of the network's input.
 * Weights are packed once into RGBA32F textures read with texelFetch (no filtering, no extension).
 * Every coordinate is an integer texel; row 0 is the top of the picture throughout (no flips).
 *
 * Parity with the official ONNX model is tested in tests/e2e/vision.spec.ts (per layer and final).
 */
import type { ConvLayer, Layer, ModelFile } from "./model-file";
import { layersFor } from "./model-file";

export type Precision = "float32" | "float16";

export class VisionError extends Error {
  constructor(
    readonly code: "no-webgl2" | "no-float-targets" | "too-large" | "context-lost",
    message: string,
  ) {
    super(message);
  }
}

/** Which float render targets this context can draw into (checked by making one). */
export function floatTargets(gl: WebGL2RenderingContext): { float32: boolean; float16: boolean } {
  if (!gl.getExtension("EXT_color_buffer_float")) {
    const half = !!gl.getExtension("EXT_color_buffer_half_float") && probe(gl, gl.RGBA16F);
    return { float32: false, float16: half };
  }
  return { float32: probe(gl, gl.RGBA32F), float16: probe(gl, gl.RGBA16F) };
}

function probe(gl: WebGL2RenderingContext, format: number): boolean {
  const t = gl.createTexture();
  const f = gl.createFramebuffer();
  try {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, 4, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    return false;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f);
    gl.deleteTexture(t);
  }
}

/** A WebGL 2 context of its own for inference (a 1×1 canvas: every draw goes to a target). */
export function visionContext(): WebGL2RenderingContext {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1)
      : typeof document !== "undefined"
        ? document.createElement("canvas")
        : undefined;
  const gl = canvas?.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  }) as WebGL2RenderingContext | null | undefined;
  if (!gl) throw new VisionError("no-webgl2", "This browser cannot run the face finder.");
  return gl;
}

// Shaders ------------------------------------------------------------------------------------------

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Shared by every kernel: where this fragment is in the output tensor, and tensor reads. */
const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform ivec4 yg; // output: w, h, cols, groups
uniform int act;  // 0 none, 1 relu, 2 sigmoid
out vec4 o;
ivec3 here() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int tx = p.x / yg.x;
  int ty = p.y / yg.y;
  return ivec3(ty * yg.z + tx, p.x - tx * yg.x, p.y - ty * yg.y);
}
vec4 activate(vec4 v) {
  if (act == 1) return max(v, 0.0);
  if (act == 2) return 1.0 / (1.0 + exp(-v));
  return v;
}
vec4 at(sampler2D t, ivec4 g, int c, int x, int y) {
  if (x < 0 || y < 0 || x >= g.x || y >= g.y) return vec4(0.0);
  return texelFetch(t, ivec2((c % g.z) * g.x + x, (c / g.z) * g.y + y), 0);
}
`;

const INPUT = `${HEAD}
uniform sampler2D img;
uniform vec4 src;     // source rectangle in uv: x, y, w, h
uniform ivec2 content; // tensor pixels the source fills (the rest is zero)
uniform vec3 scale;
uniform vec3 bias;
uniform int bgr;
uniform float lod;    // mip level: source pixels per tensor pixel, as a power of two
void main() {
  ivec3 h = here();
  if (h.x != 0 || h.y >= content.x || h.z >= content.y) { o = vec4(0.0); return; }
  vec2 uv = src.xy + (vec2(h.yz) + 0.5) / vec2(content) * src.zw;
  vec3 c = textureLod(img, uv, lod).rgb;
  if (bgr == 1) c = c.bgr;
  o = vec4(c * scale + bias, 0.0);
}`;

const CONV1 = `${HEAD}
uniform sampler2D X;
uniform ivec4 xg;
uniform sampler2D W;
uniform int gin;
void main() {
  ivec3 h = here();
  if (h.x >= yg.w) { o = vec4(0.0); return; }
  vec4 s = texelFetch(W, ivec2(gin * 4, h.x), 0);
  for (int i = 0; i < gin; i++) {
    vec4 v = texelFetch(X, ivec2((i % xg.z) * xg.x + h.y, (i / xg.z) * xg.y + h.z), 0);
    int b = i * 4;
    s += texelFetch(W, ivec2(b, h.x), 0) * v.x + texelFetch(W, ivec2(b + 1, h.x), 0) * v.y
       + texelFetch(W, ivec2(b + 2, h.x), 0) * v.z + texelFetch(W, ivec2(b + 3, h.x), 0) * v.w;
  }
  o = activate(s);
}`;

const CONVK = `${HEAD}
uniform sampler2D X;
uniform ivec4 xg;
uniform sampler2D W;
uniform int gin;
uniform ivec3 ksp; // kernel, stride, pad
void main() {
  ivec3 h = here();
  if (h.x >= yg.w) { o = vec4(0.0); return; }
  int k = ksp.x;
  vec4 s = texelFetch(W, ivec2(k * k * gin * 4, h.x), 0);
  for (int ky = 0; ky < k; ky++)
    for (int kx = 0; kx < k; kx++) {
      int x = h.y * ksp.y - ksp.z + kx;
      int y = h.z * ksp.y - ksp.z + ky;
      if (x < 0 || y < 0 || x >= xg.x || y >= xg.y) continue;
      for (int i = 0; i < gin; i++) {
        vec4 v = texelFetch(X, ivec2((i % xg.z) * xg.x + x, (i / xg.z) * xg.y + y), 0);
        int b = ((ky * k + kx) * gin + i) * 4;
        s += texelFetch(W, ivec2(b, h.x), 0) * v.x + texelFetch(W, ivec2(b + 1, h.x), 0) * v.y
           + texelFetch(W, ivec2(b + 2, h.x), 0) * v.z + texelFetch(W, ivec2(b + 3, h.x), 0) * v.w;
      }
    }
  o = activate(s);
}`;

const DEPTHWISE = `${HEAD}
uniform sampler2D X;
uniform ivec4 xg;
uniform sampler2D W;
uniform ivec3 ksp;
void main() {
  ivec3 h = here();
  if (h.x >= yg.w) { o = vec4(0.0); return; }
  int k = ksp.x;
  vec4 s = texelFetch(W, ivec2(k * k, h.x), 0);
  for (int ky = 0; ky < k; ky++)
    for (int kx = 0; kx < k; kx++)
      s += texelFetch(W, ivec2(ky * k + kx, h.x), 0)
         * at(X, xg, h.x, h.y * ksp.y - ksp.z + kx, h.z * ksp.y - ksp.z + ky);
  o = activate(s);
}`;

const MAXPOOL = `${HEAD}
uniform sampler2D X;
uniform ivec4 xg;
void main() {
  ivec3 h = here();
  if (h.x >= yg.w) { o = vec4(0.0); return; }
  int x = h.y * 2;
  int y = h.z * 2;
  o = max(max(at(X, xg, h.x, x, y), at(X, xg, h.x, x + 1, y)),
          max(at(X, xg, h.x, x, y + 1), at(X, xg, h.x, x + 1, y + 1)));
}`;

const UPADD = `${HEAD}
uniform sampler2D A;
uniform ivec4 ag;
uniform sampler2D B;
uniform ivec4 bg;
void main() {
  ivec3 h = here();
  if (h.x >= yg.w) { o = vec4(0.0); return; }
  o = at(A, ag, h.x, h.y, h.z) + at(B, bg, h.x, min(h.y / 2, bg.x - 1), min(h.z / 2, bg.y - 1));
}`;

// Runtime ------------------------------------------------------------------------------------------

interface Prog {
  p: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
}

function compile(gl: WebGL2RenderingContext, fragment: string): Prog {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("WebGL: no shader");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(`WebGL shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram();
  if (!p) throw new Error("WebGL: no program");
  const vs = shader(gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(`WebGL link: ${gl.getProgramInfoLog(p)}`);
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u: (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name) ?? null;
    },
  };
}

/** Shape of a tensor on the GPU. */
export interface Geometry {
  c: number;
  h: number;
  w: number;
  groups: number;
  cols: number;
  rows: number;
}

export function geometry(c: number, h: number, w: number): Geometry {
  const groups = Math.ceil(c / 4);
  const cols = Math.ceil(Math.sqrt(groups));
  return { c, h, w, groups, cols, rows: Math.ceil(groups / cols) };
}

interface GpuTensor extends Geometry {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  key: string;
}

/** Channels convolved one by one (a 1-in, 1-out convolution is too). */
export const isDepthwise = (l: Pick<ConvLayer, "group" | "cin" | "cout">) =>
  l.group !== 1 || (l.cin === 1 && l.cout === 1);

/**
 * Packs conv weights for the shaders. Full and 1×1: one row per output group, four texels (the
 * columns of a 4×4 block, one per input channel) per input group and tap, then the bias.
 * Depthwise: one row per group, a texel per tap, then the bias.
 */
export function packConv(l: ConvLayer, w: Float32Array, b: Float32Array) {
  const gout = Math.ceil(l.cout / 4);
  const kk = l.k * l.k;
  if (isDepthwise(l)) {
    const width = kk + 1;
    const data = new Float32Array(width * gout * 4);
    for (let o = 0; o < l.cout; o++) {
      const row = Math.floor(o / 4) * width;
      for (let t = 0; t < kk; t++) data[(row + t) * 4 + (o % 4)] = w[o * kk + t] ?? 0;
      data[(row + kk) * 4 + (o % 4)] = b[o] ?? 0;
    }
    return { data, width, height: gout };
  }
  const gin = Math.ceil(l.cin / 4);
  const width = kk * gin * 4 + 1;
  const data = new Float32Array(width * gout * 4);
  for (let o = 0; o < l.cout; o++) {
    const row = Math.floor(o / 4) * width;
    for (let i = 0; i < l.cin; i++)
      for (let t = 0; t < kk; t++) {
        const texel = (t * gin + Math.floor(i / 4)) * 4 + (i % 4);
        data[(row + texel) * 4 + (o % 4)] = w[(o * l.cin + i) * kk + t] ?? 0;
      }
    data[(row + width - 1) * 4 + (o % 4)] = b[o] ?? 0;
  }
  return { data, width, height: gout };
}

/** How the picture becomes the input tensor. */
export interface InputSpec {
  /** Anything WebGL can upload: a VideoFrame, ImageBitmap, canvas, video or image element. */
  source: TexImageSource;
  /** Its size in pixels. */
  sourceWidth: number;
  sourceHeight: number;
  /** The part of the source to use, in source pixels (default: all of it). */
  rect?: { x: number; y: number; width: number; height: number };
  /** Tensor size (what the network runs at). */
  width: number;
  height: number;
  /** The tensor pixels the rectangle fills, from the top left (default: all); the rest is zero. */
  contentWidth?: number;
  contentHeight?: number;
  /** Per channel: value = colour (0 to 1) × scale + bias. */
  scale: [number, number, number];
  bias: [number, number, number];
  /** Channel order of the tensor (YuNet takes BGR, as OpenCV reads images). */
  order: "rgb" | "bgr";
  /** The source is the one the previous run uploaded (tiles of one frame): not uploaded again. */
  sameSource?: boolean;
}

/** A network output, channels last (the ONNX layout): `data[(y * w + x) * c + channel]`. */
export interface Output {
  c: number;
  h: number;
  w: number;
  data: Float32Array;
}

export interface GlNet {
  readonly precision: Precision;
  /** Runs the network on one picture and reads back the named outputs (`ModelFile.outputs`). */
  run(input: InputSpec, outputs: string[]): Map<string, Output>;
  /** Reads back any layer output of the last run, CHW (for parity tests). */
  readLayer(name: string): { c: number; h: number; w: number; data: Float32Array };
  /** Keeps every layer output of the next runs readable (parity tests); off by default. */
  keepAll(on: boolean): void;
  dispose(): void;
}

export interface GlNetOptions {
  /** Forces half-float tensors (the fallback where 32-bit float targets are missing). */
  precision?: Precision;
}

/**
 * Compiles the kernels and uploads `model`'s weights into `gl`. Throws `VisionError` where the
 * context cannot render to float textures.
 */
export function createGlNet(
  gl: WebGL2RenderingContext,
  model: ModelFile,
  options: GlNetOptions = {},
): GlNet {
  const support = floatTargets(gl);
  let precision: Precision;
  if (options.precision === "float16" || !support.float32) {
    if (!support.float16)
      throw new VisionError(
        "no-float-targets",
        "This browser's graphics cannot run the face finder.",
      );
    precision = "float16";
  } else precision = "float32";
  const format = precision === "float32" ? gl.RGBA32F : gl.RGBA16F;
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

  const progs = {
    input: compile(gl, INPUT),
    conv1: compile(gl, CONV1),
    convk: compile(gl, CONVK),
    dw: compile(gl, DEPTHWISE),
    pool: compile(gl, MAXPOOL),
    upadd: compile(gl, UPADD),
  };
  const vao = gl.createVertexArray();

  // Weights, once.
  const weights = new Map<string, WebGLTexture>();
  for (const l of model.layers) {
    if (l.op !== "conv") continue;
    const packed = packConv(l, model.tensor(l.w), model.tensor(l.b));
    if (packed.width > maxSize) throw new VisionError("too-large", `Layer ${l.name} is too wide.`);
    const t = gl.createTexture();
    if (!t) throw new Error("WebGL: no texture");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      packed.width,
      packed.height,
      0,
      gl.RGBA,
      gl.FLOAT,
      packed.data,
    );
    weights.set(l.name, t);
  }

  // The uploaded picture, mipmapped so a large frame is averaged, not skipped, when shrunk.
  const image = gl.createTexture();
  if (!image) throw new Error("WebGL: no texture");
  gl.bindTexture(gl.TEXTURE_2D, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Render targets, pooled by texture size and reused once their last reader has run.
  const free = new Map<string, GpuTensor[]>();
  const allocate = (g: Geometry): GpuTensor => {
    const tw = g.cols * g.w;
    const th = g.rows * g.h;
    if (tw > maxSize || th > maxSize)
      throw new VisionError("too-large", "The picture is too large for this GPU.");
    const key = `${tw}x${th}`;
    const pooled = free.get(key)?.pop();
    if (pooled) return { ...pooled, ...g, key };
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error("WebGL: no target");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, tw, th);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { ...g, tex, fbo, key };
  };
  const release = (t: GpuTensor) => {
    const list = free.get(t.key) ?? [];
    list.push(t);
    free.set(t.key, list);
  };

  let live = new Map<string, GpuTensor>();
  let keep = false;
  let uploaded = false;

  const bindTensor = (p: Prog, sampler: string, geo: string, t: GpuTensor, unit: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(p.u(sampler), unit);
    gl.uniform4i(p.u(geo), t.w, t.h, t.cols, t.groups);
  };
  const draw = (p: Prog, out: GpuTensor, act: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, out.cols * out.w, out.rows * out.h);
    gl.uniform4i(p.u("yg"), out.w, out.h, out.cols, out.groups);
    gl.uniform1i(p.u("act"), act);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Nothing stays bound, so a target reused from the pool is never also a bound input.
    for (const unit of [1, 0]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  };
  const actCode = (a: ConvLayer["act"]) => (a === "relu" ? 1 : a === "sigmoid" ? 2 : 0);

  const runLayer = (l: Layer, get: (n: string) => GpuTensor): GpuTensor => {
    if (l.op === "conv") {
      const x = get(l.in);
      const oh = Math.floor((x.h + 2 * l.pad - l.k) / l.stride) + 1;
      const ow = Math.floor((x.w + 2 * l.pad - l.k) / l.stride) + 1;
      const out = allocate(geometry(l.cout, oh, ow));
      const p = isDepthwise(l) ? progs.dw : l.k === 1 && l.stride === 1 ? progs.conv1 : progs.convk;
      gl.useProgram(p.p);
      bindTensor(p, "X", "xg", x, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, weights.get(l.name) ?? null);
      gl.uniform1i(p.u("W"), 1);
      if (p !== progs.dw) gl.uniform1i(p.u("gin"), Math.ceil(l.cin / 4));
      if (p !== progs.conv1) gl.uniform3i(p.u("ksp"), l.k, l.stride, l.pad);
      draw(p, out, actCode(l.act));
      return out;
    }
    if (l.op === "maxpool") {
      const x = get(l.in);
      const out = allocate(geometry(x.c, Math.floor(x.h / 2), Math.floor(x.w / 2)));
      gl.useProgram(progs.pool.p);
      bindTensor(progs.pool, "X", "xg", x, 0);
      draw(progs.pool, out, 0);
      return out;
    }
    const a = get(l.in[0]);
    const b = get(l.in[1]);
    const out = allocate(geometry(a.c, a.h, a.w));
    gl.useProgram(progs.upadd.p);
    bindTensor(progs.upadd, "A", "ag", a, 0);
    bindTensor(progs.upadd, "B", "bg", b, 1);
    draw(progs.upadd, out, 0);
    return out;
  };

  const readRaw = (t: GpuTensor) => {
    const tw = t.cols * t.w;
    const th = t.rows * t.h;
    const raw = new Float32Array(tw * th * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(0, 0, tw, th, gl.RGBA, gl.FLOAT, raw);
    return { raw, tw };
  };
  const channel = (
    t: GpuTensor,
    raw: Float32Array,
    tw: number,
    c: number,
    x: number,
    y: number,
  ) => {
    const g = c >> 2;
    const px = (g % t.cols) * t.w + x;
    const py = Math.floor(g / t.cols) * t.h + y;
    return raw[(py * tw + px) * 4 + (c & 3)] ?? 0;
  };

  const checkLost = () => {
    if (gl.isContextLost())
      throw new VisionError("context-lost", "The GPU stopped the face finder (context lost).");
  };

  return {
    precision,
    keepAll(on) {
      keep = on;
    },
    run(input, wanted) {
      checkLost();
      for (const t of live.values()) release(t);
      live = new Map();
      const outs = wanted.map((name) => {
        const o = model.outputs.find((x) => x.name === name);
        if (!o) throw new Error(`No output ${name}`);
        return o;
      });
      const layers = keep
        ? model.layers
        : layersFor(
            model.layers,
            outs.map((o) => o.tensor),
          );
      // Last reader of every tensor, so targets can be reused.
      const lastUse = new Map<string, number>();
      layers.forEach((l, i) => {
        for (const n of Array.isArray(l.in) ? l.in : [l.in]) lastUse.set(n, i);
      });
      const keepNames = new Set(outs.map((o) => o.tensor));

      // Picture to tensor.
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      // Allocated first: making a target binds its texture, which must not replace the picture.
      const x0 = allocate(geometry(model.input.channels, input.height, input.width));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, image);
      if (!input.sameSource || !uploaded) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.source);
        gl.generateMipmap(gl.TEXTURE_2D);
        uploaded = true;
      }
      const r = input.rect ?? { x: 0, y: 0, width: input.sourceWidth, height: input.sourceHeight };
      const p = progs.input;
      gl.useProgram(p.p);
      gl.uniform1i(p.u("img"), 0);
      gl.uniform4f(
        p.u("src"),
        r.x / input.sourceWidth,
        r.y / input.sourceHeight,
        r.width / input.sourceWidth,
        r.height / input.sourceHeight,
      );
      const cw = input.contentWidth ?? input.width;
      const ch = input.contentHeight ?? input.height;
      gl.uniform2i(p.u("content"), cw, ch);
      gl.uniform1f(p.u("lod"), Math.max(0, Math.log2(Math.max(r.width / cw, r.height / ch))));
      gl.uniform3f(p.u("scale"), ...input.scale);
      gl.uniform3f(p.u("bias"), ...input.bias);
      gl.uniform1i(p.u("bgr"), input.order === "bgr" ? 1 : 0);
      draw(p, x0, 0);
      live.set(model.input.name, x0);

      const get = (n: string) => {
        const t = live.get(n);
        if (!t) throw new Error(`Tensor ${n} not computed`);
        return t;
      };
      layers.forEach((l, i) => {
        live.set(l.out, runLayer(l, get));
        if (keep) return;
        for (const n of Array.isArray(l.in) ? l.in : [l.in]) {
          if (lastUse.get(n) === i && !keepNames.has(n)) {
            const t = live.get(n);
            if (t) release(t);
            live.delete(n);
          }
        }
      });

      const result = new Map<string, Output>();
      for (const o of outs) {
        const t = get(o.tensor);
        const { raw, tw } = readRaw(t);
        const data = new Float32Array(t.c * t.h * t.w);
        for (let y = 0; y < t.h; y++)
          for (let x = 0; x < t.w; x++)
            for (let c = 0; c < t.c; c++)
              data[(y * t.w + x) * t.c + c] = channel(t, raw, tw, c, x, y);
        result.set(o.name, { c: t.c, h: t.h, w: t.w, data });
      }
      checkLost();
      return result;
    },
    readLayer(name) {
      const t = live.get(name);
      if (!t) throw new Error(`Layer ${name} was not kept (keepAll(true) before run)`);
      const { raw, tw } = readRaw(t);
      const data = new Float32Array(t.c * t.h * t.w);
      for (let c = 0; c < t.c; c++)
        for (let y = 0; y < t.h; y++)
          for (let x = 0; x < t.w; x++)
            data[(c * t.h + y) * t.w + x] = channel(t, raw, tw, c, x, y);
      return { c: t.c, h: t.h, w: t.w, data };
    },
    dispose() {
      const all = [...live.values(), ...[...free.values()].flat()];
      for (const t of all) {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.tex);
      }
      live.clear();
      free.clear();
      for (const t of weights.values()) gl.deleteTexture(t);
      gl.deleteTexture(image);
      gl.deleteVertexArray(vao);
      for (const p of Object.values(progs)) gl.deleteProgram(p.p);
    },
  };
}
