import { History, Mic, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import UpdatePrompt from "./UpdatePrompt";

const NAV_ITEMS = [
  { to: "/", end: true, icon: Mic, label: "録音" },
  { to: "/sessions", end: false, icon: History, label: "履歴" },
  { to: "/settings", end: false, icon: Settings, label: "設定" },
] as const;

function sidebarLinkClass({ isActive }: { isActive: boolean }): string {
  const base = "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150";
  return isActive ? `${base} bg-self text-white shadow-lift` : `${base} text-muted hover:bg-line/60 hover:text-ink`;
}

function mobileLinkClass({ isActive }: { isActive: boolean }): string {
  const base = "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-150";
  return isActive ? `${base} bg-self text-white shadow-lift` : `${base} text-muted hover:bg-line/60 hover:text-ink`;
}

export default function Layout() {
  return (
    <div className="relative min-h-screen text-ink sm:flex">
      {/* サイドバー（PC幅）。会議中もナビの位置が変わらないよう常に開いたまま。 */}
      <aside className="hidden shrink-0 flex-col border-r border-line/70 bg-canvas/70 backdrop-blur-xl sm:flex sm:w-56">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-self text-white shadow-lift"
            aria-hidden
          >
            <Mic size={16} strokeWidth={2.5} />
          </span>
          <h1 className="text-[15px] font-bold tracking-tight">AI議事録</h1>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={sidebarLinkClass}>
              <Icon size={16} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* スマホ幅では上部の横並びナビにする（サイドバーだと本文が狭くなりすぎるため）。 */}
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/70 backdrop-blur-xl sm:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-self text-white shadow-lift"
              aria-hidden
            >
              <Mic size={15} strokeWidth={2.5} />
            </span>
            <h1 className="truncate text-[15px] font-bold tracking-tight">AI議事録</h1>
          </div>
          <nav className="flex shrink-0 items-center gap-1">
            {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={end} className={mobileLinkClass} aria-label={label}>
                <Icon size={15} aria-hidden />
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[100rem] px-3 py-4 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>

      <UpdatePrompt />
    </div>
  );
}
