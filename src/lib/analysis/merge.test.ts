import { describe, expect, it } from "vitest";
import { isSameText, mergeActions, mergeQuestions, normalize } from "./merge";
import type { ActionItem, DetectedQuestion } from "../types";

function question(id: string, text: string): DetectedQuestion {
  return { id, question: text, answer: "回答案", at: 0 };
}

function action(id: string, kind: ActionItem["kind"], text: string): ActionItem {
  return { id, kind, text, at: 0 };
}

describe("normalize", () => {
  it("空白と記号を落として比べられるようにする", () => {
    expect(normalize("これは、テストです。")).toBe(normalize("これはテストです"));
    expect(normalize("ＡＢＣ")).toBe("abc");
  });
});

describe("isSameText", () => {
  it("句読点だけの違いは同じとみなす", () => {
    expect(isSameText("来週までに見積もりを出す", "来週までに、見積もりを出す。")).toBe(true);
  });

  it("片方がもう片方を含んでいれば同じとみなす", () => {
    expect(isSameText("見積もりは来週までに出すことにしました", "見積もりは来週までに出す")).toBe(true);
  });

  it("短い文字列は、たまたま含まれるだけでは同じにしない", () => {
    expect(isSameText("はい", "はい、承知しました")).toBe(false);
  });

  it("違う内容は別物にする", () => {
    expect(isSameText("価格を下げる", "納期を早める")).toBe(false);
  });
});

describe("mergeQuestions", () => {
  it("同じ質問は足さない", () => {
    const existing = [question("1", "現在のご職業を教えてください")];
    const result = mergeQuestions(existing, [question("2", "現在のご職業を教えてください。")]);
    expect(result.items).toHaveLength(1);
    expect(result.added).toHaveLength(0);
  });

  it("新しい質問は足して、足したものを返す", () => {
    const existing = [question("1", "現在のご職業を教えてください")];
    const result = mergeQuestions(existing, [question("2", "転職を考えたきっかけは何ですか")]);
    expect(result.items).toHaveLength(2);
    expect(result.added.map((item) => item.id)).toEqual(["2"]);
  });

  it("空の質問は捨てる", () => {
    const result = mergeQuestions([], [question("1", "   ")]);
    expect(result.items).toHaveLength(0);
  });

  it("元の配列を書き換えない", () => {
    const existing = [question("1", "現在のご職業を教えてください")];
    mergeQuestions(existing, [question("2", "転職を考えたきっかけは何ですか")]);
    expect(existing).toHaveLength(1);
  });
});

describe("mergeActions", () => {
  it("決定と宿題は、同じ文でも別ものとして扱う", () => {
    const existing = [action("1", "decision", "来週までに見積もりを出す")];
    const result = mergeActions(existing, [action("2", "todo", "来週までに見積もりを出す")]);
    expect(result.items).toHaveLength(2);
  });

  it("同じ種類の同じ内容は足さない", () => {
    const existing = [action("1", "decision", "来週までに見積もりを出す")];
    const result = mergeActions(existing, [action("2", "decision", "来週までに見積もりを出す。")]);
    expect(result.items).toHaveLength(1);
    expect(result.added).toHaveLength(0);
  });
});
