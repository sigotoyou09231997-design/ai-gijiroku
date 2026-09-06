import { ListChecks, Mic, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { applyTheme, loadTheme, nextTheme, saveTheme, THEME_LABELS } from "../lib/theme";
import type { ThemeChoice } from "../lib/theme";

const linkBase =
  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${linkBase} bg-self text-white shadow-lift`
    : `${linkBase} text-muted hover:bg-line/60 hover:text-ink`;
}

const themeIcon: Record<ThemeChoice, typeof Sun> = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
};

export default function Layout() {
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());

  // 憶えていた配色を、画面が出る前に当てる。
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const ThemeIcon = themeIcon[theme];

  return (
    <div className="relative z-10 min-h-screen text-ink">
      {/* 会議中は画面を下までなぞるので、切り替えはいつでも押せる位置に置く。 */}
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-self text-white shadow-lift"
              aria-hidden
            >
              <Mic size={15} strokeWidth={2.5} />
            </span>
            <h1 className="text-[15px] font-bold tracking-tight">AI議事録ツール</h1>
          </div>

          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              <Mic size={15} aria-hidden />
              録音
            </NavLink>
            <NavLink to="/sessions" className={navClass}>
              <ListChecks size={15} aria-hidden />
              過去のセッション
            </NavLink>

            <span className="mx-1 h-5 w-px bg-line" aria-hidden />

            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-line/60 hover:text-ink"
              onClick={() => {
                const next = nextTheme(theme);
                setTheme(next);
                saveTheme(next);
              }}
              title={`配色: ${THEME_LABELS[theme]}（押すと切り替え）`}
              aria-label={`配色: ${THEME_LABELS[theme]}`}
            >
              <ThemeIcon size={15} aria-hidden />
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}
