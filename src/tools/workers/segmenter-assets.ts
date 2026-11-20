/**
 * The person-segmentation model files (MediaPipe Selfie Segmentation, Apache 2.0, ADR-0118), served
 * from this origin under /models/selfie-segmenter/ and fetched only when the background tools need
 * them, after a video is chosen (ADR-0106). Nothing here carries user data; the path is checked so
 * this can never become a general fetch.
 */

export type SelfieModel = "general" | "landscape";

const cache = new Map<string, Promise<ArrayBuffer>>();

function file(path: string): Promise<ArrayBuffer> {
  if (!/^\/models\/selfie-segmenter\/(general|landscape)\/1\/[\w-]+\.(json|bin)$/.test(path))
    throw new Error("Not a bundled model file.");
  let p = cache.get(path);
  if (!p) {
    p = fetch(path) // privacy-allow: our own model file under /models, same origin, no user data
      .then((r) => {
        if (!r.ok) throw new Error(`The person finder could not be loaded (${r.status}).`);
        return r.arrayBuffer();
      });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

/** The model's graph (model.json, parsed) and its one weights file. */
export async function loadSelfieModel(
  kind: SelfieModel,
): Promise<{ json: unknown; weights: ArrayBuffer }> {
  const dir = `/models/selfie-segmenter/${kind}/1`;
  const [json, weights] = await Promise.all([
    file(`${dir}/model.json`),
    file(`${dir}/group1-shard1of1.bin`),
  ]);
  return { json: JSON.parse(new TextDecoder().decode(json)), weights };
}
