/**
 * 「自分のマイク」と「相手の音」に、どの入力デバイスを使うかの憶え。
 *
 * 相手の声は Zoom などのアプリから出てくるので、仮想オーディオ（BlackHole など）で
 * 一度受けてから入力として拾う。どのデバイスがそれに当たるかは環境ごとに違うため、
 * 画面で選んでもらってこの端末に憶えておく。
 */

const STORAGE_KEY = "ai-gijiroku.audio-sources";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface SourceChoice {
  /** 自分の声を拾うデバイス。空文字なら既定のマイク。 */
  selfDeviceId: string;
  /** 相手の声を拾うデバイス。空文字なら「相手側は聞かない」。 */
  otherDeviceId: string;
}

export const emptyChoice: SourceChoice = { selfDeviceId: "", otherDeviceId: "" };

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
  if (typeof localStorage === "undefined") return emptyChoice;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyChoice;
    const parsed = JSON.parse(raw) as Partial<SourceChoice>;
    return {
      selfDeviceId: typeof parsed.selfDeviceId === "string" ? parsed.selfDeviceId : "",
      otherDeviceId: typeof parsed.otherDeviceId === "string" ? parsed.otherDeviceId : "",
    };
  } catch {
    return emptyChoice;
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
 * 選んだ憶えが、いま繋がっているデバイスの中にまだ在るかを確かめる。
 * ヘッドセットを抜き差しすると deviceId が変わるので、消えていたら既定に戻す。
 */
export function reconcile(choice: SourceChoice, devices: AudioInputDevice[]): SourceChoice {
  const ids = new Set(devices.map((d) => d.deviceId));
  return {
    selfDeviceId: ids.has(choice.selfDeviceId) ? choice.selfDeviceId : "",
    otherDeviceId: ids.has(choice.otherDeviceId) ? choice.otherDeviceId : "",
  };
}
