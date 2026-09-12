/**
 * 配色の切り替え。
 *
 * 既定は暗い配色。会議中はカンペだけが明るく浮かぶ方が読みやすく、
 * 相手と画面共有したときも眩しくない。明るい部屋で使う人のために手で変えられる。
 */

const STORAGE_KEY = "ai-gijiroku.theme";

/** index.html の --canvas と揃えた値。スマホの状態バー・アドレスバーの色に使う。 */
const CANVAS_DARK = "#0a0a0e";
const CANVAS_LIGHT = "#f4f4f7";

export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_LABELS: Record<ThemeChoice, string> = {
  auto: "OSに合わせる",
  light: "明るい",
  dark: "暗い",
};

export function loadTheme(): ThemeChoice {
  if (typeof localStorage === "undefined") return "auto";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
  } catch {
    return "auto";
  }
}

/** html に印を付ける。実際の色は index.css がこの印を見て決める。 */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  // OSに合わせているときはOS側の配色にそれぞれ合わせ、手で選んでいるときは
  // 両方を選んだ側の色にそろえる（画面の配色とスマホの状態バーの色をずらさない）。
  const dark = document.getElementById("theme-color-dark");
  const light = document.getElementById("theme-color-light");
  if (!dark || !light) return;
  const forced = choice === "dark" ? CANVAS_DARK : choice === "light" ? CANVAS_LIGHT : null;
  dark.setAttribute("content", forced ?? CANVAS_DARK);
  light.setAttribute("content", forced ?? CANVAS_LIGHT);
}

export function saveTheme(choice: ThemeChoice): void {
  applyTheme(choice);
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // 憶えられなくても、その場の切り替えは効く。
  }
}

/** 次に切り替える配色。ボタン1つで回せるようにする。 */
export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return choice === "auto" ? "light" : choice === "light" ? "dark" : "auto";
}
