import { describe, expect, it } from "vitest";
import { DEBOUNCE_MS, INTERIM_STALE_MS, TurnTracker, isBackchannel } from "./trigger";

describe("いつ回答を作り始めるか", () => {
  it("[相手] の確定から少し待ってから回す（待っている間は回さない）", () => {
    const tracker = new TurnTracker();
    tracker.otherFinal("前職で一番苦労したことを教えてください", 1_000);
    expect(tracker.due(1_000 + DEBOUNCE_MS - 1)).toBeNull();
    const request = tracker.due(1_000 + DEBOUNCE_MS);
    expect(request?.question).toBe("前職で一番苦労したことを教えてください");
    expect(request?.continuation).toBe(false);
    // 同じ中身は二度回さない。
    expect(tracker.due(1_000 + DEBOUNCE_MS + 500)).toBeNull();
  });

  it("相手がまだ喋っている（途中経過が新しい）間は待つ", () => {
    const tracker = new TurnTracker();
    tracker.otherFinal("それでは次に", 1_000);
    tracker.otherInterim("これまでに", 1_000 + DEBOUNCE_MS - 100);
    expect(tracker.due(1_000 + DEBOUNCE_MS + 50)).toBeNull();
    // 途中経過が古くなったら、言い終えたとみなして途中経過も含めて回す。
    const later = 1_000 + DEBOUNCE_MS - 100 + INTERIM_STALE_MS;
    expect(tracker.due(later)?.question).toBe("それでは次に これまでに");
  });

  it("同じ番で言い足されたら、言い足したぶんも含めて回し直す（2回目は continuation）", () => {
    const tracker = new TurnTracker();
    tracker.otherFinal("前職ではWeb制作をされていたとのことですが", 0);
    expect(tracker.due(DEBOUNCE_MS)?.continuation).toBe(false);
    tracker.otherFinal("どんな案件が多かったですか", 2_000);
    const again = tracker.due(2_000 + DEBOUNCE_MS);
    expect(again?.question).toBe("前職ではWeb制作をされていたとのことですが どんな案件が多かったですか");
    expect(again?.continuation).toBe(true);
    expect(again?.turnId).toBe(1);
  });

  it("[自分] が喋り始めたら、待たずに回す", () => {
    const tracker = new TurnTracker();
    tracker.otherFinal("自己紹介をお願いします", 1_000);
    const request = tracker.selfInterim("はい、山田と申します", 1_200);
    expect(request?.question).toBe("自己紹介をお願いします");
  });

  it("[自分] の確定で番が変わる。短い相づち（「はい」）では変わらない", () => {
    const tracker = new TurnTracker();
    tracker.otherFinal("では", 0);
    expect(tracker.selfFinal("はい", 100)).toBeNull();
    tracker.otherFinal("強みを教えてください", 200);
    expect(tracker.due(200 + DEBOUNCE_MS)?.question).toBe("では 強みを教えてください");
    tracker.selfFinal("私の強みは粘り強さです", 2_000);
    tracker.otherFinal("ありがとうございます。では年収の希望は", 4_000);
    const next = tracker.due(4_000 + DEBOUNCE_MS);
    expect(next?.turnId).toBe(2);
    expect(next?.continuation).toBe(false);
  });

  it("相づち・お礼だけの発言は回さない", () => {
    const tracker = new TurnTracker();
    tracker.otherFinal("なるほど、ありがとうございます。", 0);
    expect(tracker.due(DEBOUNCE_MS * 2)).toBeNull();
    expect(isBackchannel("はい、はい")).toBe(true);
    expect(isBackchannel("はい、では志望動機を")).toBe(false);
  });

  it("キー・ボタンでは、途中経過も含めてすぐ回す（同じ中身でも回し直す）", () => {
    const tracker = new TurnTracker();
    tracker.otherFinal("志望動機を", 0);
    tracker.otherInterim("教えてください", 10);
    expect(tracker.force()?.question).toBe("志望動機を 教えてください");
    expect(tracker.force()?.question).toBe("志望動機を 教えてください");
  });

  it("面接官の発言が無ければ、キーを押しても何もしない", () => {
    expect(new TurnTracker().force()).toBeNull();
  });
});
