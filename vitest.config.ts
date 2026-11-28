import { defineConfig } from "vitest/config";

// remote/ has its own tests (cd remote && npm test).
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
