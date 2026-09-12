import type { SpeechSource } from "./types";

/**
 * 音源ごとの取り方。役割で変える必要がある。Deepgram・Azure 共通。
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
