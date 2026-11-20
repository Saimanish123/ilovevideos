import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // DSP tests take 1 to 2 s on a laptop and can pass 5 s on shared CI runners.
    testTimeout: process.env.CI ? 30_000 : 5_000,
  },
});
