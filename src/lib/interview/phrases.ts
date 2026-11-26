/**
 * 音声認識に「よく出る言葉」として渡す語を、経歴と会社の情報から拾う。
 *
 * 面接では、技術用語・社名・人名・サービス名の聞き間違いが致命的になる
 * （「Supabase」が「スーパーベース」、「御社名」が別の言葉になるなど）。
 * Azure は phrase list、Deepgram は keywords に、ここで拾った語を渡す。
 *
 * AI は使わず、文字の種類で拾う（速く、毎回同じ結果になる）。
 */

/** 拾う語の上限。Azure は200語を超えると遅くなり、Deepgram は100語までのため。 */
export const MAX_PHRASES = 100;

/** 拾っても役に立たない、ありふれた語。 */
const COMMON = new Set([
  "こと", "もの", "ため", "よう", "これ", "それ", "あれ", "ここ", "そこ",
  "サイト", "システム", "ツール", "データ", "チーム", "メンバー", "ユーザー", "サービス",
  "アプリ", "ページ", "テスト", "コード", "スマホ", "メール", "リーダー", "エンジニア",
  "the", "and", "for", "with", "web", "app", "api", "url", "pc",
]);

function push(found: Map<string, number>, word: string, weight: number): void {
  const trimmed = word.trim().replace(/^[・\-]+|[・\-]+$/g, "");
  if (trimmed.length < 2 || trimmed.length > 40) return;
  if (COMMON.has(trimmed.toLowerCase())) return;
  found.set(trimmed, (found.get(trimmed) ?? 0) + weight);
}

/** 経歴・会社の情報の文章から、聞き取りの手がかりになる語を拾う。多く出てくる語ほど前に来る。 */
export function extractSpeechPhrases(...texts: string[]): string[] {
  const found = new Map<string, number>();
  for (const raw of texts) {
    if (!raw) continue;
    const text = raw.normalize("NFKC");

    // 社名（株式会社〇〇／〇〇株式会社）。社名は最優先で残す。
    // ひらがな（助詞）で切れるので、社名の前後に続く文までは拾わない。
    for (const m of text.matchAll(/株式会社[\s]*([A-Za-z0-9ァ-ヶー一-龥々&・]{1,20})/g)) push(found, m[1], 5);
    for (const m of text.matchAll(/([A-Za-z0-9ァ-ヶー一-龥々&・]{1,20})株式会社/g)) push(found, m[1], 5);
    // 「〇〇さん」（人名）。
    for (const m of text.matchAll(/([一-龥々ァ-ヶー]{1,6})さん/g)) push(found, m[1], 4);
    // 英字の語（React, TypeScript, Supabase, Salesforce, AWS など）。記号つき（Next.js, C#）も1語として拾う。
    for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9+#.\-]*/g)) {
      const word = m[0].replace(/[.\-]+$/, "");
      if (/^[A-Za-z]$/.test(word)) continue;
      push(found, word, 2);
    }
    // カタカナの語（3文字以上。サービス名・技術名が多い）。
    for (const m of text.matchAll(/[ァ-ヶー]{3,}/g)) push(found, m[0], 1);
    // 「〇〇室」「〇〇部」のような部署名・漢字の固有名詞は拾いすぎるので、括弧書き・鉤括弧の中だけ拾う。
    for (const m of text.matchAll(/[「『]([^」』]{2,20})[」』]/g)) push(found, m[1], 2);
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, MAX_PHRASES);
}
