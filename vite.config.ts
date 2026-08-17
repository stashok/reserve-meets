import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(root, "src/ui/sidepanel/index.html"),
        options: resolve(root, "src/ui/options/index.html"),
        background: resolve(root, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  plugins: [
    {
      name: "copy-extension-static",
      closeBundle() {
        cpSync(resolve(root, "manifest.json"), resolve(root, "dist/manifest.json"));
        cpSync(resolve(root, "src/content/extract.js"), resolve(root, "dist/extract.js"));
        cpSync(resolve(root, "src/content/overlay.js"), resolve(root, "dist/overlay.js"));
        mkdirSync(resolve(root, "dist/icons"), { recursive: true });
        for (const file of readdirSync(resolve(root, "icons"))) {
          if (file.endsWith(".png")) {
            cpSync(resolve(root, "icons", file), resolve(root, "dist/icons", file));
          }
        }
      },
    },
  ],
});
