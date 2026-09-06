import { afterEach, describe, expect, it, vi } from "vitest";
import { resetSpeechProviderProbe, resolveSpeechProvider } from "./index";

/** サーバーの返事を差し替える。 */
function mockProbe(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: async () => body,
    }),
  );
}

afterEach(() => {
  resetSpeechProviderProbe();
  vi.unstubAllGlobals();
});

describe("どの音声認識を使うかの判断", () => {
  it("Deepgram のキーがあれば Deepgram を使う", async () => {
    mockProbe({ provider: "deepgram" });
    expect((await resolveSpeechProvider()).id).toBe("deepgram");
  });

  it("Azure のキーがあれば Azure を使う", async () => {
    mockProbe({ provider: "azure", region: "japaneast" });
    expect((await resolveSpeechProvider()).id).toBe("azure-speech");
  });

  it("どちらも無ければブラウザ標準に落ちる（実装も動作確認も止めないため）", async () => {
    mockProbe({ provider: null });
    expect((await resolveSpeechProvider()).id).toBe("web-speech");
  });

  it("サーバーに聞けなくてもブラウザ標準に落ちる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("圏外")));
    expect((await resolveSpeechProvider()).id).toBe("web-speech");
  });

  it("知らない業者名が返ってきてもブラウザ標準に落ちる", async () => {
    mockProbe({ provider: "まだ無い業者" });
    expect((await resolveSpeechProvider()).id).toBe("web-speech");
  });

  it("一度聞いたら憶えていて、二度は聞きにいかない", async () => {
    mockProbe({ provider: "deepgram" });
    await resolveSpeechProvider();
    await resolveSpeechProvider();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
