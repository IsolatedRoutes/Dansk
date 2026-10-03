import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Source lives in src/. `npm run build` writes one self-contained index.html
// at the repository root, which is what GitHub Pages serves.
export default defineConfig({
  root: "src",
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { outDir: "..", emptyOutDir: false, target: "es2020" },
});
