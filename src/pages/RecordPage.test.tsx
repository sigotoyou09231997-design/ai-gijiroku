import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import RecordPage from "./RecordPage";

/**
 * 画面が描けるところまでを常設で見張る。
 * 型は通るのに開くと真っ白、という壊れ方をここで拾う。消さないこと。
 */
describe("RecordPage", () => {
  it("音声認識が使えない環境では、その旨を出す", () => {
    render(
      <MemoryRouter>
        <RecordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("この環境では音声認識を使えません")).toBeTruthy();
  });

  it("開始ボタンは出るが、使えない環境では押せない", () => {
    render(
      <MemoryRouter>
        <RecordPage />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: /開始/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("文字起こし・質問・決定事項の置き場所が最初から出ている", () => {
    render(
      <MemoryRouter>
        <RecordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("文字起こし")).toBeTruthy();
    expect(screen.getByText("あなたへの質問と回答案")).toBeTruthy();
    expect(screen.getByText("決定事項・宿題事項")).toBeTruthy();
  });
});
