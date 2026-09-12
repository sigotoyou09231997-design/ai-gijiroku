import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * 会話の増えたぶんから「自分に向けられた質問＋回答案」と「決定事項・宿題事項」を拾う。
 * Vercel向けの入り口。このリポジトリはNetlifyとVercelの両方に配信されており、
 * サーバー関数は netlify/functions/ と api/ に別々に置く決まり
 * （LIFE HUBと同じ。片方から読み込むとバンドルに含まれず落ちるため）。
 *
 * 判断のロジックは netlify/functions/analyze.ts と同じものを写してある。
 *
 * 環境変数（Vercel のプロジェクト設定）:
 *   ANTHROPIC_API_KEY … 必須。未設定のときは 503 を返し、画面側でその旨を出す。
 *   ANTHROPIC_MODEL   … 任意。既定は claude-sonnet-5。
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

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
      max_tokens: 1024,
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

const SYSTEM = `あなたは会議・面接に同席して、その場で手元のメモを作るアシスタントです。
渡されるのは、マイクで拾った会話の文字起こしです。誤認識も混ざります。

各行の先頭に [自分] [相手] の札が付いていることがあります。これは音源を分けて
聞き取った結果なので、**推測ではなく事実です。札を信じてください。**
- [自分] … この文字起こしを聞いている本人の発言
- [相手] … 本人と話している相手の発言
札が付いていない行は、音を分けずに聞いたぶんで、誰の発言か分かりません。
その場合だけ、前後のつながりから推測してください。

「直前までの会話」は文脈を掴むためだけに読み、拾うのは「今回あらたに増えたぶん」に出てきたものだけにしてください。

拾うものは3種類で、どれも常に見てください。

1. この文字起こしを聞いている本人に向けられた質問
   - **[相手] の行にある疑問文**のうち、本人に答えを求めているものだけを拾います。
     [自分] の行にある疑問文は、本人が発したものなので拾いません。
   - 札が無い行では、独り言や確認のための繰り返しを拾わないように気を付けてください。
   - 回答案は、そのまま声に出して読める長さ（2〜4文）の話し言葉で書きます。
     箇条書きにはしません。分からないことは推測で埋めず、確認する言い方にします。

2. 決まったこと（decision）と、やることになったこと（todo）
   - まだ決まっていない案・検討中の話は拾いません。
   - 担当や期限が会話に出ていれば、出てきた表現のまま入れます（「今週中」など）。

3. 聞き慣れない用語・固有名詞（term）
   - 専門用語・略語・社内用語・サービス名・指標名など、知らないと会話について
     いけなさそうなものだけを拾います。日常語や、前後の文脈で意味が明らかな
     言葉は拾いません。
   - 説明（explanation）は1〜2文で、簡潔に。**自信を持って説明できないものは、
     無理に埋めずそもそも拾わないでください**（不確かな説明を出さないため）。

該当するものが無ければ、空の配列を返してください。無理に埋めないでください。`;

const TOOL: ToolSpec = {
  name: "record_findings",
  description: "会話から拾った質問と回答案、決定事項・宿題事項、気になる用語を記録する。",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "本人に向けられた質問と、その回答案。無ければ空配列。",
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: "聞かれた内容（文字起こしの言い回しを整えたもの）" },
            answer: { type: "string", description: "そのまま口に出せる回答案。2〜4文の話し言葉。" },
          },
          required: ["question", "answer"],
        },
      },
      actions: {
        type: "array",
        description: "決まったこと・やることになったこと。無ければ空配列。",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["decision", "todo"], description: "decision=決定事項 / todo=宿題事項" },
            text: { type: "string", description: "内容を1文で" },
            owner: { type: "string", description: "担当（会話に出ていない場合は省く）" },
            due: { type: "string", description: "期限（会話に出ていない場合は省く）" },
          },
          required: ["kind", "text"],
        },
      },
      terms: {
        type: "array",
        description: "聞き慣れない用語・固有名詞とその説明。無ければ空配列。",
        items: {
          type: "object",
          properties: {
            term: { type: "string", description: "会話に出てきた用語・固有名詞そのもの" },
            explanation: { type: "string", description: "1〜2文の簡潔な説明。自信が無ければ載せない" },
          },
          required: ["term", "explanation"],
        },
      },
    },
    required: ["questions", "actions", "terms"],
  },
};

interface AnalyzeBody {
  context?: unknown;
  recent?: unknown;
  label?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).send("POST してください。");
    return;
  }

  const body = (req.body ?? {}) as AnalyzeBody;
  const recent = typeof body.recent === "string" ? body.recent.trim() : "";
  const context = typeof body.context === "string" ? body.context : "";
  const label = typeof body.label === "string" && body.label ? body.label : "打ち合わせ";

  if (!recent) {
    res.status(200).json({ questions: [], actions: [], terms: [] });
    return;
  }

  const userText = [
    `場面: ${label}`,
    "",
    "【直前までの会話（文脈用。ここからは拾わない）】",
    context || "（まだありません）",
    "",
    "【今回あらたに増えたぶん（ここから拾う）】",
    recent,
  ].join("\n");

  try {
    const result = await callClaude(SYSTEM, userText, TOOL);
    res.status(200).json({
      questions: Array.isArray(result.questions) ? result.questions : [],
      actions: Array.isArray(result.actions) ? result.actions : [],
      terms: Array.isArray(result.terms) ? result.terms : [],
    });
  } catch (error) {
    if (error instanceof MissingKeyError) {
      res.status(503).send(error.message);
      return;
    }
    res.status(502).send(error instanceof Error ? error.message : "AIの呼び出しに失敗しました。");
  }
}
