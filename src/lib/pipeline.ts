/**
 * 1단계 카드 추출과 4단계 게시 전 점검의 실행 순서. API 라우트와 측정 스크립트(scripts/)가 같은 함수를 부른다.
 *
 * 점검 흐름
 * 1) 코드: 문장마다 관련 근거 쪽(BM25 검색)과 후보 카드를 고른다(모델 호출 없음).
 * 2) 교차 판정 모델(생성에 쓰지 않은 회사): 문장 묶음별로 병렬 호출. 문장 종류·카드 연결·판정·인용·고쳐 쓴 문장을 한 번에 낸다.
 *    강조 내용 반영 판정은 별도 호출로 같은 시간에 돌린다.
 * 3) 코드: 모델 인용을 원문과 대조한다. 어긋나는 원문 구절을 인용하지 못한 경고, 코드가 원문에서 찾은 구절을 "없다"고 한 경고는
 *    경고에서 빼고 "확인 필요"(reviews)로 낮춘다.
 * 4) 코드 판정: 근거 없음·수치·단정 표현·가이드라인 필수 항목.
 * 5) (붙여넣기) 경고 문장의 고쳐 쓴 제안: 판정 모델이 낸 fix를 쓰고, 없는 문장만 생성 모델을 한 번 부른다.
 */
import { checklistWarnings, codeChecks, computeMetrics, guidelineChecklist, type CheckItem, type CheckMetrics, type ChecklistItem, type ItemSource } from "./check";
import { structured } from "./llm";
import { CARD_SYSTEM, EMPHASIS_SYSTEM, JUDGE_SYSTEM, REGENERATE_SYSTEM, cardsBlock, docsBlock } from "./prompts";
import { buildIndex, pageKey, parsePageKey, rankCards, topPages, type Index, type PageRef } from "./retrieve";
import {
  cardDraftSchema,
  emphasisSchema,
  judgeSentencesSchema,
  regenerateSchema,
  type Card,
  type CardDraft,
  type Conflict,
  type Guideline,
  type JudgeSentence,
  type LlmMeta,
  type PhotoReading,
  type SourceDoc,
  type Warning,
} from "./schemas";
import { matchQuote, normalize, splitSentences } from "./text";
import { buildCards } from "./verify";

export class CheckInputError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/* ---------- 1단계 ---------- */

export type CardsResult = { cards: Card[]; conflicts: Conflict[]; metrics: CardDraft["metrics"]; meta: LlmMeta };

export async function extractCards(docs: SourceDoc[], company?: string): Promise<CardsResult> {
  const { data, meta } = await structured({
    role: "main",
    task: "차별점 카드 추출",
    system: CARD_SYSTEM,
    prompt: `회사: ${company ?? "(미상)"}\n\n아래는 제품 자료의 쪽별 텍스트다.\n\n${docsBlock(docs)}`,
    schema: cardDraftSchema,
  });
  const { cards, conflicts } = buildCards(docs, data);
  return { cards, conflicts, metrics: data.metrics, meta };
}

/* ---------- 4단계 ---------- */

export type CheckBody = {
  /** 생성물 점검이면 문장 목록, 붙여넣기 점검이면 원고 */
  items?: CheckItem[];
  pasted?: string;
  /** 가이드라인 대조 범위. 블로그 초안이나 붙여넣은 원고 전체 */
  scope: { title: string | null; body: string } | null;
  cards: Card[];
  conflicts: Conflict[];
  docs: SourceDoc[];
  guideline: Guideline | null;
  readings: PhotoReading[];
};

export type Verdict = { key: string; verdict: string; reason: string };
export type Disagreement = { key: string; code: boolean; model: boolean; reason: string };
/** 모델이 경고했지만 코드 대조로 확인되지 않아 경고에서 뺀 판정("확인 필요") */
export type Review = { key: string; verdict: string; sentencePart: string; reason: string; why: string };

export type CheckResponse = {
  items: CheckItem[];
  warnings: Warning[];
  checklist: ChecklistItem[];
  suggestions: { key: string; text: string; cardIds: string[] }[];
  metrics: CheckMetrics;
  metas: LlmMeta[];
  judgeError: string | null;
  verdicts: Verdict[];
  disagreements: Disagreement[];
  reviews: Review[];
  suggestError: string | null;
  /** 단계별 시간(ms). judge는 병렬 묶음 호출 전체가 끝날 때까지 */
  timings: { prepareMs: number; judgeMs: number; codeMs: number; suggestMs: number };
  elapsedMs: number;
};

/** 판정 묶음 하나의 문장 수. 묶음들은 동시에 호출한다. */
export const JUDGE_BATCH = 5;
/** 문장마다 판정 모델에 보여 줄 근거 쪽 수 */
export const JUDGE_PAGES = 3;
/** 고쳐 쓴 제안 한 호출의 문장 수. 호출들은 동시에 한다. */
export const SUGGEST_BATCH = 3;
const WARN_VERDICTS = new Set(["contradicted", "condition-omitted", "not-in-sources"]);

type Candidate = { item: CheckItem; pages: PageRef[]; cardIds: string[] };

function judgePrompt(batch: Candidate[], docs: SourceDoc[], cards: Card[], readings: PhotoReading[], pasted: boolean): string {
  const pageMap = new Map(docs.flatMap((d) => d.pages.map((p) => [pageKey({ docId: d.id, page: p.page }), { title: d.title, text: p.text }] as const)));
  const pages = [...new Set(batch.flatMap((c) => c.pages.map(pageKey)))];
  const cardIds = [...new Set(batch.flatMap((c) => c.cardIds))];
  const photoMap = new Map(readings.map((r) => [r.photoId, r]));
  const pageBlock = pages.map((k) => `<<<${k}>>> (${pageMap.get(k)?.title ?? ""})\n${pageMap.get(k)?.text.trim() ?? ""}`).join("\n\n");
  const sentenceBlock = batch
    .map(({ item, pages: ps, cardIds: cs }) => {
      const lines = [`### ${item.key}`, `문장: ${item.text}`, `근거 쪽: ${ps.map(pageKey).join(", ") || "(없음)"}`, `후보 카드: ${cs.join(", ") || "(없음)"}`];
      if (!pasted) {
        for (const id of item.photoIds) {
          const r = photoMap.get(id);
          if (r) lines.push(`사진 ${id}: ${r.caption}`);
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
  return `## 근거 쪽\n${pageBlock || "(없음)"}\n\n## 후보 카드\n${cardIds.length ? cardsBlock(cards.filter((c) => cardIds.includes(c.id))) : "(없음)"}\n\n## 판정할 문장\n${sentenceBlock}\n\n각 문장의 key를 그대로 돌려준다.`;
}

/** 인용문을 모델이 적은 쪽에서 먼저, 없으면 그 문장의 다른 근거 쪽에서 찾는다. */
function locateQuote(quote: string, cited: PageRef | null, pages: PageRef[], pageText: Map<string, string>): ItemSource | null {
  if (!quote.trim()) return null;
  const order = [...(cited ? [cited] : []), ...pages.filter((p) => !cited || pageKey(p) !== pageKey(cited))];
  for (const p of order) {
    const t = pageText.get(pageKey(p));
    if (t && matchQuote(quote, t).match !== "none") return { docId: p.docId, page: p.page, quote };
  }
  return null;
}

/** 모델이 "자료에 없다"고 한 구절이 실제로 원문에 있는지 코드로 찾는다. */
function findInCorpus(part: string, docs: SourceDoc[]): PageRef | null {
  const q = normalize(part);
  if (q.length < 4) return null;
  for (const d of docs) for (const p of d.pages) if (normalize(p.text).includes(q)) return { docId: d.id, page: p.page };
  return null;
}

export async function runCheck(body: CheckBody, opts: { pasteLimit?: number } = {}): Promise<CheckResponse> {
  const started = Date.now();
  const metas: LlmMeta[] = [];
  const pasted = body.pasted !== undefined;
  let items: CheckItem[] = body.items ?? [];

  if (pasted) {
    if (opts.pasteLimit && body.pasted!.length > opts.pasteLimit) throw new CheckInputError(`원고는 ${opts.pasteLimit}자까지 받습니다.`, 413);
    const lines = splitSentences(body.pasted!);
    if (lines.length === 0) throw new CheckInputError("원고가 비어 있습니다.", 400);
    if (body.cards.length === 0) throw new CheckInputError("차별점 카드가 없습니다. 1단계를 먼저 실행하세요.", 400);
    items = lines.map((text, i) => ({ key: `paste.${i}`, text, cardIds: [], photoIds: [], kind: "fact" }));
  }

  // 1) 코드: 근거 쪽과 후보 카드
  const index: Index = buildIndex(body.docs);
  const cardMap = new Map(body.cards.map((c) => [c.id, c]));
  const pageText = new Map(body.docs.flatMap((d) => d.pages.map((p) => [pageKey({ docId: d.id, page: p.page }), p.text] as const)));
  const candidates: Candidate[] = items.map((item) => {
    const cardIds = pasted ? rankCards(body.cards, item.text, 3).map((c) => c.id) : item.cardIds.filter((id) => cardMap.has(id));
    const refs = new Map<string, PageRef>();
    for (const r of topPages(index, item.text, JUDGE_PAGES)) refs.set(pageKey(r), { docId: r.docId, page: r.page });
    // 생성물은 작성 때 단 카드의 인용 쪽도 함께 보인다.
    if (!pasted) for (const id of cardIds) for (const e of cardMap.get(id)?.evidence ?? []) refs.set(pageKey(e), { docId: e.docId, page: e.page });
    return { item, pages: [...refs.values()], cardIds };
  });
  const prepareMs = Date.now() - started;

  // 2) 교차 판정(문장 묶음 병렬) + 강조 내용 판정
  const toJudge = candidates.filter((c) => (pasted ? true : c.item.kind === "fact"));
  const batches: Candidate[][] = [];
  for (let i = 0; i < toJudge.length; i += JUDGE_BATCH) batches.push(toJudge.slice(i, i + JUDGE_BATCH));
  const emphasis = body.guideline && body.scope ? body.guideline.emphasisPoints : [];
  const judgeStarted = Date.now();
  const errors: string[] = [];
  const [batchResults, emphasisResult] = await Promise.all([
    Promise.all(
      batches.map(async (batch, bi) => {
        try {
          const { data, meta } = await structured({
            role: "judge",
            task: `교차 판정 ${bi + 1}/${batches.length}`,
            timeoutMs: 240_000,
            system: JUDGE_SYSTEM,
            prompt: judgePrompt(batch, body.docs, body.cards, body.readings ?? [], pasted),
            schema: judgeSentencesSchema,
          });
          metas.push(meta);
          return data.sentences;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
          return [] as JudgeSentence[];
        }
      }),
    ),
    emphasis.length > 0
      ? structured({
          role: "judge",
          task: "강조 내용 판정",
          timeoutMs: 240_000,
          system: EMPHASIS_SYSTEM,
          prompt: `## 가이드라인 강조 내용\n${emphasis.map((p, i) => `${i}. ${p}`).join("\n")}\n\n## 원고 전체(문장 키와 문장)\n${
            body.scope?.title && !pasted ? `[제목] ${body.scope.title}\n` : ""
          }${items.map((i) => `[${i.key}] ${i.text}`).join("\n")}`,
          schema: emphasisSchema,
        }).then(
          ({ data, meta }) => {
            metas.push(meta);
            return data.emphasis;
          },
          (e) => {
            errors.push(e instanceof Error ? e.message : String(e));
            return null;
          },
        )
      : Promise.resolve(null),
  ]);
  const judgeMs = Date.now() - judgeStarted;
  const codeStarted = Date.now();

  // 3) 모델 판정을 코드로 대조
  const candMap = new Map(candidates.map((c) => [c.item.key, c]));
  const judged = new Map<string, JudgeSentence>();
  for (const v of batchResults.flat()) if (candMap.has(v.key) && !judged.has(v.key)) judged.set(v.key, v);
  const verdicts: Verdict[] = [];
  const reviews: Review[] = [];
  const modelWarnings: Warning[] = [];
  const fixes = new Map<string, string>();
  const cited: Record<string, PageRef[]> = {};

  items = items.map((it) => {
    const cand = candMap.get(it.key)!;
    const v = judged.get(it.key);
    if (!v) {
      // 판정이 없으면(호출 실패) 붙여넣기 문장은 관련도가 높은 카드 하나를 연결해 코드 판정만 한다.
      if (!pasted) return it;
      const best = rankCards(body.cards, it.text, 1)[0];
      return { ...it, cardIds: best && best.score >= 0.3 ? [best.id] : [] };
    }
    const next: CheckItem = pasted ? { ...it, kind: v.kind, cardIds: v.cardIds.filter((id) => cardMap.has(id)) } : { ...it };
    verdicts.push({ key: it.key, verdict: v.verdict, reason: v.reason });
    const src = locateQuote(v.sourceQuote, parsePageKey(v.sourcePage), cand.pages, pageText);
    if (src) cited[it.key] = [{ docId: src.docId, page: src.page }];
    const partOk = v.sentencePart.trim().length > 0 && normalize(it.text).includes(normalize(v.sentencePart));
    if (v.verdict === "supported" && src) next.sources = [src];
    if (!WARN_VERDICTS.has(v.verdict)) return next;

    const review = (why: string) => reviews.push({ key: it.key, verdict: v.verdict, sentencePart: v.sentencePart, reason: v.reason, why });
    if (v.verdict === "not-in-sources") {
      if (!partOk) {
        review("문장에서 문제 구절을 찾지 못함");
        return next;
      }
      const found = findInCorpus(v.sentencePart, body.docs);
      if (found) {
        review(`코드가 원문에서 같은 구절을 찾음(${pageKey(found)})`);
        return next;
      }
      modelWarnings.push({
        id: "",
        type: "no-evidence",
        decider: "model",
        sentenceKey: it.key,
        message: `'${v.sentencePart}'의 근거가 자료에 없습니다.`,
        detail: v.reason,
        sentencePart: v.sentencePart,
      });
    } else {
      if (!src) {
        review("어긋나는 원문 구절을 인용하지 못함");
        return next;
      }
      const numeric = v.verdict === "contradicted" && /\d/.test(v.sentencePart) && /\d/.test(v.sourceQuote);
      modelWarnings.push({
        id: "",
        type: numeric ? "numeric-conflict" : "spec-mismatch",
        decider: "model",
        sentenceKey: it.key,
        message: v.verdict === "condition-omitted" ? "원문에 적힌 적용 조건을 빼거나 반대로 썼습니다." : "원문과 다르게 썼습니다.",
        detail: v.reason,
        quote: v.sourceQuote,
        source: { docId: src.docId, page: src.page },
        sentencePart: partOk ? v.sentencePart : undefined,
      });
    }
    if (v.fix.trim()) fixes.set(it.key, v.fix.trim());
    return next;
  });

  // 4) 코드 판정, 그다음 모델 경고. 같은 문장에 코드가 같은 종류로 이미 경고했으면 모델 판단은 그 경고의 설명에 붙인다.
  const warnings: Warning[] = codeChecks(items, body.cards, body.conflicts, body.docs, { index, pages: cited });
  for (const w of modelWarnings) {
    const same = warnings.find((x) => x.decider === "code" && x.sentenceKey === w.sentenceKey && x.type === w.type);
    if (same) {
      same.detail = [same.detail, `교차 판정도 같은 경고: ${w.detail ?? w.message}`].filter(Boolean).join(" / ");
      same.agreed = true;
    } else warnings.push(w);
  }
  const checklist: ChecklistItem[] = body.guideline && body.scope ? guidelineChecklist(body.guideline, body.scope.title, body.scope.body, items) : [];
  if (emphasisResult) {
    const allKeys = new Set(items.map((i) => i.key));
    emphasis.forEach((p, i) => {
      const e = emphasisResult.find((x) => x.index === i);
      checklist.push({
        group: "emphasis",
        label: p,
        ok: Boolean(e?.covered),
        decider: "model",
        sentenceKeys: (e?.sentenceKeys ?? []).filter((k) => allKeys.has(k)),
        note: e ? (e.covered ? undefined : `반영되지 않음 — ${e.reason}`) : "판정 결과 없음",
      });
    });
  }
  warnings.push(...checklistWarnings(checklist));

  // 판정 엇갈림: 문장 단위로 코드와 (대조를 통과한) 모델 경고 중 한쪽만 있는 경우. 규칙은 "하나라도 경고하면 경고로 띄운다".
  const modelFlagged = new Set(modelWarnings.map((w) => w.sentenceKey));
  const disagreements = verdicts
    .map((v) => ({ key: v.key, code: warnings.some((w) => w.sentenceKey === v.key && w.decider === "code"), model: modelFlagged.has(v.key), reason: v.reason }))
    .filter((d) => d.code !== d.model);
  const codeMs = Date.now() - codeStarted;

  // 5) 붙여넣기 점검은 경고 문장마다 고쳐 쓴 제안을 함께 낸다. 판정 모델의 fix가 없는 문장만 생성 모델을 부른다.
  const suggestStarted = Date.now();
  let suggestions: { key: string; text: string; cardIds: string[] }[] = [];
  let suggestError: string | null = null;
  const flagged = pasted ? items.filter((i) => warnings.some((w) => w.sentenceKey === i.key)) : [];
  for (const it of flagged) {
    const fix = fixes.get(it.key);
    if (fix) suggestions.push({ key: it.key, text: fix, cardIds: it.cardIds });
  }
  const needFix = flagged.filter((i) => !fixes.has(i.key));
  if (needFix.length > 0) {
    // 고칠 문장마다 그 문장의 근거 쪽과 연결 카드만 보여 주고, 묶음 여러 개를 동시에 부른다(전체 카드 목록을 매번 보내지 않는다).
    const chunks: CheckItem[][] = [];
    for (let i = 0; i < needFix.length; i += SUGGEST_BATCH) chunks.push(needFix.slice(i, i + SUGGEST_BATCH));
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const keys = new Set(chunk.flatMap((it) => [...(candMap.get(it.key)?.pages ?? []), ...(cited[it.key] ?? [])].map(pageKey)));
        const pagesBlock = [...keys].map((k) => `<<<${k}>>>\n${pageText.get(k)?.trim() ?? ""}`).join("\n\n");
        const cardIds = new Set(chunk.flatMap((it) => [...it.cardIds, ...(candMap.get(it.key)?.cardIds ?? [])]));
        const block = chunk
          .map((it) => {
            const ws = warnings.filter((w) => w.sentenceKey === it.key).map((w) => `- ${w.message}${w.detail ? ` (${w.detail})` : ""}`);
            return `### ${it.key}\n문장: ${it.text}\n현재 근거: ${it.cardIds.join(", ") || "없음"}\n경고:\n${ws.join("\n")}`;
          })
          .join("\n\n");
        try {
          const { data, meta } = await structured({
            role: "main",
            task: "고쳐 쓴 제안",
            system: REGENERATE_SYSTEM,
            prompt: `## 근거 쪽\n${pagesBlock || "(없음)"}\n\n## 차별점 카드\n${cardIds.size ? cardsBlock(body.cards.filter((c) => cardIds.has(c.id))) : "(없음)"}\n\n## 고칠 문장\n${block}\n\n각 문장의 key를 그대로 돌려준다.`,
            schema: regenerateSchema,
          });
          metas.push(meta);
          return data.sentences.map((s) => ({ key: s.key, text: s.replacement.text, cardIds: s.replacement.cardIds }));
        } catch (e) {
          suggestError = e instanceof Error ? e.message : String(e);
          return [];
        }
      }),
    );
    suggestions = [...suggestions, ...results.flat()];
  }
  const suggestMs = Date.now() - suggestStarted;

  return {
    items,
    warnings: warnings.map((w, i) => ({ ...w, id: `W${i + 1}` })),
    checklist,
    suggestions,
    metrics: computeMetrics(items, warnings),
    metas,
    judgeError: errors.length ? errors.join(" / ") : null,
    verdicts,
    disagreements,
    reviews,
    suggestError,
    timings: { prepareMs, judgeMs, codeMs, suggestMs },
    elapsedMs: Date.now() - started,
  };
}
