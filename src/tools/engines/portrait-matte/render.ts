/**
 * The matte and the composite in WebGL 2 (./options explains the method), for the engine worker (an
 * OffscreenCanvas at the output size) and the page's live preview (a canvas over the video, smaller
 * by `scale`): one set of shaders, so the preview shows what the file will hold (ADR-0035).
 *
 * Passes per frame:
 * 1. Guide (working size, long edge 512): the frame's luma I and the model's mask p, with I·p and I².
 * 2. Box means of those, then the guided filter's per-pixel line q = a·I + b fitted to them (He et
 *    al.), and box means of a and b. Read back at full size against the full-size luma, the mask
 *    follows the picture's own edges ("fast guided filter").
 * 3. The background as it was, estimated around the person (blur size): the frame weighted by how
 *    much background each pixel is, blurred, divided by the blurred weights, so the person's colours
 *    never smear into it. In blur mode this is the result's background; in replace mode it is taken
 *    out of the soft edge (edge pixels hold some old background) before the new one goes in.
 * 4. The output: the edge ramp (`edge`, `shift`) on the refined mask, then frame over background.
 */
import {
  drawRect,
  freeTarget,
  type GlCanvas,
  loseContext,
  type Program,
  program,
  RECT_VERTEX,
  type Target,
  target,
  texture,
  unitQuad,
  upload,
  webgl2,
} from "../overlay/gl";
import { blurSigma, edgeRamp, type PortraitMatteOptions, type Size } from "./options";

/** Longest edge of the guided filter's working size. */
export const GUIDE_EDGE = 512;
/** Box radius of the guided filter at the working size, and its regulariser. */
const GUIDE_EPS = 0.002;
/** Largest blur sigma run at full detail; larger blurs run on a smaller copy. */
const MAX_SIGMA_TEXELS = 6;
/** The old background behind soft edges, in replace mode: a blur of 1.5% of the shorter edge. */
const DECONTAMINATE_STRENGTH = 30;

const LUMA = "float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }";

const GUIDE = `#version 300 es
precision highp float;
uniform sampler2D frame;
uniform sampler2D mask;
uniform vec2 draw;
uniform vec2 toCanvas;
in vec2 px;
out vec4 color;
${LUMA}
void main() {
  vec2 uv = px * toCanvas / draw;
  float i = luma(texture(frame, uv).rgb);
  float p = texture(mask, uv).r;
  color = vec4(i, p, i * p, i * i);
}`;

const BOX = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 dir;
uniform int radius;
uniform vec2 valid;
in vec2 px;
out vec4 color;
void main() {
  vec2 p = floor(px);
  vec4 sum = vec4(0.0);
  float n = 0.0;
  for (int i = -16; i <= 16; i++) {
    if (i < -radius || i > radius) continue;
    vec2 q = p + dir * float(i);
    if (q.x < 0.0 || q.y < 0.0 || q.x >= valid.x || q.y >= valid.y) continue;
    sum += texelFetch(src, ivec2(q), 0);
    n += 1.0;
  }
  color = sum / max(n, 1.0);
}`;

const COEF = `#version 300 es
precision highp float;
uniform sampler2D means;
uniform float eps;
in vec2 px;
out vec4 color;
void main() {
  vec4 m = texelFetch(means, ivec2(floor(px)), 0);
  float varI = max(0.0, m.a - m.r * m.r);
  float a = (m.b - m.r * m.g) / (varI + eps);
  float b = m.g - a * m.r;
  color = vec4(a, b, 0.0, 1.0);
}`;

/** The refined mask at a canvas pixel, shared by the background and output passes. */
const REFINED = `
uniform sampler2D frame;
uniform sampler2D mask;
uniform sampler2D coef;
uniform vec2 draw;
uniform vec2 coefScale;
uniform int refine;
${LUMA}
float refined(vec2 canvasPx, vec3 c) {
  vec2 uv = canvasPx / draw;
  if (refine == 0) return texture(mask, uv).r;
  vec2 ab = texture(coef, canvasPx * coefScale).rg;
  return clamp(ab.x * luma(c) + ab.y, 0.0, 1.0);
}`;

const BG_WEIGHT = `#version 300 es
precision highp float;
uniform vec2 toCanvas;
uniform float lo;
uniform float hi;
in vec2 px;
out vec4 color;
${REFINED}
void main() {
  vec2 c = px * toCanvas;
  vec3 f = texture(frame, c / draw).rgb;
  // Background share, with the edge left out a little more than the output does.
  float w = 1.0 - smoothstep(lo - 0.15, hi, refined(c, f));
  color = vec4(f * w, w);
}`;

const GAUSS = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 dir;
uniform float sigma;
uniform int radius;
uniform vec2 valid;
in vec2 px;
out vec4 color;
void main() {
  vec2 p = floor(px);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -24; i <= 24; i++) {
    if (i < -radius || i > radius) continue;
    float w = exp(-float(i * i) / (2.0 * sigma * sigma));
    vec2 q = clamp(p + dir * float(i), vec2(0.0), valid - 1.0);
    sum += texelFetch(src, ivec2(q), 0) * w;
    total += w;
  }
  color = sum / total;
}`;

const OUTPUT = `#version 300 es
precision highp float;
uniform sampler2D bg;
uniform sampler2D back;
uniform vec2 canvas;
uniform vec2 bgScale;
uniform float lo;
uniform float hi;
uniform int mode;
in vec2 px;
out vec4 color;
${REFINED}
void main() {
  vec3 f = texture(frame, px / draw).rgb;
  float m = smoothstep(lo, hi, refined(px, f));
  if (mode == 2) { color = vec4(vec3(m), 1.0); return; }
  vec4 b = texture(bg, px * bgScale);
  // Deep inside the person no background is near: the frame itself, much softened, stands in.
  vec3 old = b.a > 0.02 ? b.rgb / b.a : textureLod(frame, px / draw, 5.0).rgb;
  if (mode == 0) { color = vec4(mix(old, f, m), 1.0); return; }
  vec3 fresh = texture(back, px / canvas).rgb;
  // Mostly person: the soft edge holds some of the old background, so that share is swapped for
  // the new one (no pale rim). Mostly background: a plain straight-alpha blend, because the swap
  // would carry the old background's own detail (stars, a lamp) through at full strength.
  vec3 straight = mix(fresh, f, m);
  vec3 swapped = clamp(f + (1.0 - m) * (fresh - old), 0.0, 1.0);
  color = vec4(mix(straight, swapped, smoothstep(0.4, 0.8, m)), 1.0);
}`;

export interface MaskGrid {
  data: Uint8Array;
  width: number;
  height: number;
}

export type MatteOptions = Pick<
  PortraitMatteOptions,
  "effect" | "blur" | "edge" | "shift" | "output" | "refine"
>;

export interface MatteRenderer {
  readonly canvas: GlCanvas;
  /** False when this context cannot render to float textures: the mask is then only enlarged. */
  readonly refines: boolean;
  /**
   * Draws `frame` (shown at `drawSize` picture pixels from the top left) with its background blurred
   * or replaced by `back` (a picture at the canvas size drawn by the caller; unused for blur and
   * mask), using `mask`, the model's person mask for this frame.
   */
  render(
    frame: TexImageSource,
    drawSize: Size,
    mask: MaskGrid,
    back: TexImageSource | null,
    o: MatteOptions,
    /** True when `back` changed since the last call (a video background). */
    backChanged: boolean,
  ): void;
  dispose(): void;
}

/** Sizes of the passes for a canvas, exported for the tests. */
export function passSizes(canvas: Size, sigma: number) {
  const g = Math.min(1, GUIDE_EDGE / Math.max(canvas.width, canvas.height));
  const guide = {
    width: Math.max(8, Math.round(canvas.width * g)),
    height: Math.max(8, Math.round(canvas.height * g)),
  };
  const k = Math.min(1, MAX_SIGMA_TEXELS / Math.max(0.5, sigma));
  const blur = {
    width: Math.max(8, Math.round(canvas.width * k)),
    height: Math.max(8, Math.round(canvas.height * k)),
  };
  return { guide, blur, blurSigma: sigma * (blur.width / canvas.width) };
}

/**
 * A matte renderer drawing into `canvas`, sized to `canvasSize`; `scale` is canvas pixels per
 * picture pixel (1 in the engine). Null where there is no WebGL 2.
 */
export function createMatteRenderer(
  canvas: GlCanvas,
  canvasSize: Size,
  scale = 1,
): MatteRenderer | null {
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const gl = webgl2(canvas);
  if (!gl) return null;
  const floats = !!gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  const guideP = program(gl, RECT_VERTEX, GUIDE);
  const boxP = program(gl, RECT_VERTEX, BOX);
  const coefP = program(gl, RECT_VERTEX, COEF);
  const weightP = program(gl, RECT_VERTEX, BG_WEIGHT);
  const gaussP = program(gl, RECT_VERTEX, GAUSS);
  const outP = program(gl, RECT_VERTEX, OUTPUT);
  const quad = unitQuad(gl);
  const frameTex = texture(gl, 1, 1, "mipmap");
  const backTex = texture(gl, 1, 1, "linear");
  const maskTex = gl.createTexture();
  if (!maskTex) return null;
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  let maskSize = { width: 0, height: 0 };
  const W = canvasSize.width;
  const H = canvasSize.height;
  const short = Math.min(W, H) / scale;
  // Guided filter targets: fixed for the canvas.
  const sizes0 = passSizes(canvasSize, 1);
  const gw = sizes0.guide.width;
  const gh = sizes0.guide.height;
  const gA: Target = target(gl, gw, gh, true);
  const gB: Target = target(gl, gw, gh, true);
  const radius = Math.max(2, Math.round(Math.max(gw, gh) / 128));
  // Blur targets: sized per strength, made again when it changes.
  let blur: { a: Target; b: Target; key: string } | undefined;
  let backReady = false;

  const bind = (p: Program, name: string, unit: number, t: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(p.u(name), unit);
  };
  const full = (s: Size) => ({ x: 0, y: 0, width: s.width, height: s.height });

  return {
    canvas,
    refines: floats,
    render(frame, drawSize, mask, back, o, backChanged) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND);
      upload(gl, frameTex, frame, true);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (mask.width !== maskSize.width || mask.height !== maskSize.height) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R8,
          mask.width,
          mask.height,
          0,
          gl.RED,
          gl.UNSIGNED_BYTE,
          mask.data,
        );
        maskSize = { width: mask.width, height: mask.height };
      } else
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          mask.width,
          mask.height,
          gl.RED,
          gl.UNSIGNED_BYTE,
          mask.data,
        );
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      const replace = o.output !== "mask" && o.effect !== "blur";
      if (replace && back && (backChanged || !backReady)) {
        upload(gl, backTex, back);
        backReady = true;
      }
      const draw = { width: drawSize.width * scale, height: drawSize.height * scale };
      const refine = o.refine !== false && floats;
      const r = edgeRamp(o);
      const guideSize = { width: gw, height: gh };

      if (refine) {
        drawRect(gl, guideP, gA, guideSize, full(guideSize), () => {
          bind(guideP, "frame", 0, frameTex);
          bind(guideP, "mask", 1, maskTex);
          gl.uniform2f(guideP.u("draw"), draw.width, draw.height);
          gl.uniform2f(guideP.u("toCanvas"), W / gw, H / gh);
        });
        const box = (from: Target, into: Target, dx: number, dy: number) =>
          drawRect(gl, boxP, into, guideSize, full(guideSize), () => {
            bind(boxP, "src", 0, from.texture);
            gl.uniform2f(boxP.u("dir"), dx, dy);
            gl.uniform1i(boxP.u("radius"), radius);
            gl.uniform2f(boxP.u("valid"), gw, gh);
          });
        box(gA, gB, 1, 0);
        box(gB, gA, 0, 1);
        drawRect(gl, coefP, gB, guideSize, full(guideSize), () => {
          bind(coefP, "means", 0, gA.texture);
          gl.uniform1f(coefP.u("eps"), GUIDE_EPS);
        });
        box(gB, gA, 1, 0);
        box(gA, gB, 0, 1);
      }
      const setRefined = (p: Program) => {
        bind(p, "frame", 0, frameTex);
        bind(p, "mask", 1, maskTex);
        bind(p, "coef", 2, gB.texture);
        gl.uniform2f(p.u("draw"), draw.width, draw.height);
        gl.uniform2f(p.u("coefScale"), 1 / W, 1 / H);
        gl.uniform1i(p.u("refine"), refine ? 1 : 0);
      };

      const mode = o.output === "mask" ? 2 : replace ? 1 : 0;
      let bgTex: WebGLTexture = gB.texture;
      let bgScale = { x: 1 / W, y: 1 / H };
      if (mode !== 2) {
        const sigma = blurSigma(o.effect === "blur" ? o.blur : DECONTAMINATE_STRENGTH, {
          width: short,
          height: short,
        });
        const sizes = passSizes(canvasSize, sigma * scale);
        const key = `${sizes.blur.width}x${sizes.blur.height}`;
        if (!blur || blur.key !== key) {
          if (blur) {
            freeTarget(gl, blur.a);
            freeTarget(gl, blur.b);
          }
          blur = {
            a: target(gl, sizes.blur.width, sizes.blur.height, true),
            b: target(gl, sizes.blur.width, sizes.blur.height, true),
            key,
          };
        }
        const bs = sizes.blur;
        const bl = blur;
        drawRect(gl, weightP, bl.a, bs, full(bs), () => {
          setRefined(weightP);
          gl.uniform2f(weightP.u("toCanvas"), W / bs.width, H / bs.height);
          gl.uniform1f(weightP.u("lo"), r.lo);
          gl.uniform1f(weightP.u("hi"), r.hi);
        });
        const s = Math.max(0.3, sizes.blurSigma);
        const gauss = (from: Target, into: Target, dx: number, dy: number) =>
          drawRect(gl, gaussP, into, bs, full(bs), () => {
            bind(gaussP, "src", 0, from.texture);
            gl.uniform2f(gaussP.u("dir"), dx, dy);
            gl.uniform1f(gaussP.u("sigma"), s);
            gl.uniform1i(gaussP.u("radius"), Math.min(24, Math.ceil(s * 3)));
            gl.uniform2f(gaussP.u("valid"), bs.width, bs.height);
          });
        gauss(bl.a, bl.b, 1, 0);
        gauss(bl.b, bl.a, 0, 1);
        bgTex = bl.a.texture;
        bgScale = { x: 1 / W, y: 1 / H };
      }
      drawRect(gl, outP, null, canvasSize, full(canvasSize), () => {
        setRefined(outP);
        bind(outP, "bg", 3, bgTex);
        bind(outP, "back", 4, backTex);
        gl.uniform2f(outP.u("canvas"), W, H);
        gl.uniform2f(outP.u("bgScale"), bgScale.x, bgScale.y);
        gl.uniform1f(outP.u("lo"), r.lo);
        gl.uniform1f(outP.u("hi"), r.hi);
        gl.uniform1i(outP.u("mode"), mode);
      });
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose() {
      loseContext(gl);
    },
  };
}
