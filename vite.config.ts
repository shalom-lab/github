import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const REPO = "github";
const rootDir = import.meta.dirname;

/** SPA fallbacks for GitHub Pages (no server rewrite). */
function spaFallback(): Plugin {
  return {
    name: "spa-fallback",
    closeBundle() {
      const dist = resolve(rootDir, "dist");
      const indexHtml = resolve(dist, "index.html");
      if (!existsSync(indexHtml)) return;
      copyFileSync(indexHtml, resolve(dist, "404.html"));
      for (const route of ["settings", "templates"]) {
        const dir = resolve(dist, route);
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, "index.html"), readFileSync(indexHtml, "utf8"));
      }
    },
  };
}

export default defineConfig({
  base: `/${REPO}/`,
  plugins: [react(), spaFallback()],
  build: { outDir: "dist", emptyOutDir: true },
});
