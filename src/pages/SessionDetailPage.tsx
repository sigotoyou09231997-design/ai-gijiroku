import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteSession, loadSession } from "../lib/db";
import { formatDateTime, formatDuration, formatTime } from "../lib/format";
import { generateSummary } from "../lib/sessionSummary";

function Bullets({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-gray-800">
        {items.length === 0 && <li className="text-gray-400">{empty}</li>}
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="rounded-lg bg-gray-50 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [regenerating, setRegenerating] = useState(false);

  // 読み込み中は undefined、見つからなかったときは null。両方を undefined にすると区別が付かない。
  const session = useLiveQuery(
    async () => (id ? ((await loadSession(id)) ?? null) : null),
    [id],
  );

  if (session === undefined) {
    return <p className="text-sm text-gray-500">読み込んでいます…</p>;
  }
  if (session === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">このセッションは見つかりませんでした。</p>
        <Link to="/sessions" className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:underline">
          一覧へ戻る
        </Link>
      </div>
    );
  }

  const decisions = session.actions.filter((action) => action.kind === "decision");
  const todos = session.actions.filter((action) => action.kind === "todo");
  const summaryPending = !session.summary && !session.summaryError;

  async function handleRegenerate() {
    if (!id) return;
    setRegenerating(true);
    try {
      await generateSummary(id);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm("このセッションを削除します。よろしいですか？")) return;
    await deleteSession(id);
    navigate("/sessions");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/sessions"
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={16} aria-hidden />
          一覧へ
        </Link>
        <div className="grow" />
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          onClick={() => void handleRegenerate()}
          disabled={regenerating}
        >
          {regenerating ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RefreshCw size={16} aria-hidden />}
          要約を作り直す
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
          onClick={() => void handleDelete()}
        >
          <Trash2 size={16} aria-hidden />
          削除
        </button>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {session.label}
          </span>
          <h2 className="text-base font-bold text-gray-900">{formatDateTime(session.startedAt)}</h2>
          {session.endedAt && (
            <span className="text-xs text-gray-500">{formatDuration(session.startedAt, session.endedAt)}</span>
          )}
        </div>

        <div className="mt-4">
          {summaryPending && (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              要約を作成中です…
            </p>
          )}
          {session.summaryError && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{session.summaryError}</p>
          )}
          {session.summary && (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{session.summary.overview}</p>
              <Bullets title="要点" items={session.summary.points} empty="ありません" />
              <Bullets title="決定事項" items={session.summary.decisions} empty="ありません" />
              <Bullets title="宿題事項" items={session.summary.todos} empty="ありません" />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">会話中に検知した質問と回答案</h2>
        <div className="mt-3 space-y-3">
          {session.questions.length === 0 && <p className="text-sm text-gray-400">ありません</p>}
          {session.questions.map((item) => (
            <article key={item.id} className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-sm font-semibold text-indigo-900">{item.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">会話中に検知した決定事項・宿題事項</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Bullets title="決まったこと" items={decisions.map((item) => item.text)} empty="ありません" />
          <Bullets title="やること" items={todos.map((item) => item.text)} empty="ありません" />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">文字起こし全文</h2>
        <div className="mt-3 max-h-96 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-sm leading-relaxed">
          {session.segments.map((segment) => (
            <p key={segment.id} className="text-gray-800">
              <span className="mr-2 text-xs text-gray-400">{formatTime(segment.at)}</span>
              {segment.text}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
