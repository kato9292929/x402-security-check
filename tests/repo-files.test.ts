import { describe, expect, it } from "vitest";
import { numbered, selectPaths } from "../server/src/tools/repo-files.js";

describe("read_repository file selection", () => {
  it("picks configs, lockfiles and likely source files; skips tests, docs and node_modules", () => {
    const r = selectPaths([
      "package.json",
      "package-lock.json",
      "vercel.json",
      "next.config.ts",
      "middleware.ts",
      "app/api/quote/route.ts",
      "src/lib/pay.ts",
      "README.md",
      "tests/route.test.ts",
      "src/x.test.ts",
      "docs/example.ts",
      "node_modules/x402/index.js",
      "web/pnpm-lock.yaml",
      "components/Button.tsx",
    ]);
    expect(r.configs).toEqual(["middleware.ts", "next.config.ts", "package.json", "vercel.json"]);
    expect(r.lockfiles).toEqual(["package-lock.json", "web/pnpm-lock.yaml"]);
    expect(r.sources).toEqual(["src/lib/pay.ts", "app/api/quote/route.ts", "components/Button.tsx"]);
  });
  it("numbers lines for file:line citations", () => {
    expect(numbered("a\nb")).toBe("   1| a\n   2| b");
  });
});
