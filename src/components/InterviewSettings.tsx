import { useMemo, useRef, useState } from "react";
import { Check, FileUp, Lock } from "lucide-react";
import { parseQaBank } from "../lib/interview/qaBank";
import {
  EFFORT_LABELS,
  FULL_MODEL_LABELS,
  loadMaterials,
  loadPrefs,
  MATERIAL_LIMIT,
  saveMaterial,
  savePrefs,
  type EffortChoice,
  type FullModelChoice,
  type InterviewMaterials,
  type InterviewPrefs,
} from "../lib/interview/settings";

const FIELDS: { key: keyof InterviewMaterials; title: string; help: string; placeholder: string }[] = [
  {
    key: "profile",
    title: "自分の経歴",
    help: "職歴・個人開発・数字・経験が無いもの・話し方の決まりなど。回答の事実はここに書いたものだけを使います。",
    placeholder: "# 経歴\n- 2024年4月〜 株式会社〇〇（Web制作）…",
  },
  {
    key: "company",
    title: "今日の会社の情報",
    help: "求人票・事前に聞いた情報。「その会社でどう活かすか」と逆質問に使います。面接ごとに入れ替えてください。",
    placeholder: "# 株式会社〇〇\n- 事業: …\n- 求人: …",
  },
  {
    key: "qaBank",
    title: "想定問答",
    help: "「## 質問」の下に答えを書く形。別の聞き方は「- 別の聞き方: A／B」。近い質問が来たら、AI を待たずにこの答えをすぐ出します。",
    placeholder: "## 自己紹介をしてください\n- 別の聞き方: 簡単に自己紹介を／これまでの経歴を\n〇〇と申します。…",
  },
];

const MODEL_CHOICES: FullModelChoice[] = ["opus", "fable"];

/** ファイルの中身を文字として読む（File.text が無い古い環境でも読めるように FileReader に落とす）。 */
function readText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}
const EFFORT_CHOICES: EffortChoice[] = ["low", "medium", "high"];

function MaterialField({
  field,
  value,
  onChange,
}: {
  field: (typeof FIELDS)[number];
  value: string;
  onChange(value: string): void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const count = useMemo(() => (field.key === "qaBank" ? parseQaBank(value).length : null), [field.key, value]);
  const tooLong = value.length > MATERIAL_LIMIT;

  async function handleFile(file: File) {
    let text: string;
    try {
      text = await readText(file);
    } catch {
      setMessage("読み込めませんでした");
      return;
    }
    onChange(text);
    setMessage(`「${file.name}」を読み込みました`);
    window.setTimeout(() => setMessage(null), 2500);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`material-${field.key}`} className="text-sm font-bold">
          {field.title}
        </label>
        {count !== null && <span className="text-xs text-muted">{count}問を読み取りました</span>}
        <div className="grow" />
        {message && (
          <span className="flex items-center gap-1 text-xs text-other">
            <Check size={12} aria-hidden />
            {message}
          </span>
        )}
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
          onClick={() => fileRef.current?.click()}
        >
          <FileUp size={12} aria-hidden />
          .md を読み込む
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          aria-label={`${field.title}を .md から読み込む`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">{field.help}</p>
      <textarea
        id={`material-${field.key}`}
        className="mt-2 h-40 w-full resize-y rounded-xl border border-line bg-raised px-3 py-2 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-self"
        value={value}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className={`mt-1 text-right font-mono text-[11px] tabular-nums ${tooLong ? "text-live" : "text-faint"}`}>
        {value.length.toLocaleString()} / {MATERIAL_LIMIT.toLocaleString()} 字
        {tooLong && "（長すぎて送れません）"}
      </p>
    </div>
  );
}

export default function InterviewSettings() {
  const [materials, setMaterials] = useState<InterviewMaterials>(() => loadMaterials());
  const [prefs, setPrefs] = useState<InterviewPrefs>(() => loadPrefs());
  const [saveFailed, setSaveFailed] = useState(false);

  function update(key: keyof InterviewMaterials, value: string) {
    setMaterials((current) => ({ ...current, [key]: value }));
    setSaveFailed(!saveMaterial(key, value));
  }

  function updatePrefs(next: InterviewPrefs) {
    setPrefs(next);
    savePrefs(next);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-sm font-bold">面接モード</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        録音画面の「種類」を「面接」（または「面談」を含む名前）にすると、面接官の質問に答え方を出します。
      </p>
      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-raised px-3 py-2 text-xs leading-relaxed text-muted">
        <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
        ここに入れた内容は、このブラウザの中だけに保存します。回答を作るときに AI へ送りますが、サーバーには残しません
        （セッションの控えにも入れません）。
      </p>
      {saveFailed && (
        <p className="mt-2 rounded-lg bg-live/10 px-3 py-2 text-xs text-live">
          このブラウザに保存できませんでした（プライベートモードか、容量の上限の可能性があります）。
        </p>
      )}

      <div className="mt-4 space-y-5">
        {FIELDS.map((field) => (
          <MaterialField
            key={field.key}
            field={field}
            value={materials[field.key]}
            onChange={(value) => update(field.key, value)}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-bold">詳しい回答のモデル</p>
          <p className="mt-1 text-xs text-muted">最初の1行は最速のモデル（Claude Haiku 5.5）が出し、こちらが3行で置き換えます。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MODEL_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={prefs.fullModel === choice}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  prefs.fullModel === choice
                    ? "border-self bg-self-soft text-self"
                    : "border-line bg-raised text-muted hover:text-ink"
                }`}
                onClick={() => updatePrefs({ ...prefs, fullModel: choice })}
              >
                {FULL_MODEL_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-bold">考える深さ</p>
          <p className="mt-1 text-xs text-muted">深くするほど遅くなります。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EFFORT_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={prefs.effort === choice}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  prefs.effort === choice
                    ? "border-self bg-self-soft text-self"
                    : "border-line bg-raised text-muted hover:text-ink"
                }`}
                onClick={() => updatePrefs({ ...prefs, effort: choice })}
              >
                {EFFORT_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
