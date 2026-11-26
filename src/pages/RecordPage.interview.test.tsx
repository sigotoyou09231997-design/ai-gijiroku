import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecordPage from "./RecordPage";

/**
 * 面接モードの画面を常設で見張る（描けること・重複して出さないこと・キーで回せること）。
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <RecordPage />
    </MemoryRouter>,
  );
}

function ndjson(text: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ t: "d", v: text })}\n${JSON.stringify({ t: "done" })}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("録音画面の面接モード", () => {
  it("種類を「面接」にすると、面接の回答の欄が上に出て、いつもの「質問と回答案」は出さない", () => {
    renderPage();
    expect(screen.queryByRole("region", { name: "面接の回答" })).toBeNull();
    fireEvent.change(screen.getByLabelText("種類"), { target: { value: "面接" } });
    expect(screen.getByRole("region", { name: "面接の回答" })).toBeTruthy();
    expect(screen.queryByText("あなたへの質問と回答案")).toBeNull();
    expect(screen.getByRole("button", { name: /今すぐ回答/ })).toBeTruthy();
  });

  it("リハーサル欄から送ると、2段の回答が出る。J キーで作り直せる", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "/api/interview") return new Response("{}", { status: 200 });
      const body = JSON.parse(String(init?.body ?? "{}")) as { stage: string };
      return ndjson(body.stage === "quick" ? "結論：速報です。" : "結論：詳しい結論です。\n具体例：例です。\nつなげ：活かします。");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.change(screen.getByLabelText("種類"), { target: { value: "一次面接" } });
    fireEvent.change(screen.getByLabelText(/リハーサル/), { target: { value: "強みを教えてください" } });
    fireEvent.click(screen.getByRole("button", { name: "面接官として送る" }));

    expect(await screen.findByText("詳しい結論です。")).toBeTruthy();
    expect(screen.getByText("例です。")).toBeTruthy();
    const calls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/interview").length;
    expect(calls()).toBe(2);

    // 文字を打つ欄の中では J は横取りしない。
    fireEvent.keyDown(screen.getByLabelText(/リハーサル/), { code: "KeyJ", key: "j" });
    expect(calls()).toBe(2);
    fireEvent.keyDown(window, { code: "KeyJ", key: "j" });
    await waitFor(() => expect(calls()).toBe(4));
  });
});
