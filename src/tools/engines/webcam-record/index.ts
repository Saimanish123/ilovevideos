import { captureEngine } from "../capture/engine";

/** Webcam recorder: a camera and microphone straight to MP4 on the page (../capture/recorder, ADR-0099). */
export const webcamRecordEngine = captureEngine("webcam-record", "camera");
