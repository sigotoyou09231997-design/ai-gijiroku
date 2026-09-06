import { Mic, ListChecks } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const linkBase =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${linkBase} bg-indigo-600 text-white`
    : `${linkBase} text-gray-600 hover:bg-gray-100`;
}

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-base font-bold text-gray-900">AI議事録ツール</h1>
          <nav className="flex items-center gap-2">
            <NavLink to="/" end className={navClass}>
              <Mic size={16} aria-hidden />
              録音
            </NavLink>
            <NavLink to="/sessions" className={navClass}>
              <ListChecks size={16} aria-hidden />
              過去のセッション
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
