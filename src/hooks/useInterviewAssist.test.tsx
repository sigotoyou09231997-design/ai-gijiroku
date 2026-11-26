import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contextBefore, useInterviewAssist, viewCard, type InterviewCard } from "./useInterviewAssist";
import { parseQaBank } from "../lib/interview/qaBank";

// 架空の人物（山田花子さん）の材料。
const BANK = "## 自己紹介をしてください\n山田花子と申します。物流の会社で在庫の仕組みを作ってきました。\n\n## 強みは何ですか\n粘り強さです。";

function ndjson(lines: object[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

/** stage ごとに返す中身を決める偽の fetch。 */
function stubAnswers(answers: { quick: string; full: string }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { stage: "quick" | "full" | "warm" };
    if (body.stage === "warm") return new Response("{}", { status: 200 });
    return ndjson([{ t: "d", v: answers[body.stage] }, { t: "done", model: body.stage }]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("gijiroku.interview.profile", "山田花子。物流の会社で3年。");
  window.localStorage.setItem("gijiroku.interview.qaBank", BANK);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("面接モードの回答の流れ", () => {
  it("打ち込んだ質問で、1段目と2段目を同時に回し、2段目の3行で置き換える", async () => {
    const fetchMock = stubAnswers({
      quick: "@想定 2\n結論：私の強みは粘り強さです。",
      full: "@想定 2\n結論：私の強みは粘り強く調べることです。\n具体例：在庫の仕組みで原因を突き止めました。\nつなげ：御社でも活かします。\n@質問 強みは何ですか",
    });
    const { result } = renderHook(() => useInterviewAssist(true));
    act(() => result.current.rehearse("ご自身の強みを教えてください", "other"));

    await waitFor(() => expect(result.current.cards[0]?.full.status).toBe("done"));
    const stages = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)).stage);
    expect(stages.sort()).toEqual(["full", "quick"]);
    const sent = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    // 経歴・想定問答は毎回送る（サーバーには残さない）。
    expect(sent.profile).toContain("山田花子");
    expect(sent.qa).toContain("Q2. 強みは何ですか");

    const card = result.current.cards[0];
    expect(card.visible).toBe(true);
    expect(card.fullParsed.lines.map((line) => line.label)).toEqual(["結論", "具体例", "つなげ"]);
    expect(card.qa?.index).toBe(1);
    expect(result.current.records()).toEqual([
      expect.objectContaining({ question: "強みは何ですか", qaRef: 2 }),
    ]);
    expect(result.current.exportMarkdown("面接で聞かれた質問")).toContain("## 強みは何ですか");
  });

  it("2段目が「質問ではない」と言ったものは出さない", async () => {
    stubAnswers({ quick: "@なし\n", full: "@なし\n" });
    const { result } = renderHook(() => useInterviewAssist(true));
    act(() => result.current.rehearse("今日は雨ですね", "other"));
    await waitFor(() => expect(result.current.cards[0]?.full.status).toBe("done"));
    expect(result.current.cards[0].visible).toBe(false);
    expect(result.current.records()).toEqual([]);
  });

  it("想定問答に近い質問は、AI を待たずに手元の照合で用意した答えを出す", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { result } = renderHook(() => useInterviewAssist(true));
    act(() => result.current.rehearse("まず簡単に自己紹介をお願いします", "other"));
    const card = result.current.cards[0];
    expect(card.visible).toBe(true);
    expect(card.qa).toMatchObject({ index: 0, byModel: false });
  });

  it("新しい質問が来たら、作りかけの回答は止める", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>(() => {});
      }),
    );
    const { result } = renderHook(() => useInterviewAssist(true));
    act(() => result.current.rehearse("強みを教えてください", "other"));
    act(() => result.current.rehearse("それでは私の回答です", "self"));
    act(() => result.current.rehearse("では志望動機を教えてください", "other"));
    expect(signals).toHaveLength(4);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(true);
    expect(signals[2].aborted).toBe(false);
    expect(result.current.cards[1].full.status).toBe("aborted");
  });

  it("面接モードでなければ、発言が来ても回さない", () => {
    const fetchMock = stubAnswers({ quick: "", full: "" });
    const { result } = renderHook(() => useInterviewAssist(false));
    act(() => result.current.handleFinal("other", "強みを教えてください"));
    act(() => result.current.triggerNow());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("画面に出すかの決まり", () => {
  const pairs = parseQaBank(BANK);
  const base: InterviewCard = {
    id: "1",
    turnId: 1,
    question: "強みは",
    at: 0,
    local: null,
    quick: { status: "streaming", text: "" },
    full: { status: "streaming", text: "" },
    manual: false,
  };

  it("何も届いていないうちは出さない。1段目の結論が来たら出す", () => {
    expect(viewCard(base, pairs).visible).toBe(false);
    expect(viewCard({ ...base, quick: { status: "done", text: "結論：はい。" } }, pairs).visible).toBe(true);
  });

  it("1段目が「質問ではない」でも、2段目が答えれば出す（2段目の判断が勝つ）", () => {
    const card = { ...base, quick: { status: "done" as const, text: "@なし\n" }, full: { status: "streaming" as const, text: "結論：はい。" } };
    expect(viewCard(card, pairs).visible).toBe(true);
  });

  it("経歴に無い印は2段目のものを使う", () => {
    const card = { ...base, quick: { status: "done" as const, text: "結論：はい。" }, full: { status: "done" as const, text: "@経歴外\n結論：経験はありません。" } };
    expect(viewCard(card, pairs).noExperience).toBe(true);
  });
});

describe("直近の会話", () => {
  it("今の番（末尾の [相手] の行）を除き、長ければ後ろから取る", () => {
    const lines = ["[相手] よろしくお願いします", "[自分] よろしくお願いします", "[相手] 強みは", "[相手] 何ですか"];
    expect(contextBefore(lines)).toBe("[相手] よろしくお願いします\n[自分] よろしくお願いします");
    expect(contextBefore(["[自分] あいうえお"], 3)).toBe("うえお");
  });
});
