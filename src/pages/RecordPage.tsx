import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
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

function speakerTone(speaker: Speaker | undefined): { chip: string; bar: string } {
  if (speaker === "self") return { chip: "bg-self-soft text-self", bar: "bg-self" };
  if (speaker === "other") return { chip: "bg-other-soft text-other", bar: "bg-other" };
  return { chip: "bg-line text-muted", bar: "bg-faint" };
}

export default function RecordPage() {
  const navigate = useNavigate();
  const live = useLiveSession();
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

      {/* ── 本体：カンペを主役に、文字起こしを脇に ───────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* 文字起こし */}
        <section className="flex flex-col rounded-2xl border border-line bg-surface shadow-card">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">文字起こし</h2>
          <div
            ref={transcriptRef}
            className="h-[30rem] space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed"
          >
            {segments.length === 0 && interimEntries.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Mic size={22} className="text-faint" aria-hidden />
                <p className="text-sm text-faint">
                  「開始」を押すと、
                  <br />
                  話した内容がここに流れます
                </p>
              </div>
            )}

            {segments.map((segment) => {
              const who = speakerLabel(segment.speaker);
              const tone = speakerTone(segment.speaker);
              return (
                <div key={segment.id} className="enter flex gap-2.5">
                  <span className={`mt-1 w-0.5 shrink-0 rounded-full ${tone.bar}`} aria-hidden />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {who && (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
                          {who}
                        </span>
                      )}
                      <span className="font-mono text-[11px] tabular-nums text-faint">
                        {formatTime(segment.at)}
                      </span>
                    </div>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink">{segment.text}</p>
                  </div>
                </div>
              );
            })}

            {interimEntries.map(([speaker, text]) => {
              const who = speakerLabel(speaker as Speaker);
              const tone = speakerTone(speaker as Speaker);
              return (
                <div key={speaker} className="flex gap-2.5 opacity-60">
                  <span className={`mt-1 w-0.5 shrink-0 rounded-full ${tone.bar}`} aria-hidden />
                  <div className="min-w-0">
                    {who && <span className="text-[11px] font-semibold text-faint">{who}</span>}
                    <p className="mt-0.5 text-muted">{text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 質問と回答案（カンペ） */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-self/30 bg-surface shadow-card">
            <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-sm font-semibold">
              <MessageCircleQuestion size={16} className="text-self" aria-hidden />
              あなたへの質問と回答案
              {questions.length > 0 && (
                <span className="rounded-full bg-self px-2 py-0.5 text-[11px] font-bold text-white">
                  {questions.length}
                </span>
              )}
            </h2>

            <div className="max-h-[30rem] space-y-3 overflow-y-auto px-5 py-4">
              {questions.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                  <Sparkles size={22} className="text-faint" aria-hidden />
                  <p className="text-sm leading-relaxed text-faint">
                    相手から質問が出ると、
                    <br />
                    そのまま読み上げられる回答案がここに出ます
                  </p>
                </div>
              )}

              {questions.map((item, index) => {
                // 一番新しいものだけ強く光らせる。会議中はそれだけ読めばいい。
                const newest = index === 0;
                return (
                  <article
                    key={item.id}
                    className={`enter rounded-2xl border p-4 transition-colors ${
                      newest
                        ? "border-self/50 bg-self-soft shadow-lift"
                        : "border-line bg-raised opacity-80"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${newest ? "bg-self" : "bg-faint"}`}
                        aria-hidden
                      />
                      <p className="text-[13px] font-bold leading-snug text-self">{item.question}</p>
                    </div>

                    {/* ここは声に出して読む所。行間と文字を大きめに取る。 */}
                    <p className="mt-2.5 whitespace-pre-wrap pl-3.5 text-[17px] leading-[1.85] tracking-tight text-ink">
                      {item.answer}
                    </p>

                    <p className="mt-2.5 pl-3.5 font-mono text-[11px] tabular-nums text-faint">
                      {formatTime(item.at)}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          {/* 決定事項・宿題事項 */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-sm font-semibold">決定事項・宿題事項</h2>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {(
                [
                  { title: "決まったこと", items: decisions, tone: "text-other", soft: "bg-other-soft" },
                  { title: "やること", items: todos, tone: "text-self", soft: "bg-self-soft" },
                ] as const
              ).map(({ title, items, tone, soft }) => (
                <div key={title}>
                  <h3 className={`text-xs font-semibold ${tone}`}>{title}</h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {items.length === 0 && <li className="text-faint">まだありません</li>}
                    {items.map((item) => (
                      <li key={item.id} className={`enter rounded-lg px-3 py-2 text-ink ${soft}`}>
                        {item.text}
                        {(item.owner || item.due) && (
                          <span className="mt-0.5 block text-xs text-muted">
                            {[item.owner, item.due].filter(Boolean).join(" / ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
