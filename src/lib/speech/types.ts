/**
 * 音声認識の差し替え口。
 *
 * 2段階目で Azure AI Speech に差し替えたときに、話者ごとに別々の音源を
 * 聞けるようにするため、「音源1本＝話者1人」を前提にした形にしてある。
 * 質問検知・回答案生成・要約生成・保存・画面はここから先を知らない。
 */

/**
 * 誰の声か。
 * - self    … 自分（マイク）
 * - other   … 相手（Zoom などの受話音声）
 * - unknown … 1本の音にまとめて聞いていて区別が付かない（Web Speech API のとき）
 */
export type Speaker = "self" | "other" | "unknown";

export interface SpeechChunk {
  /** 認識された文字列。 */
  text: string;
  /** 確定したものか（false のあいだは画面に薄く出すだけで、保存も解析もしない）。 */
  isFinal: boolean;
  /** 誰の声か。 */
  speaker: Speaker;
}

/** 聞く音源1本ぶん。 */
export interface SpeechSource {
  speaker: Speaker;
  /**
   * ブラウザが割り当てる入力デバイスのID（`navigator.mediaDevices.enumerateDevices()`）。
   * 未指定なら既定のマイクを使う。
   */
  deviceId?: string;
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
  /** 音源を話者ごとに分けて聞けるか。false のときは画面の設定欄を出さない。 */
  supportsMultipleSources: boolean;
}

export interface SpeechCreateOptions {
  lang: string;
  /**
   * 聞く音源。空または未指定なら既定のマイク1本だけを聞く。
   * 分けて聞けないプロバイダは先頭の1本だけを使う。
   */
  sources?: SpeechSource[];
}

export interface SpeechProvider {
  readonly id: string;
  info(): SpeechProviderInfo;
  create(options: SpeechCreateOptions): SpeechRecognizer;
}
