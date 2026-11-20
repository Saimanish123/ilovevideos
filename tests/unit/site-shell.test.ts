import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  type IllustrationId,
  illustrationComponent,
  illustrations,
  resolveIllustration,
} from "@/components/illustrations/tools";
import { illustrationToSvg } from "@/components/illustrations/tools/to-svg";
import { groupTools } from "@/components/layout/tool-groups";
import { hubIntros } from "@/content/site";
import { ogPalette } from "@/lib/og/palette";
import { getActiveCategories, getToolsByCategory, tools } from "@/tools/registry";

describe("illustrations (design system §7.1)", () => {
  it("every tool page resolves to a drawn illustration, none falls back to the glyph", () => {
    const missing = tools.filter((t) => !resolveIllustration(t.engine, t.illustration));
    expect(missing.map((t) => t.slug)).toEqual([]);
  });

  it("no two tool pages share an illustration, so every card and OG image shows its own job", () => {
    const colours = { subject: "#111111", muted: "#777777", raised: "#ffffff" };
    const owners = new Map<string, string[]>();
    for (const t of tools) {
      const id = resolveIllustration(t.engine, t.illustration);
      if (!id) continue;
      const svg = illustrationToSvg(createElement(illustrationComponent(id)), colours);
      owners.set(svg, [...(owners.get(svg) ?? []), t.slug]);
    }
    const shared = [...owners.values()].filter((slugs) => slugs.length > 1);
    expect(shared).toEqual([]);
  });

  it("serialise to standalone SVG under 3 KB with only the two tokens, made concrete", () => {
    const colours = { subject: "#111111", muted: "#777777", raised: "#ffffff" };
    const resolved = tools.map((t) => resolveIllustration(t.engine, t.illustration));
    const ids = new Set([...(Object.keys(illustrations) as IllustrationId[]), ...resolved]);
    for (const id of ids) {
      if (!id) continue;
      const svg = illustrationToSvg(createElement(illustrationComponent(id)), colours);
      expect(svg, id).toMatch(
        /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"[^>]* viewBox="0 0 240 160"/,
      );
      expect(svg, id).not.toMatch(/var\(|currentColor|view-box/);
      expect(svg.length, id).toBeLessThan(3000);
      const hexes = new Set(svg.match(/#[0-9a-f]{6}/g));
      for (const h of hexes) expect(Object.values(colours), `${id} ${h}`).toContain(h);
    }
  });
});

describe("OG palette", () => {
  it("reads the light tokens from globals.css as sRGB hex", () => {
    const p = ogPalette();
    expect(p.bgRaised).toBe("#ffffff");
    for (const v of Object.values(p)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("listings", () => {
  it("every active hub has a hand-written intro", () => {
    for (const c of getActiveCategories()) expect(hubIntros[c.id]?.length, c.id).toBeGreaterThan(0);
  });

  it("families and pairs collapse into groups; every page is listed exactly once", () => {
    for (const c of getActiveCategories()) {
      const list = getToolsByCategory(c.id);
      const { cards, groups } = groupTools(list, "en");
      const listed = [...cards, ...groups.flatMap((g) => g.members.map((m) => m.tool))];
      expect(listed.map((t) => t.slug).sort()).toEqual(list.map((t) => t.slug).sort());
      for (const t of cards) expect(t.family, t.slug).toBeUndefined();
      for (const g of groups) for (const m of g.members) expect(m.short.length).toBeGreaterThan(0);
    }
  });

  it("the size family's chips are the sizes", () => {
    const { groups } = groupTools(getToolsByCategory("compress"), "en");
    const size = groups.find((g) => g.key === "compress-size");
    expect(size?.members[0]?.short).toMatch(/^8\sMB$/);
  });
});
