import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the single "paths" entry in tsconfig.json: "@/*" -> "./src/*".
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // The quote layer is pure TypeScript — no DOM, no React.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
