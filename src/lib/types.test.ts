import { describe, expect, it } from "vitest";
import { labeledTranscriptText, speakerLabel, transcriptText } from "./types";
import type { TranscriptSegment } from "./types";

function seg(text: string, speaker?: TranscriptSegment["speaker"]): TranscriptSegment {
  return { id: text, text, at: 0, speaker };
}

describe("話者の札", () => {
  it("自分と相手には日本語の名前を返す", () => {
    expect(speakerLabel("self")).toBe("自分");
    expect(speakerLabel("other")).toBe("相手");
  });

  it("分からないときは名前を出さない（推測させないため）", () => {
    expect(speakerLabel("unknown")).toBeNull();
    expect(speakerLabel(undefined)).toBeNull();
  });
});

describe("AIに渡す全文", () => {
  it("誰の声か分かっている行にだけ札を付ける", () => {
    const text = labeledTranscriptText([
      seg("来週までに出せますか", "other"),
      seg("確認します", "self"),
      seg("昔のセッションの行", undefined),
    ]);
    expect(text).toBe("[相手] 来週までに出せますか\n[自分] 確認します\n昔のセッションの行");
  });

  it("札を付けない全文は今までどおり（画面の表示や既存の保存が壊れない）", () => {
    expect(transcriptText([seg("あ", "self"), seg("い", "other")])).toBe("あ\nい");
  });

  it("空でも落ちない", () => {
    expect(labeledTranscriptText([])).toBe("");
  });
});
