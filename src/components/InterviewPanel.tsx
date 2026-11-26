import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  Check,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  MessageSquareText,
  Send,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { CardView, InterviewAssist } from "../hooks/useInterviewAssist";
import { downloadMarkdown } from "../lib/interview/exportQuestions";
import type { AnswerLine } from "../lib/interview/protocol";
import { EFFORT_LABELS, FULL_MODEL_LABELS } from "../lib/interview/settings";
import { formatTime } from "../lib/format";

/** 面接中にすぐ回答を作るキー。面接で打つ文字（チャット・メモ）とぶつからず、押しやすいもの。 */
export const TRIGGER_KEY_CODE = "KeyJ";
export const TRIGGER_KEY_LABEL = "J";

/** 文字を打っている所では、キーを横取りしない。 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function lineStyle(line: AnswerLine, big: boolean): string {
  if (line.label === "結論") return big ? "text-[26px] font-bold leading-[1.55]" : "text-[17px] font-bold leading-relaxed";
  return big ? "text-[20px] leading-[1.75]" : "text-[15px] leading-relaxed";
}

function AnswerLines({ lines, big }: { lines: AnswerLine[]; big: boolean }) {
  return (
    <div className={big ? "space-y-3" : "space-y-1.5"}>
      {lines.map((line, index) => (
        <p key={`${index}-${line.label ?? ""}`} className={`text-ink ${lineStyle(line, big)}`}>
          {line.label && (
            <span
              className={`mr-2 inline-block rounded-md px-1.5 py-0.5 align-middle font-mono text-[11px] font-bold tracking-wide ${
                line.label === "結論" ? "bg-self text-white" : "bg-line text-muted"
              }`}
            >
              {line.label}
            </span>
          )}
          {line.text}
        </p>
      ))}
    </div>
  );
}

function seconds(ms?: number): string {
  return ms === undefined ? "" : `${(ms / 1000).toFixed(1)}秒`;
}

function CardBody({ card, big }: { card: CardView; big: boolean }) {
  const [showPrepared, setShowPrepared] = useState(true);
  const fullLines = card.fullParsed.lines;
  const useFull = fullLines.length > 0;
  const lines = useFull ? fullLines : card.quickLines;
  const fullRunning = card.full.status === "streaming";
  const quickRunning = card.quick.status === "streaming";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {card.qa && (
          <span className="flex items-center gap-1 rounded-full bg-other-soft px-2.5 py-1 text-[11px] font-bold text-other">
            <BookMarked size={11} aria-hidden />
            用意した答え {card.qa.index + 1}
            {!card.qa.byModel && "（手元の照合）"}
          </span>
        )}
        {card.noExperience && (
          <span className="rounded-full bg-live/12 px-2.5 py-1 text-[11px] font-bold text-live">経歴に無い</span>
        )}
        {!useFull && lines.length > 0 && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-faint">速報</span>
        )}
        {fullRunning && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Loader2 size={11} className="animate-spin" aria-hidden />
            {useFull ? "書いています" : "詳しい回答を作っています"}
          </span>
        )}
        {card.full.status === "aborted" && <span className="text-[11px] text-faint">途中で止めました</span>}
        {card.full.status === "error" && (
          <span className="text-[11px] text-live">{card.full.error ?? "詳しい回答を作れませんでした"}</span>
        )}
        {card.full.status === "done" && big && (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-faint">
            速報 {seconds(card.quick.firstMs)} ／ 全文 {seconds(card.full.totalMs)}
          </span>
        )}
      </div>

      <div className={big ? "mt-3" : "mt-2"}>
        {lines.length > 0 ? (
          <AnswerLines lines={lines} big={big} />
        ) : quickRunning || fullRunning ? (
          card.qa ? null : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              考えています…
            </p>
          )
        ) : null}
      </div>

      {card.qa && (
        <div className={`mt-3 rounded-2xl border border-other/30 bg-other-soft/40 ${big ? "px-5 py-3.5" : "px-3.5 py-2.5"}`}>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-left text-xs font-bold text-other"
            onClick={() => setShowPrepared((open) => !open)}
            aria-expanded={showPrepared}
          >
            用意した答え：{card.qa.pair.question}
            <ChevronDown
              size={13}
              className={`ml-auto shrink-0 transition-transform ${showPrepared ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showPrepared && (
            <p
              className={`mt-2 whitespace-pre-wrap text-ink ${big ? "text-[17px] leading-[1.8]" : "text-sm leading-relaxed"}`}
            >
              {card.qa.pair.answer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export interface InterviewPanelProps {
  assist: InterviewAssist;
  recording: boolean;
  /** 書き出しのファイル名・見出しに使う。 */
  title: string;
}

export default function InterviewPanel({ assist, recording, title }: InterviewPanelProps) {
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const visible = assist.cards.filter((card) => card.visible);
  const [latest, ...older] = visible;
  // 新しい発言を確かめている最中（まだ質問かどうか分からない）。前の答えの上に小さく知らせる。
  const head = assist.cards[0];
  const checking =
    head !== undefined &&
    !head.visible &&
    (head.quick.status === "streaming" || head.full.status === "streaming");
  const ready = {
    profile: assist.materials.profile.length > 0,
    company: assist.materials.company.length > 0,
    qa: assist.pairs.length,
  };

  // キー1つで「今すぐ回答」。文字を打っている所では反応しない。
  const { triggerNow } = assist;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== TRIGGER_KEY_CODE || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat || isTyping(event.target)) return;
      event.preventDefault();
      triggerNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerNow]);

  function send(speaker: "other" | "self") {
    if (!draft.trim()) return;
    assist.rehearse(draft, speaker);
    setDraft("");
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(assist.exportMarkdown(title));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // クリップボードが使えない環境では何もしない（保存ボタンがある）。
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-self/30 bg-surface shadow-lift" aria-label="面接の回答">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <MessageSquareText size={17} className="text-self" aria-hidden />
        <h2 className="text-[15px] font-bold tracking-tight">面接の回答</h2>
        <span className="text-[11px] text-faint">
          {FULL_MODEL_LABELS[assist.prefs.fullModel]} · {EFFORT_LABELS[assist.prefs.effort]}
        </span>
        <div className="grow" />
        <Link
          to="/settings"
          className="flex flex-wrap items-center gap-1 text-[11px] text-muted hover:text-ink"
          title="設定で変えられます"
        >
          <span className={ready.profile ? "text-other" : "text-live"}>経歴{ready.profile ? "✓" : "未入力"}</span>
          <span>·</span>
          <span className={ready.company ? "text-other" : "text-faint"}>会社{ready.company ? "✓" : "未入力"}</span>
          <span>·</span>
          <span className={ready.qa > 0 ? "text-other" : "text-faint"}>想定問答 {ready.qa}問</span>
        </Link>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-self px-3.5 py-2 text-sm font-bold text-white shadow-card transition-transform hover:scale-[1.02]"
          onClick={assist.triggerNow}
          title={`いまの面接官の発言で、すぐ回答を作ります（${TRIGGER_KEY_LABEL}キー）`}
        >
          {assist.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Zap size={14} aria-hidden />}
          今すぐ回答
          <kbd className="rounded bg-white/20 px-1.5 font-mono text-[11px]">{TRIGGER_KEY_LABEL}</kbd>
        </button>
      </div>

      {assist.error && (
        <p className="flex items-center gap-2 bg-live/10 px-5 py-2 text-sm text-live">
          <AlertTriangle size={14} aria-hidden />
          {assist.error}
        </p>
      )}
      {!ready.profile && (
        <p className="bg-raised px-5 py-2 text-xs text-muted">
          経歴が未入力です。<Link to="/settings" className="font-semibold text-self hover:underline">設定</Link>
          で「自分の経歴」を入れると、経歴に沿った答えになります（入れないと一般論になります）。
        </p>
      )}

      <div className="px-5 py-4">
        {checking && (
          <p className="mb-3 flex items-center gap-2 text-xs text-muted" role="status">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            面接官の発言を確かめています…
          </p>
        )}
        {latest ? (
          <article key={latest.id} className="enter" aria-live="polite">
            <div className="flex items-baseline gap-2">
              <span className="eyebrow text-self">いま聞かれていること</span>
              <span className="font-mono text-[10px] tabular-nums text-faint">{formatTime(latest.at)}</span>
            </div>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-muted">
              {latest.fullParsed.title || latest.question}
            </p>
            <div className="mt-3">
              <CardBody card={latest} big />
            </div>
          </article>
        ) : (
          <p className="py-6 text-center text-[15px] leading-[1.9] text-faint">
            面接官が質問すると、ここに答え方が大きく出ます。
            <br />
            すぐ欲しいときは「今すぐ回答」か {TRIGGER_KEY_LABEL} キー。
            {!recording && " 下の欄に質問を打ち込むと、録音しなくても試せます。"}
          </p>
        )}

        {older.length > 0 && (
          <details className="mt-5 rounded-2xl border border-line bg-raised/50">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-bold text-muted">
              前の質問（{older.length}件）
            </summary>
            <div className="space-y-4 px-4 pb-4">
              {older.map((card) => (
                <article key={card.id} className="border-t border-line pt-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] tabular-nums text-faint">{formatTime(card.at)}</span>
                    <p className="text-sm font-semibold text-muted">{card.fullParsed.title || card.question}</p>
                  </div>
                  <div className="mt-2">
                    <CardBody card={card} big={false} />
                  </div>
                </article>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="border-t border-line bg-raised/40 px-5 py-3">
        <label htmlFor="interview-rehearsal" className="text-xs font-semibold text-muted">
          リハーサル: 面接官の発言を打ち込んで試す
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <textarea
            id="interview-rehearsal"
            rows={2}
            className="min-h-[2.75rem] flex-1 resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-self"
            placeholder="例: これまでで一番苦労した開発について教えてください"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // 変換中の Enter では送らない。
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send("other");
              }
            }}
          />
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <button
              type="button"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-other px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              onClick={() => send("other")}
              disabled={!draft.trim()}
            >
              <Send size={12} aria-hidden />
              面接官として送る
            </button>
            <button
              type="button"
              className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
              onClick={() => send("self")}
              disabled={!draft.trim()}
            >
              自分の発言として送る
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-faint">聞かれた質問を、次の想定問答に足す形で書き出す:</span>
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink disabled:opacity-50"
            onClick={() => downloadMarkdown(`${title}.md`, assist.exportMarkdown(title))}
            disabled={visible.length === 0}
          >
            <Download size={12} aria-hidden />
            .md で保存
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink disabled:opacity-50"
            onClick={() => void copyExport()}
            disabled={visible.length === 0}
          >
            {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
      </div>
    </section>
  );
}
