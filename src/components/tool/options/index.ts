import type { EngineId } from "@/tools/registry/schema";
import type { OptionsSpec } from "./types";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous option shapes; each spec is typed internally
export type AnySpec = OptionsSpec<any>;

/**
 * Each engine's options spec, loaded on demand (ADR-0016). Nothing here is imported statically, so
 * a tool page's first load carries none of the panels, timelines, heroes, planners or media
 * libraries behind them: the stage asks for its own spec when the first file is chosen. What a
 * page shows before that lives in `./idle` and reaches the stage from the server page.
 */
export const optionsLoaders: Partial<Record<EngineId, () => Promise<AnySpec>>> = {
  compress: () => import("./compress").then((m) => m.compressSpec),
  "convert-video": () => import("./convert-video").then((m) => m.convertVideoSpec),
  trim: () => import("./trim").then((m) => m.trimSpec),
  split: () => import("./split").then((m) => m.splitSpec),
  merge: () => import("./merge").then((m) => m.mergeSpec),
  mute: () => import("./mute").then((m) => m.muteSpec),
  "video-to-gif": () => import("./video-to-gif").then((m) => m.videoToGifSpec),
  "animated-image": () => import("./animated-image").then((m) => m.animatedImageSpec),
  "video-to-audio": () => import("./video-to-audio").then((m) => m.videoToAudioSpec),
  "convert-audio": () => import("./convert-audio").then((m) => m.convertAudioSpec),
  "add-audio": () => import("./add-audio").then((m) => m.addAudioSpec),
  rotate: () => import("./rotate").then((m) => m.rotateSpec),
  speed: () => import("./speed").then((m) => m.speedSpec),
  "strip-metadata": () => import("./strip-metadata").then((m) => m.stripMetadataSpec),
  "frame-extract": () => import("./frame-extract").then((m) => m.frameExtractSpec),
  inspect: () => import("./video-info").then((m) => m.videoInfoSpec),
  crop: () => import("./crop").then((m) => m.cropSpec),
  "aspect-ratio": () => import("./aspect-ratio").then((m) => m.aspectRatioSpec),
  "gif-to-video": () => import("./gif-to-video").then((m) => m.gifToVideoSpec),
  "subtitles-convert": () => import("./subtitles-convert").then((m) => m.subtitlesConvertSpec),
  "subtitles-add": () => import("./add-subtitles").then((m) => m.addSubtitlesSpec),
  watermark: () => import("./watermark").then((m) => m.watermarkSpec),
  framerate: () => import("./framerate").then((m) => m.framerateSpec),
  codec: () => import("./codec").then((m) => m.codecSpec),
  faststart: () => import("./faststart").then((m) => m.faststartSpec),
  loop: () => import("./loop").then((m) => m.loopSpec),
  reverse: () => import("./reverse").then((m) => m.reverseSpec),
  pad: () => import("./pad").then((m) => m.padSpec),
  filter: () => import("./filter").then((m) => m.filterSpec),
  "video-fade": () => import("./video-fade").then((m) => m.videoFadeSpec),
  volume: () => import("./volume").then((m) => m.volumeSpec),
  "audio-fade": () => import("./audio-fade").then((m) => m.audioFadeSpec),
  "audio-sync": () => import("./audio-sync").then((m) => m.audioSyncSpec),
  "audio-tracks": () => import("./audio-tracks").then((m) => m.audioTracksSpec),
  "remove-silence": () => import("./remove-silence").then((m) => m.removeSilenceSpec),
  pitch: () => import("./pitch").then((m) => m.pitchSpec),
  "speech-denoise": () => import("./speech-denoise").then((m) => m.speechDenoiseSpec),
  "audio-analyze": () => import("./audio-analyze").then((m) => m.audioAnalyzeSpec),
  ringtone: () => import("./ringtone").then((m) => m.ringtoneSpec),
  "join-audio": () => import("./join-audio").then((m) => m.joinAudioSpec),
  "edit-metadata": () => import("./edit-metadata").then((m) => m.editMetadataSpec),
  cover: () => import("./edit-metadata").then((m) => m.coverSpec),
  repair: () => import("./repair").then((m) => m.repairSpec),
  "subtitles-extract": () => import("./subtitles-extract").then((m) => m.subtitlesExtractSpec),
  "thumbnail-grid": () => import("./thumbnail-grid").then((m) => m.thumbnailGridSpec),
  "frame-pick": () => import("./frame-pick").then((m) => m.framePickSpec),
  thumbnail: () => import("./thumbnail").then((m) => m.thumbnailSpec),
  "video-to-frames": () => import("./video-to-frames").then((m) => m.videoToFramesSpec),
  "audio-to-video": () => import("./audio-to-video").then((m) => m.audioToVideoSpec),
  "images-to-video": () => import("./images-to-video").then((m) => m.imagesToVideoSpec),
  "text-overlay": () => import("./text-overlay").then((m) => m.textOverlaySpec),
  // Text and time on the picture (round 3, builder B).
  "time-overlay": () => import("./time-overlay").then((m) => m.timeOverlaySpec),
  "intro-outro": () => import("./intro-outro").then((m) => m.introOutroSpec),
  "blur-region": () => import("./blur-region").then((m) => m.blurRegionSpec),
  "image-overlay": () => import("./image-overlay").then((m) => m.imageOverlaySpec),
  "chroma-key": () => import("./chroma-key").then((m) => m.chromaKeySpec),
  "portrait-matte": () => import("./portrait-matte").then((m) => m.portraitMatteSpec),
  // Time and layout (round 3, builder C).
  // Picture quality (round 3, builder D).
  clarity: () => import("./clarity").then((m) => m.claritySpec),
  stabilize: () => import("./stabilize").then((m) => m.stabilizeSpec),
  bitrate: () => import("./bitrate").then((m) => m.bitrateSpec),
  "freeze-frame": () => import("./freeze-frame").then((m) => m.freezeFrameSpec),
  "zoom-pan": () => import("./zoom-pan").then((m) => m.zoomPanSpec),
  layout: () => import("./layout").then((m) => m.layoutSpec),
  clips: () => import("./clips").then((m) => m.clipsSpec),
  "screen-record": () => import("./capture").then((m) => m.screenRecordSpec),
  "webcam-record": () => import("./capture").then((m) => m.webcamRecordSpec),
  "audio-record": () => import("./capture").then((m) => m.audioRecordSpec),
};

const loaded = new Map<EngineId, Promise<AnySpec>>();

/** The engine's spec, loaded once per page; undefined for an engine with no page yet. */
export function loadSpec(engine: EngineId): Promise<AnySpec> | undefined {
  const load = optionsLoaders[engine];
  if (!load) return undefined;
  let p = loaded.get(engine);
  if (!p) {
    p = load().catch((e) => {
      loaded.delete(engine);
      throw e;
    });
    loaded.set(engine, p);
  }
  return p;
}
