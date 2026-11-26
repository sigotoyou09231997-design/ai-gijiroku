/**
 * 面接官の発言を、いつ「質問として」AI に回すかを決める。
 *
 * 文字起こしは1つの質問を何回かに分けて確定させてくる（息継ぎ・言い直し・
 * Deepgram が数秒ごとに区切る など）。確定のたびに投げると途中で答えを作り始めてしまい、
 * 待ちすぎると遅い。そこで次の決まりにする:
 *
 * - [相手] の確定が来たら、続きを待つ短い間（DEBOUNCE_MS）を置いてから回す。
 * - その間に [相手] がまだ喋っている（途中経過が新しい）なら待つ。
 * - [自分] が喋り始めたら、相手は言い終えたとみなして待たずに回す。
 * - 同じ番（[自分] が喋るまで）の続きが来たら、言い足したぶんも含めて回し直す。
 *
 * 時刻は引数で受け取る純粋なつくりにしてあり、テストで時間を進めて確かめる。
 */

/**
 * [相手] の確定から回すまでの間。
 * Deepgram（nova-2・endpointing 300ms）で測ると、確定は喋り終えてから 0.35〜0.6 秒後に届き、
 * 文の途中で区切られた確定のときは次の途中経過がすぐ（0.1秒以内）続く。0.8秒待てば、
 * 言い終えてから約1.2秒で回り始め、文の途中の区切りでは途中経過の確認で止まる。
 */
export const DEBOUNCE_MS = 800;
/** 途中経過がこれより古ければ、喋り終えた（途中経過が残っているだけ）とみなす。 */
export const INTERIM_STALE_MS = 1_600;
/** [自分] の発言がこれより短い（「はい」など）なら、番を閉じない。 */
export const SELF_MIN_CHARS = 5;

const BACKCHANNEL = new RegExp(
  "^(?:はい|ええ|うん|ああ|へえ|ほう|なるほど|そうですね|そうなんですね|そうですか|" +
    "ありがとうございます|ありがとうございました|わかりました|分かりました|承知しました|了解です|" +
    "いいですね|すごいですね|確かに|たしかに|ですよね|OK|オーケー)+$",
);

function compact(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s　、。，．,.!?！？…ー〜~「」]/g, "");
}

/** 相づち・お礼だけの発言か。これだけなら AI に回さない（質問ではないので）。 */
export function isBackchannel(text: string): boolean {
  const c = compact(text);
  if (!c) return true;
  return c.length <= 24 && BACKCHANNEL.test(c);
}

export interface FireRequest {
  /** AI に渡す、面接官の今の番の発言。 */
  question: string;
  /** この番の何回目か。2回目以降は「言い足し」で、前の回答を作り直す。 */
  turnId: number;
  /** 同じ番で前にも回したか。 */
  continuation: boolean;
}

export class TurnTracker {
  private finals: string[] = [];
  private interim = "";
  private interimAt = 0;
  private lastFinalAt = 0;
  private firedKey = "";
  private firedInTurn = false;
  private turn = 1;

  constructor(
    private readonly debounceMs: number = DEBOUNCE_MS,
    private readonly interimStaleMs: number = INTERIM_STALE_MS,
  ) {}

  /** 今の番の発言（確定ぶん＋必要なら途中経過）。 */
  private text(includeInterim: boolean): string {
    const parts = [...this.finals];
    if (includeInterim && this.interim.trim()) parts.push(this.interim.trim());
    return parts.join(" ").trim();
  }

  private interimFresh(now: number): boolean {
    return Boolean(this.interim.trim()) && now - this.interimAt < this.interimStaleMs;
  }

  private take(includeInterim: boolean): FireRequest | null {
    const question = this.text(includeInterim);
    const key = compact(question);
    if (!key || key === this.firedKey) return null;
    if (isBackchannel(question)) return null;
    this.firedKey = key;
    const continuation = this.firedInTurn;
    this.firedInTurn = true;
    return { question, turnId: this.turn, continuation };
  }

  otherFinal(text: string, now: number): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.finals.push(trimmed);
    this.interim = "";
    this.lastFinalAt = now;
  }

  otherInterim(text: string, now: number): void {
    this.interim = text;
    this.interimAt = now;
  }

  /** [自分] が喋り始めた（途中経過）。相手の番がまだ回っていなければ、待たずに回す。 */
  selfInterim(text: string, now: number): FireRequest | null {
    if (compact(text).length < SELF_MIN_CHARS) return null;
    if (this.finals.length === 0 || this.interimFresh(now)) return null;
    return this.take(false);
  }

  /** [自分] の確定。回していない相手の発言があれば回してから、番を閉じる。 */
  selfFinal(text: string, now: number): FireRequest | null {
    if (compact(text).length < SELF_MIN_CHARS) return null;
    const request = this.finals.length > 0 && !this.interimFresh(now) ? this.take(true) : null;
    this.closeTurn();
    return request;
  }

  /** 間を置いて回す頃合いか。回すなら、その中身を返す（同じ中身は二度返さない）。 */
  due(now: number): FireRequest | null {
    if (this.finals.length === 0) return null;
    if (now - this.lastFinalAt < this.debounceMs) return null;
    if (this.interimFresh(now)) return null;
    // 古い途中経過が残っていたら、それも言い終えたぶんとして含める。
    return this.take(true);
  }

  /** 本人がキー・ボタンで「今すぐ」と言った。途中経過も含めて回す（同じ中身でも回し直す）。 */
  force(): FireRequest | null {
    const question = this.text(true);
    if (!compact(question)) return null;
    this.firedKey = compact(question);
    const continuation = this.firedInTurn;
    this.firedInTurn = true;
    return { question, turnId: this.turn, continuation };
  }

  private closeTurn(): void {
    this.finals = [];
    this.interim = "";
    this.firedKey = "";
    this.firedInTurn = false;
    this.turn += 1;
  }

  /** 新しい面接を始めるときに忘れる。 */
  reset(): void {
    this.closeTurn();
    this.lastFinalAt = 0;
    this.interimAt = 0;
  }
}
