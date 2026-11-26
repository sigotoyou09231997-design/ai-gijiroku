import { describe, expect, it } from "vitest";
import { MAX_PHRASES, extractSpeechPhrases } from "./phrases";

// 架空の会社・人物で書く。
describe("音声認識に渡す「よく出る言葉」", () => {
  it("社名・人名・英字の技術用語・カタカナ語を拾う", () => {
    const phrases = extractSpeechPhrases(
      "株式会社サンプルテックは2020年創業。担当は佐藤さん。React と TypeScript、Salesforce の案件があります。クラウドネイティブな開発。",
      "前職はミライ株式会社で Next.js を使いました。",
    );
    expect(phrases).toContain("サンプルテック");
    expect(phrases).toContain("ミライ");
    expect(phrases).toContain("佐藤");
    expect(phrases).toContain("React");
    expect(phrases).toContain("TypeScript");
    expect(phrases).toContain("Salesforce");
    expect(phrases).toContain("Next.js");
    expect(phrases).toContain("クラウドネイティブ");
  });

  it("社名の前後の文（助詞から先）までは拾わない", () => {
    const phrases = extractSpeechPhrases("応募先は株式会社サンプルで、面談は明日です。");
    expect(phrases).toContain("サンプル");
    expect(phrases.some((phrase) => phrase.includes("面談"))).toBe(false);
  });

  it("ありふれた語は拾わず、多すぎるときは上限で切る", () => {
    expect(extractSpeechPhrases("システムとサービスとデータ")).toEqual([]);
    const many = Array.from({ length: 150 }, (_, i) => `Tool${i}`).join(" ");
    expect(extractSpeechPhrases(many)).toHaveLength(MAX_PHRASES);
  });

  it("空なら空", () => {
    expect(extractSpeechPhrases("", "")).toEqual([]);
  });
});
