/**
 * Small WebGL 2 toolkit for whole-frame effects (`composite.ts` `stage`), shared by the engine
 * worker (OffscreenCanvas) and the page's live preview (a canvas over the video), so both draw
 * with the same shaders and the same numbers. No network access; nothing here touches the DOM
 * beyond the canvas it is given.
 *
 * Conventions, so effects compose without thinking about GL's upside-down y:
 * - Every position is in pixels with 0,0 at the top left of the target.
 * - Every texture holds row 0 at v = 0: uploaded frames (no UNPACK_FLIP_Y) and render targets alike
 *   (render targets are drawn without the flip, the canvas with it).
 * - `RECT_VERTEX` draws the rectangle `rect` (x, y, w, h in target pixels) and hands the fragment
 *   shader `px`, the fragment's position in target pixels.
 */

export type GlCanvas = OffscreenCanvas | HTMLCanvasElement;

export const RECT_VERTEX = `#version 300 es
in vec2 corner;
uniform vec4 rect;
uniform vec2 target;
uniform float flipY;
out vec2 px;
void main() {
  px = rect.xy + corner * rect.zw;
  vec2 c = px / target * 2.0 - 1.0;
  if (flipY > 0.5) c.y = -c.y;
  gl_Position = vec4(c, 0.0, 1.0);
}`;

/** A WebGL 2 context set up for frame work, or null where the browser has none (old WebKit workers). */
export function webgl2(canvas: GlCanvas): WebGL2RenderingContext | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    // The encoder (or the compositor) reads the canvas after the draw; keep it until the next one.
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext | null;
  return gl;
}

/** True when this context (worker or page) can make a WebGL 2 canvas. */
export function hasWebgl2(): boolean {
  try {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(2, 2)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : undefined;
    if (!canvas) return false;
    const gl = webgl2(canvas);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export interface Program {
  program: WebGLProgram;
  /** Uniform location by name, cached. */
  u(name: string): WebGLUniformLocation | null;
}

/** Compiles and links a program; throws with the GL log (a programming error, not a user one). */
export function program(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("WebGL: no shader");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`WebGL shader: ${log}`);
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  const p = gl.createProgram();
  if (!p) throw new Error("WebGL: no program");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "corner");
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(`WebGL link: ${gl.getProgramInfoLog(p)}`);
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    program: p,
    u(name) {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name) ?? null;
    },
  };
}

/** The unit square every `RECT_VERTEX` draw uses, bound to attribute 0. */
export function unitQuad(gl: WebGL2RenderingContext): WebGLBuffer {
  const buf = gl.createBuffer();
  if (!buf) throw new Error("WebGL: no buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return buf;
}

export type Filter = "linear" | "nearest" | "mipmap";

/** An RGBA8 texture with clamped edges (an edge pixel repeats; nothing outside reads as black). */
export function texture(
  gl: WebGL2RenderingContext,
  width = 1,
  height = 1,
  filter: Filter = "linear",
): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error("WebGL: no texture");
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  setFilter(gl, filter);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return t;
}

/** Sets the filter of the texture bound to TEXTURE_2D. */
export function setFilter(gl: WebGL2RenderingContext, filter: Filter) {
  const mag = filter === "nearest" ? gl.NEAREST : gl.LINEAR;
  const min =
    filter === "nearest" ? gl.NEAREST : filter === "mipmap" ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
}

/**
 * Uploads a frame (a VideoFrame, a video element, an ImageBitmap, a canvas) into `t`, row 0 at
 * v = 0, and builds its mipmaps when asked (for sampling it smaller without aliasing).
 */
export function upload(
  gl: WebGL2RenderingContext,
  t: WebGLTexture,
  source: TexImageSource,
  mipmaps = false,
) {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
}

/** A texture with a framebuffer to draw into. */
export interface Target {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

/**
 * A render target. `float` asks for half-float texels (for sums and ratios that 8 bits would
 * band), where the context can render to them (EXT_color_buffer_float); otherwise RGBA8.
 */
export function target(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  float = false,
): Target {
  if (float && gl.getExtension("EXT_color_buffer_float")) {
    const t = gl.createTexture();
    if (!t) throw new Error("WebGL: no texture");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    setFilter(gl, "linear");
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("WebGL: no framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (ok) return { texture: t, fbo, width, height };
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(t);
  }
  const tex = texture(gl, width, height, "linear");
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("WebGL: no framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture: tex, fbo, width, height };
}

export function freeTarget(gl: WebGL2RenderingContext, t: Target) {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.texture);
}

/**
 * Binds `p` and draws `rect` into `into` (a target, or the canvas when null) with the viewport set
 * to `size`. `uniforms` runs after the program is bound, to set the rest.
 */
export function drawRect(
  gl: WebGL2RenderingContext,
  p: Program,
  into: Target | null,
  size: { width: number; height: number },
  rect: { x: number; y: number; width: number; height: number },
  uniforms?: () => void,
) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.fbo : null);
  gl.viewport(0, 0, size.width, size.height);
  gl.useProgram(p.program);
  gl.uniform4f(p.u("rect"), rect.x, rect.y, rect.width, rect.height);
  gl.uniform2f(p.u("target"), size.width, size.height);
  gl.uniform1f(p.u("flipY"), into ? 0 : 1);
  uniforms?.();
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/** Drops the context's resources at once (a worker keeps running after a job). */
export function loseContext(gl: WebGL2RenderingContext) {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}
