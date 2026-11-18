import { describe, expect, it, vi } from "vitest";
import { optionsLoaders } from "@/components/tool/options";
import { idleSpecs } from "@/components/tool/options/idle";
import { isBatchable } from "@/components/tool/stage-run";
import { tools } from "@/tools/registry";

// Panels link with next-intl, which needs the Next runtime; the links do not matter here.
vi.mock("@/lib/i18n/navigation", () => ({
  Link: () => null,
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/",
}));

/**
 * The stage knows a page's idle state (options/idle) before its spec loads (options/index.ts). What
 * several files mean there must be what the spec says once it arrives.
 */
describe("idle specs", () => {
  it("every tool page's engine has a lazy spec and an idle state", () => {
    for (const t of tools) {
      expect(optionsLoaders[t.engine], t.slug).toBeDefined();
      expect(idleSpecs[t.engine], t.slug).toBeDefined();
    }
  });

  it("`several` matches the spec: multiple inputs, a batch queue, or one file", async () => {
    for (const [engine, load] of Object.entries(optionsLoaders)) {
      const spec = await load?.();
      if (!spec) continue;
      const expected = spec.multiple ? "multiple" : isBatchable(spec) ? "batch" : undefined;
      expect(idleSpecs[engine as keyof typeof idleSpecs]?.several, engine).toBe(expected);
    }
  });
});
