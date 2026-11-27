import Anthropic from "@anthropic-ai/sdk";

/**
 * 面接モード: 面接官の発言に対する回答のカンペを、流しながら作る。
 * Netlify向けの入り口。api/interview.ts（Vercel向け）に同じ中身を写してある
 * （サーバー関数は netlify/functions/ と api/ に別々に置く決まり。片方から読み込むと本番で落ちる）。
 * 「core:begin」から「core:end」までは両方で一字一句同じにする（テストで確かめている）。
 *
 * 説明は api/interview.ts の冒頭を参照。いまの本番は Vercel で、こちらは型が通る状態を保つ。
 *
 * 環境変数（Netlify のサイト設定）:
 *   ANTHROPIC_API_KEY … 必須。未設定のときは 503 を返す。
 */

// netlify/functions は1本ずつ束ねられる。共有モジュールに切り出さず、
// 各関数の中で完結させる方針（ワークスペースの他アプリでの失敗を踏まえて）。

// ── core:begin ──────────────────────────────────────────

const QUICK_MODEL = "claude-haiku-5-5";
const FULL_MODELS = { opus: "claude-opus-5-5", fable: "claude-fable-5-2" } as const;
type FullModelKey = keyof typeof FULL_MODELS;
type Effort = "low" | "medium" | "high";
type Stage = "quick" | "full" | "warm";

/**
 * 既定。評価（24問）で4通り（Opus 5.5 / Fable 5.2 × low / medium）を比べ、どれも経歴への忠実さ・答えになっている率は
 * 同じだったので、全文が出るまでが一番速かった Fable 5.2 の low にした（中央 2.9 秒・最初の1文 1.2 秒）。
 */
const DEFAULT_FULL_MODEL: FullModelKey = "fable";
const DEFAULT_EFFORT: Effort = "low";
/**
 * Fable 5.2 の速いモード（同じモデルで出力が速い・料金は2倍）。評価で、全文が出るまでの中央が 2.9 → 1.5 秒、
 * 一番遅かった質問が 9.6 → 4.8 秒になった。2026-11-27 に本人の希望（料金を抑える）で既定は普通の速さに戻した。
 * 画面の設定でオンにした時だけ使う。Opus 5.5 との組み合わせは試していないので Fable だけに付ける。
 */
const DEFAULT_FAST = false;

/** 材料1欄の上限（文字）。画面側の上限と揃える。 */
const MATERIAL_LIMIT = 30_000;
const CONTEXT_LIMIT = 10_000;
const QUESTION_LIMIT = 4_000;

const FACT_RULES = `# 使ってよい事実
- 経験・実績・数字・件数・社名・期間・技術名・人数は、<本人の経歴> に書いてあるものだけを使います。書いていないことは、ありそうなことでも足しません（「〜したこともあります」「〜を勉強中です」のような作り足しも含みます）。
- <想定問答> は本人が用意した答えです。近い質問なら土台にして、実際の聞かれ方に合わせて言い直します。
- <今日の会社の情報> は、その会社でどう活かすかを言う所と、逆質問にだけ使います。書いていない会社の事情は決めつけません。空なら会社名を出さずに言います。
- 考え方・姿勢を聞かれたとき（残業・苦手なこと・意見が割れたとき など）は、経歴の事実と食い違わない範囲で姿勢として答えます。架空の出来事を例にしません。
- 経歴に無い経験・スキルを聞かれたら、作り話をせず「経験が無いことを正直に言う → 経歴の中の近い経験 → 学ぶ姿勢」の順で答え、@経歴外 の行を書きます。
- 経歴に「聞かれない限り言わない」などの注意書きがあれば、それに従います。

# 判断
面接官の最新の発言が、本人に答えを求める質問や依頼（「〜を教えてください」「〜をお聞かせください」なども含む）かどうかを判断します。相づち・説明・感想・雑談・「では次に」のようなつなぎだけなら、@なし の1行だけを書いて終えます。
文字起こしには聞き間違いが混ざります（例:「事故紹介」→自己紹介）。前後の会話と経歴から、聞かれていることを読み取ります。`;

const QUICK_SYSTEM = `あなたは、オンライン面接を受けている本人（求職者）の横で、答えの書き出しを一番早く出す係です。面接官の最新の発言に対して、本人が最初に口に出す1文だけを書きます。このあと別の係が詳しい答えに置き換えます。

${FACT_RULES}

# この係だけの決まり（速さより、作り話をしないことが先）
- 結論は、<本人の経歴> にそのまま書いてある事実だけで言える1文にします。具体的な出来事・案件・業種・回数・程度（「少し」「〜程度」など）は、経歴に書いてあるときだけ使います。
- 経歴に無い経験・スキルを聞かれたら、「〜の経験はまだありません。」のように、無いことを正直に言うだけの1文にします。
- 考え方・好みを聞かれたら、事実を足さずに姿勢だけを1文で言います。
- @経歴外 は、経験・スキルを聞かれて、それが経歴に無いときだけ書きます。考え方・状況・予定を聞かれたときは書きません。

# 書き方
話し言葉の丁寧語（です・ます）で、一人称は「私」。結論は50字以内の1文。考えた過程や説明は書きません。

# 出力の形（この形だけを書く。前置き・見出し・飾りは書かない）
@想定 <土台にした想定問答の番号。無ければ 0>
@経歴外   ← 経歴に無い経験を聞かれたときだけ書く
結論：<最初に口に出す1文>`;

const FULL_SYSTEM = `あなたは、オンライン面接を受けている本人（求職者）の横で、答え方のカンペを出す係です。面接官の最新の発言に対して、本人がそのまま声に出して読める答えを作ります。

${FACT_RULES}

# 書き方
- 話し言葉の丁寧語（です・ます）で、面接でそのまま読める自然な文にします。一人称は「私」。
- 結論は1文、具体例は1〜2文、つなげは1文。全体で150〜230字くらい。
- 逆質問を求められたら、結論に「はい、〜について伺いたいです」、具体例に1つ目の質問、つなげに2つ目の質問を書きます。
- 箇条書き・見出し・記号での強調は使いません。

# 出力の形（この形だけを書く。前置きは書かない）
@想定 <土台にした想定問答の番号。無ければ 0>
@経歴外   ← 経歴に無い経験を聞かれたときだけ書く
結論：<1文>
具体例：<1〜2文>
つなげ：<1文。その会社でどう活かすか（会社の情報が無ければ、入社後どう活かすか）>
@質問 <面接官が聞いたことを短く整えた1文>`;

interface InterviewInput {
  stage: Stage;
  profile: string;
  company: string;
  qa: string;
  context: string;
  question: string;
  model: FullModelKey;
  effort: Effort;
  fast: boolean;
}

type ParseResult = { ok: true; input: InterviewInput } | { ok: false; status: number; message: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseInterviewBody(raw: unknown): ParseResult {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stage = body.stage;
  if (stage !== "quick" && stage !== "full" && stage !== "warm") {
    return { ok: false, status: 400, message: "stage は quick / full / warm のどれかにしてください。" };
  }
  const input: InterviewInput = {
    stage,
    profile: text(body.profile),
    company: text(body.company),
    qa: text(body.qa),
    context: text(body.context),
    question: text(body.question),
    model: body.model === "fable" ? "fable" : body.model === "opus" ? "opus" : DEFAULT_FULL_MODEL,
    effort: body.effort === "low" || body.effort === "medium" || body.effort === "high" ? body.effort : DEFAULT_EFFORT,
    fast: typeof body.fast === "boolean" ? body.fast : DEFAULT_FAST,
  };
  for (const [name, value] of [
    ["経歴", input.profile],
    ["会社の情報", input.company],
    ["想定問答", input.qa],
  ] as const) {
    if (value.length > MATERIAL_LIMIT) {
      return { ok: false, status: 413, message: `${name}が長すぎます（${MATERIAL_LIMIT.toLocaleString()}字まで）。` };
    }
  }
  if (input.context.length > CONTEXT_LIMIT || input.question.length > QUESTION_LIMIT) {
    return { ok: false, status: 413, message: "会話が長すぎます。" };
  }
  if (stage !== "warm" && !input.question) {
    return { ok: false, status: 400, message: "面接官の発言が空です。" };
  }
  return { ok: true, input };
}

/** 変わらない材料。キャッシュの区切りをこの後ろに置く。 */
function materialsText(input: InterviewInput): string {
  return [
    "<本人の経歴>",
    input.profile || "（未入力）",
    "</本人の経歴>",
    "",
    "<今日の会社の情報>",
    input.company || "（未入力）",
    "</今日の会社の情報>",
    "",
    "<想定問答>",
    input.qa || "（未入力）",
    "</想定問答>",
  ].join("\n");
}

function buildSystem(stage: "quick" | "full", input: InterviewInput): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: stage === "quick" ? QUICK_SYSTEM : FULL_SYSTEM },
    { type: "text", text: materialsText(input), cache_control: { type: "ephemeral" } },
  ];
}

function buildUserText(input: InterviewInput): string {
  return [
    "<直近の会話>（古い順。[相手]＝面接官、[自分]＝本人）",
    input.context || "（まだありません）",
    "</直近の会話>",
    "",
    "<面接官の最新の発言>",
    input.question,
    "</面接官の最新の発言>",
  ].join("\n");
}

type Emit = (event: Record<string, unknown>) => void;

interface ErrorInfo {
  status: number;
  message: string;
  /** 直せるのが本人だけ（キー・残高）。 */
  owner: boolean;
}

function describeError(error: unknown): ErrorInfo {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, owner: true, message: "AIのAPIキーが使えません。Vercel の ANTHROPIC_API_KEY を確認してください。" };
  }
  if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
    return {
      status: 402,
      owner: true,
      message: "AIの利用残高が足りません。Anthropic の Billing（console.anthropic.com）を確認してください。",
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, owner: false, message: "AIが混み合っています。少しおいて、もう一度試してください。" };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, owner: false, message: `AIの呼び出しに失敗しました（HTTP ${error.status ?? "?"}）。` };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 502, owner: false, message: "AIに接続できませんでした。" };
  }
  return { status: 500, owner: false, message: error instanceof Error ? error.message : "回答を作れませんでした。" };
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** 速いモードを使うか（Fable 5.2 だけ）。 */
function useFast(input: InterviewInput): boolean {
  return input.fast && input.model === "fable";
}

/** 1本ぶんの回答を流す。届いた文字は emit({t:"d"}) で、終わりは emit({t:"done"}) で知らせる。 */
async function runInterview(client: Anthropic, input: InterviewInput, emit: Emit, signal: AbortSignal): Promise<void> {
  const started = Date.now();
  let firstAt = 0;
  const system = buildSystem(input.stage === "quick" ? "quick" : "full", input);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserText(input) }];

  const onText = (delta: string) => {
    if (!delta) return;
    if (!firstAt) firstAt = Date.now();
    emit({ t: "d", v: delta });
  };

  let final: { model: string; stop_reason: string | null; usage: Anthropic.Usage | Anthropic.Beta.BetaUsage };
  if (input.stage === "quick") {
    // Haiku 5.5 は effort が high 以下なら考える段階を省ける。最初の1文を一番早く出すため省く
    // （評価で考える段階を持たせても、作り話は減らず速さも変わらなかった）。
    const stream = client.messages.stream(
      {
        model: QUICK_MODEL,
        max_tokens: 400,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system,
        messages,
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
    }
    final = await stream.finalMessage();
  } else {
    // Opus 5.5 / Fable 5.2 は考える段階を止められない（effort で深さを決める）。
    // 安全の判定で断られたときに備え、サーバー側の代わりのモデルを付けておく。
    const streamFull = (fast: boolean) =>
      client.beta.messages.stream(
        {
          model: FULL_MODELS[input.model],
          max_tokens: 8_000,
          output_config: { effort: input.effort },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          ...(fast ? { speed: "fast" as const } : {}),
          system,
          messages,
        },
        // 速いモードで上限に当たったら、待って再送するより普通の速さに切り替える方が早い。
        { signal, ...(fast ? { maxRetries: 0 } : {}) },
      );
    let stream = streamFull(useFast(input));
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
      }
    } catch (error) {
      // 速いモードには別の利用上限がある。上限に当たったら、まだ何も出していなければ普通の速さで出し直す。
      if (!(useFast(input) && error instanceof Anthropic.RateLimitError && !firstAt)) throw error;
      stream = streamFull(false);
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
      }
    }
    final = await stream.finalMessage();
  }

  if (final.stop_reason === "refusal") {
    emit({ t: "error", message: "この発言には回答案を作れませんでした（AIの安全の判定）。", owner: false });
    return;
  }
  emit({
    t: "done",
    model: final.model,
    stopReason: final.stop_reason,
    usage: {
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
      cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0,
    },
    serverFirstMs: firstAt ? firstAt - started : null,
    serverTotalMs: Date.now() - started,
  });
}

/**
 * 面接の初めに、材料を2つのモデルに先に読ませておく（max_tokens: 0 で答えは作らせない）。
 * 本番の呼び出しと同じ設定（考える深さ・速さ）にしないとキャッシュが当たらない。
 */
async function warmInterview(client: Anthropic, input: InterviewInput): Promise<Record<string, unknown>> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: "（準備）" }];
  const started = Date.now();
  const [quick, full] = await Promise.allSettled([
    client.messages.create({
      model: QUICK_MODEL,
      max_tokens: 0,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: buildSystem("quick", input),
      messages,
    }),
    client.beta.messages.create({
      model: FULL_MODELS[input.model],
      max_tokens: 0,
      output_config: { effort: input.effort },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      ...(useFast(input) ? { speed: "fast" as const } : {}),
      system: buildSystem("full", input),
      messages,
    }),
  ]);
  const usageOf = (result: PromiseSettledResult<{ usage: Anthropic.Usage | Anthropic.Beta.BetaUsage }>) =>
    result.status === "fulfilled"
      ? {
          cache_creation_input_tokens: result.value.usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: result.value.usage.cache_read_input_tokens ?? 0,
          input_tokens: result.value.usage.input_tokens,
        }
      : { error: describeError(result.reason).message };
  return { t: "warm", quick: usageOf(quick), full: usageOf(full), ms: Date.now() - started };
}

// ── core:end ────────────────────────────────────────────

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 60_000 });
  return client;
}

function plain(message: string, status: number): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return plain("POST してください。", 405);
  if (!process.env.ANTHROPIC_API_KEY) {
    return plain("AIのAPIキー（ANTHROPIC_API_KEY）が未設定です。Netlifyの環境変数に設定してください。", 503);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return plain("リクエストの形式が正しくありません。", 400);
  }
  const parsed = parseInterviewBody(raw);
  if (!parsed.ok) return plain(parsed.message, parsed.status);
  const input = parsed.input;

  if (input.stage === "warm") {
    try {
      return new Response(JSON.stringify(await warmInterview(getClient(), input)), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (error) {
      const info = describeError(error);
      return plain(info.message, info.status);
    }
  }

  // 画面が接続を切ったら（新しい質問で前の回答を止めたら）、AI への依頼も止める。
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(stream) {
      const emit: Emit = (event) => {
        try {
          stream.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // 読み手が先に閉じていたら捨てる。
        }
      };
      try {
        await runInterview(getClient(), input, emit, controller.signal);
      } catch (error) {
        if (!(error instanceof Anthropic.APIUserAbortError) && !controller.signal.aborted) {
          const info = describeError(error);
          emit({ t: "error", message: info.message, owner: info.owner });
        }
      } finally {
        try {
          stream.close();
        } catch {
          // すでに閉じている。
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
    },
  });
}
