import { describe, expect, it } from "vitest";
import { matchQa, normalizeForMatch, parseQaBank, serializeQaBank, similarity } from "./qaBank";

// テストの例は架空の人物（山田花子さん）で書く。本人の経歴は入れない。
const BANK = `# 想定問答

## 自己紹介をしてください
- 別の聞き方: 簡単に自己紹介を／これまでの経歴を教えてください
山田花子と申します。
物流の会社で在庫の仕組みを作ってきました。

## あなたの強みは何ですか
- 別の聞き方: 長所／自己PR
> 粘り強く調べることです。

## 希望年収を教えてください
- 別の聞き方: 年収の希望
今は380万円で、希望は420万円です。

## 答えの無い質問
<!-- まだ書いていない -->
`;

describe("想定問答の読み込み", () => {
  it("## の見出しを質問、次の見出しまでを答えとして読む（答えが空の組は捨てる）", () => {
    const pairs = parseQaBank(BANK);
    expect(pairs.map((pair) => pair.question)).toEqual([
      "自己紹介をしてください",
      "あなたの強みは何ですか",
      "希望年収を教えてください",
    ]);
    expect(pairs[0].alternatives).toEqual(["簡単に自己紹介を", "これまでの経歴を教えてください"]);
    expect(pairs[0].answer).toBe("山田花子と申します。\n物流の会社で在庫の仕組みを作ってきました。");
    // 引用（>）や ** は外す。
    expect(pairs[1].answer).toBe("粘り強く調べることです。");
  });

  it("Q: / A: の形でも読める", () => {
    const pairs = parseQaBank("Q: 転職の理由は\nA: 設計に関わりたいからです。\n\nQ．入社時期は\nA．来年1月です。");
    expect(pairs).toEqual([
      { question: "転職の理由は", alternatives: [], answer: "設計に関わりたいからです。" },
      { question: "入社時期は", alternatives: [], answer: "来年1月です。" },
    ]);
  });

  it("番号を振って渡す（画面の「用意した答え 2」と揃える）", () => {
    const text = serializeQaBank(parseQaBank(BANK));
    expect(text).toContain("Q1. 自己紹介をしてください（別の聞き方: 簡単に自己紹介を／これまでの経歴を教えてください）");
    expect(text).toContain("A2. 粘り強く調べることです。");
  });
});

describe("手元での照合", () => {
  const pairs = parseQaBank(BANK);

  it("前置きや丁寧さが違っても、同じ質問なら当たる", () => {
    expect(matchQa("ありがとうございます。それでは、まず簡単に自己紹介をお願いできますか。", pairs)?.index).toBe(0);
    expect(matchQa("ご自身の強みについて教えていただけますか", pairs)?.index).toBe(1);
    expect(matchQa("年収の希望はどのくらいでしょうか", pairs)?.index).toBe(2);
  });

  it("用意していない質問には当たらない", () => {
    expect(matchQa("Java の開発経験はありますか", pairs)).toBeNull();
    expect(matchQa("休日は何をして過ごしていますか", pairs)).toBeNull();
    expect(matchQa("", pairs)).toBeNull();
  });

  it("聞き方の枠（「〜の経験はありますか」）が同じだけでは当たらない", () => {
    const bank = parseQaBank("## リーダーの経験はありますか\nまだありません。\n\n## なぜ Supabase を選んだのですか\n一人でも安全に運用できるからです。");
    expect(matchQa("PHPの経験はありますか", bank)).toBeNull();
    expect(matchQa("リーダーとか、マネジメントのご経験ってありますか", bank)?.index).toBe(0);
  });

  it("音声認識のカタカナ・同音の字（スーパーベース・事故紹介）も、想定問答の書き方に寄せて比べる", () => {
    const bank = parseQaBank("## なぜ Supabase を選んだのですか\n一人でも安全に運用できるからです。");
    expect(matchQa("スーパーベースを選んだ理由を聞かせてください", bank)?.index).toBe(0);
    expect(normalizeForMatch("事故紹介をお願いします")).toBe(normalizeForMatch("自己紹介をお願いします"));
  });

  it("比べる前に、言い回しの違いを落とす", () => {
    expect(normalizeForMatch("強みを教えてください。")).toBe(normalizeForMatch("強みを、お聞かせください"));
    expect(similarity("自己紹介", "自己紹介")).toBe(1);
  });
});
