import { compressVideo } from "./compress-video";
import { movToMp4 } from "./mov-to-mp4";

/** Add every tool here. `scripts/validate-registry.ts` enforces schema, slug uniqueness and content rules. */
export const toolInputs = [compressVideo, movToMp4];
