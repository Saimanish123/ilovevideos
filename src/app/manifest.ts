import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * The installable app (ADR-0102): name from `site.name` (ADR-0001), the monochrome mark, and a share
 * target so a phone's Share menu can hand a video, a sound or a subtitle file to the site, which
 * opens a small chooser of tools for it (`/share`, the service worker receives the file). Colours are
 * the light theme's `--bg` and `--fg` tokens as hex (a manifest is read before any CSS).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: site.name,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f7f2",
    theme_color: "#f8f7f2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [
          {
            name: "media",
            accept: [
              "video/*",
              "audio/*",
              "image/gif",
              "image/*",
              ".srt",
              ".vtt",
              ".ass",
              ".ssa",
              ".sbv",
              ".mkv",
              ".m2ts",
              ".mts",
            ],
          },
        ],
      },
    },
  };
}
