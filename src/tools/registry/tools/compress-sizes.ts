import { type SizePageSpec, sizeTool } from "../compress-families";

/**
 * Compress to under N MB (README.md#feature-catalog, "Under N MB" size targets). Each size ships
 * because someone asks for that number, and the story says who and what it buys. The computed
 * "what it buys" paragraph comes from the engine's own planner, so it matches what the tool does.
 */
const specs: SizePageSpec[] = [
  {
    mb: 8,
    keywords: ["compress video to 8 mb", "video under 8mb"],
    related: ["compress-video-under-10mb", "trim-video", "remove-audio-from-video"],
    updatedAt: "2026-09-30",
    durations: [15, 30, 60, 180],
    sources: [
      {
        title: "Discord: Nitro Classic and Nitro (archived 2021-05-08)",
        url: "https://web.archive.org/web/20210508131411/https://support.discord.com/hc/en-us/articles/115000435108",
        checked: "2026-09-30",
      },
    ],
    lead: "This page re-encodes a video until it is under 8 MB, Discord's free limit for years and the number to use when a form, a forum or an app still asks for it. It works out the bitrate from the clip's length, lowers the resolution only when 8 MB cannot carry the full frame, and checks the real file size before handing it over.",
    subtitle: "Discord's old free limit, for short clips.",
    metaDescription:
      "Compress a clip of up to about 3:48 to under 8 MB in your browser. Resolution steps down only as needed. Files stay on your device. Free.",
    story: [
      "8 MB is 64 megabits. Spread over one minute that is a little over 1 Mbps for picture and sound together; over three minutes it is a third of that. At this size the length of the clip matters more than any setting, which is why the planner keeps full 1080p only for clips up to about 20 seconds and steps to 720p, 480p and 360p as the clip grows.",
      "8 MB was Discord's free upload cap for years: in May 2021 its Nitro help page said you could normally upload files up to 8 MB at a time, and Nitro Classic raised that to 50 MB (archived copy, linked below). Discord's current tables list 10 MB free, so an 8 MB file still goes through there with room to spare.",
      "When a clip has to be under 8 MB and still look sharp, cut it first. [Trim video](/trim-video) keeps the moment that matters, and every second removed gives the rest more bits. A clip that needs no sound can also lose it: [removing the audio](/remove-audio-from-video) frees the 64 to 128 kbps the track would take.",
    ],
    faq: [
      {
        q: "How long a video can fit in 8 MB?",
        a: "About 3:48 at the lowest quality this tool will make, 360p with 64 kbps sound. For something that looks good, aim for under a minute.",
      },
      {
        q: "Why did my 8 MB video come out at 480p?",
        a: "Because 8 MB spread over a minute leaves under 1 Mbps for the picture, and 1080p at that bitrate breaks into blocks. A smaller frame at the same bitrate looks cleaner. You can force a resolution in the options.",
      },
      {
        q: "Will the file be exactly 8 MB?",
        a: "A little under. The tool aims just below the limit and measures the result; if the encoder overshot, it encodes a second time at a lower bitrate.",
      },
      {
        q: "What if my video is already smaller than 8 MB?",
        a: "The page says so and does not re-encode it, because every re-encode costs some quality. Lower the target if you still want it smaller.",
      },
    ],
  },
  {
    mb: 10,
    keywords: ["compress video to 10 mb", "video under 10mb", "10mb video"],
    related: [
      "compress-video-for-discord",
      "compress-video-for-email",
      "compress-video-under-8mb",
      "compress-video-under-20mb",
    ],
    updatedAt: "2026-09-30",
    durations: [30, 60, 120, 180],
    lead: "This page makes a video smaller than 10 MB, the base file sharing limit in Discord's account caps table and the default message limit for Exchange work email. It plans the bitrate from the clip's length, measures the finished file, and encodes again if the first attempt came out over.",
    subtitle: "Fits Discord without Nitro and most work email.",
    metaDescription:
      "Compress a video to under 10 MB for Discord or Exchange email. Clips up to about 4:45 fit; the size is measured. Runs in your browser. Free.",
    story: [
      "Two services publish exactly this number: Discord's account caps table lists 10 MB for accounts without Nitro, and Microsoft gives 10 MB as the default size limit for Exchange business email, message text included. For Discord, the [Discord page](/compress-video-for-discord) has the Nitro and server boost limits as buttons; for mail, the [email page](/compress-video-for-email) covers Gmail and Outlook as well.",
      "Screen recordings compress far better than camera footage at the same size, because most of the screen does not change from one frame to the next. A two-minute tutorial at 10 MB can look sharper than a 30-second phone clip of a crowd. The estimate line is the same for both; what differs is how clean the result looks, not how big it is.",
    ],
    faq: [
      {
        q: "How many minutes of video fit in 10 MB?",
        a: "At most about 4:45, at 360p. For a clip that looks good on a phone, keep it under about a minute, which stays at 720p.",
      },
      {
        q: "Does a 10 MB file work on Discord?",
        a: "Yes. 10 MB is what Discord's account caps table lists for free accounts, and it is under the 20 MB its attachments FAQ mentions, so it goes through either way.",
      },
      {
        q: "Why does the result say about 9 MB?",
        a: "The result line counts a megabyte as 1,048,576 bytes, as Windows does, while the target counts 1,000,000. A file just under 10,000,000 bytes shows as a little over 9 MB.",
      },
      {
        q: "Can I pick a different size?",
        a: "Yes. Type any size into the target field; the page recalculates the resolution and bitrate before you press Compress.",
      },
    ],
  },
  {
    mb: 16,
    keywords: ["compress video to 16 mb", "video under 16mb", "16mb whatsapp"],
    related: [
      "compress-video-for-whatsapp",
      "compress-video-under-20mb",
      "compress-video-under-10mb",
    ],
    updatedAt: "2026-09-30",
    durations: [30, 60, 180, 300],
    lead: "This page compresses a video to under 16 MB, the WhatsApp limit many guides still quote. It spreads the 16 MB over the clip's length, keeps the resolution as high as that bitrate allows, and checks the finished size.",
    subtitle: "The size older WhatsApp guides still quote.",
    metaDescription:
      "Compress a video to under 16 MB in your browser. Clips up to about 7:36 fit, 1080p for about 30 seconds. Files stay on your device. Free.",
    story: [
      "Many guides still quote 16 MB for WhatsApp. The current help page gives 64 MB for videos on every platform and 100 MB on a faster connection, so for WhatsApp itself the [WhatsApp page](/compress-video-for-whatsapp) gives a sharper file. Use 16 MB when the recipient is on an app, a form or a school portal that still enforces it.",
      "16 MB is 128 megabits. Spent on a 1080p clip, that is enough for about 30 seconds at full resolution, or two minutes at 480p. Phone footage of people talking holds up at the lower end; footage of water, leaves or confetti needs the higher bitrates, so cut those clips short.",
    ],
    faq: [
      {
        q: "Is WhatsApp's limit still 16 MB?",
        a: "Not according to WhatsApp's help centre, which gives 64 MB for videos. A 16 MB file still fits, at some cost in sharpness.",
      },
      {
        q: "How long can a 16 MB video be?",
        a: "Up to about 7:36 at 360p. For 1080p keep it to roughly 30 seconds; for 720p, about a minute.",
      },
      {
        q: "Why did the page encode twice?",
        a: "The first file came out over 16 MB, which happens with short or very detailed clips. The page measured it and encoded again at a bitrate corrected by the overshoot, so the file you get fits.",
      },
      {
        q: "Can I compress several videos to 16 MB each?",
        a: "Yes. Drop them together; each is planned from its own length and measured against 16 MB before you get it, and a file that already fits is skipped with the reason.",
      },
    ],
  },
  {
    mb: 20,
    keywords: ["compress video to 20 mb", "video under 20mb", "20mb video"],
    related: [
      "compress-video-for-email",
      "compress-video-for-discord",
      "compress-video-under-25mb",
      "compress-video-under-16mb",
    ],
    updatedAt: "2026-09-30",
    durations: [60, 120, 180, 300],
    lead: "This page compresses a video to under 20 MB, the email size limit Microsoft gives for Outlook.com and Gmail accounts in the Outlook app, and the free upload size Discord's attachments FAQ now lists. It aims just under the number and checks the real file before you download it.",
    subtitle: "Fits Outlook email and Discord's free uploads.",
    metaDescription:
      "Compress a video to under 20 MB for Outlook or Discord's newer free limit. Clips up to about 9:30 fit. Runs in your browser. Free, no account.",
    story: [
      "20 MB has become a meeting point. Microsoft's Outlook help gives 20 MB as the email size limit for internet accounts such as Outlook.com and Gmail, counting the message text; Discord's attachments FAQ gives 20 MB for accounts without Nitro while its caps table still says 10 MB. The [email page](/compress-video-for-email) and the [Discord page](/compress-video-for-discord) have those tiers as buttons.",
      "At 20 MB a two-minute clip keeps 720p at a little over 1 Mbps, enough for a walkthrough, a product demo or a family clip watched on a phone. Somewhere past two minutes the picture drops to 480p; if the detail matters, a shorter cut serves better than a smaller frame.",
    ],
    faq: [
      {
        q: "Is 20 MB small enough for Outlook?",
        a: "For Outlook.com and Gmail accounts in the Outlook app, 20 MB is the published limit including the message. The file lands a little under 20 MB, which leaves room for a short note.",
      },
      {
        q: "How long a video fits in 20 MB?",
        a: "About 9:30 at the lowest usable quality. For 720p, stay under roughly two minutes.",
      },
      {
        q: "Why not use 25 MB for Gmail?",
        a: "You can: the [under 25 MB page](/compress-video-under-25mb) targets Gmail's limit. 20 MB is the safer choice when you do not know which mail app the recipient uses.",
      },
      {
        q: "Does the page change the frame rate?",
        a: "No. The frame rate stays as recorded; only the bitrate and, when needed, the resolution change.",
      },
    ],
  },
  {
    mb: 25,
    keywords: ["compress video to 25 mb", "video under 25mb", "25mb gmail"],
    related: [
      "compress-video-for-email",
      "compress-video-under-20mb",
      "compress-video-under-50mb",
      "video-info",
    ],
    updatedAt: "2026-09-30",
    durations: [60, 120, 300, 600],
    lead: "This page compresses a video to under 25 MB, the attachment limit for personal Gmail accounts, so the video stays attached instead of being swapped for a Google Drive link. The bitrate is planned from the clip's length and the finished file is measured before you get it.",
    subtitle: "Fits Gmail, so the video stays attached.",
    metaDescription:
      "Compress a video to under 25 MB so Gmail keeps it attached instead of a Drive link. Clips up to about 11:52 fit. Runs in your browser. Free.",
    story: [
      "Gmail's help page puts the limit for personal accounts at 25 MB of attachments in total, and when an email goes over it Gmail removes the attachment and adds a Drive link. For a recipient who needs the file itself, such as an application form that accepts attachments, that link is a problem. Work and school accounts use whatever limit the Workspace administrator set, which may be lower.",
      "At this size a one-minute clip keeps full 1080p at about 3 Mbps. To see how far a particular file has to go, open it in [video info](/video-info): the original bitrate against the planned one tells you how much detail will be given up, before you spend time encoding.",
    ],
    faq: [
      {
        q: "What happens if my video is over 25 MB in Gmail?",
        a: "Gmail removes the attachment and inserts a Google Drive link to it. The recipient then needs access to the Drive file instead of getting the video in the email.",
      },
      {
        q: "How long can a 25 MB video be?",
        a: "Just under 12 minutes (11:52) at 360p. A one-minute clip stays at 1080p.",
      },
      {
        q: "Does 25 MB include the email text?",
        a: "Gmail's help counts attachments toward 25 MB. Microsoft's Outlook help counts the whole message for its 20 MB limit, so from the Outlook app use the [email page](/compress-video-for-email) and pick 20 MB.",
      },
      {
        q: "Is the quality worse than the original?",
        a: "Slightly, as with any re-encode. For a short clip at 25 MB the difference is hard to see on a phone; long clips show it first in dark or busy scenes.",
      },
    ],
  },
  {
    mb: 50,
    keywords: ["compress video to 50 mb", "video under 50mb", "nitro basic video"],
    related: [
      "compress-video-for-discord",
      "compress-video-under-25mb",
      "compress-video-under-100mb",
      "trim-video",
    ],
    updatedAt: "2026-09-30",
    durations: [120, 300, 600, 1200],
    lead: "This page compresses a video to under 50 MB, the upload limit for Discord Nitro Basic and for every member of a level 2 boosted Discord server. At this size most short clips keep full 1080p, and the page lowers the resolution only for long recordings.",
    subtitle: "Fits Discord Nitro Basic and level 2 boosted servers.",
    metaDescription:
      "Compress a video to under 50 MB for Discord Nitro Basic or a level 2 server. A two-minute clip keeps 1080p. Runs in your browser. Free.",
    story: [
      "Discord's account caps table lists 50 MB for Nitro Basic, and its server caps give 50 MB to all members of a level 2 boosted server, whatever their own subscription. The [Discord page](/compress-video-for-discord) has every Discord tier as a button; this page is for when 50 MB is the number you already know.",
      "50 MB is generous for short clips: up to two minutes stays at 1080p at about 3 Mbps. It is where a five-minute recording, a lecture excerpt or a whole song filmed on a phone starts to fit at 720p. For anything past about 20 minutes, [trimming](/trim-video) serves better than squeezing.",
    ],
    faq: [
      {
        q: "How long can a 50 MB video be?",
        a: "About 23:44 at 360p. For 720p, stay under roughly five minutes.",
      },
      {
        q: "Is 50 MB the same as the Discord Nitro limit?",
        a: "It is the Nitro Basic limit. Full Nitro is listed at 500 MB in the account caps table, and the Nitro page mentions files up to 1 GB.",
      },
      {
        q: "Will a 50 MB MP4 play on a phone?",
        a: "Yes. The file is H.264 video with AAC audio in an MP4, which every phone and browser plays.",
      },
      {
        q: "Why does a short clip barely shrink?",
        a: "A clip close to 50 MB has little to remove, and one already under 50 MB is left alone: the page says so instead of re-encoding it.",
      },
    ],
  },
  {
    mb: 100,
    keywords: ["compress video to 100 mb", "video under 100mb", "100mb video"],
    related: [
      "compress-video-for-whatsapp",
      "compress-video-for-discord",
      "compress-video-under-50mb",
    ],
    updatedAt: "2026-09-30",
    durations: [180, 300, 600, 1200],
    lead: "This page compresses a video to under 100 MB, the default WhatsApp video limit on a faster connection and the upload limit for every member of a level 3 boosted Discord server. It is meant for long phone recordings that run to hundreds of megabytes.",
    subtitle: "For long recordings on WhatsApp or boosted Discord servers.",
    metaDescription:
      "Compress a long video to under 100 MB. Recordings up to about 47 minutes fit; 4K comes down to the frame the bitrate can fill. Runs in your browser.",
    story: [
      "Both numbers come from the platforms' own help pages: WhatsApp gives 100 MB, at 720p, as the default video limit on a faster connection and 64 MB otherwise, and Discord gives 100 MB to all members of a level 3 boosted server. For WhatsApp the [WhatsApp page](/compress-video-for-whatsapp) defaults to the 64 MB that works on any connection.",
      "At 100 MB the question is rarely whether a video fits but how much of the original survives. A five-minute clip gets about 2.4 Mbps at 720p, and three minutes keep 1080p at around 4 Mbps. A 4K source is brought down to the largest frame the bitrate can fill, usually 1080p or 720p.",
    ],
    faq: [
      {
        q: "How long a video fits in 100 MB?",
        a: "About 47 minutes (47:28) at 360p. A 20-minute recording still fits at 480p.",
      },
      {
        q: "Why does the page keep 1080p for some clips and not others?",
        a: "It keeps the full frame only while there are enough bits per pixel for it. Below that it steps down to 720p or 480p, which looks cleaner at the same size.",
      },
      {
        q: "Can it bring a 4K video under 100 MB?",
        a: "Yes. It lowers the resolution as far as the size needs; a 4K clip of a few minutes usually comes out at 1080p or 720p.",
      },
      {
        q: "Does WhatsApp accept 100 MB everywhere?",
        a: "No. WhatsApp's help centre gives 100 MB only on a faster connection; the limit that holds on every connection is 64 MB.",
      },
    ],
  },
];

/** Related fillers: the explicit list, then the other sizes nearest to this one. */
const withNearestSizes = (spec: SizePageSpec): SizePageSpec => ({
  ...spec,
  related: [
    ...spec.related,
    "compress-video",
    ...specs
      .filter((o) => Math.abs(o.mb - spec.mb) > 0)
      .sort((a, b) => Math.abs(a.mb - spec.mb) - Math.abs(b.mb - spec.mb))
      .map((o) => `compress-video-under-${o.mb}mb`),
  ],
});

export const compressSizeTools = specs.map(withNearestSizes).map(sizeTool);
