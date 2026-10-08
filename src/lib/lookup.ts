/**
 * 気になる用語を、ChatGPT で調べるためのリンクを作る。
 *
 * APIは使わない。ChatGPT の画面を、質問を入れた状態で開くだけ。
 * 費用も、サーバーの処理も、キーも要らない（ChatGPT 側はブラウザでログイン済みの前提）。
 *
 * ChatGPT へ渡るのは「用語」だけ。会話の文脈や文字起こしは付けない。
 * 会議の内容そのものが外へ出ないようにするため。
 */

const CHATGPT_URL = "https://chatgpt.com/";

/** 質問文。略語のときは正式名称も答えさせる。 */
export function lookupQuestion(term: string): string {
  return `「${term.trim()}」とは何ですか。略語なら、正式名称（原語と日本語訳）も教えてください。`;
}

/**
 * 入力欄に質問が入った状態で ChatGPT を開く URL。
 * hints=search は、Web検索を使う状態で開く指定（Plus など、使えるプランでだけ効く。効かなければ無視される）。
 */
export function chatGptLookupUrl(term: string): string {
  return `${CHATGPT_URL}?hints=search&q=${encodeURIComponent(lookupQuestion(term))}`;
}
