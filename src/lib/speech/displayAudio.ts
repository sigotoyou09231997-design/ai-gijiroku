/**
 * 画面・タブの音声を「相手の声」として聞くための、音の取り方。
 *
 * 会社のPCなどで、仮想オーディオ（BlackHole・VB-CABLE など）を入れられないときの代わり。
 * ブラウザの画面共有の機能で、会議の音を受け取る。インストールも管理者権限も要らない。
 *
 * - ブラウザで開いている会議（Teams・Meet・Zoom の Web 版）… その会議のタブを共有する。
 * - Zoom などのアプリ … 「画面全体」を選び、「システム音声を共有」にチェックを入れる。
 *
 * Chrome / Edge で使える。Firefox・Safari は音声を渡してくれない。
 */

/** 画面・タブの共有で失敗したとき、そのまま画面に出せる文面を持つ。 */
export class DisplayAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisplayAudioError";
  }
}

export const SHARE_GUIDE =
  "会議をブラウザで開いているときは、その会議のタブを選びます。Zoom などのアプリのときは「画面全体」を選び、「システム音声を共有」にチェックを入れてください。";

export function isDisplayAudioSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

/**
 * 共有の選択画面を出し、選ばれた画面・タブの音声だけを返す。
 *
 * ユーザーの操作（ボタン押下）の直後に呼ぶこと。そうでないとブラウザに断られる。
 */
export async function captureDisplayAudio(): Promise<MediaStream> {
  if (!isDisplayAudioSupported()) {
    throw new DisplayAudioError(
      "このブラウザは、画面・タブの音声を受け取れません。Chrome か Edge で開いてください。",
    );
  }

  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      // Chrome は映像を要求しないと共有の画面を出してくれない。映像はあとで捨てる。
      video: true,
      // 相手の声は、スピーカーから出る音そのもの。エコーキャンセルが掛かると、まるごと消えて無音になる。
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch {
    throw new DisplayAudioError(`画面・タブの共有が取りやめられました。もう一度「開始」を押して、共有するものを選んでください。${SHARE_GUIDE}`);
  }

  const audioTracks = display.getAudioTracks();
  // 映像は要らない。止めておく（共有中の負荷を減らす）。
  for (const track of display.getVideoTracks()) track.stop();

  if (audioTracks.length === 0) {
    for (const track of display.getTracks()) track.stop();
    throw new DisplayAudioError(`選んだ共有に、音声が含まれていませんでした。${SHARE_GUIDE}`);
  }

  return new MediaStream(audioTracks);
}

/** 共有が止まったときに画面へ出す文面。 */
export const SHARE_ENDED_MESSAGE =
  "画面・タブの音声の共有が止まりました。相手の声は、もう一度「開始」から共有し直すまで聞き取れません。";
