import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { createElement } from "react";
import { type IllustrationId, illustrations } from "@/components/illustrations/tools";
import { illustrationToSvg } from "@/components/illustrations/tools/to-svg";
import { ogPalette } from "@/lib/og/palette";
import { site } from "@/lib/site";

/**
 * The social preview card (1200×630): site name, the page title and subtitle, and the tool's own
 * illustration on its well, so the card, the page and the preview share one picture (ADR-0008).
 * Fonts are the bundled Geist files from node_modules; nothing is fetched while building.
 */
export const ogSize = { width: 1200, height: 630 };

const font = (file: string) =>
  readFileSync(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file));

export function ogCard({
  title,
  subtitle,
  illustration,
}: {
  title: string;
  subtitle: string;
  illustration?: IllustrationId;
}): ImageResponse {
  const p = ogPalette();
  const svg = illustration
    ? illustrationToSvg(createElement(illustrations[illustration], { width: 480, height: 320 }), {
        subject: p.fg,
        muted: p.fgMuted,
        raised: p.bgRaised,
      })
    : undefined;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 64,
        padding: 64,
        background: p.bg,
        color: p.fg,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ fontSize: 28, fontWeight: 500, color: p.fgMuted }}>{site.name}</div>
        <div
          style={{
            marginTop: 32,
            fontSize: 72,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 24, fontSize: 30, lineHeight: 1.4, color: p.fgMuted }}>
          {subtitle}
        </div>
      </div>
      {svg && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 480,
            height: 320,
            borderRadius: 24,
            background: p.bgSubtle,
            border: `2px solid ${p.border}`,
          }}
        >
          <img
            alt="Illustration of the operation"
            width={400}
            height={267}
            src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
          />
        </div>
      )}
    </div>,
    {
      ...ogSize,
      fonts: [
        { name: "Geist", data: font("Geist-Regular.ttf"), weight: 400, style: "normal" },
        { name: "Geist", data: font("Geist-Medium.ttf"), weight: 500, style: "normal" },
        { name: "Geist", data: font("Geist-SemiBold.ttf"), weight: 600, style: "normal" },
      ],
    },
  );
}
