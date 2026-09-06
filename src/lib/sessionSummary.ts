import { AiNotConfiguredError, summarizeTranscript } from "./ai/client";
import { loadSession, saveSession } from "./db";
import { transcriptText } from "./types";

/**
 * セッション1件の要約を作って保存し直す。
 *
 * 終了直後の自動生成と、要約画面の「作り直す」の両方から呼ぶ。
 * 途中でアプリを閉じた場合は summary も summaryError も入らないので、
 * 画面側では「作成中」と見なして作り直せるようにしてある。
 */
export async function generateSummary(sessionId: string): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) return;

  const transcript = transcriptText(session.segments).trim();
  if (!transcript) {
    await saveSession({ ...session, summaryError: "文字起こしが空だったため、要約は作れませんでした。" });
    return;
  }

  try {
    const summary = await summarizeTranscript({
      label: session.label,
      transcript,
      actions: session.actions.map((action) => ({ kind: action.kind, text: action.text })),
    });
    const next = { ...session, summary };
    delete next.summaryError;
    await saveSession(next);
  } catch (error) {
    const message =
      error instanceof AiNotConfiguredError
        ? error.message
        : error instanceof Error
          ? error.message
          : "要約の生成に失敗しました。";
    await saveSession({ ...session, summaryError: message });
  }
}
