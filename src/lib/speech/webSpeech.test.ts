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

  it("iPhoneでは「別のブラウザで」ではなく、OSの制約だと分かる理由にする", () => {
    // iOSはどのブラウザもSafari本体のエンジンを使う決まりで、Web Speech APIが載っていない。
    // 「Chromeで開いてください」は効かないので、案内を書き分けているかを確かめる。
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    try {
      const info = webSpeechProvider.info();
      expect(info.available).toBe(false);
      expect(info.reason).not.toContain("Chrome");
      expect(info.reason).toContain("iPhone");
    } finally {
      Object.defineProperty(navigator, "userAgent", { value: original, configurable: true });
    }
  });
});
