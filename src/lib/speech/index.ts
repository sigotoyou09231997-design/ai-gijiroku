import { azureSpeechProvider } from "./azureSpeech";
import type { SpeechProvider } from "./types";
import { webSpeechProvider } from "./webSpeech";

export type {
  Speaker,
  SpeechChunk,
  SpeechCreateOptions,
  SpeechHandlers,
  SpeechProvider,
  SpeechProviderInfo,
  SpeechRecognizer,
  SpeechSource,
} from "./types";

/**
 * 使う音声認識を1か所で決める。
 *
 * Azure のキーがサーバー側に設定されていれば Azure を使う（音源を話者ごとに分けて聞ける）。
 * 設定されていなければブラウザ標準に落として、実装を止めない。
 * 呼ぶ側はこの2つの関数しか知らないので、他の画面・処理には手を入れなくて済む。
 */

const TOKEN_URL = "/.netlify/functions/speechToken";

/** 同期で取れる既定。Azure を確かめる前や、確かめられない場面（テスト）で使う。 */
export function getSpeechProvider(): SpeechProvider {
  return webSpeechProvider;
}

let probed: Promise<SpeechProvider> | null = null;

/**
 * Azure が使える設定になっているかをサーバーに一度だけ聞いて、使う方を返す。
 * 聞けなかったときはブラウザ標準に落とす（オフラインでも録音そのものは始められるように）。
 */
export function resolveSpeechProvider(): Promise<SpeechProvider> {
  if (probed) return probed;
  probed = (async () => {
    try {
      const response = await fetch(TOKEN_URL, { method: "GET" });
      if (!response.ok) return webSpeechProvider;
      const data = (await response.json()) as { configured?: boolean };
      return data.configured ? azureSpeechProvider : webSpeechProvider;
    } catch {
      return webSpeechProvider;
    }
  })();
  return probed;
}

/** テスト用。確かめた結果を忘れる。 */
export function resetSpeechProviderProbe(): void {
  probed = null;
}
