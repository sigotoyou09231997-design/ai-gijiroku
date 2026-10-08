import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecordPage from "./RecordPage";
import type { LiveSession } from "../hooks/useLiveSession";

/**
 * 「相手の声の取り方」の切り替え（通常／会社のPC用）が、画面に出て、押せるかを見張る。
 * 録音そのものは動かさず、フックを偽物に差し替えて、画面の振る舞いだけを見る。
 */
const state = vi.hoisted(() => ({ live: {} as unknown as LiveSession }));

vi.mock("../hooks/useLiveSession", () => ({
  SESSION_LABELS: ["打ち合わせ", "面接", "議事録"],
  useLiveSession: () => state.live,
}));

function makeLive(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    status: "idle",
    micActive: false,
    label: "打ち合わせ",
    setLabel: vi.fn(),
    segments: [],
    interim: {},
    questions: [],
    actions: [],
    terms: [],
    analyzing: false,
    speechError: null,
    speechNotice: null,
    aiError: null,
    speechAvailable: true,
    speechUnavailableReason: null,
    speechLabel: "Azure AI Speech",
    canSeparateSpeakers: true,
    devices: [],
    sourceChoice: { selfDeviceId: "auto", otherDeviceId: "auto" },
    resolvedChoice: { selfDeviceId: "", otherDeviceId: "" },
    setSourceChoice: vi.fn(),
    otherMode: "device",
    setOtherMode: vi.fn(),
    displayAudioSupported: true,
    refreshDevices: vi.fn(async () => {}),
    start: vi.fn(),
    finish: vi.fn(async () => null),
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter>
      <RecordPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.live = makeLive();
});

describe("相手の声の取り方の切り替え", () => {
  it("分けて聞ける環境では「通常」「会社のPC用」が並び、通常が選ばれている", () => {
    renderPage();
    const normal = screen.getByRole("button", { name: "通常" });
    const company = screen.getByRole("button", { name: /会社のPC用/ });
    expect(normal.getAttribute("aria-pressed")).toBe("true");
    expect(company.getAttribute("aria-pressed")).toBe("false");
  });

  it("「会社のPC用」を押すと、会社のPC用に切り替わる", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /会社のPC用/ }));
    expect(state.live.setOtherMode).toHaveBeenCalledWith("display");
  });

  it("会社のPC用のときは、共有の選び方を案内し、設定欄の見出しにも反映する", () => {
    state.live = makeLive({ otherMode: "display" });
    renderPage();
    expect(screen.getByRole("button", { name: /会社のPC用/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/システム音声を共有/)).toBeTruthy();
    expect(screen.getByText(/画面・タブの音声（開始時に選ぶ）/)).toBeTruthy();
  });

  it("会社のPC用から「通常」に戻せる", async () => {
    state.live = makeLive({ otherMode: "display" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "通常" }));
    expect(state.live.setOtherMode).toHaveBeenCalledWith("device");
  });

  it("画面・タブの音声に対応していないブラウザでは、そのことを警告する", () => {
    state.live = makeLive({ otherMode: "display", displayAudioSupported: false });
    renderPage();
    expect(screen.getByText(/このブラウザは、画面・タブの音声を受け取れません/)).toBeTruthy();
  });

  it("分けて聞けない音声認識（ブラウザ標準）では、切り替え自体を出さない", () => {
    state.live = makeLive({ canSeparateSpeakers: false });
    renderPage();
    expect(screen.queryByRole("button", { name: /会社のPC用/ })).toBeNull();
  });
});
