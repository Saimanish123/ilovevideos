/**
 * What `import … from "zod"` resolves to in browser bundles (page and workers), through
 * `turbopack.resolveAlias` in next.config.ts. It sets zod's jitless flag first, then re-exports the
 * real package unchanged. Server code and tests import zod directly.
 */
import "./zod-jitless";
import z4 from "zod/v4";

export * from "zod/v4";
export default z4;
