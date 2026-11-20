/**
 * Copy for the file-first suggestions (ADR-0125): each row is a fact read from the file and the
 * tools that act on it. Facts only; a row with nothing true to say is not shown. Kept apart from the
 * rest of the discovery copy so it loads only with the suggestions, after a file is chosen.
 */
export const fileFacts = {
  hevcIphone: "HEVC from an iPhone",
  hevc: "HEVC picture",
  toH264: "Convert to H.264 so it plays everywhere",
  container: (ext: string) => `${ext} file`,
  toMp4: "Convert to MP4",
  toMp3: "Convert to MP3",
  smaller: "Make it smaller",
  trim: "Trim it",
  shorts: "Cut it into clips for Shorts",
  location: "Location stored in the file",
  removeLocation: "Remove the location",
  fps: (fps: number) => `${fps} fps`,
  lowerFps: "Lower the frame rate",
  tracks: (n: number) => (n === 1 ? "1 sound track" : `${n} sound tracks`),
  pickTracks: "Pick the tracks to keep",
  subtitleTracks: (n: number) => (n === 1 ? "1 subtitle track" : `${n} subtitle tracks`),
  saveSubtitles: "Save as a subtitle file",
  gif: "Animated GIF",
  gifToMp4: "Turn it into an MP4",
  pictures: (n: number) => (n === 1 ? "A picture" : `${n} pictures`),
  slideshow: (n: number) => (n === 1 ? "Make a video from it" : "Make a video from them"),
  subtitles: (ext: string) => `${ext} subtitles`,
  convertSubtitles: "Convert to another format",
  addSubtitles: "Put them on a video",
  unreadable: "Could not be read here",
  repair: "Repair it",
  videos: (n: number) => (n === 1 ? "1 video" : `${n} videos`),
  merge: "Merge them into one",
  audioFiles: (n: number) => (n === 1 ? "1 audio file" : `${n} audio files`),
  mergeAudio: "Merge them into one",
} as const;
