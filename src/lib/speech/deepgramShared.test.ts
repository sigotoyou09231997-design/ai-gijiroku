import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deepgramSpeechProvider } from "./deepgramSpeech";

/**
 * 画面・タブの共有で受けた音声を、Deepgram でも「相手の声」として聞けるかを見張る。
 * WebSocket とマイクの録音は偽物に差し替え、手で「つながった」「共有が止まった」を起こす。
 */
const sockets: FakeWebSocket[] = [];
const recorders: FakeMediaRecorder[] = [];

class FakeWebSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  closed = false;
  constructor(public url: string, public protocols: string[]) {
    sockets.push(this);
  }
  send() {}
  close() {
    this.closed = true;
    this.readyState = 3;
  }
}

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  constructor(public stream: unknown, public options: unknown) {
    recorders.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
  }
}

function sharedStream() {
  let ended: (() => void) | undefined;
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, callback: () => void) => {
      if (type === "ended") ended = callback;
    }),
  };
  const stream = { active: true, getTracks: () => [track], getAudioTracks: () => [track] };
  return { stream: stream as unknown as MediaStream, track, end: () => ended?.() };
}

beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
  recorders.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "t1", model: "nova-2" }), { status: 200 })),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Deepgram で、画面・タブの共有で受けた音声を聞く", () => {
  it("マイクは掴まず、共有された音声をそのまま録って送る", async () => {
    const shared = sharedStream();
    const handlers = { onChunk: vi.fn(), onError: vi.fn(), onStatus: vi.fn() };
    deepgramSpeechProvider
      .create({ lang: "ja-JP", sources: [{ speaker: "other", stream: shared.stream }] })
      .start(handlers);
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].onopen?.();

    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(recorders).toHaveLength(1);
    expect(recorders[0].stream).toBe(shared.stream);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("共有が止まったら、止まったと知らせて閉じる（エラーにはしない）", async () => {
    const shared = sharedStream();
    const handlers = { onChunk: vi.fn(), onError: vi.fn(), onStatus: vi.fn() };
    deepgramSpeechProvider
      .create({ lang: "ja-JP", sources: [{ speaker: "other", stream: shared.stream }] })
      .start(handlers);
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].onopen?.();

    shared.end();

    expect(handlers.onStatus).toHaveBeenLastCalledWith("other", expect.stringContaining("共有が止まりました"));
    expect(sockets[0].closed).toBe(true);
    expect(shared.track.stop).toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });
});
