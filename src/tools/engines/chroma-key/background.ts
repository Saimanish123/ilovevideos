/**
 * Draws the green screen's background into a canvas of the output size: the colour, then an image
 * or video frame fitted (cover or contain, ./options `fitRect`) over it. One function for the page's
 * preview and the engine worker, so both put the background in the same place.
 */
import { type ChromaKeyOptions, fitRect, type Size } from "./options";

type C2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawBackground(
  c: C2D,
  canvas: Size,
  o: Pick<ChromaKeyOptions, "color" | "fit">,
  picture?: {
    width: number;
    height: number;
    /** Draws the picture into the box (a video sample draws itself, rotation included). */
    draw: (c: C2D, x: number, y: number, width: number, height: number) => void;
  },
) {
  const [r, g, b] = o.color;
  c.fillStyle = `rgb(${r} ${g} ${b})`;
  c.fillRect(0, 0, canvas.width, canvas.height);
  if (!picture || picture.width <= 0 || picture.height <= 0) return;
  const f = fitRect(picture, canvas, o.fit);
  c.imageSmoothingQuality = "high";
  picture.draw(c, f.x, f.y, f.width, f.height);
}
