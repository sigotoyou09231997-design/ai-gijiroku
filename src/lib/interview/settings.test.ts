import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "./settings";

describe("面接モードの設定（モデル・深さ・速いモード）", () => {
  beforeEach(() => window.localStorage.clear());

  it("何も保存していなければ既定（速いモードはオフ）", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.fast).toBe(false);
  });

  it("前の保存（v1）からはモデルと深さだけ引き継ぎ、速いモードは既定のオフに戻す", () => {
    // v1 の頃は速いモードが既定でオンだったので、保存に true が残っていることがある。
    window.localStorage.setItem(
      "gijiroku.interview.prefs",
      JSON.stringify({ fullModel: "opus", effort: "medium", fast: true }),
    );
    expect(loadPrefs()).toEqual({ fullModel: "opus", effort: "medium", fast: false });
  });

  it("今の保存（v2）で選んだ速いモードはそのまま使う", () => {
    savePrefs({ fullModel: "fable", effort: "low", fast: true });
    expect(loadPrefs().fast).toBe(true);
  });
});
