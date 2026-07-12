import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync } from "fs";

// Chrome MV3 content scripts run as CLASSIC scripts and CANNOT use ESM `import`.
// popup.html/options.html also load their JS as classic <script src> tags, and
// the background service worker is registered as a classic worker (no type:module).
// A single multi-entry ES build code-splits shared modules into a chunk that every
// entry `import`s — which makes all bundles ESM and silently breaks them on load
// (SyntaxError). So we build each entry as its own self-contained IIFE bundle:
// one vite pass per entry, selected via BUILD_ONE. package.json `build` runs the
// passes in order (content first wipes dist).
const entry = process.env.BUILD_ONE ?? "content";

export default defineConfig({
  build: {
    // First pass (content) clears dist; later passes append to it.
    emptyOutDir: entry === "content",
    outDir: "dist",
    minify: "terser",
    terserOptions: {
      // KEEP_CONSOLE=1 retains console.* for debugging the built extension.
      compress: { drop_console: !process.env.KEEP_CONSOLE },
    },
    rollupOptions: {
      input: { [entry]: resolve(__dirname, `src/${entry}.ts`) },
      output: {
        format: "iife",
        entryFileNames: "[name].js",
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    {
      name: "copy-html",
      closeBundle() {
        if (entry === "popup") {
          copyFileSync(
            resolve(__dirname, "src/popup.html"),
            resolve(__dirname, "dist/popup.html"),
          );
        }
        if (entry === "options") {
          copyFileSync(
            resolve(__dirname, "src/options.html"),
            resolve(__dirname, "dist/options.html"),
          );
        }
        if (entry === "sidepanel") {
          copyFileSync(
            resolve(__dirname, "src/sidepanel.html"),
            resolve(__dirname, "dist/sidepanel.html"),
          );
        }
      },
    },
  ],
});
