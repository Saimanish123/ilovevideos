/**
 * Stabilize, second pass: each frame redrawn through its correction in WebGL 2. An output pixel at
 * centred position q shows the source at W·(q / zoom) (./path), read with Catmull-Rom bicubic
 * filtering (16 texels), which keeps edges crisper than bilinear when the picture is enlarged.
 * Outside the source: black (only with borders; zoom to fill never reaches it). Runs in the engine
 * worker; no network access.
 */
import {
  drawRect,
  type GlCanvas,
  loseContext,
  program,
  RECT_VERTEX,
  texture,
  upload,
  webgl2,
} from "../overlay/gl";
import type { Motion } from "./motion";

const WARP = `#version 300 es
precision highp float;
in vec2 px;
out vec4 o;
uniform sampler2D src;
uniform ivec2 size;
uniform vec4 warp; // a, b, tx, ty
uniform float zoom;
vec4 at(ivec2 p) { return texelFetch(src, clamp(p, ivec2(0), size - 1), 0); }
vec4 cubic(float x) {
  // Catmull-Rom weights for taps at -1, 0, 1, 2.
  float x2 = x * x;
  float x3 = x2 * x;
  return vec4(
    -0.5 * x3 + x2 - 0.5 * x,
    1.5 * x3 - 2.5 * x2 + 1.0,
    -1.5 * x3 + 2.0 * x2 + 0.5 * x,
    0.5 * x3 - 0.5 * x2
  );
}
void main() {
  vec2 half_ = vec2(size) * 0.5;
  vec2 q = (px - half_) / zoom;
  vec2 p = vec2(warp.x * q.x - warp.y * q.y, warp.y * q.x + warp.x * q.y) + warp.zw + half_;
  if (p.x < 0.0 || p.y < 0.0 || p.x > float(size.x) || p.y > float(size.y)) {
    o = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 s = p - 0.5;
  vec2 i0 = floor(s);
  vec2 f = s - i0;
  vec4 wx = cubic(f.x);
  vec4 wy = cubic(f.y);
  ivec2 b = ivec2(i0);
  vec3 c = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    vec3 row = vec3(0.0);
    for (int i = 0; i < 4; i++) row += wx[i] * at(b + ivec2(i - 1, j - 1)).rgb;
    c += wy[j] * row;
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export interface WarpRenderer {
  readonly canvas: GlCanvas;
  render(source: TexImageSource, warp: Motion, zoom: number): void;
  dispose(): void;
}

export function createWarpRenderer(
  canvas: GlCanvas,
  size: { width: number; height: number },
): WarpRenderer | null {
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
  const p = program(gl, RECT_VERTEX, WARP);
  const src = texture(gl, size.width, size.height, "nearest");
  const full = { x: 0, y: 0, width: size.width, height: size.height };
  return {
    canvas,
    render(source, w, zoom) {
      upload(gl, src, source);
      drawRect(gl, p, null, size, full, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(p.u("src"), 0);
        gl.uniform2i(p.u("size"), size.width, size.height);
        gl.uniform4f(p.u("warp"), w.a, w.b, w.tx, w.ty);
        gl.uniform1f(p.u("zoom"), zoom);
      });
    },
    dispose() {
      gl.deleteTexture(src);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(p.program);
      loseContext(gl);
    },
  };
}
