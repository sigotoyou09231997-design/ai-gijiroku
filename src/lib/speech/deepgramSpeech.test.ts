import { describe, expect, it } from "vitest";
import { deepgramLanguage } from "./deepgramSpeech";

/**
 * ここを間違えると、接続も課金も成立したまま結果だけが空で返る。
 * エラーが出ないぶん気付きにくいので、機械で止める。
 */
describe("Deepgram に渡す言語コード", () => {
  it("日本語は ja に直す（ja-JP のままだと空の結果が返る）", () => {
    expect(deepgramLanguage("ja-JP")).toBe("ja");
    expect(deepgramLanguage("ja")).toBe("ja");
  });

  it("地域まで見る言語はそのまま渡す", () => {
    expect(deepgramLanguage("en-US")).toBe("en-us");
    expect(deepgramLanguage("pt-BR")).toBe("pt-br");
  });

  it("地域を見ない言語は先頭だけにする", () => {
    expect(deepgramLanguage("ko-KR")).toBe("ko");
    expect(deepgramLanguage("de-DE")).toBe("de");
  });

  it("空でも落ちず、日本語に倒す", () => {
    expect(deepgramLanguage("")).toBe("ja");
    expect(deepgramLanguage("   ")).toBe("ja");
  });
});
