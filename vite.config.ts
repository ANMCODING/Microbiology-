import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the built app works on GitHub Pages (/repo/) and file preview.
  base: "./",
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
