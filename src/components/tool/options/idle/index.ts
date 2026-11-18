import type { EngineId } from "@/tools/registry/schema";
import type { IdleSpec } from "../types";
import { idle as addAudio } from "./add-audio";
import { idle as animatedImage } from "./animated-image";
import { idle as aspectRatio } from "./aspect-ratio";
import { idle as audioAnalyze } from "./audio-analyze";
import { idle as audioFade } from "./audio-fade";
import { idle as audioRecord } from "./audio-record";
import { idle as audioSync } from "./audio-sync";
import { idle as audioToVideo } from "./audio-to-video";
import { idle as audioTracks } from "./audio-tracks";
import { idle as bitrate } from "./bitrate";
import { idle as blurRegion } from "./blur-region";
import { idle as chromaKey } from "./chroma-key";
import { idle as clarity } from "./clarity";
import { idle as clips } from "./clips";
import { idle as codec } from "./codec";
import { idle as compress } from "./compress";
import { idle as convertAudio } from "./convert-audio";
import { idle as convertVideo } from "./convert-video";
import { idle as cover } from "./cover";
import { idle as crop } from "./crop";
import { idle as editMetadata } from "./edit-metadata";
import { idle as faststart } from "./faststart";
import { idle as filter } from "./filter";
import { idle as frameExtract } from "./frame-extract";
import { idle as framePick } from "./frame-pick";
import { idle as framerate } from "./framerate";
import { idle as freezeFrame } from "./freeze-frame";
import { idle as gifToVideo } from "./gif-to-video";
import { idle as imageOverlay } from "./image-overlay";
import { idle as imagesToVideo } from "./images-to-video";
import { idle as inspect } from "./inspect";
import { idle as introOutro } from "./intro-outro";
import { idle as joinAudio } from "./join-audio";
import { idle as layout } from "./layout";
import { idle as loop } from "./loop";
import { idle as merge } from "./merge";
import { idle as mute } from "./mute";
import { idle as pad } from "./pad";
import { idle as pitch } from "./pitch";
import { idle as removeSilence } from "./remove-silence";
import { idle as repair } from "./repair";
import { idle as reverse } from "./reverse";
import { idle as ringtone } from "./ringtone";
import { idle as rotate } from "./rotate";
import { idle as screenRecord } from "./screen-record";
import { idle as speed } from "./speed";
import { idle as split } from "./split";
import { idle as stabilize } from "./stabilize";
import { idle as stripMetadata } from "./strip-metadata";
import { idle as subtitlesAdd } from "./subtitles-add";
import { idle as subtitlesConvert } from "./subtitles-convert";
import { idle as subtitlesExtract } from "./subtitles-extract";
import { idle as textOverlay } from "./text-overlay";
import { idle as thumbnail } from "./thumbnail";
import { idle as thumbnailGrid } from "./thumbnail-grid";
import { idle as timeOverlay } from "./time-overlay";
import { idle as trim } from "./trim";
import { idle as videoFade } from "./video-fade";
import { idle as videoToAudio } from "./video-to-audio";
import { idle as videoToFrames } from "./video-to-frames";
import { idle as videoToGif } from "./video-to-gif";
import { idle as volume } from "./volume";
import { idle as watermark } from "./watermark";
import { idle as webcamRecord } from "./webcam-record";
import { idle as zoomPan } from "./zoom-pan";

/**
 * Every engine's idle state, for the SERVER tool page only (components/tool/tool-page.tsx). Each
 * module is "use client", so here each entry is a client reference: the page passes its own entry
 * to the stage, and the browser loads that one module and nothing else from this map. Importing
 * this file from client code would ship every engine's idle state; the stage never does.
 */
export const idleSpecs: Partial<Record<EngineId, IdleSpec>> = {
  "add-audio": addAudio,
  "aspect-ratio": aspectRatio,
  "audio-to-video": audioToVideo,
  "audio-analyze": audioAnalyze,
  "audio-fade": audioFade,
  "audio-sync": audioSync,
  "audio-tracks": audioTracks,
  "blur-region": blurRegion,
  compress: compress,
  "convert-audio": convertAudio,
  "convert-video": convertVideo,
  crop: crop,
  "edit-metadata": editMetadata,
  cover: cover,
  "frame-extract": frameExtract,
  "frame-pick": framePick,
  "gif-to-video": gifToVideo,
  "image-overlay": imageOverlay,
  "images-to-video": imagesToVideo,
  inspect: inspect,
  "join-audio": joinAudio,
  merge: merge,
  "remove-silence": removeSilence,
  repair: repair,
  pitch: pitch,
  ringtone: ringtone,
  mute: mute,
  rotate: rotate,
  speed: speed,
  split: split,
  "strip-metadata": stripMetadata,
  "subtitles-add": subtitlesAdd,
  "subtitles-convert": subtitlesConvert,
  "subtitles-extract": subtitlesExtract,
  "text-overlay": textOverlay,
  "time-overlay": timeOverlay,
  "intro-outro": introOutro,
  "thumbnail-grid": thumbnailGrid,
  thumbnail: thumbnail,
  trim: trim,
  "video-to-audio": videoToAudio,
  "video-to-frames": videoToFrames,
  "video-to-gif": videoToGif,
  "animated-image": animatedImage,
  volume: volume,
  watermark: watermark,
  "chroma-key": chromaKey,
  codec: codec,
  faststart: faststart,
  filter: filter,
  framerate: framerate,
  loop: loop,
  pad: pad,
  reverse: reverse,
  "video-fade": videoFade,
  // Picture quality (round 3, builder D).
  clarity: clarity,
  stabilize: stabilize,
  bitrate: bitrate,
  "freeze-frame": freezeFrame,
  "zoom-pan": zoomPan,
  layout: layout,
  clips: clips,
  "screen-record": screenRecord,
  "webcam-record": webcamRecord,
  "audio-record": audioRecord,
};
