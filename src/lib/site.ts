/** Single source of truth for brand strings. See ADR-0001 (naming is a launch blocker). */
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? "ilovevideos",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "Free online video tools that run in your browser. Compress, convert, trim, resize and more. No upload, no account, no watermark.",
} as const;
