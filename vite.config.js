import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const BACKEND_PORT = process.env.BACKEND_PORT || 8787;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    host: true, // expose dev server on the LAN
    // In browser dev, forward /api to the Express backend so the app can use relative URLs.
    proxy: {
      "/api": `http://localhost:${BACKEND_PORT}`,
    },
  },
});
