import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import InterviewSettings from "./InterviewSettings";
import { loadMaterials, loadPrefs } from "../lib/interview/settings";

afterEach(() => {
  window.localStorage.clear();
});

describe("面接モードの設定", () => {
  it("経歴・会社の情報・想定問答の欄があり、入れた内容はこのブラウザに保存される", () => {
    render(<InterviewSettings />);
    fireEvent.change(screen.getByLabelText("自分の経歴"), { target: { value: "山田花子。物流の会社で3年。" } });
    fireEvent.change(screen.getByLabelText("今日の会社の情報"), { target: { value: "株式会社サンプル" } });
    fireEvent.change(screen.getByLabelText("想定問答"), {
      target: { value: "## 強みは\n粘り強さです。\n\n## 年収は\n450万円です。" },
    });
    expect(loadMaterials()).toEqual({
      profile: "山田花子。物流の会社で3年。",
      company: "株式会社サンプル",
      qaBank: "## 強みは\n粘り強さです。\n\n## 年収は\n450万円です。",
    });
    expect(screen.getByText("2問を読み取りました")).toBeTruthy();
  });

  it(".md ファイルから読み込める", async () => {
    render(<InterviewSettings />);
    const file = new File(["# 経歴\n- 物流の会社で3年"], "profile.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("自分の経歴を .md から読み込む"), { target: { files: [file] } });
    await waitFor(() => expect(loadMaterials().profile).toBe("# 経歴\n- 物流の会社で3年"));
    expect(screen.getByText("「profile.md」を読み込みました")).toBeTruthy();
  });

  it("詳しい回答のモデルと考える深さを選べる", () => {
    render(<InterviewSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Claude Fable 5.2" }));
    fireEvent.click(screen.getByRole("button", { name: "標準（medium）" }));
    expect(loadPrefs()).toEqual({ fullModel: "fable", effort: "medium", fast: true });
    fireEvent.click(screen.getByRole("checkbox", { name: /速いモード/ }));
    expect(loadPrefs().fast).toBe(false);
    // Opus 5.5 では速いモードは選べない（試していない組み合わせのため）。
    fireEvent.click(screen.getByRole("button", { name: "Claude Opus 5.5" }));
    expect((screen.getByRole("checkbox", { name: /速いモード/ }) as HTMLInputElement).disabled).toBe(true);
  });
});
