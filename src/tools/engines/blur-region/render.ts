/**
 * Draws a frame with its regions blurred, pixelated or covered, in WebGL 2. One renderer for the
 * engine worker (an OffscreenCanvas at the output size) and the page's live preview (a canvas over
 * the video, smaller by `scale`): every size is worked out in picture pixels by ./options and only
 * then multiplied by `scale`, so the preview shows what the file will hold (ADR-0063).
 *
 * Per region, only the area the effect needs is processed:
 * - Blur: the region plus three sigmas around it is drawn into a render target, smaller by a
 *   factor that leaves a sigma of 2.5 texels (the frame's mipmaps average what is skipped), blurred
 *   with a separable Gaussian there, and drawn back stretched over the region with linear filtering.
 *   Samples past the frame's edge repeat the edge pixel (CLAMP_TO_EDGE and clamped fetches), so a
 *   region at the edge gets no dark rim.
 * - Pixelate: each block is the average of 16 samples spread over it (from the mip level that
 *   holds a quarter of the block per texel), on a grid that starts at the region's top left.
 * - Box: solid black.
 * The result is drawn over the frame through the region's shape (rectangle or ellipse) with an
 * optional soft edge outside it. Inverted, the effect covers the whole frame and the regions stay
 * clear.
 */
import {
  drawRect,
  type GlCanvas,
  loseContext,
  type Program,
  program,
  RECT_VERTEX,
  setFilter,
  type Target,
  target,
  texture,
  unitQuad,
  upload,
  webgl2,
} from "../overlay/gl";
import {
  type BlurRegionOptions,
  effectSize,
  MAX_REGIONS,
  type PlacedRegion,
  type Size,
} from "./options";

/** Sigma, in texels of the reduced copy, that the Gaussian pass works at. */
const LOW_SIGMA = 2.5;

const COPY = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec4 rect;
uniform vec4 srcRect;
in vec2 px;
out vec4 color;
void main() {
  vec2 uv = srcRect.xy + (px - rect.xy) / rect.zw * srcRect.zw;
  color = vec4(texture(src, uv).rgb, 1.0);
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
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -32; i <= 32; i++) {
    if (i < -radius || i > radius) continue;
    float w = exp(-float(i * i) / (2.0 * sigma * sigma));
    vec2 q = clamp(p + dir * float(i), vec2(0.0), valid - 1.0);
    sum += texelFetch(src, ivec2(q), 0).rgb * w;
    total += w;
  }
  color = vec4(sum / total, 1.0);
}`;

const BLOCKS = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 origin;
uniform float block;
uniform vec2 frame;
uniform float lod;
in vec2 px;
out vec4 color;
void main() {
  vec2 cell = floor(px);
  vec2 start = origin + cell * block;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 at = clamp(start + (vec2(float(i), float(j)) + 0.5) * block * 0.25, vec2(0.5), frame - 0.5);
      sum += textureLod(src, at / frame, lod).rgb;
    }
  }
  color = vec4(sum / 16.0, 1.0);
}`;

/** Signed distance (px, negative inside) to a rectangle or an ellipse, shared by both composites. */
const SHAPE = `
float shapeDistance(vec2 p, vec2 c, vec2 h, bool ellipse) {
  if (ellipse) {
    float k = length((p - c) / max(h, vec2(0.5)));
    return (k - 1.0) * min(h.x, h.y);
  }
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float coverage(float sd, float feather) {
  return feather > 0.0 ? 1.0 - smoothstep(0.0, feather, sd) : clamp(0.5 - sd, 0.0, 1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D fx;
uniform int mode;
uniform vec4 fxRect;
uniform vec2 fxValid;
uniform vec2 fxSize;
uniform vec2 origin;
uniform float block;
uniform vec4 shape;
uniform int ellipse;
uniform float feather;
in vec2 px;
out vec4 color;
${SHAPE}
void main() {
  float a = coverage(shapeDistance(px, shape.xy, shape.zw, ellipse == 1), feather);
  if (a <= 0.0) discard;
  vec3 c;
  if (mode == 2) {
    c = vec3(0.0);
  } else if (mode == 1) {
    vec2 cell = clamp(floor((px - origin) / block), vec2(0.0), fxValid - 1.0);
    c = texelFetch(fx, ivec2(cell), 0).rgb;
  } else {
    vec2 t = (px - fxRect.xy) / fxRect.zw * fxValid;
    t = clamp(t, vec2(0.5), fxValid - 0.5);
    c = texture(fx, t / fxSize).rgb;
  }
  color = vec4(c, a);
}`;

const INVERTED = `#version 300 es
precision highp float;
uniform sampler2D fx;
uniform int mode;
uniform vec4 fxRect;
uniform vec2 fxValid;
uniform vec2 fxSize;
uniform vec2 origin;
uniform float block;
uniform int count;
uniform vec4 shapes[${MAX_REGIONS}];
uniform int ellipses[${MAX_REGIONS}];
uniform float feathers[${MAX_REGIONS}];
in vec2 px;
out vec4 color;
${SHAPE}
void main() {
  float keep = 0.0;
  for (int i = 0; i < ${MAX_REGIONS}; i++) {
    if (i >= count) break;
    keep = max(keep, coverage(shapeDistance(px, shapes[i].xy, shapes[i].zw, ellipses[i] == 1), feathers[i]));
  }
  float a = 1.0 - keep;
  if (a <= 0.0) discard;
  vec3 c;
  if (mode == 2) {
    c = vec3(0.0);
  } else if (mode == 1) {
    vec2 cell = clamp(floor((px - origin) / block), vec2(0.0), fxValid - 1.0);
    c = texelFetch(fx, ivec2(cell), 0).rgb;
  } else {
    vec2 t = (px - fxRect.xy) / fxRect.zw * fxValid;
    t = clamp(t, vec2(0.5), fxValid - 0.5);
    c = texture(fx, t / fxSize).rgb;
  }
  color = vec4(c, a);
}`;

export interface BlurRenderer {
  readonly canvas: GlCanvas;
  /**
   * Draws `frame` (shown at `drawSize` picture pixels from the top left) with `regions` (placed in
   * picture pixels, ./options `placeAll`) applied, onto the canvas.
   */
  render(
    frame: TexImageSource,
    drawSize: Size,
    regions: PlacedRegion[],
    o: Pick<BlurRegionOptions, "effect" | "strength" | "feather" | "invert">,
  ): void;
  dispose(): void;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A renderer drawing into `canvas`, which it sizes to `canvasSize` (canvas pixels); regions
 * and frame sizes come in picture pixels and `scale` is canvas pixels per picture pixel (1 in the engine).
 * Returns null when there is no WebGL 2 here.
 */
export function createBlurRenderer(
  canvas: GlCanvas,
  canvasSize: Size,
  scale = 1,
): BlurRenderer | null {
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const gl = webgl2(canvas);
  if (!gl) return null;
  const copy = program(gl, RECT_VERTEX, COPY);
  const gauss = program(gl, RECT_VERTEX, GAUSS);
  const blocks = program(gl, RECT_VERTEX, BLOCKS);
  const composite = program(gl, RECT_VERTEX, COMPOSITE);
  const inverted = program(gl, RECT_VERTEX, INVERTED);
  const quad = unitQuad(gl);
  const frameTex = texture(gl, 1, 1, "mipmap");
  // Two full-size targets cover any region: a reduced copy is never larger than the canvas.
  let ping: Target | undefined;
  let pong: Target | undefined;
  const W = canvasSize.width;
  const H = canvasSize.height;
  const targets = () => {
    ping ??= target(gl, W, H);
    pong ??= target(gl, W, H);
    return [ping, pong] as const;
  };

  const canvasBox = { width: W, height: H };
  const bindTex = (p: Program, name: string, unit: number, t: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(p.u(name), unit);
  };

  /** Blurs `area` (canvas px) of the frame into a target; returns where its result lies. */
  const blurArea = (area: Box, sigma: number, draw: Size) => {
    const [a, b] = targets();
    const f = Math.max(1, sigma / LOW_SIGMA);
    const fw = Math.max(1, Math.min(W, Math.ceil(area.width / f)));
    const fh = Math.max(1, Math.min(H, Math.ceil(area.height / f)));
    const covered = { x: area.x, y: area.y, width: fw * f, height: fh * f };
    const low = sigma / f;
    const radius = Math.min(32, Math.ceil(low * 3));
    const valid = { width: fw, height: fh };
    drawRect(gl, copy, a, valid, { x: 0, y: 0, width: fw, height: fh }, () => {
      bindTex(copy, "src", 0, frameTex);
      gl.uniform4f(
        copy.u("srcRect"),
        covered.x / draw.width,
        covered.y / draw.height,
        covered.width / draw.width,
        covered.height / draw.height,
      );
    });
    const pass = (from: Target, into: Target, dx: number, dy: number) =>
      drawRect(gl, gauss, into, valid, { x: 0, y: 0, width: fw, height: fh }, () => {
        bindTex(gauss, "src", 0, from.texture);
        gl.uniform2f(gauss.u("dir"), dx, dy);
        gl.uniform1f(gauss.u("sigma"), low);
        gl.uniform1i(gauss.u("radius"), radius);
        gl.uniform2f(gauss.u("valid"), fw, fh);
      });
    pass(a, b, 1, 0);
    pass(b, a, 0, 1);
    return { tex: a, covered, valid };
  };

  /** Averages `area` (canvas px) in blocks of `block` px into a target, one texel per block. */
  const blockArea = (area: Box, block: number, draw: Size) => {
    const [a] = targets();
    const bw = Math.max(1, Math.min(W, Math.ceil(area.width / block)));
    const bh = Math.max(1, Math.min(H, Math.ceil(area.height / block)));
    drawRect(
      gl,
      blocks,
      a,
      { width: bw, height: bh },
      { x: 0, y: 0, width: bw, height: bh },
      () => {
        bindTex(blocks, "src", 0, frameTex);
        gl.uniform2f(blocks.u("origin"), area.x, area.y);
        gl.uniform1f(blocks.u("block"), block);
        gl.uniform2f(blocks.u("frame"), draw.width, draw.height);
        gl.uniform1f(blocks.u("lod"), Math.max(0, Math.log2(block / 4)));
      },
    );
    return { tex: a, valid: { width: bw, height: bh } };
  };

  const clampBox = (b: Box, draw: Size): Box => {
    const x0 = Math.max(0, Math.floor(b.x));
    const y0 = Math.max(0, Math.floor(b.y));
    const x1 = Math.min(draw.width, Math.ceil(b.x + b.width));
    const y1 = Math.min(draw.height, Math.ceil(b.y + b.height));
    return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
  };

  return {
    canvas,
    render(frame, drawSize, regions, o) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const draw = { width: drawSize.width * scale, height: drawSize.height * scale };
      const needsMips = regions.length > 0 && o.effect !== "box";
      upload(gl, frameTex, frame, needsMips);
      gl.bindTexture(gl.TEXTURE_2D, frameTex);
      setFilter(gl, needsMips ? "mipmap" : "linear");
      gl.disable(gl.BLEND);
      drawRect(gl, copy, null, canvasBox, { x: 0, y: 0, ...draw }, () => {
        bindTex(copy, "src", 0, frameTex);
        gl.uniform4f(copy.u("srcRect"), 0, 0, 1, 1);
      });
      if (regions.length === 0) return;
      const mode = o.effect === "box" ? 2 : o.effect === "pixelate" ? 1 : 0;
      const setFx = (p: Program, fx: { tex: Target; valid: Size; covered?: Box }, origin: Box) => {
        bindTex(p, "fx", 0, fx.tex.texture);
        gl.uniform1i(p.u("mode"), mode);
        const c = fx.covered ?? origin;
        gl.uniform4f(p.u("fxRect"), c.x, c.y, c.width, c.height);
        gl.uniform2f(p.u("fxValid"), fx.valid.width, fx.valid.height);
        gl.uniform2f(p.u("fxSize"), W, H);
        gl.uniform2f(p.u("origin"), origin.x, origin.y);
      };

      if (o.invert) {
        const fx = effectSize(o, drawSize, drawSize, true);
        const whole = { x: 0, y: 0, ...draw };
        const done =
          mode === 0
            ? blurArea(whole, fx.sigma * scale, draw)
            : mode === 1
              ? blockArea(whole, fx.block * scale, draw)
              : undefined;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        drawRect(gl, inverted, null, canvasBox, whole, () => {
          if (done) setFx(inverted, done, whole);
          else gl.uniform1i(inverted.u("mode"), 2);
          gl.uniform1f(inverted.u("block"), fx.block * scale);
          const list = regions.slice(0, MAX_REGIONS);
          gl.uniform1i(inverted.u("count"), list.length);
          const shapes = new Float32Array(MAX_REGIONS * 4);
          const ellipses = new Int32Array(MAX_REGIONS);
          const feathers = new Float32Array(MAX_REGIONS);
          list.forEach((r, i) => {
            shapes.set(
              [
                (r.x + r.width / 2) * scale,
                (r.y + r.height / 2) * scale,
                (r.width / 2) * scale,
                (r.height / 2) * scale,
              ],
              i * 4,
            );
            ellipses[i] = r.shape === "ellipse" ? 1 : 0;
            feathers[i] = effectSize(o, r, drawSize).feather * scale;
          });
          gl.uniform4fv(inverted.u("shapes"), shapes);
          gl.uniform1iv(inverted.u("ellipses"), ellipses);
          gl.uniform1fv(inverted.u("feathers"), feathers);
        });
        gl.disable(gl.BLEND);
        return;
      }

      for (const r of regions) {
        const fx = effectSize(o, r, drawSize);
        const rect: Box = {
          x: r.x * scale,
          y: r.y * scale,
          width: r.width * scale,
          height: r.height * scale,
        };
        const feather = fx.feather * scale;
        const reach = { x: rect.x - feather, y: rect.y - feather };
        const quadBox = clampBox(
          {
            x: reach.x,
            y: reach.y,
            width: rect.width + 2 * feather,
            height: rect.height + 2 * feather,
          },
          { width: W, height: H },
        );
        let done: { tex: Target; valid: Size; covered?: Box } | undefined;
        if (mode === 0) {
          const sigma = fx.sigma * scale;
          const pad = 3 * sigma + feather;
          done = blurArea(
            clampBox(
              {
                x: rect.x - pad,
                y: rect.y - pad,
                width: rect.width + 2 * pad,
                height: rect.height + 2 * pad,
              },
              draw,
            ),
            sigma,
            draw,
          );
        } else if (mode === 1) {
          done = blockArea(rect, fx.block * scale, draw);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        drawRect(gl, composite, null, canvasBox, quadBox, () => {
          if (done) setFx(composite, done, rect);
          else gl.uniform1i(composite.u("mode"), 2);
          gl.uniform1f(composite.u("block"), fx.block * scale);
          gl.uniform4f(
            composite.u("shape"),
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            rect.width / 2,
            rect.height / 2,
          );
          gl.uniform1i(composite.u("ellipse"), r.shape === "ellipse" ? 1 : 0);
          gl.uniform1f(composite.u("feather"), feather);
        });
        gl.disable(gl.BLEND);
      }
    },
    dispose() {
      loseContext(gl);
    },
  };
}
