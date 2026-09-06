import type { SpeechHandlers, SpeechProvider, SpeechProviderInfo, SpeechRecognizer } from "./types";

/**
 * ブラウザ標準の音声認識（Web Speech API）。1段階目の暫定。
 * Chrome / Edge / Safari には載っているが Firefox には無い。
 */

// 型定義がブラウザによって無い（lib.dom.d.ts に入っていない）ので、使うぶんだけ自前で持つ。
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * iPhone・iPad か。
 *
 * iOSでは、Safariに限らずどのブラウザ（Chrome・Edge含む）もSafari本体のエンジンを
 * 使う決まりになっており、Web Speech API はそのエンジンに載っていない。
 * 「別のブラウザで」という案内は、iOSでは的外れ（Androidやパソコンなら効く）になるため、
 * 判定してメッセージを書き分ける。
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ は "MacIntel" を名乗るので、タッチ対応も合わせて見る。
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** 続けても直らない種類の失敗か。無音・音声なしは長い会話では普通に起きるので止めない。 */
export function isFatalSpeechError(code: string): boolean {
  return code !== "no-speech" && code !== "aborted" && code !== "audio-capture-timeout";
}

/** エラーコードを、そのまま画面に出せる日本語にする。 */
export function describeSpeechError(code: string, fallback?: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "マイクの使用が許可されていません。ブラウザの設定でこのサイトのマイクを許可してください。";
    case "audio-capture":
      return "マイクが見つかりません。接続と入力デバイスの設定を確認してください。";
    case "network":
      return "音声認識サーバーに接続できませんでした。ネットワークを確認してください。";
    case "language-not-supported":
      return "この言語の音声認識に対応していません。";
    default:
      return fallback ? `音声認識が止まりました（${code}: ${fallback}）` : `音声認識が止まりました（${code}）`;
  }
}

class WebSpeechRecognizer implements SpeechRecognizer {
  private recognition: SpeechRecognitionLike | null = null;
  private running = false;

  constructor(private readonly lang: string) {}

  start(handlers: SpeechHandlers): void {
    const Ctor = getCtor();
    if (!Ctor) {
      handlers.onError("このブラウザは音声認識に対応していません。");
      return;
    }
    this.running = true;

    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (!text) continue;
        // 1本の音にまとめて聞いているので、誰の声かは区別できない。
        handlers.onChunk({ text, isFinal: result.isFinal, speaker: "unknown" });
      }
    };

    recognition.onerror = (event) => {
      if (isFatalSpeechError(event.error)) {
        this.running = false;
        handlers.onError(describeSpeechError(event.error, event.message));
      }
    };

    // 長い会話では、ブラウザ側の都合で勝手に終わることがある。止めていないなら繋ぎ直す。
    recognition.onend = () => {
      if (!this.running) return;
      try {
        recognition.start();
      } catch {
        this.running = false;
        handlers.onError("音声認識を続けられませんでした。もう一度開始してください。");
      }
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch (error) {
      this.running = false;
      handlers.onError(error instanceof Error ? error.message : "音声認識を開始できませんでした。");
    }
  }

  stop(): void {
    this.running = false;
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // すでに終わっている場合は何もしない。
    }
  }
}

export const webSpeechProvider: SpeechProvider = {
  id: "web-speech",
  info(): SpeechProviderInfo {
    if (typeof window === "undefined") {
      return { label: "ブラウザ標準の音声認識", available: false, supportsMultipleSources: false, reason: "ブラウザ以外では使えません。" };
    }
    if (!getCtor()) {
      return {
        label: "ブラウザ標準の音声認識",
        available: false,
        supportsMultipleSources: false,
        reason: isIOS()
          ? "iPhone/iPadはブラウザの種類によらず音声認識（Web Speech API）に対応していません。Androidのスマホかパソコンでお使いください。"
          : "このブラウザは音声認識（Web Speech API）に対応していません。Google Chrome か Microsoft Edge で開いてください。",
      };
    }
    if (!window.isSecureContext) {
      return {
        label: "ブラウザ標準の音声認識",
        available: false,
        supportsMultipleSources: false,
        reason: "https（または localhost）で開いていないため、マイクを使えません。",
      };
    }
    return { label: "ブラウザ標準の音声認識", available: true, supportsMultipleSources: false };
  },
  create({ lang }) {
    return new WebSpeechRecognizer(lang);
  },
};
