import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, MessageCircleQuestion, Mic } from "lucide-react";
import { Link } from "react-router-dom";
import { listSessions } from "../lib/db";
import { formatDateTime, formatDuration } from "../lib/format";

export default function SessionsPage() {
  const sessions = useLiveQuery(() => listSessions(), []);

  if (sessions === undefined) {
    return <p className="text-sm text-muted">読み込んでいます…</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-12 text-center shadow-card">
        <Mic size={24} className="mx-auto text-faint" aria-hidden />
        <p className="mt-3 text-sm text-muted">保存したセッションはまだありません。</p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-self px-4 py-2 text-sm font-semibold text-white shadow-card transition-all hover:shadow-lift"
        >
          <Mic size={15} aria-hidden />
          録音をはじめる
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {sessions.map((session) => {
        const decisions = session.actions.filter((action) => action.kind === "decision").length;
        const todos = session.actions.filter((action) => action.kind === "todo").length;
        return (
          <li key={session.id}>
            <Link
              to={`/sessions/${session.id}`}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition-all hover:border-self/40 hover:shadow-lift"
            >
              <div className="min-w-0 grow">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-self-soft px-2 py-0.5 text-[11px] font-semibold text-self">
                    {session.label}
                  </span>
                  <span className="text-sm font-semibold">{formatDateTime(session.startedAt)}</span>
                  {session.endedAt && (
                    <span className="font-mono text-xs tabular-nums text-faint">
                      {formatDuration(session.startedAt, session.endedAt)}
                    </span>
                  )}
                </div>

                <p className="mt-1.5 truncate text-sm text-muted">
                  {session.summary?.overview ||
                    (session.summaryError ? "要約を作れませんでした" : "要約を作成中…")}
                </p>

                {/* 中身の多さが一目で分かるように、数を並べる。 */}
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
                  <MessageCircleQuestion size={12} aria-hidden />
                  {`質問 ${session.questions.length}件 ／ 決定 ${decisions}件 ／ やること ${todos}件`}
                </p>
              </div>

              <ChevronRight
                size={18}
                className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
