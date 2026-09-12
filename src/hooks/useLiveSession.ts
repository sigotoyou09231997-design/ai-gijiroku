import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiNotConfiguredError, analyzeTranscript } from "../lib/ai/client";
import { contextWindow, shouldAnalyze } from "../lib/analysis/schedule";
import { mergeActions, mergeQuestions, mergeTerms } from "../lib/analysis/merge";
import { newId, saveSession } from "../lib/db";
import { generateSummary } from "../lib/sessionSummary";
import {
  type AudioInputDevice,
  ensureMicPermission,
  listAudioInputs,
  loadChoice,
  reconcile,
  saveChoice,
  type SourceChoice,
} from "../lib/speech/devices";
import { getSpeechProvider, resolveSpeechProvider } from "../lib/speech";
import type { Speaker, SpeechProvider, SpeechRecognizer, SpeechSource } from "../lib/speech";
import { speakerLabel } from "../lib/types";
import type { ActionItem, DetectedQuestion, DetectedTerm, MeetingSession, TranscriptSegment } from "../lib/types";

export const SESSION_LABELS = ["打ち合わせ", "面接", "議事録"];

/** 解析するタイミングを見に行く間隔。判断そのものは shouldAnalyze が持つ。 */
const TICK_MS = 2_000;

export type LiveStatus = "idle" | "recording" | "finishing";

/** いま喋っている途中のぶん。話者ごとに別々に出す（同時に喋ることがあるため）。 */
export type InterimBySpeaker = Partial<Record<Speaker, string>>;

export interface LiveSession {
  status: LiveStatus;
  /** 音声認識が動いているか。止まっても、それまでのぶんは保存できるようにしておく。 */
  micActive: boolean;
  label: string;
  setLabel(label: string): void;
  segments: TranscriptSegment[];
  /** まだ確定していない、いま喋っているぶん。 */
  interim: InterimBySpeaker;
  questions: DetectedQuestion[];
  actions: ActionItem[];
  terms: DetectedTerm[];
  analyzing: boolean;
  speechError: string | null;
  aiError: string | null;
  /** 音声認識が使えるか（使えない理由つき）。 */
  speechAvailable: boolean;
  speechUnavailableReason: string | null;
  /** 使っている音声認識の名前（画面に出す）。 */
  speechLabel: string;
  /** 音源を話者ごとに分けて聞けるか。false なら下の設定欄は出さない。 */
  canSeparateSpeakers: boolean;
  /** 選べる入力デバイス。 */
  devices: AudioInputDevice[];
  /** いまの選択。 */
  sourceChoice: SourceChoice;
  setSourceChoice(choice: SourceChoice): void;
  refreshDevices(): Promise<void>;
  start(): void;
  /** 終了して保存する。保存したセッションのIDを返す（何も録れていなければ null）。 */
  finish(): Promise<string | null>;
}

/** AI に渡す行。誰の声か分かっているぶんには札を付ける。 */
function labeledLine(text: string, speaker: Speaker): string {
  const label = speakerLabel(speaker);
  return label ? `[${label}] ${text}` : text;
}

export function useLiveSession(): LiveSession {
  // 起動直後はブラウザ標準。Azure が使える設定ならすぐ差し替わる。
  const [provider, setProvider] = useState<SpeechProvider>(() => getSpeechProvider());
  const providerInfo = useMemo(() => provider.info(), [provider]);

  const [status, setStatus] = useState<LiveStatus>("idle");
  const [micActive, setMicActive] = useState(false);
  const [label, setLabel] = useState<string>(SESSION_LABELS[0]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState<InterimBySpeaker>({});
  const [questions, setQuestions] = useState<DetectedQuestion[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [terms, setTerms] = useState<DetectedTerm[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [sourceChoice, setSourceChoiceState] = useState<SourceChoice>(() => loadChoice());

  // 解析は setInterval から呼ぶので、最新の値を ref で持つ（state だと古い値を掴む）。
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const questionsRef = useRef<DetectedQuestion[]>([]);
  const actionsRef = useRef<ActionItem[]>([]);
  const termsRef = useRef<DetectedTerm[]>([]);
  /** すでにAIへ渡した確定ぶん（文脈として渡す）。 */
  const analyzedRef = useRef("");
  /** まだAIへ渡していない確定ぶん。 */
  const pendingRef = useRef("");
  const lastSentAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const labelRef = useRef(label);
  const choiceRef = useRef(sourceChoice);

  useEffect(() => {
    labelRef.current = label;
  }, [label]);
  useEffect(() => {
    choiceRef.current = sourceChoice;
  }, [sourceChoice]);

  // Azure が使える設定かをサーバーに聞いて、使える方に差し替える。
  useEffect(() => {
    let alive = true;
    void resolveSpeechProvider().then((p) => {
      if (alive) setProvider(() => p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    // 名前を読むには許可が要る。断られても一覧そのものは出す（名前が空になるだけ）。
    await ensureMicPermission();
    const found = await listAudioInputs();
    setDevices(found);
    setSourceChoiceState((current) => {
      const fixed = reconcile(current, found);
      if (fixed.selfDeviceId !== current.selfDeviceId || fixed.otherDeviceId !== current.otherDeviceId) {
        saveChoice(fixed);
      }
      return fixed;
    });
  }, []);

  // 分けて聞ける音声認識のときだけ、デバイスの一覧が要る。
  useEffect(() => {
    if (!providerInfo.supportsMultipleSources) return;
    void refreshDevices();
  }, [providerInfo.supportsMultipleSources, refreshDevices]);

  const setSourceChoice = useCallback((choice: SourceChoice) => {
    setSourceChoiceState(choice);
    saveChoice(choice);
  }, []);

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
        const mergedTerms = mergeTerms(termsRef.current, result.terms);
        if (mergedQuestions.added.length > 0) {
          questionsRef.current = mergedQuestions.items;
          setQuestions(mergedQuestions.items);
        }
        if (mergedActions.added.length > 0) {
          actionsRef.current = mergedActions.items;
          setActions(mergedActions.items);
        }
        if (mergedTerms.added.length > 0) {
          termsRef.current = mergedTerms.items;
          setTerms(mergedTerms.items);
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
    termsRef.current = [];
    analyzedRef.current = "";
    pendingRef.current = "";
    inFlightRef.current = false;
    lastSentAtRef.current = Date.now();
    sessionIdRef.current = newId();
    startedAtRef.current = Date.now();

    setSegments([]);
    setQuestions([]);
    setActions([]);
    setTerms([]);
    setInterim({});
    setSpeechError(null);
    setAiError(null);
    setAnalyzing(false);

    // 分けて聞けるときは、選んだデバイスを話者ごとに1本ずつ渡す。
    let sources: SpeechSource[] | undefined;
    if (providerInfo.supportsMultipleSources) {
      const choice = choiceRef.current;
      sources = [{ speaker: "self", deviceId: choice.selfDeviceId || undefined }];
      if (choice.otherDeviceId) {
        sources.push({ speaker: "other", deviceId: choice.otherDeviceId });
      }
    }

    const recognizer = provider.create({ lang: "ja-JP", sources });
    recognizerRef.current = recognizer;
    recognizer.start({
      onChunk: ({ text, isFinal, speaker }) => {
        if (!isFinal) {
          setInterim((current) => ({ ...current, [speaker]: text }));
          return;
        }
        setInterim((current) => ({ ...current, [speaker]: "" }));
        const trimmed = text.trim();
        if (!trimmed) return;
        const line = labeledLine(trimmed, speaker);
        pendingRef.current = pendingRef.current ? `${pendingRef.current}\n${line}` : line;
        const segment: TranscriptSegment = { id: newId(), text: trimmed, at: Date.now(), speaker };
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
  }, [provider, providerInfo.available, providerInfo.supportsMultipleSources]);

  const finish = useCallback(async (): Promise<string | null> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return null;

    setStatus("finishing");
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setMicActive(false);
    setInterim({});

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
      terms: termsRef.current,
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
    terms,
    analyzing,
    speechError,
    aiError,
    speechAvailable: providerInfo.available,
    speechUnavailableReason: providerInfo.reason ?? null,
    speechLabel: providerInfo.label,
    canSeparateSpeakers: providerInfo.supportsMultipleSources,
    devices,
    sourceChoice,
    setSourceChoice,
    refreshDevices,
    start,
    finish,
  };
}
