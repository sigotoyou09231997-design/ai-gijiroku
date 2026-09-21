import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Azure の SDK を偽物に差し替えて、途中で切れたときの振る舞いを確かめる。
 * 本物は WebSocket とマイクが要るので、テストでは「打ち切りの知らせ」を手で起こす。
 */
const created: FakeRecognizer[] = [];

class FakeRecognizer {
  recognizing: ((s: unknown, e: unknown) => void) | null = null;
  recognized: ((s: unknown, e: unknown) => void) | null = null;
  canceled: ((s: unknown, e: unknown) => void) | null = null;
  authorizationToken = "";
  closed = false;
  constructor(public config: { token: string }) {
    created.push(this);
  }
  startContinuousRecognitionAsync(ok: () => void) {
    ok();
  }
  stopContinuousRecognitionAsync(ok: () => void) {
    ok();
  }
  close() {
    this.closed = true;
  }
}

vi.mock("microsoft-cognitiveservices-speech-sdk", () => ({
  SpeechConfig: {
    fromAuthorizationToken: (token: string) => ({ token, speechRecognitionLanguage: "" }),
  },
  AudioConfig: { fromStreamInput: () => ({}) },
  SpeechRecognizer: FakeRecognizer,
  ResultReason: { RecognizedSpeech: 3 },
  CancellationReason: { Error: 0, EndOfStream: 1 },
  CancellationErrorCode: {
    NoError: 0,
    AuthenticationFailure: 1,
    BadRequestParameters: 2,
    TooManyRequests: 3,
    ConnectionFailure: 4,
    ServiceTimeout: 5,
    ServiceError: 6,
    RuntimeError: 7,
  },
}));

const { azureSpeechProvider, classifyCancel, retryDelayMs } = await import("./azureSpeech");

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return { active: true, getTracks: () => [track], getAudioTracks: () => [track] };
}

let tokenCount = 0;

beforeEach(() => {
  vi.useFakeTimers();
  created.length = 0;
  tokenCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      tokenCount += 1;
      return new Response(JSON.stringify({ token: `t${tokenCount}`, region: "japaneast" }), { status: 200 });
    }),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => fakeStream()) } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function startOne() {
  const handlers = { onChunk: vi.fn(), onError: vi.fn(), onStatus: vi.fn() };
  const recognizer = azureSpeechProvider.create({ lang: "ja-JP", sources: [{ speaker: "self" }] });
  recognizer.start(handlers);
  await vi.advanceTimersByTimeAsync(0);
  return { handlers, recognizer };
}

describe("打ち切りの理由の分け方", () => {
  it("利用枠の超過は、1007 で文面に Quota とあるものも含めて quota", () => {
    expect(classifyCancel(2, "Quota exceeded. Cid: websocket error code: 1007")).toBe("quota");
    expect(classifyCancel(3, "")).toBe("quota");
  });

  it("合鍵切れは auth、設定の誤りは config、通信の切断は retry", () => {
    expect(classifyCancel(1, "")).toBe("auth");
    expect(classifyCancel(2, "bad language")).toBe("config");
    expect(classifyCancel(4, "websocket error code: 1006")).toBe("retry");
    expect(classifyCancel(5, "")).toBe("retry");
  });

  it("待ち時間は倍々に伸び、15秒で頭打ち", () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
  });
});

describe("途中で切れたとき", () => {
  it("通信が切れても止めずにつなぎ直し、画面には「つなぎ直しています」を出す", async () => {
    const { handlers } = await startOne();
    expect(created).toHaveLength(1);

    created[0].canceled?.(null, { reason: 0, errorCode: 4, errorDetails: "websocket error code: 1006" });
    expect(created[0].closed).toBe(true);
    expect(handlers.onStatus).toHaveBeenLastCalledWith("self", expect.stringContaining("つなぎ直しています"));

    await vi.advanceTimersByTimeAsync(1000);
    expect(created).toHaveLength(2);
    expect(handlers.onStatus).toHaveBeenLastCalledWith("self", null);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("音の流れが終わった（以前は黙って止まっていた）ときも、つなぎ直す", async () => {
    const { handlers } = await startOne();
    created[0].canceled?.(null, { reason: 1, errorCode: 0, errorDetails: "" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(created).toHaveLength(2);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("合鍵切れなら、取り直した合鍵でつなぎ直す", async () => {
    await startOne();
    created[0].canceled?.(null, { reason: 0, errorCode: 1, errorDetails: "401" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(created[1].config.token).toBe("t2");
  });

  it("利用枠の超過は、つなぎ直さずに理由の分かる言葉で止める", async () => {
    const { handlers } = await startOne();
    created[0].canceled?.(null, { reason: 0, errorCode: 2, errorDetails: "Quota exceeded. websocket error code: 1007" });
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining("利用上限"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(1);
  });

  it("何度つなぎ直しても戻らなければ、止めて知らせる", async () => {
    const { handlers } = await startOne();
    for (let i = 0; i < 30 && handlers.onError.mock.calls.length === 0; i++) {
      created[created.length - 1].canceled?.(null, { reason: 0, errorCode: 4, errorDetails: "1006" });
      await vi.advanceTimersByTimeAsync(15_000);
    }
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining("何度つなぎ直しても"));
  });

  it("止めたあとは、つなぎ直しの予約も取り消す", async () => {
    const { recognizer } = await startOne();
    created[0].canceled?.(null, { reason: 0, errorCode: 4, errorDetails: "1006" });
    recognizer.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(1);
  });
});
