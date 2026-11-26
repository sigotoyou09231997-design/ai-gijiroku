/**
 * 面接で聞かれた質問を、次の想定問答に足せる形（.md）に書き出す。
 * 書き出した形は、そのまま設定の「想定問答」に読み込める（parseQaBank と同じ書き方）。
 */

export interface ExportItem {
  question: string;
  qaRef?: number;
  noExperience?: boolean;
  /** 画面に出した回答（あれば下書きとして添える）。 */
  answer?: string;
}

export function questionsToMarkdown(items: ExportItem[], title: string): string {
  const lines: string[] = [`# ${title}`, ""];
  if (items.length === 0) {
    lines.push("（聞かれた質問はありませんでした）");
    return `${lines.join("\n")}\n`;
  }
  lines.push(
    "<!-- 想定問答に足すときは、答えを自分の言葉に直してから、設定の「想定問答」に貼るか読み込んでください。 -->",
    "",
  );
  for (const item of items) {
    lines.push(`## ${item.question.replace(/\n+/g, " ").trim()}`);
    const notes = [
      item.qaRef ? `想定問答 ${item.qaRef} をもとに答えた` : "想定外の質問",
      item.noExperience ? "経歴に無い経験を聞かれた" : "",
    ].filter(Boolean);
    lines.push(`<!-- ${notes.join("／")} -->`);
    if (item.answer && item.answer.trim()) {
      lines.push(item.answer.trim());
    } else {
      // 答えが空の組は読み込まれないので、書き足すまでは想定問答に入らない。
      lines.push("<!-- ここに答えを書く -->");
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** ブラウザで .md を保存させる。 */
export function downloadMarkdown(fileName: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
