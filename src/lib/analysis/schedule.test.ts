import { describe, expect, it } from "vitest";
import { CONTEXT_CHARS, MIN_INTERVAL_MS, contextWindow, shouldAnalyze } from "./schedule";

describe("shouldAnalyze", () => {
  const base = { pendingText: "", lastSentAt: 0, inFlight: false };

  it("溜まっていなければ投げない", () => {
    expect(shouldAnalyze(base, 1_000_000)).toBe(false);
    expect(shouldAnalyze({ ...base, pendingText: "   \n  " }, 1_000_000)).toBe(false);
  });

  it("前の返事を待っているあいだは重ねて投げない", () => {
    const state = { pendingText: "あ".repeat(500), lastSentAt: 0, inFlight: true };
    expect(shouldAnalyze(state, 1_000_000)).toBe(false);
  });

  it("たくさん溜まったら、間隔を待たずに投げる", () => {
    const now = 1_000;
    const state = { pendingText: "あ".repeat(200), lastSentAt: now, inFlight: false };
    expect(shouldAnalyze(state, now)).toBe(true);
  });

  it("少しだけのときは、間隔が空くまで待つ", () => {
    const state = {
      pendingText: "今日はよろしくお願いします。まず日程の件から始めます",
      lastSentAt: 1_000,
      inFlight: false,
    };
    expect(shouldAnalyze(state, 1_000 + MIN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldAnalyze(state, 1_000 + MIN_INTERVAL_MS)).toBe(true);
  });

  it("短すぎるものは、間隔が空いても投げない", () => {
    const state = { pendingText: "はい", lastSentAt: 0, inFlight: false };
    expect(shouldAnalyze(state, MIN_INTERVAL_MS * 10)).toBe(false);
  });
});

describe("contextWindow", () => {
  it("短ければそのまま返す", () => {
    expect(contextWindow("こんにちは")).toBe("こんにちは");
  });

  it("長いときは後ろ（直前の会話）を残す", () => {
    const text = "あ".repeat(CONTEXT_CHARS) + "最後のところ";
    const result = contextWindow(text);
    expect(result.length).toBe(CONTEXT_CHARS);
    expect(result.endsWith("最後のところ")).toBe(true);
  });
});
