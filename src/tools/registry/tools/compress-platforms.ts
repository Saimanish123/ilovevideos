import { type PlatformPageSpec, platformTool } from "../compress-families";

/**
 * Compress for a platform (README.md#feature-catalog A8). One page per platform whose limit was read
 * from the platform's own help page; the numbers live in `src/content/platforms/` with source and date.
 * Platforms whose limits could not be verified from a primary source have no page yet.
 */
const specs: PlatformPageSpec[] = [
  {
    platform: "discord",
    slug: "compress-video-for-discord",
    keywords: [
      "compress video for discord",
      "discord video size limit",
      "discord file too large",
      "make video smaller for discord",
    ],
    aliases: ["discord", "nitro"],
    related: [
      "compress-video-under-10mb",
      "compress-video-under-50mb",
      "compress-video-for-whatsapp",
      "trim-video",
    ],
    icon: "send",
    updatedAt: "2026-09-30",
    title: "Compress video for Discord",
    subtitle: "Make a video small enough to send on Discord.",
    metaTitle: "Compress video for Discord, free, no upload",
    metaDescription:
      "Fit a video under Discord's limit: 10 or 20 MB free, 50 MB Nitro Basic, 500 MB Nitro. Runs in your browser; files never leave your device. Free.",
    what: "This page shrinks a video until it fits Discord's attachment limit, 10 MB by default, a size every free account can send. It writes H.264 video in an MP4, which Discord plays inline in the chat.",
    story: [
      "Discord's own help pages disagree. The attachments FAQ says the limit without Nitro is 20 MB and that Discord is experimenting with upload limits for some users; the account caps table still lists 10 MB free, 50 MB for Nitro Basic and 500 MB for Nitro; the Nitro page advertises files up to 1 GB. This page defaults to 10 MB because a file that size goes through on every account, whichever page is current for yours. If Discord takes 20 MB from you, pick 20 MB for a sharper picture.",
      "Boosted servers raise the limit for everyone posting in them, whatever their own account: 50 MB for all members at boost level 2 and 100 MB at level 3, per the same caps table. Level 1 leaves it at 10 MB. Posting in a level 3 server, type 100 into the target size.",
      "Discord's FAQ lists MP4 with H.264, HEVC or AV1 video among the files it plays in the chat. This page always writes H.264, the one that plays in every Discord client, including the web app in browsers without HEVC support, so a friend on an old laptop sees the same thing as one on a new phone.",
      "At 10 MB a one-minute clip lands at 720p, which reads well in the chat window, and a 15-second clip keeps full 1080p. For gameplay with a lot of motion, [trim the video](/trim-video) to the moment that matters before compressing: fewer seconds buy more bits per frame than any setting can.",
    ],
    faq: [
      {
        q: "What is the Discord file size limit without Nitro?",
        a: "Discord's account caps table lists 10 MB and its attachments FAQ lists 20 MB, and Discord says it is testing different limits. 10 MB works on every free account.",
      },
      {
        q: "How long can a video be at 10 MB?",
        a: "About 4:45 at the lowest quality this page will make, 360p with 64 kbps sound. Past that it asks you to trim or pick a larger tier instead of producing something unwatchable.",
      },
      {
        q: "Why does my compressed clip look soft?",
        a: "The limit is fixed, so a longer clip gets fewer bits per second. Cut it shorter, or choose 50 MB if you have Nitro Basic or are posting in a level 2 server.",
      },
      {
        q: "Does it keep the sound?",
        a: "Yes, as AAC at 128 kbps, dropping to 96 or 64 kbps only when a long clip leaves little room. Voice chat recordings stay clear at all three.",
      },
      {
        q: "Is my clip uploaded to compress it?",
        a: "No. It is re-encoded inside your browser tab; the only upload is the one you make to Discord when you post it.",
      },
    ],
  },
  {
    platform: "whatsapp",
    slug: "compress-video-for-whatsapp",
    keywords: [
      "compress video for whatsapp",
      "whatsapp video size limit",
      "whatsapp video too large",
      "send long video on whatsapp",
    ],
    aliases: ["whatsapp"],
    related: [
      "compress-video-under-100mb",
      "compress-video-under-16mb",
      "compress-video-for-email",
      "trim-video",
    ],
    icon: "send",
    updatedAt: "2026-09-30",
    title: "Compress video for WhatsApp",
    subtitle: "Make a video small enough to send on WhatsApp.",
    metaTitle: "Compress video for WhatsApp, free, no upload",
    metaDescription:
      "Fit a video under WhatsApp's 64 MB limit at 720p, the resolution WhatsApp gives for fast connections. Runs in your browser. Free, no account.",
    what: "This page makes a video small enough to send in a WhatsApp chat as a video rather than as a document: under 64 MB by default, at 720p. It re-encodes into an MP4 with H.264 and AAC. WhatsApp may compress it again as it sends; this page makes sure it is accepted as a video rather than refused or sent as a document.",
    story: [
      "WhatsApp's help centre gives two numbers. The maximum for videos sent or forwarded is 64 MB on all platforms; on a faster connection the default limit is 100 MB at 720p, while a slower connection gets 64 MB at 480p. This page defaults to 64 MB because it holds on any phone and any connection. The 16 MB figure that many guides still quote is older than the current help page.",
      "The page caps the picture at 720p because that is the resolution the help centre names for videos on a fast connection. At 64 MB, spending the bits on 720p rather than on a 4K frame gives a cleaner picture on the phone screen where it will be watched. For a larger frame, set Resolution to Keep or 1080p in the options; the size target still holds.",
      "Bigger files can go as a document instead, up to 2 GB according to the same page, but a document shows up in the chat as a file attachment, not as a video with a preview that plays in place. Compressing under 64 MB keeps the normal video bubble.",
      "Status updates have their own rule: 90 seconds per video, per the help centre. That is a length limit, not a size limit, so [trim video](/trim-video) is the tool for it; compress afterwards only if the trimmed clip is still large.",
    ],
    faq: [
      {
        q: "What is the WhatsApp video size limit?",
        a: "64 MB for videos sent or forwarded, on every platform, per WhatsApp's help centre. On a faster connection the default is 100 MB. Documents can be up to 2 GB.",
      },
      {
        q: "Is the WhatsApp limit still 16 MB?",
        a: "No. 16 MB is an older figure that keeps being repeated. The help centre now gives 64 MB, and the buttons on this page follow it.",
      },
      {
        q: "Why does this page use 720p?",
        a: "It matches the default resolution WhatsApp's help centre gives for fast connections, and a 720p file puts 64 MB into fewer pixels, which looks cleaner on a phone.",
      },
      {
        q: "Does it work on my phone?",
        a: "It runs wherever the browser can encode H.264, which the page checks when you drop the file; if yours cannot, it says so before you start. Save the result, then attach it in WhatsApp.",
      },
      {
        q: "Does this page send the video anywhere?",
        a: "No. It is compressed inside your browser; the only upload is the one WhatsApp makes when you press send.",
      },
    ],
  },
  {
    platform: "email",
    slug: "compress-video-for-email",
    keywords: [
      "compress video for email",
      "compress video for gmail",
      "compress video for outlook",
      "video too large to email",
      "email video size limit",
    ],
    aliases: ["gmail", "outlook", "email", "attachment"],
    related: [
      "compress-video-under-25mb",
      "compress-video-under-20mb",
      "compress-video-under-10mb",
      "extract-frame-from-video",
    ],
    icon: "mail",
    updatedAt: "2026-09-30",
    title: "Compress video for email",
    subtitle: "Make a video small enough to attach to an email.",
    metaTitle: "Compress video for email, free, no upload",
    metaDescription:
      "Shrink a video to attach it to an email: under 20 MB for Outlook, 25 MB for Gmail, 10 MB for Exchange. Runs in your browser. Free, no account.",
    what: "This page shrinks a video so it goes out as a real attachment instead of a cloud link: under 20 MB by default, which fits the Outlook app's limit for Outlook.com and Gmail accounts and sits inside Gmail's own 25 MB. It writes an H.264 MP4, a file every mail app and phone can open.",
    story: [
      "The limits apply per message, not per file. Gmail's help says personal accounts can send up to 25 MB in attachments; Microsoft's Outlook help says the limit for internet accounts such as Outlook.com or Gmail is 20 MB and that it counts the text of the email as well as the attachments. The 20 MB default leaves room for a message and a signature. Attaching two videos, split the budget, for example 9 MB each.",
      "Over 25 MB, Gmail does not refuse the email: it removes the attachment and puts a Google Drive link in its place. That suits colleagues, but not a recipient who needs the file itself, such as an application form that only takes attachments. Staying under the limit keeps the video in the message.",
      "Work and school accounts differ. On Google Workspace the administrator sets both the sending and the receiving limit; on Exchange the default message limit is 10 MB, per Microsoft. The recipient's limit matters as much as yours, since a 20 MB video sent from Gmail may be refused by a company server capped at 10 MB. Writing to a company address, choose 10 MB.",
      "A screen recording of a bug, a clip for a job application, a video of a leaking pipe for a landlord: for most of these a 720p file reads fine in a mail preview. If the video only needs to show one moment, [extract a frame](/extract-frame-from-video) and attach a still image instead.",
    ],
    faq: [
      {
        q: "What is the maximum video size for Gmail?",
        a: "25 MB of attachments for personal accounts, per Google's help. Anything bigger is turned into a Google Drive link automatically.",
      },
      {
        q: "Why does Outlook say my attachment is too large when it is under 25 MB?",
        a: "Microsoft gives 20 MB as the limit for internet accounts in the Outlook app, and that counts the email text too. Exchange work accounts default to 10 MB.",
      },
      {
        q: "Can I send two videos in one email?",
        a: "Yes, if both together fit the limit. Compress each to a little under half of it, for example 9 MB each for 20 MB, and leave room for the message.",
      },
      {
        q: "Will the recipient be able to play it?",
        a: "The result is an MP4 with H.264 video and AAC audio, the most widely supported combination there is, so it opens on any phone or computer.",
      },
      {
        q: "Is the video uploaded while it is compressed?",
        a: "No. The work happens in your browser; the only thing that leaves your device is the email you send.",
      },
    ],
  },
];

export const compressPlatformTools = specs.map(platformTool);
