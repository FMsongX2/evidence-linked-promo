"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FolderOpen, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CheckItem } from "@/lib/check";
import { resizeImage } from "@/lib/client-image";
import type { Card, Conflict, Generation, Guideline, LlmMeta, PhotoReading, Sentence, SourceDoc, Warning } from "@/lib/schemas";
import { blogScope, flattenGeneration, replaceSentence } from "@/lib/sentences";
import { cardStatus, reverifyCard } from "@/lib/verify";
import { cn } from "@/lib/utils";
import { formatMs, postJson, type Brand, type CheckResult, type ExampleSnapshot, type Photo, type Providers } from "./model";
import { StepSources } from "./step-sources";
import { StepPhotos } from "./step-photos";
import { StepContent } from "./step-content";
import { StepCheck } from "./step-check";

type Config = {
  providers: Providers;
  deployed: boolean;
  limits: { photos: number; photoBytes: number; pdfBytes: number; pasteChars: number };
  data: { available: boolean; docs: number; photos: number };
};

export type TlinkPhoto = {
  file: string;
  url: string;
  sourceUrl: string;
  pageUrl?: string;
  caption?: string;
  alt?: string;
  industry?: string;
  officialFieldPhoto?: boolean;
  note?: string;
  license?: string;
  width?: number;
  height?: number;
};
export type PageImage = { src: string; alt: string; pageUrl: string };

type Job = "cards" | "photos" | "generate" | "check" | "paste" | "regen" | "load";
export type JobState = { running: boolean; error: string | null; startedAt: number | null };
const idle: JobState = { running: false, error: null, startedAt: null };

const EXAMPLE_URL = "/demo/example.json";
const PHOTO_IDS = ["P1", "P2", "P3", "P4", "P5"];

export type AutoStage = "cards" | "photos" | "generate" | "check" | "done";
export const AUTO_STAGE_LABEL: Record<AutoStage, string> = { cards: "차별점 카드", photos: "사진 판독", generate: "초안 생성", check: "게시 전 점검", done: "점검 끝난 초안" };
export type AutoState = {
  running: boolean;
  startedAt: number;
  stage: AutoStage;
  steps: Record<string, number>;
  totalMs: number | null;
  error: string | null;
  actionsDuring: number | null;
};

export type LinkDecision = "confirmed" | "auto" | "rejected";

/** 확정(사람 또는 자동)한 연결만 남기고, 확정 연결이 없는 사진은 뺀다. */
export function confirmedReadings(readings: PhotoReading[], decisions: Record<string, LinkDecision>): PhotoReading[] {
  return readings
    .map((r) => ({ ...r, links: r.links.filter((l) => ["confirmed", "auto"].includes(decisions[`${r.photoId}:${l.cardId}`] ?? "")) }))
    .filter((r) => r.links.length > 0);
}

function normUrl(u?: string) {
  return (u ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export function useWorkbench() {
  const [config, setConfig] = useState<Config | null>(null);
  const [mode, setMode] = useState<"live" | "example">("live");
  const [exampleSavedAt, setExampleSavedAt] = useState<string | null>(null);
  const [exampleProviders, setExampleProviders] = useState<Providers | null>(null);
  const [company, setCompany] = useState("");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [guideline, setGuideline] = useState<Guideline | null>(null);
  const [tlinkPhotos, setTlinkPhotos] = useState<TlinkPhoto[]>([]);
  const [pageImages, setPageImages] = useState<PageImage[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [readings, setReadings] = useState<PhotoReading[]>([]);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checkStale, setCheckStale] = useState(false);
  const [approved, setApproved] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteResult, setPasteResult] = useState<CheckResult | null>(null);
  const [pasteRun, setPasteRun] = useState(0);
  /** 사진-카드 연결의 사람 확정. 키는 "P1:C2" */
  const [linkDecisions, setLinkDecisions] = useState<Record<string, LinkDecision>>({});
  const [boardImported, setBoardImported] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<Record<string, number> | null>(null);
  const [metas, setMetas] = useState<LlmMeta[]>([]);
  const [photoStartAt, setPhotoStartAt] = useState<number | null>(null);
  const [photoToDraftMs, setPhotoToDraftMs] = useState<number | null>(null);
  const [jobs, setJobs] = useState<Record<Job, JobState>>({ cards: idle, photos: idle, generate: idle, check: idle, paste: idle, regen: idle, load: idle });
  const [auto, setAuto] = useState<AutoState | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ name: string; page: number; total: number; emptyPages: number | null } | null>(null);
  /** 사람이 누른 횟수(측정 기록용) */
  const [userActions, setUserActions] = useState(0);
  const userActionsRef = useRef(0);
  const tap =
    <A extends unknown[], R>(fn: (...a: A) => R) =>
    (...a: A) => {
      userActionsRef.current += 1;
      setUserActions(userActionsRef.current);
      return fn(...a);
    };

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const setJob = (j: Job, s: Partial<JobState>) => setJobs((prev) => ({ ...prev, [j]: { ...prev[j], ...s } }));

  async function runJob<T>(j: Job, fn: () => Promise<T>): Promise<T | null> {
    setJob(j, { running: true, error: null, startedAt: Date.now() });
    try {
      const r = await fn();
      setJob(j, { running: false });
      return r;
    } catch (e) {
      setJob(j, { running: false, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  const live = mode === "live";
  /** 모델 호출이 가능한지와 불가능한 이유 */
  const modelBlock: string | null = !live
    ? "미리 계산한 예시 결과를 보는 중입니다. '처음부터 직접 실행'을 누르면 직접 실행할 수 있습니다."
    : !config
      ? "서버 설정을 불러오는 중입니다."
      : config.providers.main
        ? null
        : (config.providers.mainReason ?? "모델을 쓸 수 없습니다.");
  const visionBlock: string | null = modelBlock ?? (config?.providers.vision ? null : (config?.providers.visionReason ?? "사진 판독에는 이미지 입력 모델 키가 필요합니다."));

  function addDoc(doc: SourceDoc) {
    setDocs((prev) => [...prev.filter((d) => d.id !== doc.id && (!doc.url || normUrl(d.url) !== normUrl(doc.url))), doc]);
  }

  function resetDownstream() {
    setCards([]);
    setConflicts([]);
    setSelected([]);
    setReadings([]);
    setGeneration(null);
    setCheck(null);
    setApproved(false);
    setPasteResult(null);
  }

  function startLive() {
    setMode("live");
    setExampleSavedAt(null);
    setExampleProviders(null);
    setDocs([]);
    setPhotos([]);
    setPhotoStartAt(null);
    setPhotoToDraftMs(null);
    setMetas([]);
    setPageImages([]);
    resetDownstream();
  }

  type TlinkData = { docs: SourceDoc[]; guideline: Guideline | null; photos: TlinkPhoto[]; brand: { name: string; logoUrl: string; colors: string[] } | null };

  async function fetchTlink(): Promise<TlinkData> {
    const res = await fetch("/api/tlink");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "티링크 자료를 불러오지 못했습니다.");
    if (mode !== "live") startLive();
    for (const d of data.docs as SourceDoc[]) addDoc(d);
    setGuideline(data.guideline);
    if (data.brand) {
      setBrand({ name: data.brand.name, logoUrl: data.brand.logoUrl, colors: data.brand.colors });
      setCompany(data.brand.name);
    }
    const ps = (data.photos as TlinkPhoto[]).slice().sort((a, b) => Number(Boolean(b.officialFieldPhoto)) - Number(Boolean(a.officialFieldPhoto)));
    setTlinkPhotos(ps);
    return data;
  }

  async function loadTlink() {
    await runJob("load", fetchTlink);
  }

  async function uploadPdf(file: File) {
    await runJob("load", async () => {
      const fd = new FormData();
      fd.append("file", file);
      setPdfProgress({ name: file.name, page: 0, total: 0, emptyPages: null });
      const res = await fetch("/api/ingest/pdf", { method: "POST", body: fd });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "PDF를 읽지 못했습니다.");
      }
      // 줄 단위 JSON 스트림에서 쪽 색인 진행을 읽는다.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress") setPdfProgress({ name: file.name, page: msg.page, total: msg.total, emptyPages: null });
          else if (msg.type === "done") {
            addDoc(msg.doc);
            setPdfProgress({ name: file.name, page: msg.doc.pages.length, total: msg.doc.pages.length, emptyPages: msg.emptyPages });
          } else if (msg.type === "error") throw new Error(`PDF 색인 실패: ${msg.error}`);
        }
      }
    });
  }

  async function ingestUrl(url: string) {
    await runJob("load", async () => {
      const data = await postJson<{ doc: SourceDoc; images: { src: string; alt: string }[] }>("/api/ingest/url", { url });
      addDoc(data.doc);
      setPageImages((prev) => {
        const seen = new Set(prev.map((p) => p.src));
        return [...prev, ...data.images.filter((i) => !seen.has(i.src)).map((i) => ({ ...i, pageUrl: url }))];
      });
    });
  }

  function removeDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  async function fetchCards(fromDocs: SourceDoc[], companyName: string) {
    const r = await postJson<{ cards: Card[]; conflicts: Conflict[]; meta: LlmMeta }>("/api/cards", { docs: fromDocs, company: companyName });
    resetDownstream();
    setCards(r.cards);
    setConflicts(r.conflicts);
    setSelected(r.cards.filter((c) => c.status !== "unverified").map((c) => c.id));
    setMetas((m) => [...m, r.meta]);
    return r;
  }

  async function extractCards() {
    await runJob("cards", () => fetchCards(docs, company));
  }

  function updateCard(card: Card) {
    const next = reverifyCard(docs, { ...card, edited: true }, conflicts);
    setCards((prev) => prev.map((c) => (c.id === card.id ? next : c)));
  }

  /** 수치 충돌에서 쓸 값을 고르고 승인한다. 승인하면 연결된 카드의 충돌 배지가 풀린다. */
  function approveConflict(conflictId: string, value: string | null) {
    const nextConflicts = conflicts.map((c) => (c.id === conflictId ? { ...c, approvedValue: value } : c));
    setConflicts(nextConflicts);
    setCards((prev) => prev.map((c) => (c.conflictIds.includes(conflictId) ? { ...c, status: cardStatus(c, nextConflicts) } : c)));
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setSelected((prev) => prev.filter((x) => x !== id));
    setConflicts((prev) => prev.map((c) => ({ ...c, cardIds: c.cardIds.filter((x) => x !== id) })));
  }

  function toggleCard(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function nextPhotoId(current: Photo[]) {
    return PHOTO_IDS.find((id) => !current.some((p) => p.id === id)) ?? null;
  }

  async function addPhoto(load: () => Promise<Blob>, meta: { name: string; sourceUrl?: string; sourceLabel?: string }) {
    const blob = await load();
    const r = await resizeImage(blob);
    setPhotos((prev) => {
      const id = nextPhotoId(prev);
      if (!id) return prev;
      return [...prev, { id, name: meta.name, src: r.dataUrl, width: r.width, height: r.height, sourceLong: r.sourceLong, sourceUrl: meta.sourceUrl, sourceLabel: meta.sourceLabel }];
    });
    setPhotoStartAt((t) => t ?? Date.now());
    setReadings([]);
  }

  async function addPhotoFiles(files: File[]) {
    await runJob("photos", async () => {
      const room = (config?.limits.photos ?? 5) - photos.length;
      if (files.length > room) throw new Error(`사진은 ${config?.limits.photos ?? 5}장까지입니다. ${Math.max(room, 0)}장 더 올릴 수 있습니다.`);
      for (const f of files) await addPhoto(async () => f, { name: f.name, sourceLabel: "직접 올린 사진" });
    });
  }

  async function addPhotoUrl(url: string, meta: { name: string; sourceUrl?: string; sourceLabel?: string }) {
    await runJob("photos", async () => {
      if (photos.length >= (config?.limits.photos ?? 5)) throw new Error("사진은 5장까지입니다.");
      await addPhoto(async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`사진을 불러오지 못했습니다(${res.status}): ${meta.sourceUrl ?? url}`);
        return res.blob();
      }, meta);
    });
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setReadings([]);
  }

  /* 각 단계의 본체. 수동 버튼과 자동 실행이 같은 함수를 부른다. 입력을 인자로 받아 결과를 돌려준다. */

  async function doReadPhotos(useCards: Card[], usePhotos: Photo[]) {
    const ready = usePhotos.filter((p) => p.src);
    if (ready.length === 0) throw new Error("판독할 사진이 없습니다.");
    const r = await postJson<{ readings: PhotoReading[]; meta: LlmMeta }>("/api/photos", {
      cards: useCards,
      photos: ready.map((p) => ({ id: p.id, dataUrl: p.src })),
    });
    setReadings(r.readings);
    setLinkDecisions({});
    setMetas((m) => [...m, r.meta]);
    return r.readings;
  }

  async function doGenerate(useCards: Card[], useReadings: PhotoReading[], useConflicts: Conflict[]) {
    const r = await postJson<{ generation: Generation; meta: LlmMeta }>("/api/generate", {
      cards: useCards,
      readings: useReadings,
      guideline,
      company,
      conflicts: useConflicts,
    });
    setGeneration(r.generation);
    setCheck(null);
    setApproved(false);
    setMetas((m) => [...m, r.meta]);
    if (photoStartAt) setPhotoToDraftMs(Date.now() - photoStartAt);
    return r.generation;
  }

  async function doCheck(gen: Generation, useCards: Card[], useConflicts: Conflict[], useReadings: PhotoReading[]) {
    const r = await postJson<Omit<CheckResult, "checkedAt">>("/api/check", {
      items: flattenGeneration(gen),
      scope: blogScope(gen),
      cards: useCards,
      conflicts: useConflicts,
      docs,
      guideline,
      readings: useReadings,
    });
    const result = { ...r, checkedAt: Date.now() };
    setCheck(result);
    setCheckStale(false);
    setApproved(false);
    setMetas((m) => [...m, ...r.metas]);
    return result;
  }

  async function readPhotos() {
    await runJob("photos", () => doReadPhotos(cards.filter((c) => selected.includes(c.id)), photos));
  }

  async function generate() {
    await runJob("generate", () => doGenerate(cards.filter((c) => selected.includes(c.id)), confirmedReadings(readings, linkDecisions), conflicts));
  }

  async function runCheck(gen: Generation | null = generation) {
    if (!gen) return;
    const r = await runJob("check", () => doCheck(gen, cards, conflicts, readings));
    if (r) void saveRunLog("generated", r);
  }

  /**
   * 자동 실행: 자료와 사진이 준비된 상태에서 카드 추출 → 사진 판독 → 초안 생성 → 게시 전 점검을 이어서 한다.
   * 카드는 인용 대조를 통과한 것만 쓰고 사진과 연결된 카드를 앞에 둔다. 수치 충돌은 멈추지 않고 '확인 필요'로 남긴다.
   */
  async function autoRun() {
    const started = Date.now();
    const actionsAtStart = userActions;
    const steps: Record<string, number> = {};
    setAuto({ running: true, startedAt: started, stage: "cards", steps, totalMs: null, error: null, actionsDuring: null });
    const timed = async <T,>(stage: AutoStage, job: Job, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      setAuto((a) => (a ? { ...a, stage } : a));
      const r = await runJob(job, fn);
      steps[stage] = Date.now() - t0;
      setAuto((a) => (a ? { ...a, steps: { ...steps } } : a));
      if (r === null) throw new Error(`${AUTO_STAGE_LABEL[stage]} 단계에서 멈췄습니다.`);
      return r;
    };
    try {
      const { cards: newCards, conflicts: newConflicts } = await timed("cards", "cards", () => fetchCards(docs, company));
      const passing = newCards.filter((c) => c.status !== "unverified");
      const newReadings = photos.length > 0 ? await timed("photos", "photos", () => doReadPhotos(passing, photos)) : [];
      // 자동 실행은 판독한 연결을 모두 '자동 확정'으로 표시하고 그 연결만 생성에 쓴다.
      const autoDecisions: Record<string, LinkDecision> = Object.fromEntries(newReadings.flatMap((r) => r.links.map((l) => [`${r.photoId}:${l.cardId}`, "auto" as const])));
      setLinkDecisions(autoDecisions);
      const linkedIds = new Set(newReadings.flatMap((r) => r.links.map((l) => l.cardId)));
      const ordered = [...passing.filter((c) => linkedIds.has(c.id)), ...passing.filter((c) => !linkedIds.has(c.id))];
      setSelected(ordered.map((c) => c.id));
      const gen = await timed("generate", "generate", () => doGenerate(ordered, confirmedReadings(newReadings, autoDecisions), newConflicts));
      const result = await timed("check", "check", () => doCheck(gen, newCards, newConflicts, newReadings));
      const totalMs = Date.now() - started;
      setAuto((a) => (a ? { ...a, running: false, stage: "done", totalMs, actionsDuring: userActionsRef.current - actionsAtStart } : a));
      void saveRunLog("auto", result, { totalMs, steps, actionsDuring: userActionsRef.current - actionsAtStart });
    } catch (e) {
      setAuto((a) => (a ? { ...a, running: false, error: e instanceof Error ? e.message : String(e) } : a));
    }
  }

  function editSentence(key: string, text: string) {
    if (!generation) return;
    const old = flattenGeneration(generation).find((i) => i.key === key);
    if (!old || old.text === text) return;
    const s: Sentence = { text, cardIds: old.cardIds, photoIds: old.photoIds, kind: old.kind };
    setGeneration(replaceSentence(generation, key, s));
    setCheckStale(true);
    setApproved(false);
  }

  /** 경고 문장을 다시 쓴다. onlyKey를 주면 그 문장 하나만. */
  async function regenerateFlagged(onlyKey?: string) {
    if (!generation || !check) return;
    const flagged = check.warnings.map((w) => w.sentenceKey).filter((k): k is string => Boolean(k));
    const keys = new Set(onlyKey ? flagged.filter((k) => k === onlyKey) : flagged);
    const items: CheckItem[] = flattenGeneration(generation).filter((i) => keys.has(i.key));
    if (items.length === 0) return;
    const gen = await runJob("regen", async () => {
      const r = await postJson<{ replacements: { key: string; replacement: Sentence }[]; meta: LlmMeta }>("/api/regenerate", {
        items,
        warnings: check.warnings,
        cards,
        readings,
      });
      setMetas((m) => [...m, r.meta]);
      let next = generation;
      for (const x of r.replacements) if (keys.has(x.key)) next = replaceSentence(next, x.key, x.replacement);
      setGeneration(next);
      return next;
    });
    if (gen) await runCheck(gen);
  }

  /** 원고 붙여넣기 점검. 카드가 없으면 자료를 불러와 카드를 먼저 만들고, 있으면 그대로 쓴다. */
  async function runPasteCheck(text: string = paste) {
    // 두 번째 실행부터 끝을 구분할 수 있게 이전 결과를 지우고 회차를 올린다.
    setPasteResult(null);
    setPasteRun((n) => n + 1);
    const r = await runJob("paste", async () => {
      let useDocs = docs;
      let useGuideline = guideline;
      let useCards = cards;
      let useConflicts = conflicts;
      if (useCards.length === 0) {
        if (useDocs.length === 0) {
          const t = await fetchTlink();
          useDocs = t.docs;
          useGuideline = t.guideline;
        }
        const c = await fetchCards(useDocs, company || "티링크");
        useCards = c.cards;
        useConflicts = c.conflicts;
      }
      const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? null;
      const res = await postJson<Omit<CheckResult, "checkedAt">>("/api/check", {
        pasted: text,
        scope: { title: firstLine, body: text },
        cards: useCards,
        conflicts: useConflicts,
        docs: useDocs,
        guideline: useGuideline,
        readings: [],
      });
      const result = { ...res, checkedAt: Date.now() };
      setPasteResult(result);
      setMetas((m) => [...m, ...res.metas]);
      return result;
    });
    if (r) void saveRunLog("paste", r);
  }

  /** 경고 문장을 고쳐 쓴 제안으로 바꾼 원고를 다시 점검한다. onlyKey를 주면 그 문장 하나만 바꾼다. */
  async function applySuggestions(onlyKey?: string) {
    if (!pasteResult) return;
    const lines = pasteResult.items.map((i) => (onlyKey && i.key !== onlyKey ? i.text : (pasteResult.suggestions.find((s) => s.key === i.key)?.text ?? i.text)));
    const text = lines.join("\n");
    setPaste(text);
    await runPasteCheck(text);
  }

  /* ---------- 측정 기록 ---------- */

  function buildRunLog(kind: "generated" | "paste" | "auto", r: CheckResult, autoInfo?: { totalMs: number; steps: Record<string, number>; actionsDuring: number }) {
    return {
      kind,
      at: new Date().toISOString(),
      mode,
      providers: config?.providers ?? null,
      userActions: userActionsRef.current,
      auto: autoInfo ?? null,
      photoToDraftMs,
      modelCalls: metas.map((m) => ({ task: m.role, provider: m.provider, model: m.model, ms: m.ms, cached: m.cached })),
      docs: docs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, pages: d.pages.length })),
      cards: cards.map((c) => ({ id: c.id, status: c.status, origin: c.origin ?? "model", evidence: c.evidence.map((e) => ({ docId: e.docId, page: e.page, match: e.match, score: e.score })) })),
      conflicts: conflicts.map((c) => ({ id: c.id, metric: c.metric, values: c.values.map((v) => ({ value: v.value, docId: v.docId, page: v.page })), approvedValue: c.approvedValue ?? null })),
      readings: readings.map((x) => ({ photoId: x.photoId, kind: x.kind, links: x.links.map((l) => l.cardId), exposure: x.exposure.length })),
      check: {
        elapsedMs: r.elapsedMs,
        metrics: r.metrics,
        items: r.items.map((i) => ({ key: i.key, text: i.text, cardIds: i.cardIds, photoIds: i.photoIds, kind: i.kind })),
        warnings: r.warnings.map((x) => ({ type: x.type, decider: x.decider, sentenceKey: x.sentenceKey, message: x.message })),
        checklist: r.checklist.map((x) => ({ group: x.group, label: x.label, ok: x.ok, decider: x.decider, sentenceKeys: x.sentenceKeys })),
        disagreements: r.disagreements,
        judgeError: r.judgeError,
      },
    };
  }

  /** 기록은 상태가 반영된 다음 렌더에서 만든다(같은 틱에서는 카드·호출 목록이 아직 옛 값이다). */
  const [pendingLog, setPendingLog] = useState<{ kind: "generated" | "paste" | "auto"; r: CheckResult; autoInfo?: { totalMs: number; steps: Record<string, number>; actionsDuring: number } } | null>(null);
  const lastLog = useRef<ReturnType<typeof buildRunLog> | null>(null);
  useEffect(() => {
    if (!pendingLog) return;
    const log = buildRunLog(pendingLog.kind, pendingLog.r, pendingLog.autoInfo);
    lastLog.current = log;
    setPendingLog(null);
    if (config?.deployed) return;
    fetch("/api/runlog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(log) }).catch(() => undefined);
    // buildRunLog는 매 렌더의 상태를 읽는다. pendingLog가 바뀔 때만 기록한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLog]);

  function saveRunLog(kind: "generated" | "paste" | "auto", r: CheckResult, autoInfo?: { totalMs: number; steps: Record<string, number>; actionsDuring: number }) {
    setPendingLog({ kind, r, autoInfo });
  }

  /* ---------- 카드 보드 내보내기·불러오기 ---------- */

  /** 카드(짧은 인용·문서명·쪽)와 가이드라인만 담은 파일. 원본 문서 전체는 넣지 않는다. */
  function exportBoard() {
    const board = {
      kind: "geunger-card-board",
      version: 1,
      exportedAt: new Date().toISOString(),
      company,
      docs: docs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, url: d.url })),
      cards,
      conflicts,
      guideline,
    };
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `card-board-${(company || "board").replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importBoard(file: File) {
    await runJob("load", async () => {
      const board = JSON.parse(await file.text());
      if (board?.kind !== "geunger-card-board" || !Array.isArray(board.cards)) throw new Error("카드 보드 파일이 아닙니다.");
      startLive();
      setCompany(board.company ?? "");
      setDocs((board.docs ?? []).map((d: SourceDoc) => ({ ...d, pages: [] })));
      setGuideline(board.guideline ?? null);
      setCards(board.cards);
      setConflicts(board.conflicts ?? []);
      setSelected(board.cards.filter((c: Card) => c.status !== "unverified").map((c: Card) => c.id));
      setBoardImported(file.name);
    });
  }

  async function refreshLocalFiles() {
    const r = await fetch("/api/local-data").then((x) => x.json());
    setLocalFiles(r.stored ? r.files : null);
  }

  async function clearLocalData() {
    await fetch("/api/local-data", { method: "DELETE" });
    await refreshLocalFiles();
  }

  function downloadRunLog() {
    const log = lastLog.current;
    if (!log) return;
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `run-${log.kind}-${log.at.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function snapshot(): ExampleSnapshot {
    return {
      savedAt: new Date().toISOString(),
      providers: config!.providers,
      company,
      brand,
      docs: docs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, url: d.url })),
      guideline,
      cards,
      conflicts,
      photos,
      readings,
      generation,
      check,
      paste: { text: paste, result: pasteResult },
      metas,
      timings: { photoToDraftMs },
    };
  }

  async function saveExample() {
    await runJob("load", async () => {
      await postJson("/api/demo/save", snapshot());
    });
  }

  async function loadExample() {
    await runJob("load", async () => {
      const res = await fetch(EXAMPLE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("미리 계산한 예시 결과 파일이 없습니다.");
      const ex = (await res.json()) as ExampleSnapshot;
      setMode("example");
      setExampleSavedAt(ex.savedAt);
      setExampleProviders(ex.providers);
      setCompany(ex.company);
      setBrand(ex.brand);
      setDocs(ex.docs.map((d) => ({ ...d, pages: [] })));
      setGuideline(ex.guideline);
      setCards(ex.cards);
      setConflicts(ex.conflicts);
      setSelected(ex.cards.filter((c) => c.status !== "unverified").map((c) => c.id));
      setReadings(ex.readings);
      setGeneration(ex.generation);
      setCheck(ex.check);
      setCheckStale(false);
      setApproved(false);
      setPaste(ex.paste.text);
      setPasteResult(ex.paste.result);
      setMetas(ex.metas);
      setPhotoToDraftMs(ex.timings.photoToDraftMs);
      setPageImages([]);
      // 사진은 저장소에 넣지 않고 원본 주소에서 같은 출처 중계로 불러온다.
      // 홈페이지 사진은 저장소에 넣지 않고 원본 주소에서 같은 출처 중계로 불러온다. 블로그 사진은 public/demo 사본을 쓴다.
      const base = ex.photos.map((p) => ({ ...p, loadError: undefined }));
      setPhotos(base.map((p) => (p.src?.startsWith("/demo/") ? p : { ...p, src: null })));
      for (const p of base) {
        if (p.src?.startsWith("/demo/") || !p.sourceUrl) continue;
        const relay = `/api/image?src=${encodeURIComponent(p.sourceUrl)}`;
        fetch(relay)
          .then(async (r) => {
            if (!r.ok) throw new Error(String(r.status));
            const img = await resizeImage(await r.blob());
            setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, src: img.dataUrl } : x)));
          })
          .catch(() =>
            setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, loadError: `원본 사진을 불러오지 못했습니다(${p.sourceUrl})` } : x))),
          );
      }
    });
  }

  const warningsByKey = useMemo(() => {
    const m = new Map<string, Warning[]>();
    for (const w of check?.warnings ?? []) if (w.sentenceKey) m.set(w.sentenceKey, [...(m.get(w.sentenceKey) ?? []), w]);
    return m;
  }, [check]);

  return {
    config,
    mode,
    live,
    exampleSavedAt,
    exampleProviders,
    company,
    setCompany,
    brand,
    docs,
    guideline,
    tlinkPhotos,
    pageImages,
    cards,
    conflicts,
    selected,
    photos,
    readings,
    generation,
    check,
    checkStale,
    approved,
    setApproved,
    paste,
    setPaste,
    pasteResult,
    metas,
    photoToDraftMs,
    jobs,
    auto,
    pdfProgress,
    pasteRun,
    linkDecisions,
    decideLink: tap((photoId: string, cardId: string, d: LinkDecision | null) =>
      setLinkDecisions((prev) => {
        const next = { ...prev };
        if (d) next[`${photoId}:${cardId}`] = d;
        else delete next[`${photoId}:${cardId}`];
        return next;
      }),
    ),
    userActions,
    modelBlock,
    visionBlock,
    warningsByKey,
    loadTlink: tap(loadTlink),
    uploadPdf: tap(uploadPdf),
    ingestUrl: tap(ingestUrl),
    removeDoc: tap(removeDoc),
    extractCards: tap(extractCards),
    updateCard: tap(updateCard),
    approveConflict: tap(approveConflict),
    removeCard: tap(removeCard),
    toggleCard: tap(toggleCard),
    addPhotoFiles: tap(addPhotoFiles),
    addPhotoUrl: tap(addPhotoUrl),
    removePhoto: tap(removePhoto),
    readPhotos: tap(readPhotos),
    generate: tap(generate),
    runCheck: tap(runCheck),
    editSentence: tap(editSentence),
    regenerateFlagged: tap((key?: string) => regenerateFlagged(key)),
    runPasteCheck: tap(() => runPasteCheck()),
    applySuggestions: tap((key?: string) => applySuggestions(key)),
    autoRun: tap(autoRun),
    downloadRunLog,
    exportBoard,
    importBoard: tap(importBoard),
    boardImported,
    clearLocalData: tap(clearLocalData),
    localFiles,
    refreshLocalFiles,
    saveExample,
    loadExample: tap(loadExample),
    startLive: tap(startLive),
  };
}

export type W = ReturnType<typeof useWorkbench>;

const STEPS = [
  { id: "step-1", n: 1, title: "제품 분석" },
  { id: "step-2", n: 2, title: "사진 판독" },
  { id: "step-3", n: 3, title: "콘텐츠 생성" },
  { id: "step-4", n: 4, title: "게시 전 점검" },
] as const;

function stepState(w: W, n: number): { label: string; tone: "idle" | "run" | "done" | "error" } {
  const j = n === 1 ? w.jobs.cards : n === 2 ? w.jobs.photos : n === 3 ? w.jobs.generate : w.jobs.check;
  const done = n === 1 ? w.cards.length > 0 : n === 2 ? w.readings.length > 0 : n === 3 ? Boolean(w.generation) : Boolean(w.check);
  if (j.running) return { label: "진행 중", tone: "run" };
  if (j.error) return { label: "오류", tone: "error" };
  if (done) return { label: "완료", tone: "done" };
  return { label: "대기", tone: "idle" };
}

export function Workbench() {
  const w = useWorkbench();
  const p = w.mode === "example" ? w.exampleProviders : w.config?.providers;
  // ?step=check: 자료와 가이드라인을 불러와 원고 검수 화면(17개 항목 목록)으로 바로 연다.
  const opened = useRef(false);
  const { config, loadTlink } = w;
  useEffect(() => {
    if (opened.current || !config) return;
    if (new URLSearchParams(window.location.search).get("step") !== "check") return;
    opened.current = true;
    const go = () => document.getElementById("paste-check")?.scrollIntoView({ block: "start" });
    if (config.data.available) void loadTlink().then(() => setTimeout(go, 50));
    else go();
  }, [config, loadTlink]);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center gap-6 px-6 py-3">
          <div className="min-w-0 max-w-[24rem] shrink">
            <h1 className="text-xl font-extrabold tracking-tight">근거 달린 홍보문</h1>
            <p className="text-sm text-muted-foreground">사진과 제품 정보에서 게시 전 점검까지 끝난 초안을 자동으로 만듭니다. 사람은 확인하고 승인만 합니다.</p>
          </div>
          <nav className="flex flex-1 items-center justify-center gap-1.5">
            {STEPS.map((s) => {
              const st = stepState(w, s.n);
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-sm font-semibold",
                    st.tone === "done" && "border-emerald-300 bg-emerald-50 text-emerald-800",
                    st.tone === "run" && "border-blue-300 bg-blue-50 text-blue-800",
                    st.tone === "error" && "border-red-300 bg-red-50 text-red-800",
                    st.tone === "idle" && "border-slate-200 text-slate-600",
                  )}
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-white text-xs ring-1 ring-current">{s.n}</span>
                  {s.title}
                  <span className="text-xs font-medium opacity-80">{st.label}</span>
                </a>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Button data-testid="load-tlink" variant="outline" onClick={w.loadTlink} disabled={w.jobs.load.running}>
              <FolderOpen /> 티링크 자료 불러오기
            </Button>
            <Button data-testid="load-example" variant="outline" onClick={w.loadExample} disabled={w.jobs.load.running}>
              <Eye /> 티링크 예시로 보기
            </Button>
            <Button
              data-testid="auto-run"
              onClick={w.autoRun}
              disabled={Boolean(w.modelBlock) || w.docs.length === 0 || Boolean(w.auto?.running)}
              title={w.modelBlock ?? (w.docs.length === 0 ? "자료를 먼저 불러오세요." : "카드 추출 → 사진 판독 → 초안 생성 → 게시 전 점검을 이어서 실행")}
            >
              <Play /> 자동 실행
            </Button>
            {w.auto && <AutoElapsed auto={w.auto} />}
            {w.live && w.config && !w.config.deployed && w.check && (
              <Button data-testid="save-example" variant="ghost" size="sm" onClick={w.saveExample} title="현재 실행 결과를 공개 데모용 예시 결과로 저장(로컬 전용)">
                <Save /> 예시로 저장
              </Button>
            )}
          </div>
        </div>
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-1 px-6 pb-2 text-xs text-muted-foreground">
          <span>글 작업 모델: {p?.main ?? `없음 — ${p?.mainReason ?? "설정 확인 중"}`}</span>
          <span>사진 판독 모델: {p?.vision ?? `없음 — ${p?.visionReason ?? "설정 확인 중"}`}</span>
          <span>
            교차 판정 모델: {p?.judge ?? `없음 — ${p?.judgeReason ?? "설정 확인 중"}`}
            {p?.judge && (p.judgeSameVendor ? " (같은 공급자의 별도 호출로 판정)" : " (생성과 다른 회사 모델)")}
          </span>
          {w.photoToDraftMs !== null && <span className="font-semibold text-slate-700">사진 업로드 → 초안: {formatMs(w.photoToDraftMs)}</span>}
          {w.jobs.load.error && <span className="font-semibold text-red-700">{w.jobs.load.error}</span>}
          {w.auto && (
            <span className={cn("font-semibold", w.auto.error ? "text-red-700" : "text-blue-800")}>
              자동 실행: {w.auto.error ? `중단 — ${w.auto.error}` : w.auto.running ? `${AUTO_STAGE_LABEL[w.auto.stage]} 진행 중` : `점검 끝난 초안까지 ${formatMs(w.auto.totalMs ?? 0)}, 사람이 누른 횟수 ${w.auto.actionsDuring ?? 1}회`}
              {Object.entries(w.auto.steps).map(([k, ms]) => ` · ${AUTO_STAGE_LABEL[k as AutoStage]} ${formatMs(ms)}`)}
            </span>
          )}
        </div>
        {w.mode === "example" && (
          <div data-testid="example-banner" className="border-t bg-amber-50 px-6 py-2 text-center text-sm font-semibold text-amber-900">
            미리 계산한 예시 결과입니다({w.exampleSavedAt ? new Date(w.exampleSavedAt).toLocaleString("ko-KR") : ""} 실제 실행 출력). 원본 문서 전문은 포함하지 않았습니다. 이 예시는 저장해 둔 다른 실행의 결과입니다(카드 {w.cards.length}장). 측정 실행은 카드 10장·인용 23개였습니다. 실행마다 추출되는 카드 수가 달라질 수 있습니다.{" "}
            <button className="underline" onClick={w.startLive}>
              처음부터 직접 실행
            </button>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-[1800px] space-y-8 px-6 py-6">
        <StepSources w={w} />
        <StepPhotos w={w} />
        <StepContent w={w} />
        <StepCheck w={w} />
        <RunSummary w={w} />
      </main>
    </div>
  );
}

/** 실행 요약: 실제 호출한 모델 식별자, 호출 수·토큰, 자료 처리 안내, 카드 보드 내보내기. */
function RunSummary({ w }: { w: W }) {
  const { refreshLocalFiles, config } = w;
  useEffect(() => {
    if (config && !config.deployed) void refreshLocalFiles();
    // 설정을 받은 뒤 한 번 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  const calls = w.metas.filter((m) => !m.cached);
  const byModel = new Map<string, { tasks: Set<string>; calls: number; cached: number }>();
  for (const m of w.metas) {
    const k = `${m.provider}:${m.model}`;
    const e = byModel.get(k) ?? { tasks: new Set<string>(), calls: 0, cached: 0 };
    e.tasks.add(m.role.replace(/ \d+\/\d+$/, ""));
    if (m.cached) e.cached++;
    else e.calls++;
    byModel.set(k, e);
  }
  const usage = calls.reduce(
    (a, m) => ({ input: a.input + (m.usage?.inputTokens ?? 0), output: a.output + (m.usage?.outputTokens ?? 0), known: a.known + (m.usage ? 1 : 0) }),
    { input: 0, output: 0, known: 0 },
  );
  const deployed = config?.deployed;
  return (
    <section data-testid="run-summary" className="grid gap-4 rounded-2xl border bg-white p-6 text-[0.95rem] lg:grid-cols-3">
      <div>
        <h2 className="mb-2 text-lg font-bold">실제로 호출한 모델</h2>
        {byModel.size === 0 ? (
          <p className="text-muted-foreground">아직 호출이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {[...byModel.entries()].map(([k, e]) => (
              <li key={k}>
                <code className="rounded bg-slate-100 px-1 text-sm">{k}</code> — {[...e.tasks].join(", ")} · 호출 {e.calls}회{e.cached ? `, 캐시 ${e.cached}회` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          모델 호출 {calls.length}회
          {usage.known > 0 ? ` · 토큰 입력 ${usage.input.toLocaleString()} / 출력 ${usage.output.toLocaleString()}(공급자 보고값, ${usage.known}회분)` : ""}
        </p>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-bold">자료 처리</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>올린 PDF·사진·원고는 이 앱의 서버를 거쳐 위의 모델 공급자 API로 보냅니다. 홈페이지 주소는 Jina Reader(r.jina.ai)로 본문을 받습니다.</li>
          <li>서버는 올린 PDF·사진 파일을 디스크에 저장하지 않습니다.</li>
          {deployed ? (
            <li>이 배포 환경은 모델 응답 캐시와 실행 기록을 서버에 남기지 않습니다.</li>
          ) : (
            <li>
              로컬 실행에서는 모델 응답(.cache/llm), 홈페이지 본문(.cache/url), 실행 기록(.cache/runs)을 이 기기에 남깁니다
              {w.localFiles ? `(현재 ${w.localFiles.llm ?? 0}·${w.localFiles.url ?? 0}·${w.localFiles.runs ?? 0}개 파일)` : ""}.
            </li>
          )}
          <li>얼굴·연락처·고객사 이름이 보이는 사진은 올리기 전에 확인하세요. 앱은 경고만 하고 가리지 않습니다.</li>
        </ul>
        {!deployed && (
          <Button data-testid="clear-local-data" size="sm" variant="outline" className="mt-2" onClick={w.clearLocalData}>
            이 기기의 캐시와 실행 기록 모두 지우기
          </Button>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-lg font-bold">카드 보드 전달</h2>
        <p>외부 리뷰 작성자에게 카드 보드 파일을 보내면, 원본 PDF 없이 그 파일을 불러와 자기 원고를 검수할 수 있습니다. 파일에는 카드의 짧은 인용·문서명·쪽과 가이드라인만 들어갑니다.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button data-testid="board-export" size="sm" variant="outline" onClick={w.exportBoard} disabled={w.cards.length === 0}>
            카드 보드 내려받기(JSON)
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border px-2.5 py-1 text-sm font-medium hover:bg-muted">
            카드 보드 불러오기
            <input
              data-testid="board-import"
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void w.importBoard(f).then(() => document.getElementById("paste-check")?.scrollIntoView({ block: "start" }));
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {w.boardImported && <p className="mt-2 text-sm font-semibold text-emerald-800">{w.boardImported}에서 카드 {w.cards.length}장을 불러왔습니다. 아래 원고 검수에 바로 쓸 수 있습니다.</p>}
      </div>
    </section>
  );
}

export function SectionHeader({ n, title, desc, children }: { n: number; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-3 text-2xl font-extrabold">
          <span className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-lg text-white">{n}</span>
          {title}
        </h2>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">{desc}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function MetaLine({ metas, task }: { metas: LlmMeta[]; task: string }) {
  const m = [...metas].reverse().find((x) => x.role === task);
  if (!m) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {m.provider}:{m.model} · {formatMs(m.ms)}
      {m.cached && <span className="ml-1 rounded bg-slate-200 px-1 text-slate-700">캐시</span>}
    </span>
  );
}

/** 자동 실행 총 경과 시간. 실행 중에는 1초마다 갱신하고, 끝나면 측정한 총 시간을 그대로 보인다. */
function AutoElapsed({ auto }: { auto: AutoState }) {
  const [now, setNow] = useState(auto.startedAt);
  useEffect(() => {
    if (!auto.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [auto.running]);
  const ms = auto.running ? Math.max(0, now - auto.startedAt) : (auto.totalMs ?? 0);
  const s = Math.floor(ms / 1000);
  return (
    <span
      data-testid="total-elapsed"
      className={cn("rounded-md px-2 py-1 font-mono text-base font-bold tabular-nums", auto.running ? "bg-blue-600 text-white" : auto.error ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-900")}
      title="자동 실행 시작부터 경과한 실제 시간"
    >
      {auto.running ? "경과" : auto.error ? "중단" : "완료"} {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function Running({ job, label }: { job: JobState; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!job.running) return;
    const t = setInterval(() => setElapsed(Date.now() - (job.startedAt ?? Date.now())), 1000);
    return () => clearInterval(t);
  }, [job.running, job.startedAt]);
  if (job.running)
    return (
      <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
        <span className="size-3 animate-pulse rounded-full bg-blue-500" />
        {label} 진행 중 · {formatMs(elapsed)}
      </div>
    );
  if (job.error)
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
        <b>실패:</b> {job.error} — 입력은 그대로 남아 있습니다. 버튼을 다시 누르면 재시도합니다.
      </div>
    );
  return null;
}
