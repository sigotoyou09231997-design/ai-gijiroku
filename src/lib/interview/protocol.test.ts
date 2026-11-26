import { describe, expect, it } from "vitest";
import { answerPlainText, parseAnswer } from "./protocol";

describe("面接の回答の読み取り", () => {
  it("2段目の形（想定・3行・質問）を読む", () => {
    const parsed = parseAnswer(
      "@想定 3\n結論：私の強みは、作ったものを使いながら直し続けることです。\n具体例：家計アプリを毎日使って直しています。\nつなげ：御社でも同じように改善を続けます。\n@質問 強みは何ですか\n",
    );
    expect(parsed.skip).toBe(false);
    expect(parsed.qaRef).toBe(3);
    expect(parsed.noExperience).toBe(false);
    expect(parsed.title).toBe("強みは何ですか");
    expect(parsed.lines.map((line) => line.label)).toEqual(["結論", "具体例", "つなげ"]);
    expect(parsed.lines[0].text).toBe("私の強みは、作ったものを使いながら直し続けることです。");
  });

  it("質問ではないときは @なし だけ（改行で終わらなくても読む）", () => {
    const parsed = parseAnswer("@なし\n");
    expect(parsed.skip).toBe(true);
    expect(parsed.lines).toEqual([]);
    expect(parseAnswer("@なし").skip).toBe(true);
  });

  it("書き終わっていれば、改行の無い最後の @ の行も読む", () => {
    expect(parseAnswer("@想定 1").qaRef).toBeUndefined();
    expect(parseAnswer("@想定 1", true).qaRef).toBe(1);
  });

  it("経歴に無い経験の印を読む。想定 0 は「当たり無し」", () => {
    const parsed = parseAnswer("@想定 0\n@経歴外\n結論：業務で使った経験はありません。");
    expect(parsed.qaRef).toBeUndefined();
    expect(parsed.noExperience).toBe(true);
    expect(parsed.lines).toHaveLength(1);
  });

  it("流れている途中でも、本文の書きかけは出す。@ の書きかけは出さない", () => {
    expect(parseAnswer("@想定 2\n結論：私は").lines).toEqual([{ label: "結論", text: "私は" }]);
    const partialMeta = parseAnswer("結論：はい。\n@経");
    expect(partialMeta.noExperience).toBe(false);
    expect(partialMeta.lines).toHaveLength(1);
  });

  it("飾り（**・箇条書きの記号・半角コロン・全角数字）が付いても読める", () => {
    const parsed = parseAnswer("＠想定 ３\n- **結論**: はい。\n・具体例：例です。\n");
    expect(parsed.qaRef).toBe(3);
    expect(parsed.lines).toEqual([
      { label: "結論", text: "はい。" },
      { label: "具体例", text: "例です。" },
    ]);
  });

  it("印は行まるごとで読む（書き崩れた @ の行は印にしない）", () => {
    const parsed = parseAnswer("@経歴外 — いいえ、これは使わない\n@なしではない\n結論：はい。\n");
    expect(parsed.noExperience).toBe(false);
    expect(parsed.skip).toBe(false);
    expect(parsed.lines).toEqual([{ label: "結論", text: "はい。" }]);
  });

  it("括弧で始まる断り書き（読み上げる文ではない）は出さない", () => {
    const parsed = parseAnswer("@なし\n結論：（この発言は質問ではないため、回答は不要です。）\n");
    expect(parsed.skip).toBe(true);
    expect(parsed.lines).toEqual([]);
    expect(parseAnswer("（補足）\n結論：はい。").lines).toEqual([{ label: "結論", text: "はい。" }]);
  });

  it("札の無い行もそのまま本文として出す", () => {
    const parsed = parseAnswer("経験はありません。");
    expect(parsed.lines).toEqual([{ text: "経験はありません。" }]);
    expect(answerPlainText(parsed)).toBe("経験はありません。");
  });
});
