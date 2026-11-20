import type { ToolInput } from "../schema";

export const changeAudioPitch: ToolInput = {
  slug: "change-audio-pitch",
  engine: "pitch",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio", "video"],
  produces: "audio",
  keywords: [
    "change pitch of audio",
    "pitch shifter",
    "change key of song",
    "transpose audio",
    "change pitch without changing speed",
    "change pitch of video",
  ],
  aliases: ["pitch shift", "transpose", "key changer", "raise pitch", "lower pitch"],
  related: ["key-bpm-finder", "change-audio-speed", "change-audio-volume", "trim-audio"],
  updatedAt: "2026-11-18",
  icon: "music-2",
  content: {
    en: {
      title: "Change audio pitch",
      subtitle: "Move a song or voice up or down in pitch.",
      metaTitle: "Change audio pitch online, free, no upload",
      metaDescription:
        "Shift the pitch of an MP3, WAV or video's sound by semitones and cents without changing its speed. Listen first. Runs on your device. Free.",
      action: "Change pitch",
      what: "This tool raises or lowers the pitch of an audio file, or of the sound in a video, while every second stays where it was: a three-minute song is still three minutes, at the same tempo, in another key. You choose the shift in semitones, fine-tune it in cents, and listen to a few seconds from any point before processing the whole file.",
      steps: [
        "Drop an audio file or a video onto the page or choose one from your device.",
        "Set how many semitones to move it, up or down; 12 is a full octave.",
        "Move the playhead to a part you know well and press Listen to hear the shift there.",
        "Press Change pitch, then play the result and download it.",
      ],
      goodToKnow: [
        "A semitone is one step on a piano keyboard and changes every frequency by about 5.9%. Moving a song in A minor up 3 semitones puts it in C minor; moving it down 2 puts it in G minor. Singers often move a song by 1 to 3 semitones to bring it into their range. If you do not know the key you start from, the [key and BPM finder](/key-bpm-finder) reads it from the file.",
        "The shift is exact: a tone at 440 Hz moved up 3 semitones comes out at 523.25 Hz, and the output has the same number of samples as the input, so it stays in sync with a video or with other tracks in a project. The sound is read faster or slower through a band-limited resampler, then stretched back to its length by a phase vocoder that keeps drum hits and plucked notes sharp instead of smearing them.",
        "Large shifts sound less natural on voices. Pitch and the resonances of a voice (its formants) move together here, so a voice raised by more than 3 or 4 semitones starts to sound smaller and one lowered that far sounds larger. Instruments tolerate bigger shifts than voices do.",
        "Cents fine-tune by hundredths of a semitone. They fix a recording made slightly sharp or flat, for example a tape that ran a little fast, or match a song tuned to A = 432 Hz to instruments at 440 Hz, which is a shift of about +32 cents.",
        "WAV and FLAC files are written sample for sample at their own depth. MP3, M4A, OGG and Opus are decoded and encoded once at a bitrate at least as high as the source's; MP3 and OGG need a one-time download. In a video, the picture is copied as it is and only the sound is encoded again. To change speed and pitch together, as a record played at the wrong speed does, use [change audio speed](/change-audio-speed) instead.",
      ],
      faq: [
        {
          q: "Does changing the pitch change the speed?",
          a: "No. The length, the tempo and the timing of every note stay the same; only the key moves.",
        },
        {
          q: "How many semitones should I shift a song to sing it?",
          a: "Start with 2 down for a song that is too high, or 2 up for one that is too low, and listen from the chorus. If that is not enough, try one more and listen again.",
        },
        {
          q: "Can I change the pitch of a video?",
          a: "Yes. Drop the video; its sound is shifted and encoded again, and the picture is copied untouched, so the picture keeps its quality and stays in sync.",
        },
        {
          q: "Will the result sound robotic?",
          a: "Shifts of a few semitones sound natural on most music. Very large shifts on voices change their character, because the resonances that make a voice sound like itself move with the pitch.",
        },
        {
          q: "Can I shift several files at once?",
          a: "Yes. Drop them together; each gets the same shift, and they download as a zip.",
        },
        {
          q: "Is my file uploaded?",
          a: "No. The sound is processed in your browser and the file never leaves this device.",
        },
      ],
    },
  },
};
