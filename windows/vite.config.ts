import { defineConfig } from "vite";

// Tauri serves assets from the front-end dev server during `tauri dev`, so the
// port and host match what src-tauri/tauri.conf.json expects. No framework is
// used: index.html loads a single TS entry point and Canvas 2D does the rest.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        island: "index.html",
      },
    },
  },
});
