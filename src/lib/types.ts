/** セッション1件ぶんの型。Dexie に入れるものと、画面が扱うものはここに集約する。 */

/** 文字起こしの1発話（確定したぶんだけ入る）。 */
export interface TranscriptSegment {
  id: string;
  text: string;
  /** epoch ms */
  at: number;
}

/** 会話の中で自分に向けられた質問と、その場で出した回答案。 */
export interface DetectedQuestion {
  id: string;
  question: string;
  /** カンペ。箇条書きではなく、そのまま口に出せる長さの文にする。 */
  answer: string;
  /** epoch ms */
  at: number;
}

/** 決まったこと（decision）／やることになったこと（todo）。 */
export interface ActionItem {
  id: string;
  kind: "decision" | "todo";
  text: string;
  /** 担当。会話から読み取れないときは undefined。 */
  owner?: string;
  /** 期限。会話に出てきた表現をそのまま入れる（「今週中」など）。 */
  due?: string;
  /** epoch ms */
  at: number;
}

/** セッション終了後にまとめて作る議事録風のまとめ。 */
export interface SessionSummary {
  /** 要点 */
  points: string[];
  /** 決定事項 */
  decisions: string[];
  /** 宿題事項 */
  todos: string[];
  /** 全体を短くまとめた文章 */
  overview: string;
}

/** 面接／打ち合わせ／議事録 などの区別。中身は自由入力。 */
export type SessionLabel = string;

export interface MeetingSession {
  id: string;
  label: SessionLabel;
  /** epoch ms */
  startedAt: number;
  /** epoch ms。録音中は undefined。 */
  endedAt?: number;
  segments: TranscriptSegment[];
  questions: DetectedQuestion[];
  actions: ActionItem[];
  summary?: SessionSummary;
  /** 要約の生成に失敗したときの理由（画面に出して、あとで作り直せるようにする）。 */
  summaryError?: string;
}

/** 文字起こしの全文。保存はセグメント単位で持ち、全文はここで組み立てる。 */
export function transcriptText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join("\n");
}
