import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SessionsPage from "./SessionsPage";
import SessionDetailPage from "./SessionDetailPage";
import { saveSession } from "../lib/db";
import type { MeetingSession } from "../lib/types";

/**
 * 保存したものを見返す側の画面が、実際に描けるところまでを見張る。
 * IndexedDB は fake-indexeddb（src/test/setup.ts）で代わりを入れてある。消さないこと。
 */
describe("過去のセッションの画面", () => {
  it("1件も無いときは、その旨と録音への入口を出す", async () => {
    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("保存したセッションはまだありません。")).toBeTruthy();
    expect(screen.getByText("録音をはじめる")).toBeTruthy();
  });

  it("保存したセッションが一覧に出る", async () => {
    const session: MeetingSession = {
      id: "s1",
      label: "面接",
      startedAt: new Date("2026-09-06T10:00:00+09:00").getTime(),
      endedAt: new Date("2026-09-06T10:30:00+09:00").getTime(),
      segments: [{ id: "g1", text: "本日はよろしくお願いします", at: 0 }],
      questions: [{ id: "q1", question: "志望動機は", answer: "こう答えます", at: 0 }],
      actions: [{ id: "a1", kind: "todo", text: "職務経歴書を送る", at: 0 }],
      terms: [{ id: "t1", term: "SPA", explanation: "単一のHTMLで画面遷移するアプリの作り方", at: 0 }],
      summary: { overview: "面接の1次でした", points: ["自己紹介"], decisions: [], todos: ["職務経歴書を送る"] },
    };
    await saveSession(session);

    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("面接の1次でした")).toBeTruthy();
    expect(screen.getByText("面接")).toBeTruthy();
    expect(screen.getByText("質問 1件 ／ 決定 0件 ／ やること 1件")).toBeTruthy();
  });

  it("詳細画面に、要約・質問・決定事項・全文が並ぶ", async () => {
    render(
      <MemoryRouter initialEntries={["/sessions/s1"]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("面接の1次でした")).toBeTruthy();

    // 質問・決定事項・全文は、スクロールを減らすため既定では畳んである。
    expect(screen.queryByText("志望動機は")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /詳細を見る/ }));

    expect(screen.getByText("志望動機は")).toBeTruthy();
    expect(screen.getByText("会話中に検知した決定事項・宿題事項")).toBeTruthy();
    expect(screen.getByText("会話中に検知した気になる用語")).toBeTruthy();
    expect(screen.getByText("SPA")).toBeTruthy();
    expect(screen.getByText("本日はよろしくお願いします")).toBeTruthy();
  });

  it("無いセッションを開いたら、その旨を出す", async () => {
    render(
      <MemoryRouter initialEntries={["/sessions/no-such-id"]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("このセッションは見つかりませんでした。")).toBeTruthy();
  });
});
