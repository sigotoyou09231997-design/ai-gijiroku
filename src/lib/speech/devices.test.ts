import { afterEach, describe, expect, it } from "vitest";
import {
  AUTO,
  autoChoice,
  emptyChoice,
  loadOtherMode,
  pickOtherDevice,
  pickSelfDevice,
  reconcile,
  resolveChoice,
  saveOtherMode,
} from "./devices";
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

describe("自動で選ぶ", () => {
  // Chrome on Mac で実際に並ぶ形（「既定 -」の別名つき）。
  const mac: AudioInputDevice[] = [
    { deviceId: "default", label: "既定 - MacBook Proのマイク (Built-in)" },
    { deviceId: "builtin", label: "MacBook Proのマイク (Built-in)" },
    { deviceId: "airpods", label: "appleのAirPods Pro (Bluetooth)" },
    { deviceId: "emeet", label: "HD Webcam eMeet C960 (328f:006d)" },
    { deviceId: "razer", label: "Razer Seiren Mini (1532:0531)" },
    { deviceId: "blackhole", label: "BlackHole 2ch (Virtual)" },
    { deviceId: "bgm", label: "Background Music (Virtual)" },
    { deviceId: "bgm-ui", label: "Background Music (UI Sounds) (Virtual)" },
    { deviceId: "iphone", label: "\u200eれもんのマイク" },
  ];

  it("相手は仮想オーディオ、自分は専用の外付けマイクを選ぶ", () => {
    expect(resolveChoice(autoChoice, mac)).toEqual({ selfDeviceId: "razer", otherDeviceId: "blackhole" });
  });

  it("外付けマイクを抜くと、カメラ → iPhone → AirPods → 内蔵（無音）の順に下がる", () => {
    const without = (...ids: string[]) => mac.filter((d) => !ids.includes(d.deviceId));
    expect(pickSelfDevice(without("razer"))).toBe("emeet");
    expect(pickSelfDevice(without("razer", "emeet"))).toBe("iphone");
    expect(pickSelfDevice(without("razer", "emeet", "iphone"))).toBe("airpods");
    expect(pickSelfDevice(without("razer", "emeet", "iphone", "airpods"))).toBe("builtin");
  });

  it("Background Music も仮想オーディオなので、自分の声には選ばず、相手は BlackHole を優先する", () => {
    const only = mac.filter((d) => ["bgm", "bgm-ui", "blackhole", "airpods"].includes(d.deviceId));
    expect(resolveChoice(autoChoice, only)).toEqual({ selfDeviceId: "airpods", otherDeviceId: "blackhole" });
  });

  it("仮想オーディオが無ければ、相手側は聞かない", () => {
    // Background Music は残っているが、会議の音は流していないので選ばない。
    expect(pickOtherDevice(mac.filter((d) => d.deviceId !== "blackhole"))).toBe("");
  });

  it("仮想オーディオを自分の声には選ばない", () => {
    expect(pickSelfDevice([{ deviceId: "blackhole", label: "BlackHole 2ch" }])).toBe("");
  });

  it("手で選んだ所は自動で上書きしない", () => {
    expect(resolveChoice({ selfDeviceId: "emeet", otherDeviceId: AUTO }, mac)).toEqual({
      selfDeviceId: "emeet",
      otherDeviceId: "blackhole",
    });
  });

  it("「自動」は一覧に無くても消さずに残す", () => {
    expect(reconcile(autoChoice, [])).toEqual(autoChoice);
  });
});

describe("相手の声の取り方（会社のPC用の切り替え）", () => {
  afterEach(() => localStorage.clear());

  it("何も選んでいなければ、通常（仮想オーディオ）で始める", () => {
    expect(loadOtherMode()).toBe("device");
  });

  it("会社のPC用に切り替えたら、次に開いたときも憶えている", () => {
    saveOtherMode("display");
    expect(loadOtherMode()).toBe("display");
    saveOtherMode("device");
    expect(loadOtherMode()).toBe("device");
  });

  it("憶えが壊れていても、通常に倒す", () => {
    localStorage.setItem("ai-gijiroku.other-source-mode.v1", "なにか違う値");
    expect(loadOtherMode()).toBe("device");
  });
});
