import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, loadTheme, saveTheme, THEME_LABELS } from "../lib/theme";
import type { ThemeChoice } from "../lib/theme";

const CHOICES: ThemeChoice[] = ["auto", "light", "dark"];

export default function SettingsPage() {
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold tracking-tight">設定</h1>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold">配色</h2>
        <p className="mt-1 text-xs text-muted">
          会議中は暗い配色の方が眩しくなく読みやすいので、既定は暗い配色にしています。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                theme === choice
                  ? "border-self bg-self-soft text-self"
                  : "border-line bg-raised text-muted hover:text-ink"
              }`}
              onClick={() => {
                setTheme(choice);
                saveTheme(choice);
              }}
            >
              {theme === choice && <Check size={14} aria-hidden />}
              {THEME_LABELS[choice]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
