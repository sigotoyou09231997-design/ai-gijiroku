import Dexie, { type Table } from "dexie";
import type { MeetingSession } from "./types";

/**
 * この端末だけのローカル保存（IndexedDB）。他端末との同期は今回は対象外。
 * セッションは1レコードで完結させる（文字起こし・質問と回答案・決定事項・要約を同じ行に持つ）。
 */
export class GijirokuDb extends Dexie {
  sessions!: Table<MeetingSession, string>;

  constructor() {
    super("ai-gijiroku");
    this.version(1).stores({
      sessions: "id, startedAt, label",
    });
  }
}

export const db = new GijirokuDb();

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveSession(session: MeetingSession): Promise<void> {
  await db.sessions.put(session);
}

/** 用語検出を足す前に保存されたセッションには terms が無いので、無ければ空配列で補う。 */
function withTerms(session: MeetingSession): MeetingSession {
  return session.terms ? session : { ...session, terms: [] };
}

export async function loadSession(id: string): Promise<MeetingSession | undefined> {
  const session = await db.sessions.get(id);
  return session ? withTerms(session) : session;
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

/** 新しいものが上に来る並びで返す。 */
export async function listSessions(): Promise<MeetingSession[]> {
  const sessions = await db.sessions.orderBy("startedAt").reverse().toArray();
  return sessions.map(withTerms);
}
