import { describe, expect, it } from "vitest";
import { describeSpeechError, isFatalSpeechError, webSpeechProvider } from "./webSpeech";

describe("isFatalSpeechError", () => {
  it("無音や中断では止めない（長い会話では普通に起きるため）", () => {
    expect(isFatalSpeechError("no-speech")).toBe(false);
    expect(isFatalSpeechError("aborted")).toBe(false);
  });

  it("許可されていない・マイクが無いは止める", () => {
    expect(isFatalSpeechError("not-allowed")).toBe(true);
    expect(isFatalSpeechError("audio-capture")).toBe(true);
  });
});

describe("describeSpeechError", () => {
  it("よくある失敗は、何をすればいいかが分かる文にする", () => {
    expect(describeSpeechError("not-allowed")).toContain("マイク");
    expect(describeSpeechError("network")).toContain("ネットワーク");
  });

  it("知らないコードでも、そのまま出せる文にする", () => {
    expect(describeSpeechError("something-odd")).toContain("something-odd");
  });
});

describe("webSpeechProvider", () => {
  it("音声認識が無い環境では、理由つきで使えないと答える", () => {
    // jsdom には SpeechRecognition が無いので、非対応の環境と同じ状態になる。
    const info = webSpeechProvider.info();
    expect(info.available).toBe(false);
    expect(info.reason).toBeTruthy();
  });
});
