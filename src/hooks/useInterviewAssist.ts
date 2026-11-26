import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newId } from "../lib/db";
import {
  InterviewRequestError,
  prewarmInterview,
  streamInterviewAnswer,
  type InterviewDone,
  type InterviewStage,
} from "../lib/interview/client";
import { matchQa, parseQaBank, serializeQaBank, type QaMatch, type QaPair } from "../lib/interview/qaBank";
import { answerPlainText, parseAnswer, type AnswerLine, type ParsedAnswer } from "../lib/interview/protocol";
import { extractSpeechPhrases } from "../lib/interview/phrases";
import { loadMaterials, loadPrefs, type InterviewMaterials, type InterviewPrefs } from "../lib/interview/settings";
import { TurnTracker, type FireRequest } from "../lib/interview/trigger";
import { questionsToMarkdown, type ExportItem } from "../lib/interview/exportQuestions";
import type { Speaker } from "../lib/speech/types";
import type { InterviewQuestionRecord } from "../lib/types";

/** 直近の会話としてモデルに渡す長さ（文字）。前の流れから質問の意図を読ませるため、analyze より長くする。 */
export const INTERVIEW_CONTEXT_CHARS = 4_000;
/** 面接官の1回の番として渡す長さの上限（長い説明の後ろの方に質問が来るので、後ろから取る）。 */
const QUESTION_CHARS = 1_500;
/** 間を置いて回すかを見に行く間隔。 */
const TICK_MS = 150;

export type StageStatus = "streaming" | "done" | "error" | "aborted";

export interface StageView {
  status: StageStatus;
  text: string;
  /** 回し始めてから最初の文字が届くまで（ミリ秒）。 */
  firstMs?: number;
  /** 回し始めてから全部届くまで（ミリ秒）。 */
  totalMs?: number;
  error?: string;
  done?: InterviewDone;
}

export interface InterviewCard {
  id: string;
  turnId: number;
  /** 面接官の発言（文字起こしのまま）。 */
  question: string;
  at: number;
  /** 手元の照合で当たった想定問答（API を待たずに出す）。 */
  local: QaMatch | null;
  quick: StageView;
  full: StageView;
  /** キー・ボタンで本人が回した。 */
  manual: boolean;
}

export interface CardView extends InterviewCard {
  quickParsed: ParsedAnswer;
  fullParsed: ParsedAnswer;
  /**
   * 1段目（速報）のうち、画面に出してよい行。
   * 速報は想定問答を土台にできたとき（@想定 が1以上）だけ出す。評価で、想定外の質問への速報は
   * 12問中2〜4問で経歴に無いことを足していた（土台がある質問では36問とも経歴どおり）。
   */
  quickLines: AnswerLine[];
  /** 画面に出すか（質問ではないと判断されたものは出さない）。 */
  visible: boolean;
  /** 土台にした想定問答（AI の判断があればそちら、無ければ手元の照合）。 */
  qa: { index: number; pair: QaPair; byModel: boolean } | null;
  noExperience: boolean;
}

export interface InterviewAssist {
  materials: InterviewMaterials;
  prefs: InterviewPrefs;
  pairs: QaPair[];
  /** 音声認識に渡す「よく出る言葉」。 */
  phrases: string[];
  cards: CardView[];
  /** いま回答を作っている最中か。 */
  busy: boolean;
  error: string | null;
  handleFinal(speaker: Speaker, text: string): void;
  handleInterim(speaker: Speaker, text: string): void;
  /** キー・ボタン: いまの面接官の発言で、すぐ回答を作る。 */
  triggerNow(): void;
  /** リハーサル: 打ち込んだ文を、その人の発言として流す（相手なら、待たずに回す）。 */
  rehearse(text: string, speaker: "other" | "self"): void;
  /** 新しい面接を始める。 */
  reset(): void;
  /** 材料を AI 側に先に読ませておく。 */
  prewarm(): void;
  /** 材料を読み直す（設定を変えたあと）。 */
  reload(): void;
  /** セッションに残す、聞かれた質問の一覧。 */
  records(): InterviewQuestionRecord[];
  exportMarkdown(title: string): string;
}

function emptyStage(): StageView {
  return { status: "streaming", text: "" };
}

export function viewCard(card: InterviewCard, pairs: QaPair[]): CardView {
  const quickParsed = parseAnswer(card.quick.text, card.quick.status === "done");
  const fullParsed = parseAnswer(card.full.text, card.full.status === "done");
  const fullHasContent = fullParsed.lines.length > 0;
  const quickGrounded = !quickParsed.skip && quickParsed.qaRef !== undefined && pairs[quickParsed.qaRef - 1] !== undefined;
  const quickLines = quickGrounded ? quickParsed.lines : [];
  const quickHasContent = quickLines.length > 0;
  // 2段目（正確な方）が「質問ではない」と言ったら、1段目や手元の照合より優先して出さない。
  const fullSaysSkip = fullParsed.skip;
  const visible = !fullSaysSkip && (fullHasContent || quickHasContent || card.local !== null);

  const modelRef = fullParsed.qaRef ?? (fullHasContent ? undefined : quickParsed.qaRef);
  let qa: CardView["qa"] = null;
  if (modelRef && pairs[modelRef - 1]) {
    qa = { index: modelRef - 1, pair: pairs[modelRef - 1], byModel: true };
  } else if (!fullHasContent && card.local && pairs[card.local.index]) {
    // AI がまだ何も言っていない間だけ、手元の照合を出す。
    qa = { index: card.local.index, pair: pairs[card.local.index], byModel: false };
  }
  return {
    ...card,
    quickParsed,
    fullParsed,
    quickLines,
    visible,
    qa,
    noExperience: fullHasContent ? fullParsed.noExperience : quickParsed.noExperience,
  };
}

function labeledLine(speaker: Speaker, text: string): string {
  if (speaker === "self") return `[自分] ${text}`;
  if (speaker === "other") return `[相手] ${text}`;
  return text;
}

/** 今の番（末尾の [相手] の行）を除いた、直近の会話。 */
export function contextBefore(lines: string[], limit: number = INTERVIEW_CONTEXT_CHARS): string {
  let end = lines.length;
  while (end > 0 && lines[end - 1].startsWith("[相手]")) end -= 1;
  const joined = lines.slice(0, end).join("\n");
  return joined.length <= limit ? joined : joined.slice(joined.length - limit);
}

export function useInterviewAssist(enabled: boolean): InterviewAssist {
  const [materials, setMaterials] = useState<InterviewMaterials>(() => loadMaterials());
  const [prefs, setPrefs] = useState<InterviewPrefs>(() => loadPrefs());
  const [cards, setCards] = useState<InterviewCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pairs = useMemo(() => parseQaBank(materials.qaBank), [materials.qaBank]);
  const qaText = useMemo(() => serializeQaBank(pairs), [pairs]);
  const phrases = useMemo(
    () => extractSpeechPhrases(materials.company, materials.profile),
    [materials.company, materials.profile],
  );

  const trackerRef = useRef(new TurnTracker());
  const linesRef = useRef<string[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const cardsRef = useRef<InterviewCard[]>([]);
  const enabledRef = useRef(enabled);
  const inputsRef = useRef({ materials, prefs, pairs, qaText });

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    inputsRef.current = { materials, prefs, pairs, qaText };
  }, [materials, prefs, pairs, qaText]);

  const commit = useCallback((next: InterviewCard[]) => {
    cardsRef.current = next;
    setCards(next);
  }, []);

  const updateStage = useCallback(
    (cardId: string, stage: InterviewStage, change: (current: StageView) => StageView) => {
      const next = cardsRef.current.map((card) =>
        card.id === cardId ? { ...card, [stage]: change(card[stage]) } : card,
      );
      commit(next);
    },
    [commit],
  );

  const fire = useCallback(
    (request: FireRequest, manual: boolean) => {
      const { materials: m, prefs: p, pairs: bank, qaText: qa } = inputsRef.current;
      // 作りかけの回答は止める（新しい質問・言い足しが来たので）。
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const question =
        request.question.length > QUESTION_CHARS
          ? request.question.slice(request.question.length - QUESTION_CHARS)
          : request.question;
      const previous = cardsRef.current[0];
      const reuse = request.continuation && previous && previous.turnId === request.turnId;
      const card: InterviewCard = {
        id: reuse ? previous.id : newId(),
        turnId: request.turnId,
        question,
        at: Date.now(),
        local: matchQa(question, bank),
        quick: emptyStage(),
        full: emptyStage(),
        manual,
      };
      // 止めた方の回答は、途中まで出ていたぶんを残して「止めた」にする。
      const rest = cardsRef.current
        .filter((item) => item.id !== card.id)
        .map((item) => ({
          ...item,
          quick: item.quick.status === "streaming" ? { ...item.quick, status: "aborted" as const } : item.quick,
          full: item.full.status === "streaming" ? { ...item.full, status: "aborted" as const } : item.full,
        }));
      commit([card, ...rest]);
      setBusy(true);
      setError(null);

      const context = contextBefore(linesRef.current);
      const started = performance.now();
      const run = async (stage: InterviewStage) => {
        let first = 0;
        try {
          const done = await streamInterviewAnswer(
            {
              stage,
              profile: m.profile,
              company: m.company,
              qa,
              context,
              question,
              model: p.fullModel,
              effort: p.effort,
            },
            {
              onText(delta) {
                if (controller.signal.aborted) return;
                if (!first) first = performance.now();
                updateStage(card.id, stage, (current) => ({
                  ...current,
                  text: current.text + delta,
                  firstMs: current.firstMs ?? Math.round(first - started),
                }));
              },
            },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          updateStage(card.id, stage, (current) => ({
            ...current,
            status: "done",
            totalMs: Math.round(performance.now() - started),
            done,
          }));
        } catch (err) {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : "回答を作れませんでした。";
          updateStage(card.id, stage, (current) => ({ ...current, status: "error", error: message }));
          // 本人にしか直せない失敗（キー・残高）は、面接中でも目に入るように上にも出す。
          if (err instanceof InterviewRequestError && err.needsOwner) setError(message);
        }
      };
      void Promise.all([run("quick"), run("full")]).finally(() => {
        if (controllerRef.current === controller) setBusy(false);
      });
    },
    [commit, updateStage],
  );

  // 間を置いて回す。状態はすべて ref にあるので、短い間隔で見に行くだけ。
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!enabledRef.current) return;
      const request = trackerRef.current.due(Date.now());
      if (request) fire(request, false);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [fire]);

  // 画面を離れるときは、作りかけの回答を止める。
  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleFinal = useCallback(
    (speaker: Speaker, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      linesRef.current = [...linesRef.current, labeledLine(speaker, trimmed)];
      if (!enabledRef.current) return;
      const now = Date.now();
      if (speaker === "other") {
        trackerRef.current.otherFinal(trimmed, now);
      } else if (speaker === "self") {
        const request = trackerRef.current.selfFinal(trimmed, now);
        if (request) fire(request, false);
      }
    },
    [fire],
  );

  const handleInterim = useCallback(
    (speaker: Speaker, text: string) => {
      if (!enabledRef.current) return;
      const now = Date.now();
      if (speaker === "other") {
        trackerRef.current.otherInterim(text, now);
      } else if (speaker === "self") {
        const request = trackerRef.current.selfInterim(text, now);
        if (request) fire(request, false);
      }
    },
    [fire],
  );

  const triggerNow = useCallback(() => {
    const request = trackerRef.current.force();
    if (request) {
      fire(request, true);
      return;
    }
    // 今の番に面接官の発言が無ければ、直前の質問で作り直す。
    const last = cardsRef.current[0];
    if (last) fire({ question: last.question, turnId: last.turnId, continuation: true }, true);
  }, [fire]);

  const rehearse = useCallback(
    (text: string, speaker: "other" | "self") => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (speaker === "self") {
        handleFinal("self", trimmed);
        return;
      }
      // 打ち込みは1回ごとに別の質問（音声と違い、続けて送っても言い足しではない）。
      trackerRef.current.newTurn();
      handleFinal("other", trimmed);
      // 打ち込みは言い終えているので、待たずに回す。
      const request = trackerRef.current.force();
      if (request) fire(request, true);
    },
    [fire, handleFinal],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    trackerRef.current.reset();
    linesRef.current = [];
    commit([]);
    setBusy(false);
    setError(null);
  }, [commit]);

  const prewarm = useCallback(() => {
    const { materials: m, prefs: p, qaText: qa } = inputsRef.current;
    if (!m.profile && !qa) return;
    void prewarmInterview({ profile: m.profile, company: m.company, qa, model: p.fullModel, effort: p.effort });
  }, []);

  const reload = useCallback(() => {
    setMaterials(loadMaterials());
    setPrefs(loadPrefs());
  }, []);

  // 設定を別のタブで変えたときも追いかける。
  useEffect(() => {
    const onStorage = () => reload();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  const views = useMemo(() => cards.map((card) => viewCard(card, pairs)), [cards, pairs]);

  const exportItems = useCallback((): ExportItem[] => {
    return cardsRef.current
      .map((card) => viewCard(card, inputsRef.current.pairs))
      .filter((card) => card.visible)
      .reverse()
      .map((card) => ({
        question: card.fullParsed.title || card.question,
        qaRef: card.qa ? card.qa.index + 1 : undefined,
        noExperience: card.noExperience || undefined,
        answer: answerPlainText(
          card.fullParsed.lines.length > 0 ? card.fullParsed : { ...card.quickParsed, lines: card.quickLines },
        ),
      }));
  }, []);

  const records = useCallback(
    (): InterviewQuestionRecord[] =>
      cardsRef.current
        .map((card) => viewCard(card, inputsRef.current.pairs))
        .filter((card) => card.visible)
        .reverse()
        .map((card) => ({
          id: card.id,
          question: card.fullParsed.title || card.question,
          at: card.at,
          ...(card.qa ? { qaRef: card.qa.index + 1 } : {}),
          ...(card.noExperience ? { noExperience: true } : {}),
        })),
    [],
  );

  const exportMarkdown = useCallback((title: string) => questionsToMarkdown(exportItems(), title), [exportItems]);

  return {
    materials,
    prefs,
    pairs,
    phrases,
    cards: views,
    busy,
    error,
    handleFinal,
    handleInterim,
    triggerNow,
    rehearse,
    reset,
    prewarm,
    reload,
    records,
    exportMarkdown,
  };
}
