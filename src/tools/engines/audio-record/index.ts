import { captureEngine } from "../capture/engine";

/** Voice recorder: a microphone straight to M4A, WAV or Opus on the page (../capture/recorder, ADR-0099). */
export const audioRecordEngine = captureEngine("audio-record", "microphone");
