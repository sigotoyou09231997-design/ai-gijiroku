import { describe, expect, it } from "vitest";
import { audioConstraints } from "./audioConstraints";

describe("音源ごとの取り方", () => {
  it("相手の音は、ブラウザの音いじりを全部切って受け取る", () => {
    // 切らないと、ブラウザが「スピーカーから出ている音」として打ち消してしまい、
    // 接続も課金も成立したまま結果だけが空になる。
    const c = audioConstraints({ speaker: "other", deviceId: "loopback-1" }) as Record<string, unknown>;
    expect(c.echoCancellation).toBe(false);
    expect(c.noiseSuppression).toBe(false);
    expect(c.autoGainControl).toBe(false);
    expect(c.deviceId).toEqual({ exact: "loopback-1" });
  });

  it("自分のマイクは既定のまま（漏れてきた相手の音を消してもらう）", () => {
    const c = audioConstraints({ speaker: "self", deviceId: "mic-1" }) as Record<string, unknown>;
    expect(c.echoCancellation).toBeUndefined();
    expect(c.deviceId).toEqual({ exact: "mic-1" });
  });

  it("デバイス未指定なら既定のマイクを使う", () => {
    expect(audioConstraints({ speaker: "self" })).toEqual({});
  });
});
