import { captureEngine } from "../capture/engine";

/** Screen recorder: getDisplayMedia straight to MP4 on the page (../capture/recorder, ADR-0099). */
export const screenRecordEngine = captureEngine("screen-record", "display");
