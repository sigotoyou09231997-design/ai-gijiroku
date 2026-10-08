/**
 * 「自分のマイク」と「相手の音」に、どの入力デバイスを使うかの憶え。
 *
 * 相手の声は Zoom などのアプリから出てくるので、仮想オーディオ（BlackHole など）で
 * 一度受けてから入力として拾う。どのデバイスがそれに当たるかは環境ごとに違うため、
 * 画面で選んでもらってこの端末に憶えておく。
 */

// v2 で「自動」を既定にした。以前の手選びの憶えは引き継がず、自動から始める。
const STORAGE_KEY = "ai-gijiroku.audio-sources.v2";

/** 「そのとき繋がっているものから選ぶ」を表す値。 */
export const AUTO = "auto";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface SourceChoice {
  /** 自分の声を拾うデバイス。AUTO なら自動、空文字なら既定のマイク。 */
  selfDeviceId: string;
  /** 相手の声を拾うデバイス。AUTO なら自動、空文字なら「相手側は聞かない」。 */
  otherDeviceId: string;
}

export const emptyChoice: SourceChoice = { selfDeviceId: "", otherDeviceId: "" };
export const autoChoice: SourceChoice = { selfDeviceId: AUTO, otherDeviceId: AUTO };

/**
 * 入力デバイスの一覧。
 * ラベルを得るにはマイクの許可が要るので、許可が無いときは名前が空で返ってくる。
 * その場合に備えて、呼ぶ側が先に getUserMedia で許可を取る。
 */
export async function listAudioInputs(): Promise<AudioInputDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `入力デバイス ${i + 1}`,
    }));
}

/** ラベルを読めるようにするための許可取り。断られても致命傷ではない。 */
export async function ensureMicPermission(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // 許可を取るだけが目的なので、掴んだマイクはすぐ離す。
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}

export function loadChoice(): SourceChoice {
  if (typeof localStorage === "undefined") return autoChoice;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return autoChoice;
    const parsed = JSON.parse(raw) as Partial<SourceChoice>;
    return {
      selfDeviceId: typeof parsed.selfDeviceId === "string" ? parsed.selfDeviceId : "",
      otherDeviceId: typeof parsed.otherDeviceId === "string" ? parsed.otherDeviceId : "",
    };
  } catch {
    return autoChoice;
  }
}

export function saveChoice(choice: SourceChoice): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // 保存できなくても、その場の録音は選んだ内容で動く。
  }
}

/**
 * 相手の声の取り方。
 * - device  … 仮想オーディオ（BlackHole・VB-CABLE など）の入力デバイスから聞く（通常）。
 * - display … 画面・タブの共有で受けた音声から聞く（仮想オーディオを入れられない会社のPC用）。
 *
 * 選びはこの端末（のブラウザ）に憶える。会社のPCと家のPCで、それぞれ別に持てる。
 */
export type OtherSourceMode = "device" | "display";

const OTHER_MODE_KEY = "ai-gijiroku.other-source-mode.v1";

export function loadOtherMode(): OtherSourceMode {
  if (typeof localStorage === "undefined") return "device";
  try {
    return localStorage.getItem(OTHER_MODE_KEY) === "display" ? "display" : "device";
  } catch {
    return "device";
  }
}

export function saveOtherMode(mode: OtherSourceMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OTHER_MODE_KEY, mode);
  } catch {
    // 保存できなくても、その場の録音は選んだ方式で動く。
  }
}

/**
 * 選んだ憶えが、いま繋がっているデバイスの中にまだ在るかを確かめる。
 * ヘッドセットを抜き差しすると deviceId が変わるので、消えていたら既定に戻す。
 */
export function reconcile(choice: SourceChoice, devices: AudioInputDevice[]): SourceChoice {
  const ids = new Set(devices.map((d) => d.deviceId));
  const keep = (id: string) => (id === AUTO || ids.has(id) ? id : "");
  return { selfDeviceId: keep(choice.selfDeviceId), otherDeviceId: keep(choice.otherDeviceId) };
}

/** 通話アプリの音を受けるための仮想オーディオか。相手の声はここから拾う。 */
const VIRTUAL =
  /blackhole|loopback|soundflower|background music|vb-?audio|vb-?cable|cable output|virtual|仮想|stereo mix|ステレオ ミキサー|zoomaudiodevice|teams audio/i;

/** Chrome が一覧に足す「既定」「通信」の別名。中身は他の行と同じなので、自動では選ばない。 */
const ALIAS_IDS = new Set(["default", "communications"]);

/**
 * 仮想オーディオでも、通話の音を流す先ではないもの。
 * Background Music はアプリごとの音量調整のための仮想デバイスで、会議の音は BlackHole に流している。
 * 自分の声にも相手の声にも選ばない。
 */
const NOT_CALL_AUDIO = /background music/i;

function isVirtual(device: AudioInputDevice): boolean {
  return VIRTUAL.test(device.label);
}

/**
 * 自分の声に向いているかの点数。高いほど良い。
 * - 専用の外付けマイク（USB など）がいちばん。
 * - カメラのマイクは口から遠いので、少し下げる。
 * - iPhone をマイクにしたもの（連係カメラ）は、iPhone が離れたり画面が消えたりで途切れやすい。
 *   mac はその名前を「‎〇〇のマイク」と先頭に見えない向きの印（U+200E）を付けて出す。
 * - Bluetooth のイヤホン（AirPods など）はマイクを使うと通話モードに落ち、音質が下がるうえ、
 *   同じ時計に乗っている相手側の音まで道連れにする。
 * - 本体の内蔵マイクは最後。この Mac の MacBook Pro は内蔵マイクが完全な無音を返すので、
 *   音質が落ちても声が届く AirPods の方がまし。
 */
function selfScore(device: AudioInputDevice): number {
  const label = device.label;
  if (/macbook|built-?in|internal|内蔵/i.test(label)) return -30;
  if (/airpods|bluetooth|hands-?free|headset|ヘッドセット/i.test(label)) return -20;
  if (/iphone|ipad|continuity|\u200e/i.test(label)) return -10;
  if (/webcam|camera|カメラ/i.test(label)) return -5;
  return 0;
}

/** 自動のときに、自分の声に使うデバイスを選ぶ。候補が無ければ既定のマイク（空文字）。 */
export function pickSelfDevice(devices: AudioInputDevice[]): string {
  let best: AudioInputDevice | null = null;
  for (const device of devices) {
    if (ALIAS_IDS.has(device.deviceId) || isVirtual(device)) continue;
    if (!best || selfScore(device) > selfScore(best)) best = device;
  }
  return best?.deviceId ?? "";
}

/** 自動のときに、相手の声に使うデバイスを選ぶ。仮想オーディオが無ければ聞かない（空文字）。 */
export function pickOtherDevice(devices: AudioInputDevice[]): string {
  const candidates = devices.filter(
    (d) => !ALIAS_IDS.has(d.deviceId) && isVirtual(d) && !NOT_CALL_AUDIO.test(d.label),
  );
  const preferred = candidates.find((d) => /blackhole/i.test(d.label)) ?? candidates[0];
  return preferred?.deviceId ?? "";
}

/** 自動の所を、いま繋がっているデバイスで具体的なIDに置き換える。録音はこの結果で始める。 */
export function resolveChoice(choice: SourceChoice, devices: AudioInputDevice[]): SourceChoice {
  const fixed = reconcile(choice, devices);
  return {
    selfDeviceId: fixed.selfDeviceId === AUTO ? pickSelfDevice(devices) : fixed.selfDeviceId,
    otherDeviceId: fixed.otherDeviceId === AUTO ? pickOtherDevice(devices) : fixed.otherDeviceId,
  };
}
