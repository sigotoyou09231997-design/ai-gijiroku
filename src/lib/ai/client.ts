import { newId } from "../db";
import type { ActionItem, DetectedQuestion, SessionSummary } from "../types";

/**
 * AI呼び出しの窓口。
 *
 * ブラウザから直接 Anthropic のキーを使うのは危ないので、必ず netlify/functions を経由する。
 * 会話の中身はサーバーに保存されず、その場で処理して返ってくるだけ。
 */

const ANALYZE_URL = "/.netlify/functions/analyze";
const SUMMARIZE_URL = "/.netlify/functions/summarize";

/** APIキーが未設定などで、直せるのが人（本人）だけの状態。画面で言い方を変えるために区別する。 */
export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export class AiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

interface RawQuestion {
  question?: unknown;
  answer?: unknown;
}

interface RawAction {
  kind?: unknown;
  text?: unknown;
  owner?: unknown;
  due?: unknown;
}

interface RawAnalyze {
  questions?: unknown;
  actions?: unknown;
}

interface RawSummary {
  overview?: unknown;
  points?: unknown;
  decisions?: unknown;
  todos?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item) => item.length > 0);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiRequestError("AIに接続できませんでした。ネットワークを確認してください。");
  }

  if (response.status === 503) {
    const detail = await response.text().catch(() => "");
    throw new AiNotConfiguredError(
      detail || "AIのAPIキーが未設定です。Netlifyの環境変数 ANTHROPIC_API_KEY を設定してください。",
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiRequestError(detail || `AIの呼び出しに失敗しました（HTTP ${response.status}）。`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new AiRequestError("AIの返事を読み取れませんでした。");
  }
}

export interface AnalyzeInput {
  /** 直前までの会話（文脈として渡すだけで、ここからは新しく拾わない）。 */
  context: string;
  /** 今回あらたに増えたぶん。ここに出てきたものだけを拾う。 */
  recent: string;
  /** 面接／打ち合わせ など。回答案の口調を合わせるために渡す。 */
  label: string;
}

export interface AnalyzeOutput {
  questions: DetectedQuestion[];
  actions: ActionItem[];
}

/** 会話の増えたぶんから、自分への質問と、決定事項・宿題事項を拾う。 */
export async function analyzeTranscript(input: AnalyzeInput, at: number): Promise<AnalyzeOutput> {
  const raw = await postJson<RawAnalyze>(ANALYZE_URL, input);

  const questions: DetectedQuestion[] = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((item) => item as RawQuestion)
    .map((item) => ({
      id: newId(),
      question: asString(item.question),
      answer: asString(item.answer),
      at,
    }))
    .filter((item) => item.question.length > 0);

  const actions: ActionItem[] = (Array.isArray(raw.actions) ? raw.actions : [])
    .map((item) => item as RawAction)
    .map((item) => ({
      id: newId(),
      kind: item.kind === "todo" ? ("todo" as const) : ("decision" as const),
      text: asString(item.text),
      owner: asString(item.owner) || undefined,
      due: asString(item.due) || undefined,
      at,
    }))
    .filter((item) => item.text.length > 0);

  return { questions, actions };
}

export interface SummarizeInput {
  label: string;
  transcript: string;
  /** 会話中に拾ってあったもの。要約でも取りこぼさないように渡す。 */
  actions: { kind: ActionItem["kind"]; text: string }[];
}

/** セッション終了後に、議事録風のまとめを作る。 */
export async function summarizeTranscript(input: SummarizeInput): Promise<SessionSummary> {
  const raw = await postJson<RawSummary>(SUMMARIZE_URL, input);
  return {
    overview: asString(raw.overview),
    points: asStringList(raw.points),
    decisions: asStringList(raw.decisions),
    todos: asStringList(raw.todos),
  };
}
