import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  Mic,
  RefreshCw,
  Square,
  Sparkles,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SESSION_LABELS, useLiveSession } from "../hooks/useLiveSession";
import { formatTime } from "../lib/format";
import { speakerLabel } from "../lib/types";
import type { Speaker } from "../lib/types";

/** 経過時間を mm:ss で。会議の長さの見当が付くように。 */
function useElapsed(active: boolean): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 話者ごとの色。線の色にも使うので、変数名そのものも返す。 */
function speakerTone(speaker: Speaker | undefined): { text: string; varName: string } {
  if (speaker === "self") return { text: "text-self", varName: "--self" };
  if (speaker === "other") return { text: "text-other", varName: "--other" };
  return { text: "text-faint", varName: "--faint" };
}

export default function RecordPage() {
  const navigate = useNavigate();
  const live = useLiveSession();
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { segments, interim } = live;
  const interimEntries = Object.entries(interim).filter(([, text]) => Boolean(text));
  const recording = live.status === "recording";
  const finishing = live.status === "finishing";
  const elapsed = useElapsed(recording);

  // 新しい発話が来たら下まで送る（会議中は最新だけ見ていられるように）。
  useEffect(() => {
    const element = transcriptRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [segments, interim]);

  // 設定は一度決めれば触らない。まだ決めていないときだけ開いた状態で始める。
  useEffect(() => {
    if (live.canSeparateSpeakers && !live.sourceChoice.otherDeviceId) setSettingsOpen(true);
  }, [live.canSeparateSpeakers, live.sourceChoice.otherDeviceId]);

  async function handleFinish() {
    const id = await live.finish();
    if (id) navigate(`/sessions/${id}`);
  }

  async function handleCopyAnswer(item: { id: string; answer: string }) {
    try {
      await navigator.clipboard.writeText(item.answer);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1800);
    } catch {
      // クリップボードが使えない環境では、押しても何も起きないだけにする。
    }
  }

  const decisions = live.actions.filter((action) => action.kind === "decision");
  const todos = live.actions.filter((action) => action.kind === "todo");
  // 会議中は最新のカンペが一番大事なので、新しいものを上に出す。
  const questions = [...live.questions].reverse();

  const deviceName = (id: string, fallback: string) =>
    live.devices.find((d) => d.deviceId === id)?.label ?? fallback;

  return (
    <div className="space-y-4">
      {!live.speechAvailable && (
        <div className="flex items-start gap-3 rounded-2xl border border-live/30 bg-live/5 p-4 text-sm text-ink">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-live" aria-hidden />
          <div>
            <p className="font-semibold">この環境では音声認識を使えません</p>
            <p className="mt-1 text-muted">{live.speechUnavailableReason}</p>
          </div>
        </div>
      )}

      {/* ── 操作の場（待機中は大きく、録音中は小さく） ───── */}
      <section
        className={`relative overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition-all ${
          recording ? "p-4" : "p-8"
        }`}
      >
        {!recording ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <button
              type="button"
              className="group relative flex h-24 w-24 items-center justify-center rounded-full bg-self text-white shadow-lift transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:bg-faint disabled:shadow-none"
              onClick={live.start}
              disabled={!live.speechAvailable || finishing}
              aria-label="開始"
            >
              {/* 押せるときだけ、静かに広がる輪を出す。 */}
              {live.speechAvailable && !finishing && (
                <span
                  className="absolute inset-0 rounded-full bg-self"
                  style={{ animation: "halo 2.4s ease-out infinite" }}
                  aria-hidden
                />
              )}
              <Mic size={34} strokeWidth={2} className="relative" aria-hidden />
            </button>

            <div>
              <p className="text-lg font-bold tracking-tight">開始</p>
              <p className="mt-1 text-sm text-muted">
                押すと、あなたと相手の声を別々に聞き取ります
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <label className="text-xs text-faint" htmlFor="session-label">
                種類
              </label>
              <input
                id="session-label"
                list="session-label-presets"
                className="w-40 rounded-lg border border-line bg-raised px-3 py-1.5 text-center text-sm text-ink outline-none transition-colors focus:border-self"
                value={live.label}
                onChange={(event) => live.setLabel(event.target.value)}
                disabled={finishing}
              />
              <datalist id="session-label-presets">
                {SESSION_LABELS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
              <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-faint">
                {live.speechLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {/* 録音中はここが「生きている」ことの合図になる。 */}
            <div className="flex items-center gap-3 rounded-full bg-live/12 px-4 py-2">
              <span className="bars flex items-end gap-[3px] text-live" aria-hidden>
                <span /><span /><span /><span /><span />
              </span>
              <span className="text-xs font-bold tracking-wide text-live">録音中</span>
              <span className="font-mono text-sm tabular-nums text-live">{elapsed}</span>
            </div>

            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-faint">
              {live.label}
            </span>

            <span className="flex items-center gap-1.5 rounded-full bg-self-soft px-3 py-1.5 text-xs font-bold text-self">
              <CheckCircle2 size={13} aria-hidden />
              決定事項 {decisions.length}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-other-soft px-3 py-1.5 text-xs font-bold text-other">
              <ListChecks size={13} aria-hidden />
              タスク {todos.length}
            </span>

            {live.analyzing && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                AIが確認中
              </span>
            )}

            <div className="grow" />

            <button
              type="button"
              className="flex items-center gap-2 rounded-xl border border-line bg-raised px-5 py-2.5 text-sm font-semibold text-ink transition-all hover:border-live/50 hover:text-live disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleFinish()}
              disabled={finishing}
            >
              {finishing ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Square size={14} aria-hidden />
              )}
              {finishing ? "まとめています…" : "終了して保存"}
            </button>
          </div>
        )}

        {recording && !live.micActive && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-live/10 px-3 py-2 text-sm text-live">
            <AlertTriangle size={14} aria-hidden />
            音声認識が止まっています（「終了して保存」でここまでを残せます）
          </p>
        )}
        {live.speechError && (
          <p className="mt-3 rounded-lg bg-live/10 px-3 py-2 text-sm text-live">{live.speechError}</p>
        )}
        {live.aiError && (
          <p className="mt-2 rounded-lg bg-line px-3 py-2 text-sm text-muted">
            {live.aiError}（文字起こしと保存は続きます）
          </p>
        )}
      </section>

      {/* ── 音源の設定（普段は畳んでおく） ─────────────── */}
      {live.canSeparateSpeakers && (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-raised"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
          >
            <Users size={15} className="text-muted" aria-hidden />
            <span className="text-sm font-semibold">どの音を、誰の声として聞くか</span>
            {!settingsOpen && (
              <span className="ml-1 truncate text-xs text-faint">
                自分 = {deviceName(live.sourceChoice.selfDeviceId, "既定のマイク")} ／ 相手 ={" "}
                {deviceName(live.sourceChoice.otherDeviceId, "聞かない")}
              </span>
            )}
            <div className="grow" />
            <ChevronDown
              size={16}
              className={`shrink-0 text-muted transition-transform duration-200 ${settingsOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {settingsOpen && (
            <div className="border-t border-line px-4 pb-4 pt-3">
              <div className="flex items-start gap-2">
                <p className="text-xs leading-relaxed text-muted">
                  2つを別々に聞き取るので、どちらが喋ったのかが確実に分かります。相手の声は、Zoom
                  などの音を仮想オーディオ（BlackHole など）で受けた入力を選んでください。
                </p>
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-muted transition-colors hover:bg-raised disabled:opacity-50"
                  onClick={() => void live.refreshDevices()}
                  disabled={recording}
                >
                  <RefreshCw size={11} aria-hidden />
                  一覧を更新
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { key: "self" as const, title: "自分の声（マイク）", empty: "既定のマイク" },
                    { key: "other" as const, title: "相手の声（通話の音）", empty: "聞かない（自分の声だけ）" },
                  ]
                ).map(({ key, title, empty }) => (
                  <label key={key} className="block">
                    <span
                      className={`flex items-center gap-1.5 text-xs font-semibold ${
                        key === "self" ? "text-self" : "text-other"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${key === "self" ? "bg-self" : "bg-other"}`}
                        aria-hidden
                      />
                      {title}
                    </span>
                    <select
                      className="mt-1.5 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-self disabled:opacity-60"
                      value={key === "self" ? live.sourceChoice.selfDeviceId : live.sourceChoice.otherDeviceId}
                      disabled={recording || finishing}
                      onChange={(event) =>
                        live.setSourceChoice(
                          key === "self"
                            ? { ...live.sourceChoice, selfDeviceId: event.target.value }
                            : { ...live.sourceChoice, otherDeviceId: event.target.value },
                        )
                      }
                    >
                      <option value="">{empty}</option>
                      {live.devices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {live.sourceChoice.selfDeviceId !== "" &&
                live.sourceChoice.selfDeviceId === live.sourceChoice.otherDeviceId && (
                  <p className="mt-3 rounded-lg bg-live/10 px-3 py-2 text-sm text-live">
                    同じ入力を両方に選んでいます。これでは話者を分けられません。別々のものを選んでください。
                  </p>
                )}
            </div>
          )}
        </section>
      )}

      {/* ── 本体：カンペが主役、文字起こしは脇の柱 ─────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* 文字起こし（脇の柱） */}
        <section className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="text-[15px] font-bold tracking-tight">ライブ文字起こし</h2>
            {segments.length > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-faint">{segments.length}</span>
            )}
          </div>

          <div ref={transcriptRef} className="h-[34rem] overflow-y-auto px-6 py-4">
            {segments.length === 0 && interimEntries.length === 0 && (
              <p className="pt-24 text-center text-[15px] leading-[1.9] text-faint">
                話した内容が、誰の声かの札つきで
                <br />
                ここに流れます
              </p>
            )}

            <div className="space-y-4">
              {segments.map((segment) => {
                const who = speakerLabel(segment.speaker);
                const tone = speakerTone(segment.speaker);
                return (
                  <div key={segment.id} className="enter">
                    <div className="flex items-baseline gap-2">
                      {who && <span className={`text-[13px] font-bold ${tone.text}`}>{who}</span>}
                      <span className="font-mono text-[11px] tabular-nums text-faint">
                        {formatTime(segment.at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[15px] leading-[1.75] text-ink">{segment.text}</p>
                  </div>
                );
              })}

              {interimEntries.map(([speaker, text]) => {
                const who = speakerLabel(speaker as Speaker);
                return (
                  <div key={speaker} className="opacity-50">
                    {who && <span className="text-[13px] font-bold text-faint">{who}</span>}
                    <p className="mt-0.5 text-[15px] leading-[1.75] text-faint">{text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* カンペ（主役） */}
        <section className="flex flex-col overflow-hidden rounded-3xl border border-self/25 bg-surface shadow-lift">
          <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
            <MessageCircleQuestion size={17} className="text-self" aria-hidden />
            <h2 className="text-[15px] font-bold tracking-tight">あなたへの質問と回答案</h2>
            {questions.length > 0 && (
              <span className="ml-auto font-mono text-xs tabular-nums text-faint">
                {questions.length}件
              </span>
            )}
          </div>

          <div className="h-[34rem] overflow-y-auto px-6 py-5">
            {questions.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <Sparkles size={26} className="text-faint" aria-hidden />
                <p className="max-w-xs text-[15px] leading-[1.9] text-faint">
                  相手から質問が出ると、
                  <br />
                  そのまま読み上げられる回答案が
                  <br />
                  ここに大きく出ます
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {questions.map((item, index) => {
                  // 一番新しいものだけ主役。会議中はそれだけ読めばいい。
                  const newest = index === 0;
                  return (
                    <article key={item.id} className={`enter ${newest ? "" : "opacity-55"}`}>
                      <div className="flex items-baseline gap-2">
                        <span className="eyebrow text-self">
                          {newest ? "いま聞かれていること" : `${index + 1}つ前`}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-faint">
                          {formatTime(item.at)}
                        </span>
                      </div>

                      <p className="mt-2 text-[15px] font-bold leading-snug text-ink">
                        {item.question}
                      </p>

                      {/* ここは声に出して読む所。台本として読める大きさに取る。 */}
                      <div
                        className={`mt-3 rounded-2xl border px-5 py-4 ${
                          newest ? "border-self/40 bg-self-soft" : "border-line bg-raised"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-[18px] leading-[1.9] tracking-tight text-ink">
                          {item.answer}
                        </p>
                        <button
                          type="button"
                          className="mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-line/60 hover:text-ink"
                          onClick={() => void handleCopyAnswer(item)}
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check size={13} aria-hidden />
                              コピーしました
                            </>
                          ) : (
                            <>
                              <Copy size={13} aria-hidden />
                              この回答案をコピー
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── 決定事項・宿題事項（下に一列） ───────────────── */}
      <section className="rounded-2xl border border-line bg-surface/60 px-5 py-4">
        <h2 className="eyebrow text-faint">決定事項・宿題事項</h2>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          {(
            [
              { title: "決まったこと", items: decisions, text: "text-other", soft: "bg-other-soft" },
              { title: "やること", items: todos, text: "text-self", soft: "bg-self-soft" },
            ] as const
          ).map(({ title, items, text, soft }) => (
            <div key={title}>
              <h3 className={`text-xs font-bold ${text}`}>{title}</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {items.length === 0 && <li className="text-faint">まだありません</li>}
                {items.map((item) => (
                  <li key={item.id} className={`enter rounded-xl px-3.5 py-2.5 text-ink ${soft}`}>
                    {item.text}
                    {(item.owner || item.due) && (
                      <span className="mt-1 block font-mono text-[11px] text-muted">
                        {[item.owner, item.due].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── 気になる用語（聞き慣れない専門用語・固有名詞の説明） ─── */}
      {live.terms.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface/60 px-5 py-4">
          <h2 className="flex items-center gap-1.5 eyebrow text-faint">
            <BookOpen size={12} aria-hidden />
            気になる用語
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {live.terms.map((item) => (
              <li key={item.id} className="enter rounded-xl bg-raised px-3.5 py-2.5">
                <p className="text-sm font-bold text-ink">{item.term}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
