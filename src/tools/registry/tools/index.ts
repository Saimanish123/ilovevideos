import { addAudioToVideo } from "./add-audio-to-video";
import { addBorderToVideo } from "./add-border-to-video";
import { addFilterToVideo } from "./add-filter-to-video";
import { addImageToVideo } from "./add-image-to-video";
import { addIntroToVideo } from "./add-intro-to-video";
import { addProgressBarToVideo } from "./add-progress-bar-to-video";
import { addSubtitlesToVideo } from "./add-subtitles-to-video";
import { addTextToVideo } from "./add-text-to-video";
import { addTimerToVideo } from "./add-timer-to-video";
import { addWatermarkToVideo } from "./add-watermark-to-video";
import { adjustVideoBrightness } from "./adjust-video-brightness";
import { audioConverter } from "./audio-converter";
import { audioEditTools } from "./audio-edits";
import { audioPairTools } from "./audio-pairs";
import { audioToVideo } from "./audio-to-video";
import { blackAndWhiteVideo } from "./black-and-white-video";
import { blurVideo } from "./blur-video";
import { boomerangVideo } from "./boomerang-video";
import { changeSubtitleFrameRate } from "./change-subtitle-frame-rate";
import { changeVideoAspectRatio } from "./change-video-aspect-ratio";
import { changeVideoBitrate } from "./change-video-bitrate";
import { changeVideoCodec } from "./change-video-codec";
import { changeVideoCreationDate } from "./change-video-creation-date";
import { changeVideoFrameRate } from "./change-video-frame-rate";
import { changeVideoSpeed } from "./change-video-speed";
import { changeVideoThumbnail } from "./change-video-thumbnail";
import { compressPlatformTools } from "./compress-platforms";
import { compressSizeTools } from "./compress-sizes";
import { compressVideo } from "./compress-video";
import { cropVideo } from "./crop-video";
import { cutVideoIntoShorts } from "./cut-video-into-shorts";
import { denoiseVideo } from "./denoise-video";
import { editVideoMetadata } from "./edit-video-metadata";
import { extractAudioFromVideo } from "./extract-audio-from-video";
import { extractFrameFromVideo } from "./extract-frame-from-video";
import { extractSubtitlesFromVideo } from "./extract-subtitles-from-video";
import { fadeVideo } from "./fade-video";
import { fixSubtitleOverlaps } from "./fix-subtitle-overlaps";
import { flipVideo } from "./flip-video";
import { freezeFrameVideo } from "./freeze-frame-video";
import { gifToMp4 } from "./gif-to-mp4";
import { h264ToHevc } from "./h264-to-hevc";
import { hevcToH264 } from "./hevc-to-h264";
import { imagesToVideo } from "./images-to-video";
import { loopVideo } from "./loop-video";
import { mergeVideos } from "./merge-videos";
import { mp4ToMp3 } from "./mp4-to-mp3";
import { optimizeVideoForWeb } from "./optimize-video-for-web";
import { pairTools } from "./pairs";
import { pictureInPictureVideo } from "./picture-in-picture-video";
import { removeAudioFromVideo } from "./remove-audio-from-video";
import { removeBlackBarsFromVideo } from "./remove-black-bars-from-video";
import { removeGreenScreenFromVideo } from "./remove-green-screen-from-video";
import { removeMetadataFromVideo } from "./remove-metadata-from-video";
import { repairVideo } from "./repair-video";
import { replaceAudioInVideo } from "./replace-audio-in-video";
import { resizePlatformTools } from "./resize-platforms";
import { reverseVideo } from "./reverse-video";
import { rotateVideo } from "./rotate-video";
import { screenRecorder } from "./screen-recorder";
import { sharpenVideo } from "./sharpen-video";
import { sharpestFrameFromVideo } from "./sharpest-frame-from-video";
import { shiftSubtitleTiming } from "./shift-subtitle-timing";
import { sideBySideVideo } from "./side-by-side-video";
import { soundTools } from "./sound-tools";
import { splitVideo } from "./split-video";
import { stabilizeVideo } from "./stabilize-video";
import { subtitleConverter } from "./subtitle-converter";
import { subtitlePairTools } from "./subtitle-pairs";
import { trimVideo } from "./trim-video";
import { verticalVideoToHorizontal } from "./vertical-video-to-horizontal";
import { videoAudioPairTools } from "./video-audio-pairs";
import { videoContactSheet } from "./video-contact-sheet";
import { videoConverter } from "./video-converter";
import { videoInfo } from "./video-info";
import { videoThumbnailMaker } from "./video-thumbnail-maker";
import { videoToApng } from "./video-to-apng";
import { videoToAvif } from "./video-to-avif";
import { videoToGif } from "./video-to-gif";
import { videoToImageSequence } from "./video-to-image-sequence";
import { videoToWebp } from "./video-to-webp";
import { voiceRecorder } from "./voice-recorder";
import { webcamRecorder } from "./webcam-recorder";
import { zoomVideo } from "./zoom-video";

/**
 * Add every tool here. Format pairs come from `./pairs` (profile library + pair story).
 * `scripts/validate-registry.ts` enforces schema, slug uniqueness, no duplicate pages and content rules.
 */
export const toolInputs = [
  compressVideo,
  ...compressSizeTools,
  ...compressPlatformTools,
  videoConverter,
  ...pairTools,
  trimVideo,
  splitVideo,
  mergeVideos,
  removeAudioFromVideo,
  videoToGif,
  videoToWebp,
  videoToApng,
  videoToAvif,
  sharpestFrameFromVideo,
  videoThumbnailMaker,
  gifToMp4,
  imagesToVideo,
  extractAudioFromVideo,
  mp4ToMp3,
  ...videoAudioPairTools,
  audioConverter,
  audioToVideo,
  ...audioPairTools,
  addAudioToVideo,
  replaceAudioInVideo,
  rotateVideo,
  flipVideo,
  cropVideo,
  changeVideoAspectRatio,
  ...resizePlatformTools,
  changeVideoSpeed,
  removeMetadataFromVideo,
  editVideoMetadata,
  changeVideoCreationDate,
  changeVideoThumbnail,
  repairVideo,
  extractFrameFromVideo,
  videoContactSheet,
  videoToImageSequence,
  videoInfo,
  addSubtitlesToVideo,
  addWatermarkToVideo,
  addTextToVideo,
  // Text and time on the picture (round 3, builder B).
  addProgressBarToVideo,
  addTimerToVideo,
  addIntroToVideo,
  subtitleConverter,
  ...subtitlePairTools,
  shiftSubtitleTiming,
  fixSubtitleOverlaps,
  changeSubtitleFrameRate,
  extractSubtitlesFromVideo,
  ...audioEditTools,
  ...soundTools,
  // Video edits (Phase 2): frame rate, codec, fast start, loop, reverse, borders, colour, fades.
  changeVideoFrameRate,
  changeVideoCodec,
  hevcToH264,
  h264ToHevc,
  optimizeVideoForWeb,
  loopVideo,
  boomerangVideo,
  reverseVideo,
  addBorderToVideo,
  verticalVideoToHorizontal,
  blackAndWhiteVideo,
  addFilterToVideo,
  adjustVideoBrightness,
  fadeVideo,
  // Regions and layers (round 3, builder A).
  blurVideo,
  addImageToVideo,
  removeGreenScreenFromVideo,
  // Time and layout (round 3, builder C).
  freezeFrameVideo,
  zoomVideo,
  // Picture quality (round 3, builder D).
  stabilizeVideo,
  sharpenVideo,
  denoiseVideo,
  removeBlackBarsFromVideo,
  changeVideoBitrate,
  pictureInPictureVideo,
  sideBySideVideo,
  cutVideoIntoShorts,
  // Recorders (ADR-0099).
  screenRecorder,
  webcamRecorder,
  voiceRecorder,
];
