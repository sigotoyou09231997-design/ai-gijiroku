/**
 * 想定問答（本人が用意した「質問と答え」の組）の読み込みと、手元での照合。
 *
 * 照合はブラウザの中だけで行う（AI を待たない）。来た質問が用意した質問に
 * 十分近ければ、用意した答えをすぐ出すため。
 *
 * 読める書き方（.md）:
 *
 *   ## 自己紹介をしてください
 *   - 別の聞き方: 簡単に自己紹介を／これまでの経歴を教えてください
 *   山田です。……（ここから次の ## までが答え）
 *
 * 「Q: …」「A: …」の形でも読める。
 */

export interface QaPair {
  question: string;
  /** 同じことの別の聞き方。照合にだけ使う。 */
  alternatives: string[];
  answer: string;
}

const ALT_PREFIX = /^[\s　]*(?:[-・*][\s　]*)?(?:別の聞き方|言い換え|ほかの聞き方|他の聞き方)[\s　]*[：:][\s　]*/;
const Q_PREFIX = /^[\s　]*(?:[-・*][\s　]*)?(?:Q|Ｑ|質問)[\s　]*[0-9０-９]*[\s　]*[.．:：)）][\s　]*/;
const A_PREFIX = /^[\s　]*(?:[-・*][\s　]*)?(?:A|Ａ|答え|回答)[\s　]*[0-9０-９]*[\s　]*[.．:：)）][\s　]*/;

function splitAlternatives(text: string): string[] {
  return text
    .split(/[／/|｜]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function cleanAnswerLine(line: string): string {
  return line.replace(/^[\s　]*>[\s　]?/, "").replace(/\*\*/g, "");
}

/** .md の文字列を、質問と答えの組にする。答えが空の組は捨てる。 */
export function parseQaBank(markdown: string): QaPair[] {
  const pairs: QaPair[] = [];
  let current: { question: string; alternatives: string[]; answer: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const answer = current.answer.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (current.question && answer) {
      pairs.push({ question: current.question, alternatives: current.alternatives, answer });
    }
    current = null;
  };

  const text = markdown.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const line of text.split("\n")) {
    const heading = line.match(/^##+[\s　]+(.+)$/);
    if (heading) {
      flush();
      const title = heading[1].replace(Q_PREFIX, "").replace(/\*\*/g, "").trim();
      current = { question: title, alternatives: [], answer: [] };
      continue;
    }
    // 「# 想定問答」のような1段目の見出しは題名なので読まない。
    if (/^#[\s　]+/.test(line)) {
      flush();
      continue;
    }
    if (Q_PREFIX.test(line) && !ALT_PREFIX.test(line)) {
      flush();
      current = { question: line.replace(Q_PREFIX, "").replace(/\*\*/g, "").trim(), alternatives: [], answer: [] };
      continue;
    }
    if (!current) continue;
    if (ALT_PREFIX.test(line)) {
      current.alternatives.push(...splitAlternatives(line.replace(ALT_PREFIX, "")));
      continue;
    }
    if (A_PREFIX.test(line)) {
      const rest = line.replace(A_PREFIX, "").trim();
      if (rest) current.answer.push(cleanAnswerLine(rest));
      continue;
    }
    current.answer.push(cleanAnswerLine(line));
  }
  flush();
  return pairs;
}

// ── 照合 ────────────────────────────────────────────────

/**
 * 比べる前に落とす言葉。面接官の言い回し（丁寧さ・前置き）で点数がぶれないようにする。
 * 長いものから順に消す（「お願いいたします」を「お願い」より先に）。
 */
const FILLERS = [
  "ありがとうございます",
  "お願いいたします",
  "お願いします",
  "お聞かせください",
  "お聞かせいただけますか",
  "聞かせてください",
  "聞かせていただけますか",
  "教えていただけますか",
  "教えていただけますでしょうか",
  "教えてください",
  "伺えますか",
  "伺ってもよろしいですか",
  "よろしいですか",
  "いただけますか",
  "でしょうか",
  "ください",
  "それでは",
  "続いて",
  "次に",
  "まずは",
  "まず",
  "では",
  "えっと",
  "えーと",
  "あのー",
  "えー",
  "ちなみに",
  "簡単に",
  "ざっくり",
  "少し",
  "ちょっと",
  "あなたの",
  "あなたが",
  "あなたは",
  "ご自身の",
  "ご自身",
  "について",
  "に関して",
  // 疑問の言い方。「強みは何ですか」と「強みを教えて」を同じに扱うため。
  "はなんですか",
  "は何ですか",
  "なんですか",
  "何ですか",
  "は何",
  "どのような",
  "どういった",
  "どんな",
  "どのくらい",
  "どれくらい",
  "いかがですか",
  "いかが",
  "ですか",
  "ますか",
  "ですね",
  "です",
  "ます",
];

export function normalizeForMatch(text: string): string {
  let result = text.normalize("NFKC").toLowerCase();
  result = result.replace(/[\s　]+/g, "");
  // 「〇〇さんの」「〇〇さんは」（面接官が名前で呼ぶとき）は質問の中身ではないので落とす。
  result = result.replace(/[一-龥々ァ-ヶー]{1,6}さん(?:の|は|が)/g, "");
  result = result.replace(/[、。，．,.!?！？「」『』（）()【】［］\[\]・:：;；~〜…ー\-—"'`]/g, "");
  for (const filler of FILLERS) result = result.split(filler.normalize("NFKC")).join("");
  return result;
}

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  if (text.length === 1) set.add(text);
  for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
  return set;
}

/** 2つの言い方の近さ（0〜1）。 */
export function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let shared = 0;
  for (const gram of ga) if (gb.has(gram)) shared += 1;
  const dice = (2 * shared) / (ga.size + gb.size);
  // 面接官の発言は前置きが付いて長くなりがち。用意した言い方がほぼ丸ごと入っていれば近いとみなす。
  const [shortSet, shortText] = ga.size <= gb.size ? [ga, na] : [gb, nb];
  const coverage = shortText.length >= 4 ? shared / shortSet.size : 0;
  return Math.max(dice, coverage * 0.9);
}

/** 発言を文に分ける。前置きの文と、本題の文を別々に比べるため。 */
function sentences(text: string): string[] {
  const parts = text
    .split(/[。？！?!\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 1 ? [text, ...parts] : [text];
}

export interface QaMatch {
  /** 0始まりの添字。 */
  index: number;
  score: number;
}

/**
 * これ以上なら「用意した質問と同じ」とみなして、答えをすぐ出す。
 * 評価用の24問（言い換え12・想定外12）で決めた値（docs ではなく報告に残している）。
 */
export const MATCH_THRESHOLD = 0.62;

/** 来た質問にいちばん近い想定問答を返す。十分に近いものが無ければ null。 */
export function matchQa(
  question: string,
  pairs: QaPair[],
  threshold: number = MATCH_THRESHOLD,
): QaMatch | null {
  if (!question.trim() || pairs.length === 0) return null;
  const pieces = sentences(question);
  let best: QaMatch | null = null;
  pairs.forEach((pair, index) => {
    for (const phrasing of [pair.question, ...pair.alternatives]) {
      for (const piece of pieces) {
        const score = similarity(piece, phrasing);
        if (!best || score > best.score) best = { index, score };
      }
    }
  });
  const found = best as QaMatch | null;
  return found && found.score >= threshold ? found : null;
}

/** サーバーへ渡すときの形。番号は 1 始まりで、画面の「想定 3」と揃う。 */
export function serializeQaBank(pairs: QaPair[]): string {
  return pairs
    .map((pair, index) => {
      const n = index + 1;
      const alt = pair.alternatives.length > 0 ? `（別の聞き方: ${pair.alternatives.join("／")}）` : "";
      return `Q${n}. ${pair.question}${alt}\nA${n}. ${pair.answer}`;
    })
    .join("\n\n");
}
