import { describe, expect, it } from "vitest";
import { emptyChoice, reconcile } from "./devices";
import type { AudioInputDevice } from "./devices";

const devices: AudioInputDevice[] = [
  { deviceId: "mic-1", label: "USBマイク" },
  { deviceId: "loopback-1", label: "BlackHole 2ch" },
];

describe("選んだ入力デバイスの引き当て", () => {
  it("繋がっているものはそのまま残す", () => {
    const choice = { selfDeviceId: "mic-1", otherDeviceId: "loopback-1" };
    expect(reconcile(choice, devices)).toEqual(choice);
  });

  it("抜かれて消えたものは既定に戻す（存在しないIDで録音を始めないため）", () => {
    const choice = { selfDeviceId: "抜いたヘッドセット", otherDeviceId: "loopback-1" };
    expect(reconcile(choice, devices)).toEqual({ selfDeviceId: "", otherDeviceId: "loopback-1" });
  });

  it("両方消えても落ちない", () => {
    expect(reconcile({ selfDeviceId: "x", otherDeviceId: "y" }, [])).toEqual(emptyChoice);
  });

  it("既定（空文字）はそのまま既定のまま", () => {
    expect(reconcile(emptyChoice, devices)).toEqual(emptyChoice);
  });
});
