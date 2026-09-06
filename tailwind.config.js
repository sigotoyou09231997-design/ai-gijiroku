/** @type {import('tailwindcss').Config} */

// 色は src/index.css の変数で決まる。ここでは役割名との対応だけを持つ。
// こうすることで、画面側は `bg-surface` `text-muted` のように役割で書ける。
// `<alpha-value>` は Tailwind が不透明度に置き換える差し込み口（v3 の書き方）。
const c = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: c("--canvas"),
        surface: c("--surface"),
        raised: c("--raised"),
        line: c("--line"),
        ink: c("--ink"),
        muted: c("--muted"),
        faint: c("--faint"),
        self: c("--self"),
        "self-soft": c("--self-soft"),
        other: c("--other"),
        "other-soft": c("--other-soft"),
        live: c("--live"),
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Noto Sans JP",
          "Meiryo",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)",
        lift: "0 2px 8px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
};
