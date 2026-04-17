import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync } from "fs";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.ts"),
        popup: resolve(__dirname, "src/popup.ts"),
        options: resolve(__dirname, "src/options.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        inlineDynamicImports: false,
      },
    },
    outDir: "dist",
    minify: "terser",
    terserOptions: {
      compress: { drop_console: true },
    },
    emptyOutDir: true,
  },
  plugins: [
    {
      name: "copy-html",
      closeBundle() {
        copyFileSync(
          resolve(__dirname, "src/popup.html"),
          resolve(__dirname, "dist/popup.html"),
        );
        copyFileSync(
          resolve(__dirname, "src/options.html"),
          resolve(__dirname, "dist/options.html"),
        );
      },
    },
  ],
});
