import type { SpeechProvider } from "./types";
import { webSpeechProvider } from "./webSpeech";

export type { SpeechChunk, SpeechHandlers, SpeechProvider, SpeechProviderInfo, SpeechRecognizer } from "./types";

/**
 * 使う音声認識を1か所で決める。
 *
 * 2段階目で Azure AI Speech に差し替えるときは、`azureSpeech.ts` を足して
 * ここの並びの先頭に入れる（キーが無ければ webSpeechProvider に落ちる、という形にする）。
 * 呼ぶ側はこの関数しか知らないので、他の画面・処理には手を入れなくて済む。
 */
export function getSpeechProvider(): SpeechProvider {
  return webSpeechProvider;
}
