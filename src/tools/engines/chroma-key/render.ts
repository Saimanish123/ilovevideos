/**
 * The green screen keyer in WebGL 2 (./options explains the method), for the engine worker (an
 * OffscreenCanvas at the output size) and the page's live preview (a canvas over the video, smaller
 * by `scale`): one set of shaders, so the preview shows what the file will hold (ADR-0065).
 *
 * Passes per frame: (1) the screen plate, at one texel per 8 picture pixels, the average of the
 * clearly-screen pixels of each block with their count; (2) and (3) a Gaussian over the plate
 * (sigma 3.5 texels, about 28 picture pixels), on sums so blocks with no screen borrow from their
 * neighbours; (4) every output pixel keyed against its local plate and laid over the background,
 * which the caller draws into a canvas of the output size (colour, image or video, fitted).
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
  unitQuad,
  upload,
  webgl2,
} from "../overlay/gl";
import { type ChromaKeyOptions, keyChannel, PLATE_SHARE, ramp, type Size } from "./options";

/** Picture pixels per plate texel, and the plate blur in texels. */
const BLOCK = 8;
const PLATE_SIGMA = 3.5;

/** Key-ness for the screen channel `ch` (0 red, 1 green, 2 blue), as in ./options `keyness`. */
const KEYNESS = `
float keyness(vec3 c, int ch) {
  if (ch == 1) return c.g - max(c.r, c.b);
  if (ch == 2) return c.b - max(c.r, c.g);
  return c.r - max(c.g, c.b);
}`;

const PLATE = `#version 300 es
precision highp float;
uniform sampler2D frame;
uniform vec2 draw;
uniform float block;
uniform int ch;
uniform float keyMin;
in vec2 px;
out vec4 color;
${KEYNESS}
void main() {
  vec2 start = floor(px) * block;
  vec3 sum = vec3(0.0);
  float n = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 at = clamp(start + (vec2(float(i), float(j)) + 0.5) * block * 0.25, vec2(0.5), draw - 0.5);
      vec3 c = texture(frame, at / draw).rgb;
      if (keyness(c, ch) >= keyMin) { sum += c; n += 1.0; }
    }
  }
  color = vec4(sum / 16.0, n / 16.0);
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
  for (int i = -16; i <= 16; i++) {
    if (i < -radius || i > radius) continue;
    float w = exp(-float(i * i) / (2.0 * sigma * sigma));
    vec2 q = clamp(p + dir * float(i), vec2(0.0), valid - 1.0);
    sum += texelFetch(src, ivec2(q), 0) * w;
    total += w;
  }
  color = sum / total;
}`;

const KEY = `#version 300 es
precision highp float;
uniform sampler2D frame;
uniform sampler2D plate;
uniform sampler2D back;
uniform vec2 draw;
uniform vec2 canvas;
uniform float block;
uniform vec2 plateValid;
uniform vec2 plateSize;
uniform vec3 key;
uniform int ch;
uniform float lo;
uniform float hi;
uniform float spill;
in vec2 px;
out vec4 color;
${KEYNESS}
void main() {
  vec3 c = texture(frame, px / draw).rgb;
  vec4 p = texture(plate, clamp(px / block, vec2(0.5), plateValid - 0.5) / plateSize);
  vec3 s = p.a > 0.002 ? p.rgb / p.a : key;
  float ks = keyness(s, ch);
  float kk = keyness(key, ch);
  if (ks < 0.25 * kk) { s = key; ks = kk; }
  float ratio = keyness(c, ch) / max(ks, 0.004);
  float a = 1.0 - clamp((ratio - lo) / max(hi - lo, 0.001), 0.0, 1.0);
  vec3 f = c - (1.0 - a) * s;
  // Spill: the screen channel is held down towards the larger of the other two.
  if (ch == 1) f.g -= spill * max(0.0, f.g - max(f.r, f.b));
  else if (ch == 2) f.b -= spill * max(0.0, f.b - max(f.r, f.g));
  else f.r -= spill * max(0.0, f.r - max(f.g, f.b));
  vec3 b = texture(back, px / canvas).rgb;
  color = vec4(clamp(f + (1.0 - a) * b, 0.0, 1.0), 1.0);
}`;

export interface KeyRenderer {
  readonly canvas: GlCanvas;
  /**
   * Keys `frame` (shown at `drawSize` picture pixels from the top left) and lays it over `back`
   * (a picture at the canvas size, drawn by the caller), onto the canvas.
   */
  render(
    frame: TexImageSource,
    drawSize: Size,
    back: TexImageSource,
    o: Pick<ChromaKeyOptions, "key" | "tolerance" | "softness" | "spill">,
    /** True when `back` changed since the last call (a video background); colour and images upload once. */
    backChanged: boolean,
  ): void;
  dispose(): void;
}

/**
 * A keyer drawing into `canvas`, sized to `canvasSize`; `scale` is canvas pixels per picture
 * pixel (1 in the engine). Null where there is no WebGL 2.
 */
export function createKeyRenderer(
  canvas: GlCanvas,
  canvasSize: Size,
  scale = 1,
): KeyRenderer | null {
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const gl = webgl2(canvas);
  if (!gl) return null;
  const plateP = program(gl, RECT_VERTEX, PLATE);
  const gauss = program(gl, RECT_VERTEX, GAUSS);
  const keyP = program(gl, RECT_VERTEX, KEY);
  const quad = unitQuad(gl);
  const frameTex = texture(gl, 1, 1, "linear");
  const backTex = texture(gl, 1, 1, "linear");
  const W = canvasSize.width;
  const H = canvasSize.height;
  const block = BLOCK * scale;
  const lw = Math.max(1, Math.ceil(W / block));
  const lh = Math.max(1, Math.ceil(H / block));
  const a: Target = target(gl, lw, lh, true);
  const b: Target = target(gl, lw, lh, true);
  let backReady = false;
  const bind = (p: Program, name: string, unit: number, t: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(p.u(name), unit);
  };
  const plateBox = { x: 0, y: 0, width: lw, height: lh };
  const plateSize = { width: lw, height: lh };
  return {
    canvas,
    render(frame, drawSize, back, o, backChanged) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND);
      upload(gl, frameTex, frame);
      if (backChanged || !backReady) {
        upload(gl, backTex, back);
        backReady = true;
      }
      const draw = { width: drawSize.width * scale, height: drawSize.height * scale };
      const ch = keyChannel(o.key);
      const key = o.key.map((v) => v / 255) as [number, number, number];
      const kk =
        ch === 1
          ? key[1] - Math.max(key[0], key[2])
          : ch === 2
            ? key[2] - Math.max(key[0], key[1])
            : key[0] - Math.max(key[1], key[2]);
      drawRect(gl, plateP, a, plateSize, plateBox, () => {
        bind(plateP, "frame", 0, frameTex);
        gl.uniform2f(plateP.u("draw"), draw.width, draw.height);
        gl.uniform1f(plateP.u("block"), block);
        gl.uniform1i(plateP.u("ch"), ch);
        gl.uniform1f(plateP.u("keyMin"), PLATE_SHARE * Math.max(0.01, kk));
      });
      const pass = (from: Target, into: Target, dx: number, dy: number) =>
        drawRect(gl, gauss, into, plateSize, plateBox, () => {
          bind(gauss, "src", 0, from.texture);
          gl.uniform2f(gauss.u("dir"), dx, dy);
          gl.uniform1f(gauss.u("sigma"), PLATE_SIGMA);
          gl.uniform1i(gauss.u("radius"), Math.ceil(PLATE_SIGMA * 3));
          gl.uniform2f(gauss.u("valid"), lw, lh);
        });
      pass(a, b, 1, 0);
      pass(b, a, 0, 1);
      const r = ramp(o);
      drawRect(gl, keyP, null, { width: W, height: H }, { x: 0, y: 0, width: W, height: H }, () => {
        bind(keyP, "frame", 0, frameTex);
        bind(keyP, "plate", 1, a.texture);
        bind(keyP, "back", 2, backTex);
        gl.uniform2f(keyP.u("draw"), draw.width, draw.height);
        gl.uniform2f(keyP.u("canvas"), W, H);
        gl.uniform1f(keyP.u("block"), block);
        gl.uniform2f(keyP.u("plateValid"), lw, lh);
        gl.uniform2f(keyP.u("plateSize"), lw, lh);
        gl.uniform3f(keyP.u("key"), key[0], key[1], key[2]);
        gl.uniform1i(keyP.u("ch"), ch);
        gl.uniform1f(keyP.u("lo"), r.lo);
        gl.uniform1f(keyP.u("hi"), r.hi);
        gl.uniform1f(keyP.u("spill"), o.spill);
      });
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose() {
      loseContext(gl);
    },
  };
}
