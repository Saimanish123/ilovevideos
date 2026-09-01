import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * Retrieval crawlers are allowed (AI answers hand users a link to a working tool: upside).
 * Training-only crawlers are blocked; this has no effect on Google Search or AI Overviews.
 * Parameter URLs are blocked to prevent index bloat.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/dev/", "/*?*"] },
      { userAgent: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"], allow: "/" },
      { userAgent: ["Google-Extended", "GPTBot", "ClaudeBot", "CCBot"], disallow: "/" },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
