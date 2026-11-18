/**
 * Platform upload limits for the compress-for-platform family (README.md#feature-catalog A8 and K,
 * ADR-0011 generated families). One profile per platform, facts only; the page story lives in
 * `src/tools/registry/tools/compress-platforms.ts`.
 *
 * Every number here was read on the platform's own help page on the date in `checked`. Limits change:
 * re-check each source quarterly (README.md#seo-strategy §7) and bump `checked` and the page's
 * `updatedAt` only when a number changes. A platform whose limit could not be read from a primary
 * source is not in this file.
 */

export type PlatformId = "discord" | "whatsapp" | "email";

export interface PlatformSource {
  /** Link text on the page, e.g. "Discord: File attachments FAQ". Defaults to the host name. */
  title?: string;
  url: string;
  /** ISO date the page was read. */
  checked: string;
  /** What the page says, close to verbatim, so the next person can tell whether it changed. */
  says: string;
}

export interface PlatformTier {
  /** Decimal megabytes. */
  mb: number;
  /** Who gets this limit, short enough for a segment: "Free", "Nitro Basic", "Gmail". */
  plan: string;
  /** One line under the control: where the number comes from and who it applies to. */
  note: string;
}

export interface PlatformProfile {
  id: PlatformId;
  /** As the platform writes it. */
  name: string;
  /** Size choices offered on the page, smallest first. */
  tiers: PlatformTier[];
  /** The tier selected with zero interaction: the one every account of this platform can send. */
  defaultMb: number;
  /** Resolution cap preselected on the page ("auto" lets the bitrate decide). */
  maxHeight: "auto" | 720;
  sources: PlatformSource[];
}

export const CHECKED = "2026-09-30";

export const platforms: Record<PlatformId, PlatformProfile> = {
  discord: {
    id: "discord",
    name: "Discord",
    tiers: [
      {
        mb: 10,
        plan: "Every account",
        note: "The free limit in Discord's account caps table. Goes through on every account.",
      },
      {
        mb: 20,
        plan: "Free (newer limit)",
        note: "The free limit in Discord's attachments FAQ. The caps table still says 10 MB.",
      },
      {
        mb: 50,
        plan: "Nitro Basic",
        note: "Nitro Basic, or any member of a level 2 boosted server.",
      },
      {
        mb: 500,
        plan: "Nitro",
        note: "Nitro, per the account caps table. The Nitro page mentions up to 1 GB.",
      },
    ],
    defaultMb: 10,
    maxHeight: "auto",
    sources: [
      {
        title: "Discord: File attachments FAQ",
        url: "https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ",
        checked: CHECKED,
        says: "For non-Nitro subscribers, the maximum file upload is 20MB. Also: we're currently experimenting with various file upload size limits; select users may be able to upload larger files. Video: MP4 with H264, HEVC/H265 or AV1.",
      },
      {
        title: "Discord: Account caps, server caps and more",
        url: "https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More",
        checked: CHECKED,
        says: "File Sharing Limit: 10MB (base), 50MB (Nitro Basic), 500MB (Nitro). Server upload: 10MB base and level 1, 50MB for all members at level 2, 100MB for all members at level 3.",
      },
      {
        title: "Discord: What are Nitro and Nitro Basic",
        url: "https://support.discord.com/hc/en-us/articles/115000435108-What-are-Nitro-Nitro-Basic",
        checked: CHECKED,
        says: "Nitro: share larger files up to 1GB. Nitro Basic: share larger files up to 50 MB.",
      },
    ],
  },
  whatsapp: {
    id: "whatsapp",
    name: "WhatsApp",
    tiers: [
      { mb: 64, plan: "Any connection", note: "The video limit on every platform and connection." },
      { mb: 100, plan: "Fast connection", note: "The default on a faster connection only." },
    ],
    defaultMb: 64,
    maxHeight: 720,
    sources: [
      {
        title: "WhatsApp Help Center: Can't send longer videos",
        url: "https://faq.whatsapp.com/823886715479103/",
        checked: CHECKED,
        says: "The maximum file size for videos sent or forwarded through WhatsApp is 64MB on all platforms. Faster connection: default video size limit 100MB and 720p. Slower connection: 64MB and 480p. Documents up to 2 GB. Status videos up to 90 seconds.",
      },
    ],
  },
  email: {
    id: "email",
    name: "Email",
    tiers: [
      {
        mb: 10,
        plan: "Exchange",
        note: "Work accounts on Exchange, whose default message limit is 10 MB.",
      },
      {
        mb: 20,
        plan: "Outlook",
        note: "The Outlook app with Outlook.com or Gmail, message text included.",
      },
      { mb: 25, plan: "Gmail", note: "Gmail on the web, personal accounts." },
    ],
    defaultMb: 20,
    maxHeight: "auto",
    sources: [
      {
        title: "Gmail Help: Send attachments with your Gmail message",
        url: "https://support.google.com/mail/answer/6584",
        checked: CHECKED,
        says: "For personal Gmail accounts, the limit is 25 MB. If your total attachment size is greater than the limit, Gmail automatically removes the attachment and adds it as a Google Drive link. Work and school limits are set by the Workspace administrator.",
      },
      {
        title: "Microsoft Support: Reduce attachment size to send large files with Outlook",
        url: "https://support.microsoft.com/en-us/outlook/reduce-attachment-size-to-send-large-files-with-outlook",
        checked: CHECKED,
        says: "For internet email accounts such as Outlook.com or Gmail, the email size limit is 20 megabytes (MB). For Exchange accounts (business email), the default email size limit is 10 MB. This limit includes both the size of the attachment and the size of the email.",
      },
    ],
  },
};

/** Segment label: "Nitro Basic · 50 MB". */
export const tierLabel = (t: PlatformTier) => `${t.plan} · ${t.mb} MB`;

export function getPlatform(id: unknown): PlatformProfile | undefined {
  return typeof id === "string" && id in platforms ? platforms[id as PlatformId] : undefined;
}
