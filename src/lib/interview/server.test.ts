import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { __test } from "../../../api/interview";

const { parseInterviewBody, buildSystem, buildUserText, runInterview } = __test;

function core(path: string): string {
  // テストはリポジトリの一番上から走る。
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const begin = source.indexOf("// ── core:begin");
  const end = source.indexOf("// ── core:end");
  if (begin < 0 || end < 0) throw new Error(`${path} に core の印がありません`);
  return source.slice(begin, end);
}

describe("面接モードのサーバー関数", () => {
  it("Vercel 用と Netlify 用で、中身（core）が一字一句同じ", () => {
    // 片方だけ直すと、本番（Vercel）と控え（Netlify）で答え方が食い違う。
    expect(core("netlify/functions/interview.ts")).toBe(core("api/interview.ts"));
  });

  it("受け取る形を確かめる（段・長さ・モデルの選び方）", () => {
    expect(parseInterviewBody({ stage: "x" }).ok).toBe(false);
    expect(parseInterviewBody({ stage: "quick", question: "" }).ok).toBe(false);
    expect(parseInterviewBody({ stage: "warm", question: "" }).ok).toBe(true);
    const tooLong = parseInterviewBody({ stage: "full", question: "強みは", profile: "あ".repeat(30_001) });
    expect(tooLong.ok ? 0 : tooLong.status).toBe(413);

    const parsed = parseInterviewBody({ stage: "full", question: " 強みは？ ", model: "fable", effort: "medium" });
    expect(parsed.ok && parsed.input).toMatchObject({ question: "強みは？", model: "fable", effort: "medium", fast: true });
    // 知らない値は既定に倒す（勝手に高いモデル・深い考えにしない）。
    const fallback = parseInterviewBody({ stage: "full", question: "強みは", model: "x", effort: "max" });
    expect(fallback.ok && fallback.input.effort).not.toBe("max");
  });

  it("変わらない材料を前に置き、その後ろにキャッシュの区切りを置く。会話は後ろ", () => {
    const parsed = parseInterviewBody({
      stage: "full",
      profile: "山田花子。物流の会社で3年。",
      company: "株式会社サンプル",
      qa: "Q1. 強みは\nA1. 粘り強さ",
      context: "[相手] こんにちは",
      question: "強みを教えてください",
    });
    if (!parsed.ok) throw new Error("parse failed");
    const system = buildSystem("full", parsed.input);
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toBeUndefined();
    expect(system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(system[1].text).toContain("山田花子。物流の会社で3年。");
    expect(system[1].text).toContain("Q1. 強みは");
    // 質問ごとに変わるもの（会話・質問）は system に入れない（入れるとキャッシュが毎回外れる）。
    expect(system.map((block) => block.text).join("")).not.toContain("強みを教えてください");
    expect(buildUserText(parsed.input)).toContain("強みを教えてください");
    expect(buildUserText(parsed.input)).toContain("[相手] こんにちは");
  });

  function fakeStream(texts: string[], final: Record<string, unknown>) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const text of texts) {
          yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
        }
      },
      finalMessage: async () => final,
    };
  }

  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 };

  it("1段目は最速のモデルで、考える段階を省いて流す", async () => {
    const stream = vi.fn(() => fakeStream(["結論：", "はい。"], { model: "claude-haiku-5-5", stop_reason: "end_turn", usage }));
    const client = { messages: { stream }, beta: { messages: { stream: vi.fn() } } };
    const events: Record<string, unknown>[] = [];
    const parsed = parseInterviewBody({ stage: "quick", question: "強みは" });
    if (!parsed.ok) throw new Error("parse failed");
    await runInterview(client as never, parsed.input, (event) => events.push(event), new AbortController().signal);

    const params = (stream.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.thinking).toEqual({ type: "disabled" });
    expect(events.filter((event) => event.t === "d").map((event) => event.v)).toEqual(["結論：", "はい。"]);
    const done = events.find((event) => event.t === "done");
    expect(done).toMatchObject({ model: "claude-haiku-5-5", usage: { cache_read_input_tokens: 900 } });
  });

  it("2段目は正確なモデルで、断られたときの代わりのモデルを付けて流す", async () => {
    const stream = vi.fn(() => fakeStream(["@想定 0\n結論：はい。"], { model: "claude-opus-5-5", stop_reason: "end_turn", usage }));
    const client = { messages: { stream: vi.fn() }, beta: { messages: { stream } } };
    const parsed = parseInterviewBody({ stage: "full", question: "強みは", model: "opus", effort: "low" });
    if (!parsed.ok) throw new Error("parse failed");
    await runInterview(client as never, parsed.input, () => {}, new AbortController().signal);

    const params = (stream.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.output_config).toEqual({ effort: "low" });
    // Opus 5.5 / Fable 5.2 は考える段階を止められない（止める指定は 400 になる）。
    expect(params.thinking).toBeUndefined();
    expect(params.tool_choice).toBeUndefined();
    // 速いモードは Fable 5.2 だけ（Opus 5.5 との組み合わせは試していない）。
    expect(params.speed).toBeUndefined();
  });

  it("Fable 5.2 は既定で速いモード。上限に当たったら普通の速さで出し直す", async () => {
    const calls: Record<string, unknown>[] = [];
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const stream = vi.fn((params: Record<string, unknown>) => {
      calls.push(params);
      if (params.speed === "fast") {
        return {
          // eslint-disable-next-line require-yield
          async *[Symbol.asyncIterator]() {
            throw new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers());
          },
          finalMessage: async () => ({}),
        };
      }
      return fakeStream(["結論：はい。"], { model: "claude-fable-5-2", stop_reason: "end_turn", usage });
    });
    const client = { messages: { stream: vi.fn() }, beta: { messages: { stream } } };
    const events: Record<string, unknown>[] = [];
    const parsed = parseInterviewBody({ stage: "full", question: "強みは" });
    if (!parsed.ok) throw new Error("parse failed");
    expect(parsed.input).toMatchObject({ model: "fable", effort: "low", fast: true });
    await runInterview(client as never, parsed.input, (event) => events.push(event), new AbortController().signal);
    expect(calls.map((call) => call.speed)).toEqual(["fast", undefined]);
    expect(events.map((event) => event.t)).toEqual(["d", "done"]);
  });

  it("安全の判定で断られたら、終わりではなく失敗として知らせる", async () => {
    const stream = vi.fn(() => fakeStream([], { model: "claude-opus-5-5", stop_reason: "refusal", usage }));
    const client = { messages: { stream: vi.fn() }, beta: { messages: { stream } } };
    const events: Record<string, unknown>[] = [];
    const parsed = parseInterviewBody({ stage: "full", question: "強みは" });
    if (!parsed.ok) throw new Error("parse failed");
    await runInterview(client as never, parsed.input, (event) => events.push(event), new AbortController().signal);
    expect(events.map((event) => event.t)).toEqual(["error"]);
  });
});
