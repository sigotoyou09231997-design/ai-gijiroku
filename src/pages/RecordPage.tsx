import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, ListTodo, Loader2, MessageCircleQuestion, Mic, RefreshCw, Square, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SESSION_LABELS, useLiveSession } from "../hooks/useLiveSession";
import { formatTime } from "../lib/format";
import { speakerLabel } from "../lib/types";

export default function RecordPage() {
  const navigate = useNavigate();
  const live = useLiveSession();
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const { segments, interim } = live;

  // 新しい発話が来たら下まで送る（会話中は最新だけ見ていられるように）。
  useEffect(() => {
    const element = transcriptRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [segments, interim]);

  const interimEntries = Object.entries(live.interim).filter(([, text]) => Boolean(text));
  const recording = live.status === "recording";
  const finishing = live.status === "finishing";

  async function handleFinish() {
    const id = await live.finish();
    if (id) navigate(`/sessions/${id}`);
  }

  const decisions = live.actions.filter((action) => action.kind === "decision");
  const todos = live.actions.filter((action) => action.kind === "todo");

  return (
    <div className="space-y-4">
      {!live.speechAvailable && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">この環境では音声認識を使えません</p>
            <p className="mt-1">{live.speechUnavailableReason}</p>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600" htmlFor="session-label">
            種類
          </label>
          <input
            id="session-label"
            list="session-label-presets"
            className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
            value={live.label}
            onChange={(event) => live.setLabel(event.target.value)}
            disabled={recording || finishing}
          />
          <datalist id="session-label-presets">
            {SESSION_LABELS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>

          <div className="grow" />

          {!recording && (
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              onClick={live.start}
              disabled={!live.speechAvailable || finishing}
            >
              <Mic size={16} aria-hidden />
              開始
            </button>
          )}

          {recording && (
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
              onClick={() => void handleFinish()}
              disabled={finishing}
            >
              {finishing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Square size={16} aria-hidden />}
              {finishing ? "まとめています…" : "終了して保存"}
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {recording && live.micActive && (
            <span className="flex items-center gap-1 text-rose-600">
              <CircleDot size={14} className="animate-pulse" aria-hidden />
              録音中
            </span>
          )}
          {recording && !live.micActive && (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle size={14} aria-hidden />
              音声認識が止まっています（「終了して保存」でここまでを残せます）
            </span>
          )}
          <span className="text-gray-400">{live.speechLabel}</span>
          {live.analyzing && (
            <span className="flex items-center gap-1">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              AIが確認中
            </span>
          )}
        </div>

        {live.speechError && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{live.speechError}</p>
        )}
        {live.aiError && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {live.aiError}（文字起こしと保存は続きます）
          </p>
        )}
      </section>

      {live.canSeparateSpeakers && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" aria-hidden />
            <h2 className="text-sm font-semibold text-gray-700">どの音を、誰の声として聞くか</h2>
            <div className="grow" />
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              onClick={() => void live.refreshDevices()}
              disabled={recording}
            >
              <RefreshCw size={12} aria-hidden />
              一覧を更新
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            2つを別々に聞き取るので、どちらが喋ったのかが確実に分かります。相手の声は、Zoom
            などの音を仮想オーディオ（BlackHole など）で受けた入力を選んでください。
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-indigo-700">自分の声（マイク）</span>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                value={live.sourceChoice.selfDeviceId}
                disabled={recording || finishing}
                onChange={(event) =>
                  live.setSourceChoice({ ...live.sourceChoice, selfDeviceId: event.target.value })
                }
              >
                <option value="">既定のマイク</option>
                {live.devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-emerald-700">相手の声（通話の音）</span>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                value={live.sourceChoice.otherDeviceId}
                disabled={recording || finishing}
                onChange={(event) =>
                  live.setSourceChoice({ ...live.sourceChoice, otherDeviceId: event.target.value })
                }
              >
                <option value="">聞かない（自分の声だけ）</option>
                {live.devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {live.sourceChoice.selfDeviceId !== "" &&
            live.sourceChoice.selfDeviceId === live.sourceChoice.otherDeviceId && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                同じ入力を両方に選んでいます。これでは話者を分けられません。別々のものを選んでください。
              </p>
            )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700">文字起こし</h2>
          <div
            ref={transcriptRef}
            className="mt-3 h-80 space-y-2 overflow-y-auto rounded-lg bg-gray-50 p-3 text-sm leading-relaxed"
          >
            {segments.length === 0 && interimEntries.length === 0 && (
              <p className="text-gray-400">「開始」を押すと、話した内容がここに流れます。</p>
            )}
            {segments.map((segment) => {
              const who = speakerLabel(segment.speaker);
              return (
                <p key={segment.id} className="text-gray-800">
                  <span className="mr-2 text-xs text-gray-400">{formatTime(segment.at)}</span>
                  {who && (
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                        segment.speaker === "self"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {who}
                    </span>
                  )}
                  {segment.text}
                </p>
              );
            })}
            {interimEntries.map(([speaker, text]) => (
              <p key={speaker} className="text-gray-400">
                {speakerLabel(speaker as never) && (
                  <span className="mr-2 text-xs">{speakerLabel(speaker as never)}</span>
                )}
                {text}
              </p>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <MessageCircleQuestion size={16} aria-hidden />
              あなたへの質問と回答案
            </h2>
            <div className="mt-3 space-y-3">
              {live.questions.length === 0 && (
                <p className="text-sm text-gray-400">質問が出てくると、ここに回答案（カンペ）が並びます。</p>
              )}
              {live.questions.map((item) => (
                <article key={item.id} className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                  <p className="text-sm font-semibold text-indigo-900">{item.question}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{item.answer}</p>
                  <p className="mt-1 text-xs text-indigo-500">{formatTime(item.at)}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <ListTodo size={16} aria-hidden />
              決定事項・宿題事項
            </h2>
            <div className="mt-3 space-y-4">
              <div>
                <h3 className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={14} aria-hidden />
                  決まったこと
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-800">
                  {decisions.length === 0 && <li className="text-gray-400">まだありません</li>}
                  {decisions.map((item) => (
                    <li key={item.id} className="rounded-lg bg-emerald-50 px-3 py-2">
                      {item.text}
                      {(item.owner || item.due) && (
                        <span className="ml-2 text-xs text-emerald-700">
                          {[item.owner, item.due].filter(Boolean).join(" / ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-sky-700">やること</h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-800">
                  {todos.length === 0 && <li className="text-gray-400">まだありません</li>}
                  {todos.map((item) => (
                    <li key={item.id} className="rounded-lg bg-sky-50 px-3 py-2">
                      {item.text}
                      {(item.owner || item.due) && (
                        <span className="ml-2 text-xs text-sky-700">
                          {[item.owner, item.due].filter(Boolean).join(" / ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
