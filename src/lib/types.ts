/** セッション1件ぶんの型。Dexie に入れるものと、画面が扱うものはここに集約する。 */

import type { Speaker } from "./speech/types";

export type { Speaker };

/** 文字起こしの1発話（確定したぶんだけ入る）。 */
export interface TranscriptSegment {
  id: string;
  text: string;
  /** epoch ms */
  at: number;
  /**
   * 誰の声か。音源を分けて聞けるとき（Azure）だけ self / other が入る。
   * 1本にまとめて聞いていたとき、および この項目より前に保存したセッションは undefined。
   */
  speaker?: Speaker;
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

/** 会話に出てきた、聞き慣れない用語・固有名詞とその説明。 */
export interface DetectedTerm {
  id: string;
  term: string;
  /** AIの一般知識にもとづく説明。ネット検索はしていない。 */
  explanation: string;
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
  terms: DetectedTerm[];
  summary?: SessionSummary;
  /** 要約の生成に失敗したときの理由（画面に出して、あとで作り直せるようにする）。 */
  summaryError?: string;
}

/** 文字起こしの全文。保存はセグメント単位で持ち、全文はここで組み立てる。 */
export function transcriptText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join("\n");
}

/** 画面に出す話者の名前。 */
export function speakerLabel(speaker: Speaker | undefined): string | null {
  if (speaker === "self") return "自分";
  if (speaker === "other") return "相手";
  return null;
}

/**
 * AI に渡す全文。誰の声か分かっているぶんには札を付ける。
 * これがあると「本人が発した質問か、相手から本人への質問か」を推測せずに判定できる。
 */
export function labeledTranscriptText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const label = speakerLabel(s.speaker);
      return label ? `[${label}] ${s.text}` : s.text;
    })
    .join("\n");
}
