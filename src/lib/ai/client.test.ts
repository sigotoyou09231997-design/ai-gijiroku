import { describe, expect, it } from "vitest";
import { asStringList } from "./client";

/**
 * 実際の本番データで再現した不具合: AIが points/decisions/todos を
 * 配列ではなく `<point>...</point>` のようなタグ付き文字列で返すことがあり、
 * それを「配列じゃない」と丸ごと空配列に捨てていた（中身自体は生成できていた）。
 * ここで機械的に見張る。
 */
describe("asStringList", () => {
  it("配列ならそのまま文字列の配列にする", () => {
    expect(asStringList(["要点1", "要点2"])).toEqual(["要点1", "要点2"]);
  });

  it("タグ付きの1本の文字列で返ってきても、タグの中身を1件ずつ取り出す", () => {
    const value = "<point>要点1</point>\n<point>要点2</point>";
    expect(asStringList(value)).toEqual(["要点1", "要点2"]);
  });

  it("閉じタグの無い書きかけのタグが混ざっても、中身だけ残す", () => {
    const value = '\n<parameter name="decisions">次回の面談は16日21時から実施する。';
    expect(asStringList(value)).toEqual(["次回の面談は16日21時から実施する。"]);
  });

  it("タグの後にJSON配列そのものが続く形でも、配列として取り出す", () => {
    const value = '\n<parameter name="points">["要点1", "要点2"]';
    expect(asStringList(value)).toEqual(["要点1", "要点2"]);
  });

  it("タグの中に、さらにタグの切れ端が入れ子になっても中身だけにする", () => {
    const value = '\n<parameter name="decisions">\n<item>次回は16日に実施する</item>\n';
    expect(asStringList(value)).toEqual(["次回は16日に実施する"]);
  });

  it("タグも無ければ、改行区切りの箇条書きとして扱う", () => {
    const value = "- 要点1\n・要点2\n3. 要点3";
    expect(asStringList(value)).toEqual(["要点1", "要点2", "要点3"]);
  });

  it("空や配列でも文字列でもなければ空配列にする", () => {
    expect(asStringList(undefined)).toEqual([]);
    expect(asStringList(null)).toEqual([]);
    expect(asStringList(123)).toEqual([]);
  });
});
