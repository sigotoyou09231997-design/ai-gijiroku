import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * セッション終了後に、文字起こし全文から議事録風のまとめ（要点・決定事項・宿題事項）を作る。
 * Vercel向けの入り口。analyze.ts と同じく、サーバー関数は netlify/functions/ と api/ に
 * 別々に置く決まり（判断のロジックは netlify/functions/summarize.ts と同じものを写してある）。
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY … 必須。未設定のときは 503。
 *   ANTHROPIC_MODEL   … 任意。既定は claude-sonnet-5。
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";
/** 長い会話でも1回で収まるように、全文が長すぎるときは後ろ側を優先して切る。 */
const MAX_TRANSCRIPT_CHARS = 40_000;

interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
}

class MissingKeyError extends Error {}

async function callClaude(system: string, userText: string, tool: ToolSpec): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingKeyError(
      "AIのAPIキー（ANTHROPIC_API_KEY）が未設定です。Vercelの環境変数に設定してください。",
    );
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 2048,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AIの呼び出しに失敗しました（HTTP ${response.status}）。`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const block = (data.content ?? []).find((item) => item.type === "tool_use" && item.name === tool.name);
  const input = block?.input;
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

const SYSTEM = `あなたは議事録を書く担当です。渡されるのは、マイクで拾った会話の文字起こし全文です。
誤認識も混ざります。読み取れない部分は無理に補わず、落としてください。

各行の先頭に [自分] [相手] の札が付いていることがあります。これは音源を分けて聞き取った
結果なので、推測ではなく事実です。誰が何を言ったかを書き分けるときは、この札に従ってください。
札が付いていない行は、誰の発言か分かりません。その場合は無理に誰の発言かを決めつけないでください。

議事録として、次の4つを作ります。

- overview … 何の話だったかが1〜3文で分かる短いまとめ
- points   … 要点。話の流れが追える粒度で、多くても8項目まで。
             相槌（「はい」「うんうん」など）や言い淀みは無視してよいですが、
             検討した選択肢・出てきた数字や情報・話の展開は要点として拾って
             ください。**実質的な内容のある会話であれば、pointsが空になる
             ことはまずありません。** 空にしてよいのは、雑談だけで中身が
             無かったときだけです。
- decisions … 決まったこと。決まっていない案・検討中の話は入れません
             （検討していたこと自体はpointsの方に入れてください）。
- todos    … やることになったこと。担当・期限が会話に出ていれば文の中に含める

会話中に拾ってあった決定事項・宿題事項も一緒に渡します。取りこぼさないようにしつつ、
同じ内容が重なっているものは1つにまとめてください。decisions・todosは該当が無ければ
空の配列で構いませんが、pointsは上の基準で必ず見直してください。`;

const TOOL: ToolSpec = {
  name: "write_minutes",
  description: "議事録のまとめを書く。",
  input_schema: {
    type: "object",
    properties: {
      overview: { type: "string", description: "何の話だったかの短いまとめ（1〜3文）" },
      points: { type: "array", items: { type: "string" }, description: "要点（最大8項目）" },
      decisions: { type: "array", items: { type: "string" }, description: "決定事項" },
      todos: { type: "array", items: { type: "string" }, description: "宿題事項" },
    },
    required: ["overview", "points", "decisions", "todos"],
  },
};

interface SummarizeBody {
  label?: unknown;
  transcript?: unknown;
  actions?: unknown;
}

function formatActions(value: unknown): string {
  if (!Array.isArray(value)) return "（なし）";
  const lines = value
    .map((item) => (item && typeof item === "object" ? (item as { kind?: unknown; text?: unknown }) : null))
    .filter((item): item is { kind?: unknown; text?: unknown } => item !== null)
    .map((item) => {
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return "";
      const kind = item.kind === "todo" ? "宿題" : "決定";
      return `- [${kind}] ${text}`;
    })
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines.join("\n") : "（なし）";
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).send("POST してください。");
    return;
  }

  const body = (req.body ?? {}) as SummarizeBody;
  const rawTranscript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!rawTranscript) {
    res.status(400).send("文字起こしが空です。");
    return;
  }
  const transcript =
    rawTranscript.length > MAX_TRANSCRIPT_CHARS
      ? `（前半は長さの都合で省略）\n${rawTranscript.slice(rawTranscript.length - MAX_TRANSCRIPT_CHARS)}`
      : rawTranscript;
  const label = typeof body.label === "string" && body.label ? body.label : "打ち合わせ";

  const userText = [
    `場面: ${label}`,
    "",
    "【会話中に拾ってあった決定事項・宿題事項】",
    formatActions(body.actions),
    "",
    "【文字起こし全文】",
    transcript,
  ].join("\n");

  try {
    const result = await callClaude(SYSTEM, userText, TOOL);
    res.status(200).json({
      overview: typeof result.overview === "string" ? result.overview : "",
      points: Array.isArray(result.points) ? result.points : [],
      decisions: Array.isArray(result.decisions) ? result.decisions : [],
      todos: Array.isArray(result.todos) ? result.todos : [],
    });
  } catch (error) {
    if (error instanceof MissingKeyError) {
      res.status(503).send(error.message);
      return;
    }
    res.status(502).send(error instanceof Error ? error.message : "AIの呼び出しに失敗しました。");
  }
}
