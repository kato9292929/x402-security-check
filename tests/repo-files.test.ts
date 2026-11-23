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

import { excerpt, localImports } from "../server/src/tools/repo-files.js";

describe("read_repository imports and excerpts", () => {
  it("follows local imports from x402 code (relative, @/ alias, .js to .ts, Python)", () => {
    const all = new Set(["src/lib/jin-data.ts", "src/lib/x402-route.ts", "src/lib/receipts.ts", "src/app/api/jin/series/route.ts", "storage/db.py", "api/x402.py", "api/util/__init__.py"]);
    const ts = `import { withX402 } from "@/lib/x402-route";\nimport { getJinSeries } from "../../../../lib/jin-data.js";\nimport next from "next/server";`;
    expect(localImports("src/app/api/jin/series/route.ts", ts, all)).toEqual(["src/lib/jin-data.ts", "src/lib/x402-route.ts"]);
    const py = "from storage.db import get\nfrom .util import x\nimport os";
    expect(localImports("api/x402.py", py, all)).toEqual(["api/util/__init__.py", "storage/db.py"]);
  });
  it("cuts long files and says where", () => {
    const e = excerpt(Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n"), 1000);
    expect(e.cut).toBe(true);
    expect(e.content.length).toBeLessThan(1100);
    expect(e.content).toMatch(/cut after line \d+; read the rest with paths/);
  });
});

import { x402Score } from "../server/src/tools/repo-files.js";

describe("read_repository ranking", () => {
  it("ranks x402 route and receipt code above long files that mention payments once", () => {
    const route = x402Score("src/lib/x402-route.ts", "withX402 settle facilitator payTo PAYMENT-RESPONSE ".repeat(5));
    const receipts = x402Score("src/lib/receipts.ts", "// x402 receipts\n" + "x".repeat(2000));
    const job = x402Score("jobs/daily.py", "settle\n" + "y".repeat(40000));
    const page = x402Score("src/app/page.tsx", "Pay in USDC\n" + "z".repeat(5000));
    expect(route).toBeGreaterThan(receipts);
    expect(receipts).toBeGreaterThan(job);
    expect(page).toBe(0);
  });
});
