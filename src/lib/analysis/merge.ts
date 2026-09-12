import type { ActionItem, DetectedQuestion, DetectedTerm } from "../types";

/**
 * AIは少し前の会話も一緒に見ているので、同じ質問・同じ決定事項を何度も返してくる。
 * そのまま足すと画面が同じ行で埋まるため、ここで重なりを落とす。
 */

/** 比べるための正規化。記号・空白・語尾のゆれを落とす。 */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[、。，．,.!?！？「」『』（）()・:：;；~〜ー-]/g, "");
}

/** 片方がもう片方をそのまま含んでいたら、同じことを言っているとみなす。 */
export function isSameText(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shortText, longText] = na.length <= nb.length ? [na, nb] : [nb, na];
  // 短すぎる文字列は、たまたま含まれるだけのことがあるので含有では判定しない。
  if (shortText.length < 8) return false;
  return longText.includes(shortText);
}

export interface MergeResult<T> {
  items: T[];
  added: T[];
}

/** すでにある質問に、新しく検知した質問を足す（同じ質問は足さない）。 */
export function mergeQuestions(
  existing: DetectedQuestion[],
  incoming: DetectedQuestion[],
): MergeResult<DetectedQuestion> {
  const items = [...existing];
  const added: DetectedQuestion[] = [];
  for (const candidate of incoming) {
    if (!candidate.question.trim()) continue;
    if (items.some((item) => isSameText(item.question, candidate.question))) continue;
    items.push(candidate);
    added.push(candidate);
  }
  return { items, added };
}

/** 気になる用語も同じ考え方で足す（同じ用語は二重に出さない）。 */
export function mergeTerms(existing: DetectedTerm[], incoming: DetectedTerm[]): MergeResult<DetectedTerm> {
  const items = [...existing];
  const added: DetectedTerm[] = [];
  for (const candidate of incoming) {
    if (!candidate.term.trim()) continue;
    if (items.some((item) => isSameText(item.term, candidate.term))) continue;
    items.push(candidate);
    added.push(candidate);
  }
  return { items, added };
}

/** 決定事項・宿題事項も同じ考え方で足す。種類が違えば別物として扱う。 */
export function mergeActions(existing: ActionItem[], incoming: ActionItem[]): MergeResult<ActionItem> {
  const items = [...existing];
  const added: ActionItem[] = [];
  for (const candidate of incoming) {
    if (!candidate.text.trim()) continue;
    if (items.some((item) => item.kind === candidate.kind && isSameText(item.text, candidate.text))) continue;
    items.push(candidate);
    added.push(candidate);
  }
  return { items, added };
}
