import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteSession, loadSession } from "../lib/db";
import { formatDateTime, formatDuration, formatTime } from "../lib/format";
import { generateSummary } from "../lib/sessionSummary";
import { speakerLabel } from "../lib/types";

function Bullets({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-ink">
        {items.length === 0 && <li className="text-faint">{empty}</li>}
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="rounded-lg bg-raised px-3 py-2">
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
    return <p className="text-sm text-muted">読み込んでいます…</p>;
  }
  if (session === null) {
    return (
      <div className="rounded-2xl border border-line bg-surface shadow-card p-8 text-center">
        <p className="text-sm text-muted">このセッションは見つかりませんでした。</p>
        <Link to="/sessions" className="mt-3 inline-block text-sm font-semibold text-self hover:underline">
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
          className="flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:bg-raised"
        >
          <ArrowLeft size={16} aria-hidden />
          一覧へ
        </Link>
        <div className="grow" />
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:bg-raised disabled:opacity-50"
          onClick={() => void handleRegenerate()}
          disabled={regenerating}
        >
          {regenerating ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RefreshCw size={16} aria-hidden />}
          要約を作り直す
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border border-live/30 bg-surface px-3 py-2 text-sm text-live hover:bg-live/10"
          onClick={() => void handleDelete()}
        >
          <Trash2 size={16} aria-hidden />
          削除
        </button>
      </div>

      <section className="rounded-2xl border border-line bg-surface shadow-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-self-soft px-2 py-0.5 text-xs font-semibold text-self">
            {session.label}
          </span>
          <h2 className="text-base font-bold text-ink">{formatDateTime(session.startedAt)}</h2>
          {session.endedAt && (
            <span className="text-xs text-muted">{formatDuration(session.startedAt, session.endedAt)}</span>
          )}
        </div>

        <div className="mt-4">
          {summaryPending && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              要約を作成中です…
            </p>
          )}
          {session.summaryError && (
            <p className="rounded-lg bg-line px-3 py-2 text-sm text-muted">{session.summaryError}</p>
          )}
          {session.summary && (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{session.summary.overview}</p>
              <Bullets title="要点" items={session.summary.points} empty="ありません" />
              <Bullets title="決定事項" items={session.summary.decisions} empty="ありません" />
              <Bullets title="宿題事項" items={session.summary.todos} empty="ありません" />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface shadow-card p-4">
        <h2 className="text-sm font-semibold text-ink">会話中に検知した質問と回答案</h2>
        <div className="mt-3 space-y-3">
          {session.questions.length === 0 && <p className="text-sm text-faint">ありません</p>}
          {session.questions.map((item) => (
            <article key={item.id} className="rounded-lg border border-self/25 bg-self-soft p-3">
              <p className="text-sm font-semibold text-self">{item.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface shadow-card p-4">
        <h2 className="text-sm font-semibold text-ink">会話中に検知した決定事項・宿題事項</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Bullets title="決まったこと" items={decisions.map((item) => item.text)} empty="ありません" />
          <Bullets title="やること" items={todos.map((item) => item.text)} empty="ありません" />
        </div>
      </section>

      {session.terms.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface shadow-card p-4">
          <h2 className="text-sm font-semibold text-ink">会話中に検知した気になる用語</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {session.terms.map((item) => (
              <li key={item.id} className="rounded-lg bg-raised px-3 py-2">
                <p className="text-sm font-semibold text-ink">{item.term}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface shadow-card p-4">
        <h2 className="text-sm font-semibold text-ink">文字起こし全文</h2>
        <div className="mt-3 max-h-96 space-y-1 overflow-y-auto rounded-lg bg-raised p-3 text-sm leading-relaxed">
          {session.segments.map((segment) => {
            // 誰の声か分かっているぶんには札を出す。録音中の画面と同じ色分けにする。
            const who = speakerLabel(segment.speaker);
            return (
              <p key={segment.id} className="text-ink">
                <span className="mr-2 text-xs text-faint">{formatTime(segment.at)}</span>
                {who && (
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                      segment.speaker === "self"
                        ? "bg-self-soft text-self"
                        : "bg-other-soft text-other"
                    }`}
                  >
                    {who}
                  </span>
                )}
                {segment.text}
              </p>
            );
          })}
        </div>
      </section>
    </div>
  );
}
