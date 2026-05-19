import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: "src/boot.ts",
      name: "KeenAI",
      formats: ["iife"],
      fileName: () => "keenai-widget.js",
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
    minify: "esbuild",
    target: "es2020",
  },
});
