/**
 * いつAIに投げるかの判断だけを切り出したもの。
 * 会話中に毎回投げると重くて高いので、「ある程度たまった」か「少したまって時間が経った」で送る。
 */

/** これだけ溜まったら、時間を待たずにすぐ送る。 */
export const IMMEDIATE_CHARS = 120;
/** これ以上溜まっていれば、下の間隔が空いたところで送る。 */
export const MIN_CHARS = 20;
/** 上の最小量で待つ間隔（ミリ秒）。 */
export const MIN_INTERVAL_MS = 12_000;
/** 直前の会話としてAIに渡す文脈の長さ（文字）。 */
export const CONTEXT_CHARS = 1_200;

export interface ScheduleState {
  /** まだAIに投げていない、確定ぶんの文字起こし。 */
  pendingText: string;
  /** 前回投げた時刻（epoch ms）。まだ一度も投げていなければ 0。 */
  lastSentAt: number;
  /** いま解析中か。前の返事を待っているあいだは重ねて投げない。 */
  inFlight: boolean;
}

export function shouldAnalyze(state: ScheduleState, now: number): boolean {
  if (state.inFlight) return false;
  const length = state.pendingText.trim().length;
  if (length === 0) return false;
  if (length >= IMMEDIATE_CHARS) return true;
  return length >= MIN_CHARS && now - state.lastSentAt >= MIN_INTERVAL_MS;
}

/** AIに渡す「直前の会話」。長くなりすぎないように後ろから切る。 */
export function contextWindow(transcript: string, limit: number = CONTEXT_CHARS): string {
  if (transcript.length <= limit) return transcript;
  return transcript.slice(transcript.length - limit);
}
