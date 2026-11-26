import type { EffortChoice, FullModelChoice } from "./settings";

/**
 * 面接モードの回答を作るサーバー関数（/api/interview）の呼び出し。
 *
 * 返事は1行1件の JSON（NDJSON）で流れてくる:
 *   {"t":"d","v":"結論：…"}            … 文字の続き
 *   {"t":"done", ...}                 … 終わり（使った量・かかった時間）
 *   {"t":"error","message":"…"}        … 失敗
 * 書き終わりを待たずに、届いたぶんから画面に出すため。
 */

const URL = "/api/interview";

export type InterviewStage = "quick" | "full";

export interface InterviewRequest {
  stage: InterviewStage;
  profile: string;
  company: string;
  /** serializeQaBank で番号を振った文字列。 */
  qa: string;
  /** 直近の会話（[自分]/[相手] の札つき）。 */
  context: string;
  /** 面接官の今の発言。 */
  question: string;
  model?: FullModelChoice;
  effort?: EffortChoice;
}

export interface InterviewUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface InterviewDone {
  model?: string;
  stopReason?: string | null;
  usage?: InterviewUsage;
  /** サーバーから見た、最初の文字までと全部までの時間（ミリ秒）。 */
  serverFirstMs?: number;
  serverTotalMs?: number;
}

export interface StreamHandlers {
  onText(delta: string): void;
}

export class InterviewRequestError extends Error {
  constructor(
    message: string,
    /** 直せるのが本人だけのもの（キー未設定・残高不足など）。 */
    readonly needsOwner = false,
  ) {
    super(message);
    this.name = "InterviewRequestError";
  }
}

interface WireEvent {
  t?: string;
  v?: string;
  message?: string;
  owner?: boolean;
  model?: string;
  stopReason?: string | null;
  usage?: InterviewUsage;
  serverFirstMs?: number;
  serverTotalMs?: number;
}

/**
 * 回答を1本作る。届いた文字は handlers.onText に順に渡し、終わったら使った量などを返す。
 * signal で止めると、AbortError（DOMException）で抜ける。
 */
export async function streamInterviewAnswer(
  request: InterviewRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<InterviewDone> {
  let response: Response;
  try {
    response = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new InterviewRequestError("AIに接続できませんでした。ネットワークを確認してください。");
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new InterviewRequestError(
      detail || `回答を作れませんでした（HTTP ${response.status}）。`,
      response.status === 503 || response.status === 402,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // 中の関数から書き込むので、入れ物に入れて持つ。
  const result: { done: InterviewDone | null } = { done: null };

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: WireEvent;
    try {
      event = JSON.parse(line) as WireEvent;
    } catch {
      return;
    }
    if (event.t === "d" && typeof event.v === "string") {
      handlers.onText(event.v);
    } else if (event.t === "done") {
      result.done = {
        model: event.model,
        stopReason: event.stopReason,
        usage: event.usage,
        serverFirstMs: event.serverFirstMs,
        serverTotalMs: event.serverTotalMs,
      };
    } else if (event.t === "error") {
      throw new InterviewRequestError(event.message || "回答を作れませんでした。", Boolean(event.owner));
    }
  };

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    if (finished) break;
  }
  buffer += decoder.decode();
  handleLine(buffer);

  if (!result.done) throw new InterviewRequestError("回答が途中で切れました。");
  return result.done;
}

/**
 * 面接の初めに、経歴などを AI 側に先に読ませておく（プロンプトキャッシュを温める）。
 * 失敗しても回答は作れる（最初の1問が少し遅くなるだけ）ので、結果は捨てる。
 */
export async function prewarmInterview(
  request: Omit<InterviewRequest, "stage" | "context" | "question">,
): Promise<void> {
  try {
    await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, stage: "warm", context: "", question: "" }),
    });
  } catch {
    // 温められなくても困らない。
  }
}
