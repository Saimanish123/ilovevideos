/**
 * The sharpen and denoise renderer, in WebGL 2: one set of shaders for the engine worker
 * (OffscreenCanvas, every frame of the file in order) and the page's live preview (a canvas over
 * the video), so the preview shows what the file will hold (ADR-0035, ADR-0081). The numbers come
 * from ./options. No network access.
 *
 * Every frame is first copied into a half-float texture with its brightness in alpha.
 * - Denoise: non-local means over a 5×5 search in this frame and in the previous cleaned frame
 *   (kept from the last call; `reset` forgets it after a seek or at the start), 3×3 patches compared
 *   on brightness, weights exp(−max(d − 2σ², 0) / h²), the pixel itself weighted as its best match.
 * - Sharpen: brightness blurred by a separable Gaussian, the difference scaled by the strength with
 *   small differences (grain) scaled down, the result held within the 3×3 neighbourhood's range
 *   plus a margin, and the change added to red, green and blue alike.
 */
import {
  drawRect,
  type GlCanvas,
  loseContext,
  type Program,
  program,
  RECT_VERTEX,
  type Target,
  target,
  texture,
  upload,
  webgl2,
} from "../overlay/gl";
import {
  type ClarityOptions,
  denoiseH,
  kernelRadius,
  MIN_NOISE,
  PATCH,
  SEARCH,
  SHARPEN_CORE,
  SHARPEN_LIMIT,
} from "./options";

const HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 px;
out vec4 o;
uniform ivec2 size;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
vec4 at(sampler2D t, ivec2 p) { return texelFetch(t, clamp(p, ivec2(0), size - 1), 0); }
`;

/** The frame, brightness in alpha. */
const PREP = `${HEAD}
uniform sampler2D src;
void main() {
  vec3 c = clamp(at(src, ivec2(px)).rgb, 0.0, 1.0);
  o = vec4(c, dot(c, LUMA));
}`;

const NLM = `${HEAD}
uniform sampler2D cur;
uniform sampler2D prev;
uniform bool usePrev;
uniform float h2;
uniform float sig2;
const int S = ${SEARCH};
const int P = ${PATCH};
const float PN = float((2 * P + 1) * (2 * P + 1));
float centre[(2 * P + 1) * (2 * P + 1)];
vec3 acc = vec3(0.0);
float wsum = 0.0;
float wmax = 0.0;
void visit(sampler2D t, ivec2 p, bool self) {
  for (int dy = -S; dy <= S; dy++) {
    for (int dx = -S; dx <= S; dx++) {
      if (self && dx == 0 && dy == 0) continue;
      ivec2 q = p + ivec2(dx, dy);
      float d = 0.0;
      int m = 0;
      for (int py = -P; py <= P; py++) {
        for (int pxo = -P; pxo <= P; pxo++) {
          float e = centre[m] - at(t, q + ivec2(pxo, py)).a;
          d += e * e;
          m++;
        }
      }
      float w = exp(-max(d / PN - 2.0 * sig2, 0.0) / h2);
      acc += w * at(t, q).rgb;
      wsum += w;
      wmax = max(wmax, w);
    }
  }
}
void main() {
  ivec2 p = ivec2(px);
  int m = 0;
  for (int py = -P; py <= P; py++) {
    for (int pxo = -P; pxo <= P; pxo++) {
      centre[m] = at(cur, p + ivec2(pxo, py)).a;
      m++;
    }
  }
  visit(cur, p, true);
  if (usePrev) visit(prev, p, false);
  vec4 c = at(cur, p);
  float wc = max(wmax, 1e-3);
  vec3 r = (acc + wc * c.rgb) / (wsum + wc);
  o = vec4(r, dot(r, LUMA));
}`;

/** One direction of the Gaussian on brightness (alpha in, red out; red in, red out). */
const BLUR = `${HEAD}
uniform sampler2D src;
uniform ivec2 dir;
uniform int radius;
uniform float weights[13];
uniform bool fromAlpha;
void main() {
  ivec2 p = ivec2(px);
  float s = 0.0;
  for (int k = -12; k <= 12; k++) {
    if (k < -radius || k > radius) continue;
    vec4 v = at(src, p + dir * k);
    s += weights[abs(k)] * (fromAlpha ? v.a : v.r);
  }
  o = vec4(s, 0.0, 0.0, 1.0);
}`;

const SHARPEN = `${HEAD}
uniform sampler2D cur;
uniform sampler2D blurred;
uniform float amount;
uniform float core;
uniform float limit;
void main() {
  ivec2 p = ivec2(px);
  vec4 c = at(cur, p);
  float y = c.a;
  float d = y - at(blurred, p).r;
  float ad = abs(d);
  if (ad < core) d *= ad / core;
  float lo = 1.0;
  float hi = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      float v = at(cur, p + ivec2(dx, dy)).a;
      lo = min(lo, v);
      hi = max(hi, v);
    }
  }
  float ys = clamp(y + amount * d, lo - limit, hi + limit);
  o = vec4(clamp(c.rgb + (ys - y), 0.0, 1.0), 1.0);
}`;

/** The cleaned frame to the canvas, opaque. */
const SHOW = `${HEAD}
uniform sampler2D src;
void main() {
  o = vec4(clamp(at(src, ivec2(px)).rgb, 0.0, 1.0), 1.0);
}`;

export interface ClarityRenderer {
  readonly canvas: GlCanvas;
  /**
   * Draws `source` (a frame at the renderer's size) through the job; the canvas then holds the
   * result. `scale` is the preview's size over the file's (sizes and grain scale with it).
   */
  render(source: TexImageSource, o: ClarityOptions, scale?: number): void;
  /** Forgets the previous frame (the start of a run, a seek): the next frame is cleaned alone. */
  reset(): void;
  dispose(): void;
}

/** Gaussian weights for taps 0..12 (normalised over −r..r). */
export function gaussianWeights(sigma: number): { radius: number; weights: Float32Array } {
  const radius = kernelRadius(sigma);
  const weights = new Float32Array(13);
  let sum = 0;
  for (let k = 0; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    weights[k] = w;
    sum += k === 0 ? w : 2 * w;
  }
  for (let k = 0; k <= radius; k++) weights[k] = (weights[k] as number) / sum;
  return { radius, weights };
}

export function createClarityRenderer(
  canvas: GlCanvas,
  size: { width: number; height: number },
): ClarityRenderer | null {
  canvas.width = size.width;
  canvas.height = size.height;
  const gl = webgl2(canvas);
  if (!gl) return null;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const programs: Program[] = [];
  const make = (fragment: string) => {
    const p = program(gl, RECT_VERTEX, fragment);
    programs.push(p);
    return p;
  };
  const prep = make(PREP);
  const nlm = make(NLM);
  const blur = make(BLUR);
  const sharpen = make(SHARPEN);
  const show = make(SHOW);

  const src = texture(gl, size.width, size.height, "nearest");
  const cur = target(gl, size.width, size.height, true);
  // Denoise ping-pongs between two targets: one is the previous cleaned frame, one is drawn.
  const clean: [Target, Target] = [
    target(gl, size.width, size.height, true),
    target(gl, size.width, size.height, true),
  ];
  const blurA = target(gl, size.width, size.height, true);
  const blurB = target(gl, size.width, size.height, true);
  let drawn = 0;
  let hasPrev = false;
  const full = { x: 0, y: 0, width: size.width, height: size.height };

  const bind = (unit: number, tex: WebGLTexture, p: Program, name: string) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(p.u(name), unit);
  };
  const sizeUniform = (p: Program) => gl.uniform2i(p.u("size"), size.width, size.height);

  return {
    canvas,
    render(source, o, scale = 1) {
      upload(gl, src, source);
      drawRect(gl, prep, cur, size, full, () => {
        sizeUniform(prep);
        bind(0, src, prep, "src");
      });
      if (o.job === "denoise") {
        const into = clean[drawn % 2] as Target;
        const before = clean[(drawn + 1) % 2] as Target;
        const noise = Math.max(MIN_NOISE, (o.noise ?? 0) * scale);
        const h = denoiseH(noise, o.strength);
        drawRect(gl, nlm, into, size, full, () => {
          sizeUniform(nlm);
          bind(0, cur.texture, nlm, "cur");
          bind(1, before.texture, nlm, "prev");
          gl.uniform1i(nlm.u("usePrev"), hasPrev ? 1 : 0);
          gl.uniform1f(nlm.u("h2"), h * h);
          gl.uniform1f(nlm.u("sig2"), (noise / 255) ** 2);
        });
        drawRect(gl, show, null, size, full, () => {
          sizeUniform(show);
          bind(0, into.texture, show, "src");
        });
        hasPrev = true;
        drawn++;
        return;
      }
      const { radius, weights } = gaussianWeights(Math.max(0.3, o.radius * scale));
      for (const [from, into, dir, alpha] of [
        [cur, blurA, [1, 0], true],
        [blurA, blurB, [0, 1], false],
      ] as const) {
        drawRect(gl, blur, into, size, full, () => {
          sizeUniform(blur);
          bind(0, from.texture, blur, "src");
          gl.uniform2i(blur.u("dir"), dir[0], dir[1]);
          gl.uniform1i(blur.u("radius"), radius);
          gl.uniform1fv(blur.u("weights"), weights);
          gl.uniform1i(blur.u("fromAlpha"), alpha ? 1 : 0);
        });
      }
      drawRect(gl, sharpen, null, size, full, () => {
        sizeUniform(sharpen);
        bind(0, cur.texture, sharpen, "cur");
        bind(1, blurB.texture, sharpen, "blurred");
        gl.uniform1f(sharpen.u("amount"), o.strength);
        gl.uniform1f(sharpen.u("core"), SHARPEN_CORE / 255);
        gl.uniform1f(sharpen.u("limit"), SHARPEN_LIMIT / 255);
      });
    },
    reset() {
      hasPrev = false;
    },
    dispose() {
      for (const t of [cur, ...clean, blurA, blurB]) {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.texture);
      }
      gl.deleteTexture(src);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      for (const p of programs) gl.deleteProgram(p.program);
      loseContext(gl);
    },
  };
}
