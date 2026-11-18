import type { Metadata } from "next";
import { site } from "@/lib/site";
import { ogSize } from "./card";

/**
 * Open Graph and Twitter image metadata for one card from `/og/<file>.png` (src/app/og). The alt says
 * what the page does, not what the picture looks like.
 */
export function ogImages(
  file: string,
  alt: string,
): Pick<Metadata, "twitter"> & { images: NonNullable<Metadata["openGraph"]>["images"] } {
  const image = { url: `${site.url}/og/${file}.png`, ...ogSize, alt };
  return {
    images: [image],
    twitter: { card: "summary_large_image", images: [image] },
  };
}
