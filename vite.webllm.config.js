import { defineConfig } from "vite";

// The on-device model's software, built into one file in vendor/ so the app
// loads it from its own site instead of a third-party network. It is only
// fetched when someone turns on the local model. Rebuild after upgrading
// @mlc-ai/web-llm.
export default defineConfig({
  build: {
    outDir: "vendor",
    emptyOutDir: true,
    target: "es2020",
    lib: { entry: "node_modules/@mlc-ai/web-llm/lib/index.js", formats: ["es"], fileName: () => "web-llm.js" },
  },
});
