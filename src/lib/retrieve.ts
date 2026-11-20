/**
 * 문장과 관련된 근거 쪽을 코드로 찾는다(모델 호출 없음).
 * 쪽 텍스트를 줄 단위 구간으로 나누고, 정규화한 글자 바이그램의 BM25 점수로 순위를 매긴다.
 * 한국어는 띄어쓰기·조사가 흔들려 낱말 단위보다 글자 바이그램이 안정적이다.
 */
import type { Card, SourceDoc } from "./schemas";
import { normalize } from "./text";

export type Passage = { docId: string; page: number; text: string };
export type PageRef = { docId: string; page: number };
export type PageHit = PageRef & { score: number; passage: string };

/** 숫자는 수치 대조가 따로 하므로 검색 바이그램에서 뺀다. */
function grams(s: string): string[] {
  const n = normalize(s).replace(/\d/g, "");
  const out: string[] = [];
  for (let i = 0; i < n.length - 1; i++) out.push(n.slice(i, i + 2));
  return out;
}

/** 줄을 이어 붙여 200자 안팎 구간을 만든다. 앞 구간 마지막 줄을 겹친다. */
export function passagesOf(docs: SourceDoc[], maxChars = 220): Passage[] {
  const out: Passage[] = [];
  for (const d of docs) {
    for (const p of d.pages) {
      const lines = p.text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      let cur: string[] = [];
      let len = 0;
      for (const l of lines) {
        if (len + l.length > maxChars && cur.length) {
          out.push({ docId: d.id, page: p.page, text: cur.join("\n") });
          cur = [cur[cur.length - 1]];
          len = cur[0].length;
        }
        cur.push(l);
        len += l.length;
      }
      if (cur.length) out.push({ docId: d.id, page: p.page, text: cur.join("\n") });
    }
  }
  return out;
}

export type Index = {
  passages: Passage[];
  tf: Map<string, number>[];
  lens: number[];
  df: Map<string, number>;
  avgLen: number;
};

export function buildIndex(docs: SourceDoc[]): Index {
  const passages = passagesOf(docs);
  const tf: Map<string, number>[] = [];
  const lens: number[] = [];
  const df = new Map<string, number>();
  for (const p of passages) {
    const m = new Map<string, number>();
    const g = grams(p.text);
    for (const x of g) m.set(x, (m.get(x) ?? 0) + 1);
    for (const x of m.keys()) df.set(x, (df.get(x) ?? 0) + 1);
    tf.push(m);
    lens.push(g.length);
  }
  const avgLen = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  return { passages, tf, lens, df, avgLen };
}

function bm25(index: Index, query: string[], i: number): number {
  const k1 = 1.2;
  const b = 0.75;
  const N = index.passages.length;
  let s = 0;
  for (const q of new Set(query)) {
    const f = index.tf[i].get(q);
    if (!f) continue;
    const df = index.df.get(q) ?? 0;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    s += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * index.lens[i]) / index.avgLen));
  }
  return s;
}

/** 문장과 가장 관련 있는 쪽 k개. 쪽 점수는 그 쪽 구간 점수의 최댓값이다. */
export function topPages(index: Index, sentence: string, k = 3): PageHit[] {
  const q = grams(sentence);
  const best = new Map<string, PageHit>();
  index.passages.forEach((p, i) => {
    const score = bm25(index, q, i);
    if (score <= 0) return;
    const key = `${p.docId}#${p.page}`;
    const cur = best.get(key);
    if (!cur || score > cur.score) best.set(key, { docId: p.docId, page: p.page, score, passage: p.text });
  });
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return [];
  // 1위 점수의 절반에 못 미치는 쪽은 관련이 약하다고 보고 뺀다.
  return ranked.slice(0, k).filter((h) => h.score >= ranked[0].score * 0.5);
}

/** 문장과 카드(이름·주장·인용·조건)의 관련도 순위. */
export function rankCards(cards: Card[], sentence: string, k = 3): { id: string; score: number }[] {
  const q = new Set(grams(sentence));
  if (q.size === 0) return [];
  return cards
    .map((c) => {
      const g = new Set(grams([c.name, c.claim, ...c.evidence.map((e) => e.quote), ...c.conditions].join(" ")));
      let n = 0;
      for (const x of q) if (g.has(x)) n++;
      return { id: c.id, score: n / q.size };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function pageKey(r: PageRef): string {
  return `${r.docId} p.${r.page}`;
}

/** "docId p.N" 꼴 문자열을 쪽 참조로. */
export function parsePageKey(s: string): PageRef | null {
  const m = s.trim().match(/^(\S+)\s+p\.?\s*(\d+)$/);
  return m ? { docId: m[1], page: Number(m[2]) } : null;
}

/** 두 짧은 글의 글자 바이그램 겹침(작은 쪽 기준 비율). 숫자 주변 맥락 비교에 쓴다. */
export function contextOverlap(a: string, b: string): number {
  const A = new Set(grams(a));
  const B = new Set(grams(b));
  if (A.size === 0 || B.size === 0) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
