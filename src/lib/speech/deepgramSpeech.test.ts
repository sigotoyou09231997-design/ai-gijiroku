import { afterEach, describe, expect, it } from "vitest";
import { deepgramLanguage, pickMimeType } from "./deepgramSpeech";

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
