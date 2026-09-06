import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      // スマホでホーム画面に追加できるようにするには、Service Worker の登録が要る
      // （これが無いと、アイコン・manifest があってもインストールの対象にならない）。
      injectRegister: "auto",
      manifest: {
        name: "AI議事録ツール",
        short_name: "AI議事録",
        description: "会話をリアルタイムで文字起こしし、質問への回答案・決定事項を自動で記録するアプリ",
        lang: "ja",
        theme_color: "#4F46E5",
        // 起動中に見えるスプラッシュの地色。既定が暗い配色のアプリに合わせる。
        background_color: "#0a0a0e",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
          { src: "icon-maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" }
        ]
      }
    })
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
