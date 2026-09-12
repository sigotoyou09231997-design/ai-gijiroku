import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * 音声認識を使うための、短命の合鍵（トークン）を配る。
 * Vercel向けの入り口。netlify/functions/speechToken.ts と同じものを写してある
 * （サーバー関数は netlify/functions/ と api/ に別々に置く決まり）。
 *
 * 業者は環境変数の入り具合で決まる（Deepgram を優先）。両方とも無ければ、
 * 画面はブラウザ標準の音声認識に落ちる。
 *
 * 両方のキーが設定されている状態で、どちらを試すか切り替えたいことがある
 * （例: 精度を比べるため一時的にAzureを試し、ダメなら戻す）。そのときは
 * SPEECH_VENDOR に "azure" か "deepgram" を入れる。外せば既定の優先順位に戻る。
 *
 * 環境変数（Vercel のプロジェクト設定・ローカルは .env）:
 *   DEEPGRAM_API_KEY    … Deepgram を使うとき。
 *   DEEPGRAM_MODEL      … 任意。既定は nova-2。
 *   AZURE_SPEECH_KEY    … Azure を使うとき。
 *   AZURE_SPEECH_REGION … Azure を使うとき（例: japaneast）。
 *   SPEECH_VENDOR       … 任意。"azure" か "deepgram" を入れると、両方の
 *                          キーが揃っていてもそちらを優先する（お試し用）。
 */

export type SpeechVendor = "deepgram" | "azure";

function pickVendor(): SpeechVendor | null {
  const forced = process.env.SPEECH_VENDOR;
  if (forced === "azure" && process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
  if (forced === "deepgram" && process.env.DEEPGRAM_API_KEY) return "deepgram";
  if (process.env.DEEPGRAM_API_KEY) return "deepgram";
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
  return null;
}

/** Deepgram の合鍵。購読キーと引き換えに、期限付きのトークンをもらう。 */
async function grantDeepgram(res: VercelResponse): Promise<void> {
  const key = process.env.DEEPGRAM_API_KEY as string;
  // 既定は30秒。接続のときだけ有効ならよいが、取り直しの回数を減らすため長めにする。
  const ttl = 3600;

  let response: Response;
  try {
    response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        authorization: `Token ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: ttl }),
    });
  } catch {
    res.status(502).send("音声認識のサーバーに接続できませんでした。");
    return;
  }

  if (!response.ok) {
    const hint =
      response.status === 403
        ? "キーの権限が足りません。Deepgram の管理画面で、Owner（または Admin）の権限を持つキーを作り直してください。"
        : response.status === 401
          ? "キーが違う可能性があります。"
          : "";
    res.status(502).send(`音声認識の合鍵を取得できませんでした（HTTP ${response.status}）。${hint}`);
    return;
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    res.status(502).send("音声認識の合鍵が空でした。");
    return;
  }

  res.setHeader("cache-control", "no-store");
  res.status(200).json({
    provider: "deepgram" as const,
    token: data.access_token,
    model: process.env.DEEPGRAM_MODEL || "nova-2",
    expiresInSec: Math.max(60, (data.expires_in ?? ttl) - 120),
  });
}

/** Azure の合鍵。10分だけ有効。 */
async function grantAzure(res: VercelResponse): Promise<void> {
  const key = process.env.AZURE_SPEECH_KEY as string;
  const region = process.env.AZURE_SPEECH_REGION as string;

  let response: Response;
  try {
    response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "content-length": "0" },
    });
  } catch {
    res.status(502).send("音声認識のサーバーに接続できませんでした。");
    return;
  }

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? "キーかリージョンが違う可能性があります。"
        : "";
    res.status(502).send(`音声認識の合鍵を取得できませんでした（HTTP ${response.status}）。${hint}`);
    return;
  }

  const token = await response.text();
  if (!token) {
    res.status(502).send("音声認識の合鍵が空でした。");
    return;
  }

  res.setHeader("cache-control", "no-store");
  res.status(200).json({ provider: "azure" as const, token, region, expiresInSec: 540 });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const vendor = pickVendor();

  // GET は「どの業者が設定されているか」を聞くだけ。合鍵は発行しない。
  if (req.method === "GET") {
    res.setHeader("cache-control", "no-store");
    res.status(200).json({
      provider: vendor,
      region: vendor === "azure" ? (process.env.AZURE_SPEECH_REGION ?? null) : null,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("POST してください。");
    return;
  }

  if (!vendor) {
    res
      .status(503)
      .send(
        "音声認識のキーが未設定です。DEEPGRAM_API_KEY（または AZURE_SPEECH_KEY と AZURE_SPEECH_REGION）を設定してください。",
      );
    return;
  }

  if (vendor === "deepgram") await grantDeepgram(res);
  else await grantAzure(res);
}
