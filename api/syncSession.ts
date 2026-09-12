import type { VercelRequest, VercelResponse } from "@vercel/node";
import { get, list, put } from "@vercel/blob";

/**
 * 保存したセッションを、この端末の外（Vercel Blob）にも1部だけ残す。
 *
 * このアプリは元々「データは端末内だけ・サーバーには残さない」設計だったが、
 * 本人の希望で、作業する側（Claude Code）がセッションの中身を後からいつでも
 * 確認できるようにするために追加した。会話の中身を扱うので、読み出し側には
 * SYNC_SECRET による認証を掛けている（書き込みは今までの analyze/summarize と
 * 同じく、アプリ自身からの呼び出しを前提に認証しない）。
 *
 * このリポジトリの他の関数と違い、Netlify側には意図的に用意していない
 * （本人の指示で、当面はVercelだけで確認する運用のため）。
 *
 * 環境変数（Vercel のプロジェクト設定）:
 *   BLOB_READ_WRITE_TOKEN … Blobストア作成時にVercelが自動で入れる。
 *   SYNC_SECRET           … 読み出し（GET）に必要な合鍵。ヘッダー x-sync-key で渡す。
 */

const PREFIX = "sessions/";

interface StoredSession {
  id?: unknown;
  label?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  [key: string]: unknown;
}

function hasValidSecret(req: VercelRequest): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  return req.headers["x-sync-key"] === secret;
}

/** 非公開ストアなので、都度 get() で認証付きに読む（生URLへの素の fetch では読めない）。 */
async function readBlob(pathname: string): Promise<unknown> {
  const result = await get(pathname, { access: "private" });
  if (!result) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "POST") {
    const body = req.body as StoredSession;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      res.status(400).send("idが必要です。");
      return;
    }
    try {
      await put(`${PREFIX}${id}.json`, JSON.stringify(body), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(502).send(error instanceof Error ? error.message : "保存に失敗しました。");
    }
    return;
  }

  if (req.method === "GET") {
    if (!hasValidSecret(req)) {
      res.status(401).send("認証が必要です（x-sync-key）。");
      return;
    }

    const id = typeof req.query.id === "string" ? req.query.id : undefined;

    try {
      if (id) {
        const data = await readBlob(`${PREFIX}${id}.json`);
        if (!data) {
          res.status(404).send("見つかりません。");
          return;
        }
        res.status(200).json(data);
        return;
      }

      const { blobs } = await list({ prefix: PREFIX });
      const items = await Promise.all(
        blobs.map(async (b) => {
          const data = ((await readBlob(b.pathname)) ?? {}) as StoredSession;
          return {
            id: data.id,
            label: data.label,
            startedAt: data.startedAt,
            endedAt: data.endedAt,
          };
        }),
      );
      items.sort((a, b) => (Number(b.startedAt) || 0) - (Number(a.startedAt) || 0));
      res.status(200).json({ sessions: items });
    } catch (error) {
      res.status(502).send(error instanceof Error ? error.message : "読み出しに失敗しました。");
    }
    return;
  }

  res.status(405).send("GET か POST を使ってください。");
}
