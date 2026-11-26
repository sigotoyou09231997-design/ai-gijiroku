/**
 * 面接モードの回答の「書き方の決まり」と、その読み取り。
 *
 * サーバー（api/interview.ts）は、モデルに次の形だけで書かせる:
 *
 *   @想定 3            … 土台にした想定問答の番号（無ければ 0）
 *   @経歴外             … 経歴に無い経験を聞かれたときだけ
 *   結論：……
 *   具体例：……          … 2段目だけ
 *   つなげ：……          … 2段目だけ
 *   @質問 ……           … 聞かれたことを短く整えた1文（2段目の最後）
 *
 * 質問ではない（相づち・説明・雑談）ときは「@なし」の1行だけ。
 *
 * 流れてくる途中の文字列を何度でも読み直せるように、ここは純粋な関数だけにしてある。
 */

export type AnswerLabel = "結論" | "具体例" | "つなげ";

export interface AnswerLine {
  /** 札。札が読めない行は undefined（そのまま本文として出す）。 */
  label?: AnswerLabel;
  text: string;
}

export interface ParsedAnswer {
  /** 「@なし」＝質問ではないとモデルが判断した。 */
  skip: boolean;
  /** 土台にした想定問答の番号（1始まり）。0 や未記入は undefined。 */
  qaRef?: number;
  /** 経歴に無い経験を聞かれた。 */
  noExperience: boolean;
  /** 聞かれたことを整えた1文。 */
  title?: string;
  /** 画面に出す行（流れている途中の最後の行も含む）。 */
  lines: AnswerLine[];
}

const LABELS: AnswerLabel[] = ["結論", "具体例", "つなげ"];

/** 「**結論**：」「- 結論:」のような崩れも拾えるように、先頭の飾りを落とす。 */
function cleanLine(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/^[\s　]*(?:[-・•*]|\d+[.)．])[\s　]*/, "")
    .trim();
}

function parseContentLine(raw: string): AnswerLine | null {
  const line = cleanLine(raw);
  if (!line) return null;
  for (const label of LABELS) {
    const match = line.match(new RegExp(`^[【［\\[]?${label}[】］\\]]?[\\s　]*[：:][\\s　]*`));
    if (match) return { label, text: line.slice(match[0].length).trim() };
  }
  return { text: line };
}

/** 「@」で始まる行を読む。読めた項目を result に入れる。 */
function applyMeta(raw: string, result: ParsedAnswer): void {
  const line = raw.trim().replace(/^＠/, "@");
  const body = line.slice(1).trim();
  if (/^なし/.test(body)) {
    result.skip = true;
    return;
  }
  if (/^経歴外/.test(body)) {
    result.noExperience = true;
    return;
  }
  const ref = body.match(/^想定[\s　]*[QＱ]?[\s　]*([0-9０-９]+)/);
  if (ref) {
    const n = Number(ref[1].normalize("NFKC"));
    if (Number.isFinite(n) && n > 0) result.qaRef = n;
    return;
  }
  const title = body.match(/^質問[\s　]*[：:]?[\s　]*(.*)$/);
  if (title && title[1].trim()) {
    result.title = title[1].trim();
  }
}

function isMetaLine(raw: string): boolean {
  return /^[\s　]*[@＠]/.test(raw);
}

/**
 * ここまでに届いた文字列を読む。
 * 最後の行がまだ途中でも本文なら出す（流れているように見せるため）。
 * 「@」で始まる途中の行は、読み切れるまで出さない。
 */
export function parseAnswer(text: string): ParsedAnswer {
  const result: ParsedAnswer = { skip: false, noExperience: false, lines: [] };
  const rawLines = text.replace(/\r/g, "").split("\n");
  const endsWithNewline = text.endsWith("\n");
  rawLines.forEach((raw, index) => {
    const isLast = index === rawLines.length - 1;
    const complete = !isLast || endsWithNewline;
    if (!raw.trim()) return;
    if (isMetaLine(raw)) {
      // 途中の「@質問 …」は、続きが来るまで待つ必要がない（最後の行に来るので、そのまま読む）。
      if (complete || /^[\s　]*[@＠]質問/.test(raw)) applyMeta(raw, result);
      return;
    }
    // 「@」の書きかけ（1文字目だけ届いた）かもしれない行は出さない。
    if (!complete && /^[\s　]*$/.test(raw)) return;
    const parsed = parseContentLine(raw);
    if (parsed) result.lines.push(parsed);
  });
  return result;
}

/** 画面や書き出しで使う、本文だけの文字列。 */
export function answerPlainText(parsed: ParsedAnswer): string {
  return parsed.lines.map((line) => (line.label ? `${line.label}：${line.text}` : line.text)).join("\n");
}
