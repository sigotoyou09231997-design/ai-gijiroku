/**
 * Azure AI Speech を使うための、短命の合鍵（トークン）を配る。
 *
 * ブラウザに購読キーそのものを置くと、開発者ツールから抜かれて他人に使われる。
 * ここでキーと引き換えに10分だけ有効なトークンを取り、それだけを画面へ渡す。
 *
 * 環境変数（Netlify のサイト設定・ローカルは .env）:
 *   AZURE_SPEECH_KEY    … 必須。Speech リソースの「キー1」。
 *   AZURE_SPEECH_REGION … 必須。リソースの場所（例: japaneast）。
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // トークンは短命なので、途中に挟まるもので使い回されないようにする。
      "cache-control": "no-store",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  // GET は「設定されているか」を聞くだけ。合鍵は発行しない。
  // 画面が起動時に、Azure を使えるか／ブラウザ標準に落とすかを決めるのに使う。
  if (request.method === "GET") {
    return json({ configured: Boolean(key && region), region: region ?? null });
  }

  if (request.method !== "POST") {
    return new Response("POST してください。", { status: 405 });
  }

  if (!key || !region) {
    return new Response(
      "音声認識のキー（AZURE_SPEECH_KEY / AZURE_SPEECH_REGION）が未設定です。Netlifyの環境変数に設定してください。",
      { status: 503 },
    );
  }

  let response: Response;
  try {
    response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "content-length": "0",
      },
    });
  } catch {
    return new Response("音声認識のサーバーに接続できませんでした。", { status: 502 });
  }

  if (!response.ok) {
    // 返答の本文はそのまま外に出さない（キーの手掛かりが混ざりうるため）。
    const hint =
      response.status === 401 || response.status === 403
        ? "キーかリージョンが違う可能性があります。"
        : "";
    return new Response(`音声認識の合鍵を取得できませんでした（HTTP ${response.status}）。${hint}`, {
      status: 502,
    });
  }

  const token = await response.text();
  if (!token) {
    return new Response("音声認識の合鍵が空でした。", { status: 502 });
  }

  // 実際の有効期限は10分。切れる前に取り直せるよう、余裕を持たせた秒数を返す。
  return json({ token, region, expiresInSec: 540 });
}
