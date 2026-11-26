/**
 * 面接モードの材料（経歴・会社の情報・想定問答）と設定の置き場所。
 *
 * **このブラウザの localStorage だけに置く。** リポジトリにもサーバーにも保存しない
 * （サーバーへは回答を作るリクエストのたびに送るが、向こうでは残さない）。
 * セッションの控え（Vercel Blob）にも入れない。
 */

export type FullModelChoice = "opus" | "fable";
export type EffortChoice = "low" | "medium" | "high";

export interface InterviewMaterials {
  profile: string;
  company: string;
  qaBank: string;
}

export interface InterviewPrefs {
  /** 2段目（詳しい回答）のモデル。 */
  fullModel: FullModelChoice;
  /** 2段目の考える深さ。 */
  effort: EffortChoice;
  /** 速いモード（Fable 5.2 だけ。料金は2倍）。 */
  fast: boolean;
}

/**
 * 既定の2段目。評価（24問）で Opus 5.5 / Fable 5.2 × low / medium の4通りを比べ、
 * 経歴への忠実さ・答えになっている率はどれも同じだったので、全文が一番速く出た Fable 5.2 の low にした。
 * サーバー側の既定（api/interview.ts）と揃える。
 */
export const DEFAULT_PREFS: InterviewPrefs = { fullModel: "fable", effort: "low", fast: true };

export const FULL_MODEL_LABELS: Record<FullModelChoice, string> = {
  opus: "Claude Opus 5.5",
  fable: "Claude Fable 5.2",
};

export const EFFORT_LABELS: Record<EffortChoice, string> = {
  low: "速さ優先（low）",
  medium: "標準（medium）",
  high: "じっくり（high）",
};

/** 1欄あたりの上限（文字）。サーバー側の上限と揃える。 */
export const MATERIAL_LIMIT = 30_000;

const KEYS = {
  profile: "gijiroku.interview.profile",
  company: "gijiroku.interview.company",
  qaBank: "gijiroku.interview.qaBank",
  prefs: "gijiroku.interview.prefs",
} as const;

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string): boolean {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadMaterials(): InterviewMaterials {
  return { profile: read(KEYS.profile), company: read(KEYS.company), qaBank: read(KEYS.qaBank) };
}

/** 保存できなかった（容量・プライベートモード）ときは false。 */
export function saveMaterial(field: keyof InterviewMaterials, value: string): boolean {
  return write(KEYS[field], value);
}

function isFullModel(value: unknown): value is FullModelChoice {
  return value === "opus" || value === "fable";
}

function isEffort(value: unknown): value is EffortChoice {
  return value === "low" || value === "medium" || value === "high";
}

export function loadPrefs(): InterviewPrefs {
  const raw = read(KEYS.prefs);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<InterviewPrefs>;
    return {
      fullModel: isFullModel(parsed.fullModel) ? parsed.fullModel : DEFAULT_PREFS.fullModel,
      effort: isEffort(parsed.effort) ? parsed.effort : DEFAULT_PREFS.effort,
      fast: typeof parsed.fast === "boolean" ? parsed.fast : DEFAULT_PREFS.fast,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: InterviewPrefs): void {
  write(KEYS.prefs, JSON.stringify(prefs));
}

/** 場面の名前から、面接モードかどうかを決める（「面接」「一次面接」「カジュアル面談」など）。 */
export function isInterviewLabel(label: string): boolean {
  return /面接|面談/.test(label);
}
