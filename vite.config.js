import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // オフライン用にアプリ全体をキャッシュ
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
      manifest: {
        name: "Pure Sums",
        short_name: "Pure Sums",
        description: "ナンバーパズルゲーム",
        theme_color: "#e0c3fc",
        background_color: "#e0c3fc",
        display: "standalone", // ブラウザのUIを非表示にしてアプリっぽく
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
