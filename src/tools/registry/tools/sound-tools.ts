import { changeAudioPitch } from "./change-audio-pitch";
import { keyBpmFinder } from "./key-bpm-finder";
import { mergeAudio } from "./merge-audio";
import { ringtoneMaker } from "./ringtone-maker";

/**
 * Round 3 sound tools (E11: pitch, key and tempo, merge audio, ringtones), one file per page,
 * listed here so the registry index takes them with one line.
 */
export const soundTools = [mergeAudio, ringtoneMaker, changeAudioPitch, keyBpmFinder];
