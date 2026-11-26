import { afterEach, describe, expect, it, vi } from "vitest";
import { InterviewRequestError, streamInterviewAnswer } from "./client";

function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "application/x-ndjson" } });
}

const request = {
  stage: "full" as const,
  profile: "",
  company: "",
  qa: "",
  context: "",
  question: "強みは",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("面接の回答を流して受け取る", () => {
  it("1行1件の JSON を、途中で切れて届いても順に読む", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          '{"t":"d","v":"結論',
          '："}\n{"t":"d","v":"はい。"}\n{"t":"done","model":"claude-opus-5-5","serverTotalMs":1200,',
          '"usage":{"cache_read_input_tokens":800}}\n',
        ]),
      ),
    );
    const texts: string[] = [];
    const done = await streamInterviewAnswer(request, { onText: (delta) => texts.push(delta) });
    expect(texts.join("")).toBe("結論：はい。");
    expect(done.model).toBe("claude-opus-5-5");
    expect(done.usage?.cache_read_input_tokens).toBe(800);
  });

  it("途中で失敗の知らせが来たら、その文面で失敗にする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(['{"t":"d","v":"結論"}\n{"t":"error","message":"残高が足りません","owner":true}\n'])),
    );
    const error = await streamInterviewAnswer(request, { onText: () => {} }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(InterviewRequestError);
    expect((error as InterviewRequestError).message).toBe("残高が足りません");
    expect((error as InterviewRequestError).needsOwner).toBe(true);
  });

  it("終わりの知らせが来ないまま切れたら、失敗にする（途中の文を完成品と見なさない）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(['{"t":"d","v":"結論"}\n'])));
    await expect(streamInterviewAnswer(request, { onText: () => {} })).rejects.toThrow("途中で切れました");
  });

  it("キー未設定（503）は、本人にしか直せない失敗として返す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("キーが未設定です", { status: 503 })));
    const error = (await streamInterviewAnswer(request, { onText: () => {} }).catch((err: unknown) => err)) as InterviewRequestError;
    expect(error.message).toBe("キーが未設定です");
    expect(error.needsOwner).toBe(true);
  });
});
