import { afterEach, describe, expect, it, vi } from "vitest";
import { captureDisplayAudio, DisplayAudioError, isDisplayAudioSupported } from "./displayAudio";

/** jsdom には MediaStream が無いので、必要な形だけの偽物を置く。 */
class FakeMediaStream {
  constructor(private readonly tracks: FakeTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
}

class FakeTrack {
  stopped = false;
  constructor(public kind: "audio" | "video") {}
  stop() {
    this.stopped = true;
  }
}

function stubDisplayMedia(impl: () => Promise<FakeMediaStream>) {
  const getDisplayMedia = vi.fn(impl);
  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
  return getDisplayMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("画面・タブの音声の受け取り", () => {
  it("対応していないブラウザでは、そのことが分かる言葉で断る", async () => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
    expect(isDisplayAudioSupported()).toBe(false);
    await expect(captureDisplayAudio()).rejects.toThrow(/Chrome か Edge/);
  });

  it("音声つきで共有されたら、映像は止めて音声だけを返す", async () => {
    const video = new FakeTrack("video");
    const audio = new FakeTrack("audio");
    const getDisplayMedia = stubDisplayMedia(async () => new FakeMediaStream([video, audio]));

    const stream = await captureDisplayAudio();

    expect(isDisplayAudioSupported()).toBe(true);
    expect(video.stopped).toBe(true);
    expect(audio.stopped).toBe(false);
    expect(stream.getTracks()).toEqual([audio]);
    // 相手の声は、エコーキャンセルなどの音いじりを全部切って受け取る（掛かると無音になる）。
    const options = getDisplayMedia.mock.calls[0] as unknown as [
      { audio: { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean } },
    ];
    expect(options[0].audio).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  });

  it("音声が含まれない共有（ウィンドウ単位など）は、掴んだものを全部離して、選び方を案内する", async () => {
    const video = new FakeTrack("video");
    stubDisplayMedia(async () => new FakeMediaStream([video]));

    await expect(captureDisplayAudio()).rejects.toThrow(/システム音声を共有/);
    expect(video.stopped).toBe(true);
  });

  it("共有の選択を取りやめたときは、もう一度やり直す案内を出す", async () => {
    stubDisplayMedia(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });

    const error = await captureDisplayAudio().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DisplayAudioError);
    expect((error as Error).message).toContain("取りやめ");
    expect((error as Error).message).toContain("開始");
  });
});
