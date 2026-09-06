import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiNotConfiguredError, analyzeTranscript } from "../lib/ai/client";
import { contextWindow, shouldAnalyze } from "../lib/analysis/schedule";
import { mergeActions, mergeQuestions } from "../lib/analysis/merge";
import { newId, saveSession } from "../lib/db";
import { generateSummary } from "../lib/sessionSummary";
import { getSpeechProvider } from "../lib/speech";
import type { SpeechRecognizer } from "../lib/speech";
import type { ActionItem, DetectedQuestion, MeetingSession, TranscriptSegment } from "../lib/types";

export const SESSION_LABELS = ["打ち合わせ", "面接", "議事録"];

/** 解析するタイミングを見に行く間隔。判断そのものは shouldAnalyze が持つ。 */
const TICK_MS = 2_000;

export type LiveStatus = "idle" | "recording" | "finishing";

export interface LiveSession {
  status: LiveStatus;
  /** 音声認識が動いているか。止まっても、それまでのぶんは保存できるようにしておく。 */
  micActive: boolean;
  label: string;
  setLabel(label: string): void;
  segments: TranscriptSegment[];
  /** まだ確定していない、いま喋っているぶん。 */
  interim: string;
  questions: DetectedQuestion[];
  actions: ActionItem[];
  analyzing: boolean;
  speechError: string | null;
  aiError: string | null;
  /** 音声認識が使えるか（使えない理由つき）。 */
  speechAvailable: boolean;
  speechUnavailableReason: string | null;
  start(): void;
  /** 終了して保存する。保存したセッションのIDを返す（何も録れていなければ null）。 */
  finish(): Promise<string | null>;
}

export function useLiveSession(): LiveSession {
  const provider = useMemo(() => getSpeechProvider(), []);
  const providerInfo = useMemo(() => provider.info(), [provider]);

  const [status, setStatus] = useState<LiveStatus>("idle");
  const [micActive, setMicActive] = useState(false);
  const [label, setLabel] = useState<string>(SESSION_LABELS[0]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [questions, setQuestions] = useState<DetectedQuestion[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // 解析は setInterval から呼ぶので、最新の値を ref で持つ（state だと古い値を掴む）。
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const questionsRef = useRef<DetectedQuestion[]>([]);
  const actionsRef = useRef<ActionItem[]>([]);
  /** すでにAIへ渡した確定ぶん（文脈として渡す）。 */
  const analyzedRef = useRef("");
  /** まだAIへ渡していない確定ぶん。 */
  const pendingRef = useRef("");
  const lastSentAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const labelRef = useRef(label);

  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  const runAnalyze = useCallback(
    async (force: boolean): Promise<void> => {
      const now = Date.now();
      const state = {
        pendingText: pendingRef.current,
        lastSentAt: lastSentAtRef.current,
        inFlight: inFlightRef.current,
      };
      if (inFlightRef.current) return;
      if (!force && !shouldAnalyze(state, now)) return;

      const recent = pendingRef.current.trim();
      if (!recent) return;

      const context = contextWindow(analyzedRef.current);
      pendingRef.current = "";
      // 失敗しても同じところを何度も投げ直さない（会話は先に進んでいくため）。
      analyzedRef.current = analyzedRef.current ? `${analyzedRef.current}\n${recent}` : recent;
      inFlightRef.current = true;
      lastSentAtRef.current = now;
      setAnalyzing(true);

      try {
        const result = await analyzeTranscript({ context, recent, label: labelRef.current }, Date.now());
        const mergedQuestions = mergeQuestions(questionsRef.current, result.questions);
        const mergedActions = mergeActions(actionsRef.current, result.actions);
        if (mergedQuestions.added.length > 0) {
          questionsRef.current = mergedQuestions.items;
          setQuestions(mergedQuestions.items);
        }
        if (mergedActions.added.length > 0) {
          actionsRef.current = mergedActions.items;
          setActions(mergedActions.items);
        }
        setAiError(null);
      } catch (error) {
        const message =
          error instanceof AiNotConfiguredError
            ? error.message
            : error instanceof Error
              ? error.message
              : "AIの呼び出しに失敗しました。";
        setAiError(message);
      } finally {
        inFlightRef.current = false;
        setAnalyzing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      void runAnalyze(false);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [status, runAnalyze]);

  // 画面を離れるときにマイクを掴んだままにしない。
  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (!providerInfo.available) return;

    segmentsRef.current = [];
    questionsRef.current = [];
    actionsRef.current = [];
    analyzedRef.current = "";
    pendingRef.current = "";
    inFlightRef.current = false;
    lastSentAtRef.current = Date.now();
    sessionIdRef.current = newId();
    startedAtRef.current = Date.now();

    setSegments([]);
    setQuestions([]);
    setActions([]);
    setInterim("");
    setSpeechError(null);
    setAiError(null);
    setAnalyzing(false);

    const recognizer = provider.create({ lang: "ja-JP" });
    recognizerRef.current = recognizer;
    recognizer.start({
      onChunk: ({ text, isFinal }) => {
        if (!isFinal) {
          setInterim(text);
          return;
        }
        setInterim("");
        const trimmed = text.trim();
        if (!trimmed) return;
        pendingRef.current = pendingRef.current ? `${pendingRef.current}\n${trimmed}` : trimmed;
        const segment: TranscriptSegment = { id: newId(), text: trimmed, at: Date.now() };
        segmentsRef.current = [...segmentsRef.current, segment];
        setSegments(segmentsRef.current);
      },
      onError: (message) => {
        setSpeechError(message);
        setMicActive(false);
        recognizerRef.current?.stop();
        recognizerRef.current = null;
      },
    });

    setMicActive(true);
    setStatus("recording");
  }, [provider, providerInfo.available]);

  const finish = useCallback(async (): Promise<string | null> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return null;

    setStatus("finishing");
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setMicActive(false);
    setInterim("");

    // 最後に喋ったぶんも拾ってから閉じる。
    await runAnalyze(true);

    if (segmentsRef.current.length === 0) {
      sessionIdRef.current = null;
      setStatus("idle");
      return null;
    }

    const session: MeetingSession = {
      id: sessionId,
      label: labelRef.current,
      startedAt: startedAtRef.current,
      endedAt: Date.now(),
      segments: segmentsRef.current,
      questions: questionsRef.current,
      actions: actionsRef.current,
    };
    await saveSession(session);

    // 要約は時間がかかるので待たない。画面は先に進み、できたところで表示が入れ替わる。
    void generateSummary(sessionId);

    sessionIdRef.current = null;
    setStatus("idle");
    return sessionId;
  }, [runAnalyze]);

  return {
    status,
    micActive,
    label,
    setLabel,
    segments,
    interim,
    questions,
    actions,
    analyzing,
    speechError,
    aiError,
    speechAvailable: providerInfo.available,
    speechUnavailableReason: providerInfo.reason ?? null,
    start,
    finish,
  };
}
