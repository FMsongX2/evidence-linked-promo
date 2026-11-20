/**
 * 차별점 카드의 인용문 대조와 문서 간 수치 충돌 판정. 모델의 자기 평가를 쓰지 않고 코드가 판정한다.
 * 서버와 브라우저(카드 수정 후 재대조) 양쪽에서 쓴다.
 */
import type { Card, CardDraft, Conflict, ConflictValue, Evidence, SourceDoc } from "./schemas";
import { extractNumbers, matchQuote, normalize } from "./text";

export function findPage(docs: SourceDoc[], docId: string, page: number): string | null {
  const doc = docs.find((d) => d.id === docId);
  return doc?.pages.find((p) => p.page === page)?.text ?? null;
}

export function verifyEvidence(docs: SourceDoc[], ev: { docId: string; page: number; quote: string }): Evidence {
  const text = findPage(docs, ev.docId, ev.page);
  if (text === null) return { ...ev, match: "none", score: 0 };
  const { match, score } = matchQuote(ev.quote, text);
  return { ...ev, match, score };
}

/** 근거 미확인이 가장 먼저, 그다음 승인하지 않은 수치 충돌, 나머지는 확인. */
export function cardStatus(card: Pick<Card, "evidence" | "conflictIds">, conflicts: Pick<Conflict, "id" | "approvedValue">[] = []): Card["status"] {
  if (card.evidence.length === 0 || card.evidence.some((e) => e.match === "none")) return "unverified";
  const open = card.conflictIds.filter((id) => !conflicts.find((c) => c.id === id)?.approvedValue);
  if (open.length > 0) return "conflict";
  return "confirmed";
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
}

/** 지표 이름이 띄어쓰기·조사 정도만 다르면 같은 지표로 묶는다(바이그램 유사도 0.85 이상). */
function groupMetrics<T extends { metric: string }>(items: T[]): T[][] {
  const groups: { key: string; items: T[] }[] = [];
  for (const it of items) {
    const key = normalize(it.metric);
    const g = groups.find((g) => g.key === key || dice(g.key, key) >= 0.85);
    if (g) g.items.push(it);
    else groups.push({ key, items: [it] });
  }
  return groups.map((g) => g.items);
}

export function detectConflicts(docs: SourceDoc[], metrics: CardDraft["metrics"]): Conflict[] {
  const verified = metrics
    .map((m) => {
      const ev = verifyEvidence(docs, m);
      const num = extractNumbers(m.value)[0] ?? extractNumbers(m.quote)[0];
      return { ...m, match: ev.match, num };
    })
    .filter((m) => m.match !== "none" && m.num);

  const conflicts: Conflict[] = [];
  for (const group of groupMetrics(verified)) {
    const distinct = new Set(group.map((m) => m.num!.value));
    if (distinct.size < 2) continue;
    const values: ConflictValue[] = group.map((m) => ({ value: m.value, docId: m.docId, page: m.page, quote: m.quote, match: m.match }));
    conflicts.push({
      id: `X${conflicts.length + 1}`,
      metric: group[0].metric,
      values,
      cardIds: [...new Set(group.map((m) => m.cardId).filter((x): x is string => Boolean(x)))],
    });
  }
  return conflicts;
}

/** 카드 근거가 충돌 수치와 같은 쪽을 인용하고 그 수치를 담고 있으면 그 충돌에 연결한다. */
function linkConflicts(cards: Card[], conflicts: Conflict[]) {
  for (const c of conflicts) {
    for (const card of cards) {
      const touches = card.evidence.some((e) =>
        c.values.some((v) => v.docId === e.docId && v.page === e.page && extractNumbers(e.quote).some((n) => extractNumbers(v.value).some((x) => x.value === n.value))),
      );
      if (touches && !c.cardIds.includes(card.id)) c.cardIds.push(card.id);
    }
  }
  for (const card of cards) card.conflictIds = conflicts.filter((c) => c.cardIds.includes(card.id)).map((c) => c.id);
}

export function buildCards(docs: SourceDoc[], draft: CardDraft): { cards: Card[]; conflicts: Conflict[] } {
  const cards: Card[] = draft.cards.map((c) => ({
    id: c.id,
    name: c.name,
    claim: c.claim,
    comparison: c.comparison,
    conditions: c.conditions,
    evidence: c.evidence.map((e) => verifyEvidence(docs, e)),
    status: "unverified",
    conflictIds: [],
  }));
  const conflicts = detectConflicts(docs, draft.metrics);
  linkConflicts(cards, conflicts);
  // 어느 카드에도 붙지 않은 충돌은 대조를 통과한 원문만으로 카드를 하나 만들어 보드에 올린다.
  for (const c of conflicts) {
    if (c.cardIds.length > 0) continue;
    const id = `K${cards.length + 1}`;
    cards.push({
      id,
      name: `${c.metric} (자료 간 수치 다름)`,
      claim: `자료마다 ${c.metric}이 다르게 적혀 있습니다: ${[...new Set(c.values.map((v) => v.value))].join(" / ")}.`,
      comparison: null,
      conditions: ["게시 전에 쓸 수치와 출처를 정해야 합니다."],
      evidence: c.values.map((v) => verifyEvidence(docs, v)),
      status: "conflict",
      conflictIds: [c.id],
      origin: "conflict",
    });
    c.cardIds.push(id);
  }
  for (const card of cards) card.status = cardStatus(card);
  return { cards, conflicts };
}

export function reverifyCard(docs: SourceDoc[], card: Card, conflicts: Conflict[]): Card {
  const evidence = card.evidence.map((e) => verifyEvidence(docs, e));
  const next = { ...card, evidence };
  return { ...next, status: cardStatus(next, conflicts) };
}
