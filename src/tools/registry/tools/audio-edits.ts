import { changeAudioSampleRate } from "./change-audio-sample-rate";
import { changeAudioSpeed } from "./change-audio-speed";
import { changeAudioVolume } from "./change-audio-volume";
import { changeVideoVolume } from "./change-video-volume";
import { fadeAudio } from "./fade-audio";
import { fadeAudioInVideo } from "./fade-audio-in-video";
import { fixAudioSync } from "./fix-audio-sync";
import { normalizeAudio } from "./normalize-audio";
import { removeSilenceFromAudio } from "./remove-silence-from-audio";
import { removeSilenceFromVideo } from "./remove-silence-from-video";
import { selectAudioTracks } from "./select-audio-tracks";
import { stereoToMono } from "./stereo-to-mono";
import { trimAudio } from "./trim-audio";

/**
 * Phase 2 audio tools (E4–E7, E10, E11, C7), one file per page, listed here so the registry index
 * takes them with one line.
 */
export const audioEditTools = [
  changeVideoVolume,
  changeAudioVolume,
  normalizeAudio,
  fadeAudio,
  fadeAudioInVideo,
  fixAudioSync,
  selectAudioTracks,
  removeSilenceFromVideo,
  removeSilenceFromAudio,
  stereoToMono,
  changeAudioSampleRate,
  trimAudio,
  changeAudioSpeed,
];
