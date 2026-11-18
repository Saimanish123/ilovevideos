import type { EngineId } from "@/tools/registry/schema";
import type { Engine } from "./types";

/**
 * Engine loader used by the worker. Each engine is a separate chunk so a tool page only
 * downloads the code it needs. Add a line here when you add an engine folder.
 */
// biome-ignore lint/suspicious/noExplicitAny: engines are heterogeneous; options are validated by each engine's schema
type AnyEngine = Engine<any>;

const loaders: Partial<Record<EngineId, () => Promise<AnyEngine>>> = {
  compress: () => import("./compress").then((m) => m.compressEngine),
  "convert-video": () => import("./convert-video").then((m) => m.convertVideoEngine),
  trim: () => import("./trim").then((m) => m.trimEngine),
  split: () => import("./split").then((m) => m.splitEngine),
  merge: () => import("./merge").then((m) => m.mergeEngine),
  mute: () => import("./mute").then((m) => m.muteEngine),
  "video-to-gif": () => import("./video-to-gif").then((m) => m.videoToGifEngine),
  "animated-image": () => import("./animated-image").then((m) => m.animatedImageEngine),
  "video-to-audio": () => import("./video-to-audio").then((m) => m.videoToAudioEngine),
  "convert-audio": () => import("./convert-audio").then((m) => m.convertAudioEngine),
  "add-audio": () => import("./add-audio").then((m) => m.addAudioEngine),
  rotate: () => import("./rotate").then((m) => m.rotateEngine),
  speed: () => import("./speed").then((m) => m.speedEngine),
  "strip-metadata": () => import("./strip-metadata").then((m) => m.stripMetadataEngine),
  "frame-extract": () => import("./frame-extract").then((m) => m.frameExtractEngine),
  inspect: () => import("./inspect").then((m) => m.inspectEngine),
  crop: () => import("./crop").then((m) => m.cropEngine),
  "aspect-ratio": () => import("./aspect-ratio").then((m) => m.aspectRatioEngine),
  "gif-to-video": () => import("./gif-to-video").then((m) => m.gifToVideoEngine),
  "subtitles-convert": () => import("./subtitles-convert").then((m) => m.subtitlesConvertEngine),
  "subtitles-add": () => import("./subtitles-add").then((m) => m.addSubtitlesEngine),
  watermark: () => import("./watermark").then((m) => m.watermarkEngine),
  // Audio (Phase 2): sound shaping, sync and track selection.
  volume: () => import("./volume").then((m) => m.volumeEngine),
  "audio-fade": () => import("./audio-fade").then((m) => m.audioFadeEngine),
  "audio-sync": () => import("./audio-sync").then((m) => m.audioSyncEngine),
  "audio-tracks": () => import("./audio-tracks").then((m) => m.audioTracksEngine),
  "remove-silence": () => import("./remove-silence").then((m) => m.removeSilenceEngine),
  pitch: () => import("./pitch").then((m) => m.pitchEngine),
  "audio-analyze": () => import("./audio-analyze").then((m) => m.audioAnalyzeEngine),
  ringtone: () => import("./ringtone").then((m) => m.ringtoneEngine),
  "join-audio": () => import("./join-audio").then((m) => m.joinAudioEngine),
  framerate: () => import("./framerate").then((m) => m.framerateEngine),
  codec: () => import("./codec").then((m) => m.codecEngine),
  faststart: () => import("./faststart").then((m) => m.faststartEngine),
  loop: () => import("./loop").then((m) => m.loopEngine),
  reverse: () => import("./reverse").then((m) => m.reverseEngine),
  pad: () => import("./pad").then((m) => m.padEngine),
  filter: () => import("./video-filter").then((m) => m.filterEngine),
  "video-fade": () => import("./video-fade").then((m) => m.videoFadeEngine),
  "edit-metadata": () => import("./edit-metadata").then((m) => m.editMetadataEngine),
  cover: () =>
    import("./edit-metadata").then((m) => ({ ...m.editMetadataEngine, id: "cover" as const })),
  repair: () => import("./repair").then((m) => m.repairEngine),
  "subtitles-extract": () => import("./subtitles-extract").then((m) => m.subtitlesExtractEngine),
  "thumbnail-grid": () => import("./thumbnail-grid").then((m) => m.thumbnailGridEngine),
  "frame-pick": () => import("./frame-pick").then((m) => m.framePickEngine),
  thumbnail: () => import("./frame-pick").then((m) => m.thumbnailEngine),
  "video-to-frames": () => import("./video-to-frames").then((m) => m.videoToFramesEngine),
  "audio-to-video": () => import("./audio-to-video").then((m) => m.audioToVideoEngine),
  "images-to-video": () => import("./images-to-video").then((m) => m.imagesToVideoEngine),
  "text-overlay": () => import("./text-overlay").then((m) => m.textOverlayEngine),
  // Text and time on the picture (round 3, builder B).
  "time-overlay": () => import("./time-overlay").then((m) => m.timeOverlayEngine),
  "intro-outro": () => import("./intro-outro").then((m) => m.introOutroEngine),
  "blur-region": () => import("./blur-region").then((m) => m.blurRegionEngine),
  "image-overlay": () => import("./image-overlay").then((m) => m.imageOverlayEngine),
  "chroma-key": () => import("./chroma-key").then((m) => m.chromaKeyEngine),
  // Time and layout (round 3, builder C).
  // Picture quality (round 3, builder D).
  clarity: () => import("./clarity").then((m) => m.clarityEngine),
  stabilize: () => import("./stabilize").then((m) => m.stabilizeEngine),
  bitrate: () => import("./bitrate").then((m) => m.bitrateEngine),
  "freeze-frame": () => import("./freeze-frame").then((m) => m.freezeFrameEngine),
  "zoom-pan": () => import("./zoom-pan").then((m) => m.zoomPanEngine),
  layout: () => import("./layout").then((m) => m.layoutEngine),
  clips: () => import("./clips").then((m) => m.clipsEngine),
  // Recorders (ADR-0099): their options schema and capability probe; recording runs on the page.
  "screen-record": () => import("./screen-record").then((m) => m.screenRecordEngine),
  "webcam-record": () => import("./webcam-record").then((m) => m.webcamRecordEngine),
  "audio-record": () => import("./audio-record").then((m) => m.audioRecordEngine),
};

export const implementedEngines = Object.keys(loaders) as EngineId[];

export async function loadEngine(id: EngineId): Promise<AnyEngine> {
  const load = loaders[id];
  if (!load) throw new Error(`Engine "${id}" is not implemented yet`);
  return load();
}
