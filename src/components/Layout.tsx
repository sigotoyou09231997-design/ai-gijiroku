import { ListChecks, Mic } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const linkBase =
  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${linkBase} bg-ink text-surface shadow-card`
    : `${linkBase} text-muted hover:bg-line/60 hover:text-ink`;
}

export default function Layout() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* 会議中は画面を下までなぞるので、切り替えはいつでも押せる位置に置く。 */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-self text-white"
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
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}
