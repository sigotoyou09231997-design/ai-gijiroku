import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { listSessions } from "../lib/db";
import { formatDateTime, formatDuration } from "../lib/format";

export default function SessionsPage() {
  const sessions = useLiveQuery(() => listSessions(), []);

  if (sessions === undefined) {
    return <p className="text-sm text-gray-500">読み込んでいます…</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">保存したセッションはまだありません。</p>
        <Link to="/" className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:underline">
          録音をはじめる
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {sessions.map((session) => {
        const decisions = session.actions.filter((action) => action.kind === "decision").length;
        const todos = session.actions.filter((action) => action.kind === "todo").length;
        return (
          <li key={session.id}>
            <Link
              to={`/sessions/${session.id}`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-indigo-300"
            >
              <div className="min-w-0 grow">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    {session.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{formatDateTime(session.startedAt)}</span>
                  {session.endedAt && (
                    <span className="text-xs text-gray-500">{formatDuration(session.startedAt, session.endedAt)}</span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-gray-600">
                  {session.summary?.overview || (session.summaryError ? "要約を作れませんでした" : "要約を作成中…")}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  質問 {session.questions.length}件 ／ 決定 {decisions}件 ／ やること {todos}件
                </p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-gray-400" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
