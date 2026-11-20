import type { ToolInput } from "../schema";

export const editVideoMetadata: ToolInput = {
  slug: "edit-video-metadata",
  engine: "edit-metadata",
  category: "info",
  phase: "p2",
  backends: ["canvas"],
  accepts: ["video", "audio"],
  produces: "video",
  keywords: [
    "edit video metadata",
    "change video title metadata",
    "mp4 metadata editor",
    "add cover art to mp4",
    "edit mp3 tags online",
    "m4a tag editor",
  ],
  aliases: ["tags", "tag editor", "title", "artist", "album", "cover art", "id3"],
  related: [
    "remove-metadata-from-video",
    "video-info",
    "audio-converter",
    "extract-audio-from-video",
    "change-video-thumbnail",
    "change-video-creation-date",
  ],
  updatedAt: "2026-10-01",
  icon: "tag",
  content: {
    en: {
      title: "Edit video metadata",
      subtitle: "Change a file's title, artist, date and cover art.",
      metaTitle: "Edit video metadata online, free, no upload",
      metaDescription:
        "Change the title, artist, album, date and cover art of MP4, MOV, M4A, MP3 and FLAC files. Only the tags are rewritten; nothing is re-encoded or uploaded.",
      action: "Save tags",
      what: "This tool changes the descriptive tags inside a video or audio file: the title players show instead of the file name, the artist, album, genre, date and comment, and the cover picture. It rewrites the tag block where the file keeps it and leaves every byte of the picture and sound as it was, so a two-hour film takes no longer than a short clip. A card above the fields shows the file the way a player will list it, and it changes as you type.",
      steps: [
        "Drop an MP4, MOV, M4A, MP3 or FLAC file onto the page, or choose one from your device.",
        "Read the card: it shows the title, artist, album, year and cover the file carries now.",
        "Type the new values; an emptied field removes that tag. Genre and comment are under More fields.",
        "Choose a cover image if the format holds one, then press Save tags and download the copy.",
      ],
      goodToKnow: [
        "Every format keeps its tags somewhere different, and each one is written where its own players look. MP4, M4A and M4V use the item list that iTunes introduced (`©nam` for the title, `©ART` for the artist, `covr` for the cover) inside the movie header. MOV files from cameras and QuickTime keep short text atoms in the same header instead. MP3 has an ID3v2 tag at the start of the file and sometimes an older 128-byte ID3v1 tag at the end, and FLAC keeps Vorbis comments and a picture block before the audio.",
        "Nothing is re-muxed. A tool that copies the streams into a new container writes a new header, and the header carries more than tags: the time the recording was made, a GPS position in a format of its own, chapter marks, and in an MP3 the encoder header that tells players how much silence the encoder added. This tool rebuilds only the tag part and moves the pointers to the media by the number of bytes the tags grew or shrank, so all of that stays exactly as the camera or encoder wrote it.",
        "The date field is the tag players list, the year of a song or the date of a release. It is not the recording time a phone or camera stores for itself, which photo libraries use to sort clips; that stays as it was, and the card lists it under Kept as it is; [change the creation date](/change-video-creation-date) for that. If a video carries its location, the card says so too, and [remove metadata](/remove-metadata-from-video) writes a copy without it.",
        "Cover art goes into MP4, M4A, MP3 and FLAC files as JPEG or PNG, the two types their players read. A WebP, AVIF or other picture is converted to JPEG first, and anything over 3000 pixels on its long side is scaled down to that size. MOV has no standard place for a cover, so the picker is not offered for it. To make a frame of the video itself the picture a file shows, [change the video's thumbnail](/change-video-thumbnail).",
        "Several files at once take the same values: type an album and an artist once and every file gets them, while a field you leave empty keeps each file's own value, so their titles stay their own. MKV and WebM files are not supported yet; the page offers to [convert MKV to MP4](/mkv-to-mp4) first. After saving, [video info](/video-info) lists every field the new copy carries.",
      ],
      faq: [
        {
          q: "Does editing the tags change the video or sound quality?",
          a: "No. The picture and sound are the original bytes, copied as they are; only the tag block is rewritten. The file size changes by the size of the text and cover you add or remove.",
        },
        {
          q: "Why does my video show a file name like IMG_4411 instead of a title?",
          a: "Players show the file name when the file has no title tag. Type a title here and players that read tags show it instead, whatever the file is called.",
        },
        {
          q: "Which MP3 tag version is written?",
          a: "An MP3 that already has an ID3v2.3 or 2.4 tag keeps its version. A file without one gets ID3v2.3, the older and more widely supported of the two. An ID3v1 tag at the end is updated too, cut to its 30-character fields.",
        },
        {
          q: "Can I remove a tag instead of changing it?",
          a: "Yes. Empty the field and save: that tag is left out of the copy. To remove every tag at once, including location and device, use the remove metadata tool.",
        },
        {
          q: "Why can my MKV or WebM file not be edited?",
          a: "Matroska keeps its title in two places with different rules, and this tool does not write that format yet. Converting MKV to MP4 copies the streams without re-encoding when the codecs fit, and the MP4 can then be tagged here.",
        },
        {
          q: "Is the file uploaded?",
          a: "No. The tags are read and written in your browser, and the new copy is assembled from your file on this device.",
        },
      ],
    },
  },
};
