import * as SDK from "microsoft-cognitiveservices-speech-sdk";
import { audioConstraints } from "./audioConstraints";
import type {
  SpeechChunk,
  SpeechCreateOptions,
  SpeechHandlers,
  SpeechProvider,
  SpeechProviderInfo,
  SpeechRecognizer,
  SpeechSource,
} from "./types";

/**
 * Azure AI Speech による音声認識。
 *
 * Web Speech API と決定的に違うのは、**音源を指定して聞ける**こと。
 * 自分のマイクと、相手の声（Zoom の音を仮想デバイス経由で受けたもの）を
 * 別々に認識できるので、「誰が喋ったか」が推測ではなく事実として分かる。
 *
 * 購読キーはブラウザに置かない。netlify/functions/speechToken から
 * 10分だけ有効な合鍵をもらって使い、切れる前に取り直す。
 */

const TOKEN_URL = "/api/speechToken";
/** 合鍵を取り直す間隔。実際の有効期限（10分）より短くしておく。 */
const REFRESH_MS = 8 * 60 * 1000;

interface TokenResponse {
  token: string;
  region: string;
  expiresInSec?: number;
}

export class AzureNotConfiguredError extends Error {}

async function fetchToken(): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, { method: "POST" });
  } catch {
    throw new Error("音声認識のサーバーに接続できませんでした。ネットワークを確認してください。");
  }
  if (response.status === 503) {
    throw new AzureNotConfiguredError(
      (await response.text().catch(() => "")) ||
        "音声認識のキーが未設定です。AZURE_SPEECH_KEY と AZURE_SPEECH_REGION を設定してください。",
    );
  }
  if (!response.ok) {
    throw new Error((await response.text().catch(() => "")) || "音声認識の合鍵を取得できませんでした。");
  }
  const data = (await response.json()) as TokenResponse;
  if (!data.token || !data.region) throw new Error("音声認識の合鍵の形式が不正です。");
  return data;
}

/**
 * 音源1本ぶんの認識。話者の札はここで貼る。
 *
 * マイクの掴み方は `SDK.AudioConfig.fromMicrophoneInput(deviceId)` に任せず、
 * 自前で `getUserMedia` してから `AudioConfig.fromStreamInput` に渡す。
 * SDK 側の `fromMicrophoneInput(deviceId)` は、渡した deviceId を無視して
 * システムの既定の入力デバイスを掴んでしまうことがある（実際に、相手用に
 * BlackHole を指定したのに自分のマイクと同じ内容が「相手」側にも出た）。
 * 自前で `getUserMedia` すれば、Deepgram と同じ確実な経路でデバイスを選べる。
 */
class SourceRecognition {
  private recognizer: SDK.SpeechRecognizer | null = null;
  private stream: MediaStream | null = null;
  private stopped = false;

  constructor(
    private readonly source: SpeechSource,
    private readonly lang: string,
  ) {}

  async start(token: string, region: string, handlers: SpeechHandlers): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(this.source) });
    } catch {
      handlers.onError(
        this.source.deviceId
          ? "選んだ入力デバイスを開けませんでした。抜き差ししていないか、一覧を更新して選び直してください。"
          : "マイクを開けませんでした。ブラウザの設定でこのサイトのマイクを許可してください。",
      );
      return;
    }
    if (this.stopped) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    this.stream = stream;

    const config = SDK.SpeechConfig.fromAuthorizationToken(token, region);
    config.speechRecognitionLanguage = this.lang;

    const audio = SDK.AudioConfig.fromStreamInput(stream);

    const recognizer = new SDK.SpeechRecognizer(config, audio);
    this.recognizer = recognizer;

    const emit = (text: string, isFinal: boolean) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const chunk: SpeechChunk = { text: trimmed, isFinal, speaker: this.source.speaker };
      handlers.onChunk(chunk);
    };

    recognizer.recognizing = (_s, e) => emit(e.result.text ?? "", false);
    recognizer.recognized = (_s, e) => {
      if (e.result.reason === SDK.ResultReason.RecognizedSpeech) emit(e.result.text ?? "", true);
    };
    recognizer.canceled = (_s, e) => {
      // 認識できる音が無いだけの中断は、会議では普通に起きるので黙って流す。
      if (e.reason === SDK.CancellationReason.Error) {
        handlers.onError(`音声認識が止まりました（${e.errorDetails || e.errorCode}）`);
      }
    };

    recognizer.startContinuousRecognitionAsync(
      () => undefined,
      (err) => handlers.onError(`音声認識を開始できませんでした（${err}）`),
    );
  }

  /** 合鍵を入れ替える。認識は止めない。 */
  refresh(token: string): void {
    if (this.recognizer) this.recognizer.authorizationToken = token;
  }

  stop(): void {
    this.stopped = true;
    const recognizer = this.recognizer;
    this.recognizer = null;
    const stream = this.stream;
    this.stream = null;
    // fromStreamInput に渡した MediaStream は SDK が持ち主ではないので、
    // ここで明示的に止めないとマイクを掴んだままになる。
    const releaseStream = () => {
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
    if (!recognizer) {
      releaseStream();
      return;
    }
    recognizer.stopContinuousRecognitionAsync(
      () => {
        recognizer.close();
        releaseStream();
      },
      () => {
        recognizer.close();
        releaseStream();
      },
    );
  }
}

class AzureRecognizer implements SpeechRecognizer {
  private sources: SourceRecognition[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly options: SpeechCreateOptions) {}

  start(handlers: SpeechHandlers): void {
    this.stopped = false;
    const wanted: SpeechSource[] =
      this.options.sources && this.options.sources.length > 0
        ? this.options.sources
        : [{ speaker: "unknown" }];

    // 合鍵の取得は非同期。待っているあいだに止められることがあるので、そのときは何も始めない。
    void (async () => {
      let issued: TokenResponse;
      try {
        issued = await fetchToken();
      } catch (error) {
        handlers.onError(error instanceof Error ? error.message : "音声認識を開始できませんでした。");
        return;
      }
      if (this.stopped) return;

      this.sources = wanted.map((source) => new SourceRecognition(source, this.options.lang));
      // 1本ずつ独立して立ち上げる。片方が失敗しても、もう片方は動かす。
      await Promise.all(this.sources.map((s) => s.start(issued.token, issued.region, handlers)));

      this.timer = setInterval(() => {
        void (async () => {
          try {
            const next = await fetchToken();
            for (const s of this.sources) s.refresh(next.token);
          } catch {
            // 取り直しに失敗しても、今の合鍵が切れるまでは動き続ける。次回に賭ける。
          }
        })();
      }, REFRESH_MS);
    })();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const s of this.sources) s.stop();
    this.sources = [];
  }
}

export const azureSpeechProvider: SpeechProvider = {
  id: "azure-speech",
  info(): SpeechProviderInfo {
    if (typeof window === "undefined") {
      return {
        label: "Azure AI Speech",
        available: false,
        supportsMultipleSources: false,
        reason: "ブラウザ以外では使えません。",
      };
    }
    if (!window.isSecureContext) {
      return {
        label: "Azure AI Speech",
        available: false,
        supportsMultipleSources: false,
        reason: "https（または localhost）で開いていないため、マイクを使えません。",
      };
    }
    return { label: "Azure AI Speech", available: true, supportsMultipleSources: true };
  },
  create(options: SpeechCreateOptions): SpeechRecognizer {
    return new AzureRecognizer(options);
  },
};
