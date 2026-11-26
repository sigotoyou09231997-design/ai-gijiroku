import { afterEach, describe, expect, it } from "vitest";
import { deepgramLanguage, listenUrl, phraseParams, pickMimeType } from "./deepgramSpeech";

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

describe("送る音の形の選び方", () => {
  const original = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;

  afterEach(() => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = original;
  });

  function stubMediaRecorder(supported: string[]): void {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: (type: string) => supported.includes(type),
    };
  }

  it("Chrome/Edgeなど webm に対応した環境では webm を選ぶ", () => {
    stubMediaRecorder(["audio/webm;codecs=opus", "audio/webm"]);
    expect(pickMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("iPhone（Safari系）は webm/ogg に対応しないので mp4 を選ぶ", () => {
    // Safariは webm/ogg に一切対応せず、mp4（AAC）だけに対応する。
    // ここが無いと iPhone では毎回「音声の送信に対応していません」で止まる。
    stubMediaRecorder(["audio/mp4;codecs=mp4a.40.2", "audio/mp4"]);
    expect(pickMimeType()).toBe("audio/mp4;codecs=mp4a.40.2");
  });

  it("どれにも対応していなければ undefined を返す", () => {
    stubMediaRecorder([]);
    expect(pickMimeType()).toBeUndefined();
  });
});

describe("よく出る言葉の渡し方", () => {
  it("Nova-2 は keywords、Nova-3 は keyterm で渡す", () => {
    expect(phraseParams("nova-2", ["サンプルテック", "React"])).toEqual([
      ["keywords", "サンプルテック"],
      ["keywords", "React"],
    ]);
    expect(phraseParams("nova-3", ["React"])).toEqual([["keyterm", "React"]]);
  });

  it("「:」を含む語（強さの指定と紛れる）と空の語は渡さず、100語で切る", () => {
    expect(phraseParams("nova-2", ["a:b", " ", "React"])).toEqual([["keywords", "React"]]);
    expect(phraseParams("nova-2", Array.from({ length: 120 }, (_, i) => `w${i}`))).toHaveLength(100);
  });

  it("接続先の URL に付く（言葉が無ければ付かない）", () => {
    const url = new URL(listenUrl("ja-JP", "nova-2", ["サンプルテック"]));
    expect(url.searchParams.getAll("keywords")).toEqual(["サンプルテック"]);
    expect(url.searchParams.get("language")).toBe("ja");
    expect(new URL(listenUrl("ja-JP", "nova-2")).searchParams.has("keywords")).toBe(false);
  });
});
