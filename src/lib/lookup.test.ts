import { describe, expect, it } from "vitest";
import { chatGptLookupUrl, lookupQuestion } from "./lookup";

describe("ChatGPTで調べるリンク", () => {
  it("ChatGPT の入力欄に質問が入る形のURLを作る", () => {
    const url = new URL(chatGptLookupUrl("KPI"));
    expect(url.origin).toBe("https://chatgpt.com");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("q")).toBe(lookupQuestion("KPI"));
    expect(url.searchParams.get("hints")).toBe("search");
  });

  it("質問に、用語と、略語なら正式名称も聞く一文が入る", () => {
    const question = lookupQuestion("SLA");
    expect(question).toContain("「SLA」");
    expect(question).toContain("正式名称");
  });

  it("& や # や空白を含む用語でも、URLが壊れず元の文字に戻る", () => {
    const term = "R&D #1 / A+B";
    const url = new URL(chatGptLookupUrl(term));
    expect(url.searchParams.get("q")).toContain(`「${term}」`);
    // 質問の一部が別の項目やフラグメントに化けていないこと。
    expect(url.hash).toBe("");
    expect([...url.searchParams.keys()].sort()).toEqual(["hints", "q"]);
  });

  it("用語の前後の空白は取り除く", () => {
    expect(lookupQuestion("  SPA \n")).toContain("「SPA」");
  });

  it("会話の文脈は付けない（用語だけを渡す）", () => {
    const url = chatGptLookupUrl("SPA");
    // 質問文以外の長い文章が混ざっていないこと。URLは質問1つぶんの長さに収まる。
    expect(decodeURIComponent(url).length).toBeLessThan(120);
  });
});
