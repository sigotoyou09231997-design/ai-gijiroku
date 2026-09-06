/**
 * 音声認識の差し替え口。
 *
 * いまは Web Speech API（ブラウザ標準）だけだが、Azure AI Speech の
 * キーが用意できたら、このファイルの型を満たすプロバイダを1つ足して
 * `createRecognizer()` の選び方を変えるだけで済むようにしてある。
 * 質問検知・回答案生成・要約生成・保存・画面はここから先を知らない。
 */

export interface SpeechChunk {
  /** 認識された文字列。 */
  text: string;
  /** 確定したものか（false のあいだは画面に薄く出すだけで、保存も解析もしない）。 */
  isFinal: boolean;
}

export interface SpeechHandlers {
  onChunk(chunk: SpeechChunk): void;
  /** 続行できない種類の失敗だけ呼ぶ（無音などの一時的なものは呼ばない）。 */
  onError(message: string): void;
}

export interface SpeechRecognizer {
  start(handlers: SpeechHandlers): void;
  stop(): void;
}

export interface SpeechProviderInfo {
  /** 画面に出す名前。 */
  label: string;
  /** 使えるか。 */
  available: boolean;
  /** 使えない理由（available が false のときだけ入る）。 */
  reason?: string;
}

export interface SpeechProvider {
  readonly id: string;
  info(): SpeechProviderInfo;
  create(options: { lang: string }): SpeechRecognizer;
}
