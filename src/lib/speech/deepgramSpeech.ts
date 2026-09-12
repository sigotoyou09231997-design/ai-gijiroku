import type {
  SpeechCreateOptions,
  SpeechHandlers,
  SpeechProvider,
  SpeechProviderInfo,
  SpeechRecognizer,
  SpeechSource,
} from "./types";

/**
 * Deepgram による音声認識。
 *
 * Web Speech API と決定的に違うのは、**音源を指定して聞ける**こと。
 * 自分のマイクと、相手の声（Zoom の音を仮想デバイス経由で受けたもの）を
 * 別々の接続で認識するので、「誰が喋ったか」が推測ではなく事実として分かる。
 *
 * 購読キーはブラウザに置かない。netlify/functions/speechToken から
 * 期限付きの合鍵をもらって使い、切れる前に取り直す。
 */

const TOKEN_URL = "/.netlify/functions/speechToken";
const LISTEN_URL = "wss://api.deepgram.com/v1/listen";
/** マイクの音を送る間隔。短いほど反応が早いが、細切れすぎると認識が落ちる。 */
const CHUNK_MS = 250;
/** 無音が続くと切られるので、生きていることを伝える間隔。 */
const KEEPALIVE_MS = 5_000;
/**
 * 途中経過が確定しないまま居座ってよい時間。これを過ぎたらこちらで確定にする。
 * Deepgram の合図（UtteranceEnd）が来ない場面のための最後の砦なので、
 * 早すぎると本来ひと続きの文が切れる。長めに取ってある。
 */
const STALL_MS = 8_000;

interface TokenResponse {
  provider?: string;
  token: string;
  model?: string;
  expiresInSec?: number;
}

export class SpeechNotConfiguredError extends Error {}

async function fetchToken(): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, { method: "POST" });
  } catch {
    throw new Error("音声認識のサーバーに接続できませんでした。ネットワークを確認してください。");
  }
  if (response.status === 503) {
    throw new SpeechNotConfiguredError(
      (await response.text().catch(() => "")) || "音声認識のキーが未設定です。",
    );
  }
  if (!response.ok) {
    throw new Error((await response.text().catch(() => "")) || "音声認識の合鍵を取得できませんでした。");
  }
  const data = (await response.json()) as TokenResponse;
  if (!data.token) throw new Error("音声認識の合鍵の形式が不正です。");
  return data;
}

/**
 * ブラウザが送れる音の形。環境によって使える形が違うので、上から順に試す。
 *
 * Safari（iPhone・iPadは種類によらずこのエンジン）は webm/ogg にまったく対応しておらず、
 * 対応するのは mp4（AAC）だけ。ここに無いと iPhone では毎回「音声の送信に対応していません」
 * で止まり、Deepgram/Azureのキーを設定しても iPhone だけ動かないことになる。
 * Deepgram 側は送られてきた音から形式を自動で見分けるので、mp4 を足すだけで済む。
 */
export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * 言語コードを Deepgram の流儀に直す。
 *
 * 画面は Web Speech API の流儀で "ja-JP" のような地域付きの書き方を渡してくるが、
 * Deepgram の日本語は "ja" で、"ja-JP" を渡すと**エラーにならず空の結果が返る**。
 * 接続も課金も普通に成立するので、これに気付くのは難しい。実際に
 * 「音は届いているのに1文字も出ない」状態を作って、Deepgram 側の記録
 * （/v1/projects/{id}/requests）と突き合わせて分かった。
 *
 * 地域まで見るのは Deepgram がそう定めている一部の言語だけなので、
 * それ以外は先頭の部分だけを使う。
 */
export function deepgramLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) return "ja";
  // 地域まで含めて指定する言語（Deepgram がそう定めているもの）。
  const withRegion = new Set([
    "en-us", "en-gb", "en-au", "en-in", "en-nz",
    "es-419", "pt-br", "pt-pt", "zh-cn", "zh-tw", "fr-ca", "nl-be",
  ]);
  if (withRegion.has(normalized)) return normalized;
  return normalized.split("-")[0];
}

function listenUrl(lang: string, model: string): string {
  const params = new URLSearchParams({
    model,
    language: deepgramLanguage(lang),
    // 途中経過も受け取る（画面に薄く出すため）。
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
    // 会議では物音や通話の音が途切れないので、既定のままだと「無音の切れ目」が
    // 来ず、文章がいつまでも確定しない（灰色のまま固まる）。
    // 短い間があれば区切り、さらに1秒喋りが無ければ UtteranceEnd を送ってもらう。
    endpointing: "300",
    utterance_end_ms: "1000",
    vad_events: "true",
  });
  return `${LISTEN_URL}?${params.toString()}`;
}

/**
 * 音源ごとの取り方。役割で変える必要がある。
 *
 * ブラウザは既定で「スピーカーから出ている音」を差し引く（エコーキャンセル）。
 * これは自分のマイクには効いてほしい機能で、部屋に漏れた相手の声を消してくれる。
 *
 * ところが相手の声は、その「スピーカーから出ている音」を仮想オーディオで
 * 受けたものそのものなので、**まるごと打ち消されて無音になる**。
 * 接続も課金も成立したまま結果だけが空になるので、原因が分かりにくい。
 * 相手側だけは、音をいじる機能を全部切って生のまま受け取る。
 */
export function audioConstraints(source: SpeechSource): MediaTrackConstraints {
  const device = source.deviceId ? { deviceId: { exact: source.deviceId } } : {};
  if (source.speaker === "other") {
    return {
      ...device,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
  }
  // 自分のマイクは既定のまま。漏れてきた相手の音を消してくれる。
  return device;
}

/** 音源1本ぶん。マイクを掴んで、Deepgram へ流し、結果に話者の札を貼る。 */
class SourceStream {
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private stall: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  /** まだ確定していない途中経過と、それを受け取った時刻。 */
  private pendingText = "";
  private pendingAt = 0;

  constructor(
    private readonly source: SpeechSource,
    private readonly lang: string,
  ) {}

  async start(token: string, model: string, handlers: SpeechHandlers): Promise<void> {
    const mimeType = pickMimeType();
    if (!mimeType) {
      handlers.onError("このブラウザは音声の送信に対応していません。Chrome か Edge で開いてください。");
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(this.source) });
    } catch {
      handlers.onError(
        this.source.deviceId
          ? "選んだ入力デバイスを開けませんでした。抜き差ししていないか、一覧を更新して選び直してください。"
          : "マイクを開けませんでした。ブラウザの設定でこのサイトのマイクを許可してください。",
      );
      return;
    }
    if (this.stopped) {
      this.releaseStream();
      return;
    }

    // ブラウザは WebSocket に独自ヘッダを付けられないので、
    // 副プロトコル（Sec-WebSocket-Protocol）に合鍵を載せる。
    //
    // 合言葉は "bearer"。Deepgram の文書には "token" と書かれているが、
    // それは購読キーを直に渡すときの形で、/v1/auth/grant で取った合鍵（JWT）では
    // 弾かれる（1006 で閉じられる）。URL の access_token に載せる形も同じく通らない。
    // 実際に3通り試して確かめた結果なので、変えるときは必ず繋いで確かめること。
    const ws = new WebSocket(listenUrl(this.lang, model), ["bearer", token]);
    this.ws = ws;

    ws.onopen = () => {
      if (this.stopped) {
        ws.close();
        return;
      }
      const recorder = new MediaRecorder(this.stream as MediaStream, { mimeType });
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(event.data);
      };
      recorder.start(CHUNK_MS);

      this.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
      }, KEEPALIVE_MS);

      // 最後の砦。確定の合図が来ないまま途中経過が居座ったら、こちらで確定にする。
      // これが無いと、音が途切れない場面で文字起こしが伸びなくなる。
      this.stall = setInterval(() => {
        if (!this.pendingText) return;
        if (Date.now() - this.pendingAt < STALL_MS) return;
        this.flushPending(handlers);
      }, 1_000);
    };

    ws.onmessage = (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      const message = payload as {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: { transcript?: string }[] };
      };

      // 「ここで一区切り」の合図。溜まっている途中経過を確定にする。
      if (message.type === "UtteranceEnd") {
        this.flushPending(handlers);
        return;
      }
      if (message.type && message.type !== "Results") return;

      const text = message.channel?.alternatives?.[0]?.transcript?.trim();
      if (!text) return;

      if (message.is_final) {
        // Deepgram が確定させたので、こちらで抱えていたぶんは捨てる（二重に出さない）。
        this.pendingText = "";
        handlers.onChunk({ text, isFinal: true, speaker: this.source.speaker });
        return;
      }
      this.pendingText = text;
      this.pendingAt = Date.now();
      handlers.onChunk({ text, isFinal: false, speaker: this.source.speaker });
    };

    ws.onerror = () => {
      if (!this.stopped) handlers.onError("音声認識との通信でエラーが起きました。");
    };

    ws.onclose = (event) => {
      // 1000（正常）と、こちらから閉じたときは黙って終わる。
      if (this.stopped || event.code === 1000) return;
      handlers.onError(
        event.code === 1008 || event.code === 1006
          ? "音声認識に接続できませんでした。キーの有効期限や残高を確認してください。"
          : `音声認識の接続が切れました（コード ${event.code}）。`,
      );
    };
  }

  /** 抱えている途中経過を確定にして手放す。 */
  private flushPending(handlers: SpeechHandlers): void {
    const text = this.pendingText;
    this.pendingText = "";
    if (!text) return;
    handlers.onChunk({ text, isFinal: true, speaker: this.source.speaker });
  }

  private releaseStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
    if (this.stall) {
      clearInterval(this.stall);
      this.stall = null;
    }
    this.pendingText = "";
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        // すでに止まっている場合は何もしない。
      }
    }
    this.recorder = null;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      if (ws.readyState === WebSocket.OPEN) {
        // 残りを吐き出してから閉じてもらう。
        try {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        } catch {
          // 送れなくても、このあと閉じるので問題ない。
        }
      }
      ws.close(1000);
    }
    this.releaseStream();
  }
}

class DeepgramRecognizer implements SpeechRecognizer {
  private streams: SourceStream[] = [];
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

      const model = issued.model || "nova-2";
      this.streams = wanted.map((source) => new SourceStream(source, this.options.lang));
      // 1本ずつ独立して立ち上げる。片方が失敗しても、もう片方は動かす。
      await Promise.all(this.streams.map((s) => s.start(issued.token, model, handlers)));
    })();
  }

  stop(): void {
    this.stopped = true;
    for (const s of this.streams) s.stop();
    this.streams = [];
  }
}

export const deepgramSpeechProvider: SpeechProvider = {
  id: "deepgram",
  info(): SpeechProviderInfo {
    if (typeof window === "undefined") {
      return {
        label: "Deepgram",
        available: false,
        supportsMultipleSources: false,
        reason: "ブラウザ以外では使えません。",
      };
    }
    if (!window.isSecureContext) {
      return {
        label: "Deepgram",
        available: false,
        supportsMultipleSources: false,
        reason: "https（または localhost）で開いていないため、マイクを使えません。",
      };
    }
    if (typeof MediaRecorder === "undefined") {
      return {
        label: "Deepgram",
        available: false,
        supportsMultipleSources: false,
        reason: "このブラウザは音声の送信に対応していません。Chrome か Edge で開いてください。",
      };
    }
    return { label: "Deepgram", available: true, supportsMultipleSources: true };
  },
  create(options: SpeechCreateOptions): SpeechRecognizer {
    return new DeepgramRecognizer(options);
  },
};
