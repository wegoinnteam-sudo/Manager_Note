import { defineConfig } from "vite";

// Worker-side tests run under plain Node against a real SQLite-backed fake
// D1 (see worker/tests/helpers/fakeD1.ts) rather than the Workers runtime —
// this environment's Node/OS combination cannot load Cloudflare's workerd
// binary (see docs/known-issues.md), so this keeps the DB/business-logic
// layer genuinely tested without requiring workerd locally. CI on a modern
// Linux runner can additionally run true Workers-runtime integration tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["worker/tests/**/*.test.ts"],
  },
});
