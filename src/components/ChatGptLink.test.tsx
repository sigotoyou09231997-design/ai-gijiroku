import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChatGptLink from "./ChatGptLink";
import { chatGptLookupUrl } from "../lib/lookup";

describe("ChatGptLink", () => {
  it("用語を入れた ChatGPT のURLへのリンクになる", () => {
    render(<ChatGptLink term="SPA" />);
    const link = screen.getByRole("link", { name: /SPAをChatGPTで調べる/ });
    expect(link.getAttribute("href")).toBe(chatGptLookupUrl("SPA"));
  });

  it("必ず新しいタブで開く（同じタブだと録音中の画面が閉じて文字起こしが消える）", () => {
    render(<ChatGptLink term="SPA" />);
    const link = screen.getByRole("link", { name: /SPAをChatGPTで調べる/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });
});
