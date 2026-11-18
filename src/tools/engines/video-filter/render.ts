/**
 * Draws one decoded frame through a colour transform (./color) onto an OffscreenCanvas, which the
 * encoder takes as the new frame. WebGL 2 when the worker has it (one texture upload and one draw per
 * frame); otherwise a 2D canvas and a loop over the pixels, with the power curve as a lookup table.
 * Both paths compute the same numbers. Runs in the engine worker.
 */
import type { VideoSample } from "mediabunny";
import { EngineError } from "../errors";
import { type ColorTransform, isIdentityGamma } from "./color";

const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  // Clip space y = 1 is the top of the picture, which is the texture's first row (t = 0).
  uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D frame;
uniform vec3 gammaExp;
uniform mat3 mixer;
uniform vec3 offset;
in vec2 uv;
out vec4 color;
void main() {
  vec3 c = texture(frame, uv).rgb;
  c = pow(max(c, vec3(0.0)), gammaExp);
  c = clamp(mixer * c + offset, 0.0, 1.0);
  color = vec4(c, 1.0);
}`;

export interface FrameRenderer {
  readonly canvas: OffscreenCanvas;
  /** Draws `sample` through `t`; the canvas then holds the new frame. */
  draw(sample: VideoSample, t: ColorTransform): void;
  dispose(): void;
}

export function createRenderer(width: number, height: number): FrameRenderer {
  if (typeof OffscreenCanvas === "undefined") {
    throw new EngineError(
      "unsupported-output",
      "This browser cannot draw video frames off screen.",
      "Try desktop Chrome, Edge, Firefox or Safari 16.4 or newer.",
    );
  }
  return glRenderer(width, height) ?? cpuRenderer(width, height);
}

function glRenderer(width: number, height: number): FrameRenderer | null {
  const canvas = new OffscreenCanvas(width, height);
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    // The encoder reads the canvas after the draw; keep what was drawn until then.
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const uGamma = gl.getUniformLocation(program, "gammaExp");
  const uMixer = gl.getUniformLocation(program, "mixer");
  const uOffset = gl.getUniformLocation(program, "offset");
  gl.viewport(0, 0, width, height);

  return {
    canvas,
    draw(sample, t) {
      const src = sample.toCanvasImageSource();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const m = t.matrix;
      gl.uniform3f(uGamma, t.gamma[0], t.gamma[1], t.gamma[2]);
      // Row-major 3×4 → the 3×3 part, transposed on upload.
      gl.uniformMatrix3fv(uMixer, true, [
        m[0] ?? 1,
        m[1] ?? 0,
        m[2] ?? 0,
        m[4] ?? 0,
        m[5] ?? 1,
        m[6] ?? 0,
        m[8] ?? 0,
        m[9] ?? 0,
        m[10] ?? 1,
      ]);
      gl.uniform3f(uOffset, m[3] ?? 0, m[7] ?? 0, m[11] ?? 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function cpuRenderer(width: number, height: number): FrameRenderer {
  const canvas = new OffscreenCanvas(width, height);
  const c2d = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!c2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
  // Lookup tables for the power curve, rebuilt only when the curve changes.
  let lutKey = "";
  const luts = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  return {
    canvas,
    draw(sample, t) {
      sample.draw(c2d, 0, 0, width, height);
      const img = c2d.getImageData(0, 0, width, height);
      const d = img.data;
      const key = t.gamma.join(",");
      if (key !== lutKey) {
        lutKey = key;
        for (let ch = 0; ch < 3; ch++) {
          const g = t.gamma[ch] ?? 1;
          const lut = luts[ch] as Float32Array;
          for (let i = 0; i < 256; i++) lut[i] = isIdentityGamma([g]) ? i / 255 : (i / 255) ** g;
        }
      }
      const [lr, lg, lb] = luts as [Float32Array, Float32Array, Float32Array];
      const m = t.matrix;
      const [a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3] = m as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      for (let i = 0; i < d.length; i += 4) {
        const r = lr[d[i] ?? 0] ?? 0;
        const g = lg[d[i + 1] ?? 0] ?? 0;
        const b = lb[d[i + 2] ?? 0] ?? 0;
        d[i] = (a0 * r + a1 * g + a2 * b + a3) * 255;
        d[i + 1] = (b0 * r + b1 * g + b2 * b + b3) * 255;
        d[i + 2] = (c0 * r + c1 * g + c2 * b + c3) * 255;
      }
      c2d.putImageData(img, 0, 0);
    },
    dispose() {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
