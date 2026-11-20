/**
 * 게시 전 점검 중 코드가 판정하는 부분: 근거 없는 사실 문장, 수치 대조, 단정 표현과 적용 조건, 가이드라인 필수 항목.
 * 의미 판단(주장-원문 일치, 강조점 반영)은 judge 모델이 하고 decider: "model"로 표시한다.
 *
 * 수치 대조는 문서 전체가 아니라 그 문장의 근거 쪽(연결 카드 인용, 모델이 인용한 쪽, 코드 검색 상위 쪽) 안에서,
 * 숫자 앞뒤 맥락이 문장과 겹치는 수치끼리만 한다. 같은 숫자라도 다른 맥락(다른 지표)이면 근거로 보지 않는다.
 */
import { buildIndex, contextOverlap, pageKey, topPages, type Index, type PageRef } from "./retrieve";
import type { Card, Conflict, Guideline, Sentence, SourceDoc, Warning } from "./schemas";
import { comparableUnits, extractNumbers, normalize, type NumberToken } from "./text";

/** 원고 문장의 근거 원문(코드가 그 쪽 텍스트와 대조해 확인한 인용). 카드 없이 문서·쪽으로 근거를 보일 때 쓴다 */
export type ItemSource = { docId: string; page: number; quote: string };
export type CheckItem = Sentence & { key: string; sources?: ItemSource[] };

/** 전화번호·날짜·주소처럼 수치 대조 대상이 아닌 숫자를 지운다. */
function stripNonMetric(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\b\d{2,4}-\d{3,4}-\d{4}\b/g, " ")
    .replace(/\b\d{4}-\d{4}\b/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, " ");
}

/** 0으로 시작하는 세 자리 이상 숫자(080, 070 같은 번호 앞자리)는 지표가 아니다. */
function metricNumbers(text: string): NumberToken[] {
  return extractNumbers(text).filter((n) => !/^0\d{2,}/.test(n.raw));
}

/** 단정·보편 표현. 적용 조건이 있는 사실을 이렇게 쓰면 조건을 지운 것이 된다. */
export const ABSOLUTE_RE =
  /(모든|전부|무조건|항상|완벽|누구나|어디서나|언제나|100\s*%|만 설치하면|만 있으면|만으로|(?:어떤|어느)(?:\s+\S+){0,2}?\s*\S*?(?:이든|든지|에서도|에서나|라도)|(?:제한|상관|관계|예외)\s*없이)/;

/** 원문 줄이 적용 조건·제한을 말하는지. */
export const CONDITION_RE = /(에서만|에만\s|만\s*(?:사용|가능|지원|제공)|에\s*따라|제한|미만|이상이어야|해야|필요합니다|경우에만|단,|※|참고\s*:)/;

/** 숫자 주변 맥락 겹침이 이 값 이상이면 같은 지표를 말한다고 본다. */
export const CONTEXT_MIN = 0.35;
/** 조건 줄과 문장의 겹침이 이 값 이상이면 그 조건이 문장 대상에 걸린다고 본다. */
export const CONDITION_CONTEXT_MIN = 0.35;
const WINDOW = 20;

function docLabel(docs: SourceDoc[], docId: string, page: number): string {
  const d = docs.find((x) => x.id === docId);
  return `${d?.title ?? docId} ${d?.kind === "url" ? "구간" : "p."}${page}`;
}

/** 같은 값인지. 한쪽에 단위가 없으면(2.0x, 3.5만/월) 값만 같아도 같다고 본다. */
function sameValueLoose(a: NumberToken, b: NumberToken): boolean {
  if (Math.abs(a.value - b.value) > 1e-9) return false;
  return comparableUnits(a, b) || a.unit === "other" || b.unit === "other";
}

type NumberSite = { tok: NumberToken; win: string; line: string; docId: string; page: number };

function sitesOf(text: string, docId: string, page: number): NumberSite[] {
  const s = stripNonMetric(text);
  return metricNumbers(s).map((tok) => {
    const start = s.lastIndexOf("\n", tok.index) + 1;
    const endNl = s.indexOf("\n", tok.index + tok.raw.length);
    const line = s.slice(start, endNl < 0 ? undefined : endNl).trim();
    return { tok, win: s.slice(Math.max(0, tok.index - WINDOW), tok.index + tok.raw.length + WINDOW), line, docId, page };
  });
}

export type CheckContext = {
  /** 문서 검색 색인. 없으면 docs로 만든다 */
  index?: Index;
  /** 문장 키별 근거 쪽(모델이 인용한 쪽 등). 코드 검색 상위 쪽과 연결 카드 인용 쪽에 더한다 */
  pages?: Record<string, PageRef[]>;
};

export function codeChecks(items: CheckItem[], cards: Card[], conflicts: Conflict[], docs: SourceDoc[], ctx: CheckContext = {}): Warning[] {
  const warnings: Warning[] = [];
  const add = (w: Omit<Warning, "id" | "decider">) => warnings.push({ ...w, id: `W${warnings.length + 1}`, decider: "code" });
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const index = ctx.index ?? buildIndex(docs);
  const pageText = new Map(docs.flatMap((d) => d.pages.map((p) => [pageKey({ docId: d.id, page: p.page }), p.text] as const)));
  let corpusSites: NumberSite[] | null = null;

  for (const it of items) {
    if (it.kind === "cta") continue;
    const linked = it.cardIds.map((id) => cardMap.get(id)).filter((c): c is Card => Boolean(c));
    const missingIds = it.cardIds.filter((id) => !cardMap.has(id));

    // 모델 인용이 원문 대조를 통과한 문장(뒷받침이든 어긋남이든)은 근거 위치가 있으므로 '근거 없는 문장'으로 보지 않는다.
    if (it.kind === "fact" && linked.length === 0 && it.photoIds.length === 0 && !it.sources?.length && !ctx.pages?.[it.key]?.length) {
      add({
        type: "no-evidence",
        sentenceKey: it.key,
        message: missingIds.length ? `근거 카드(${missingIds.join(", ")})가 카드 보드에 없습니다.` : "근거 카드나 원문 인용이 연결되지 않은 사실 문장입니다.",
      });
    }

    // 이 문장의 근거 쪽: 모델이 인용한 쪽 + 코드 검색 상위 쪽 + 연결 카드 인용 쪽
    const refs = new Map<string, PageRef>();
    for (const r of [...(ctx.pages?.[it.key] ?? []), ...(it.sources ?? []), ...topPages(index, it.text, 3), ...linked.flatMap((c) => c.evidence)]) {
      refs.set(pageKey(r), { docId: r.docId, page: r.page });
    }
    const sites: NumberSite[] = [
      ...linked.flatMap((c) => c.evidence.flatMap((e) => sitesOf(e.quote, e.docId, e.page))),
      ...[...refs.values()].flatMap((r) => sitesOf(pageText.get(pageKey(r)) ?? "", r.docId, r.page)),
    ];
    const text = stripNonMetric(it.text);
    for (const n of metricNumbers(text)) {
      const win = text.slice(Math.max(0, n.index - WINDOW), n.index + n.raw.length + WINDOW);
      // 같은 지표인지: 숫자 앞뒤 20자 맥락이 겹치거나, 문장이 그 수치가 든 원문 줄과 겹친다(표의 짧은 줄).
      const related = (s: NumberSite) => contextOverlap(win, s.win) >= CONTEXT_MIN || contextOverlap(it.text, s.line) >= CONTEXT_MIN;
      const supports = (s: NumberSite) => sameValueLoose(s.tok, n) && related(s);
      // 근거 쪽에서 못 찾으면(검색이 놓친 경우) 전체 자료에서 같은 맥락의 같은 값을 찾는다.
      const support = sites.find(supports) ?? (corpusSites ??= docs.flatMap((d) => d.pages.flatMap((p) => sitesOf(p.text, d.id, p.page)))).find(supports);
      if (support) {
        // 자료 간 충돌 수치: 같은 지표가 문서마다 다르면 승인한 값과 대조한다.
        const conflict = conflicts.find(
          (x) =>
            x.values.some((v) => extractNumbers(v.value).some((vn) => sameValueLoose(vn, n))) &&
            (x.cardIds.some((id) => it.cardIds.includes(id)) || x.values.some((v) => v.docId === support.docId && v.page === support.page)),
        );
        if (conflict) {
          const approved = conflict.approvedValue ? extractNumbers(conflict.approvedValue)[0] : null;
          if (approved && sameValueLoose(approved, n)) continue;
          add({
            type: "numeric-conflict",
            sentenceKey: it.key,
            message: approved
              ? `'${n.raw}'은 승인한 값(${conflict.approvedValue})과 다릅니다(${conflict.metric}).`
              : `'${n.raw}'은 자료마다 다르게 적힌 수치입니다(${conflict.metric}). 쓸 값을 승인하세요.`,
            detail: conflict.values.map((v) => `${v.value} — ${docLabel(docs, v.docId, v.page)}`).join(" / "),
            sentencePart: n.raw,
          });
        }
        continue;
      }
      // 같은 맥락(같은 지표)에 다른 값이 적혀 있으면 수치 충돌.
      const diff = [...new Map(sites.filter((s) => comparableUnits(s.tok, n) && related(s)).map((s) => [`${s.docId}#${s.page}#${s.line}`, s])).values()].sort(
        (a, b) => contextOverlap(win, b.win) - contextOverlap(win, a.win),
      );
      if (diff.length > 0) {
        const top = diff[0];
        add({
          type: "numeric-conflict",
          sentenceKey: it.key,
          message: `문장의 '${n.raw}'이 근거 원문 수치('${top.tok.raw}')와 다릅니다.`,
          detail: diff
            .slice(0, 2)
            .map((s) => `원문 '${s.tok.raw}': "${s.line}" — ${docLabel(docs, s.docId, s.page)}`)
            .join(" / "),
          quote: top.line,
          source: { docId: top.docId, page: top.page },
          sentencePart: n.raw,
        });
        continue;
      }
      add({
        type: "no-evidence",
        sentenceKey: it.key,
        message: `'${n.raw}'을 뒷받침하는 같은 맥락의 수치를 근거 원문에서 찾지 못했습니다.`,
        detail: refs.size ? `찾아본 쪽: ${[...refs.values()].map((r) => docLabel(docs, r.docId, r.page)).join(", ")}` : undefined,
        sentencePart: n.raw,
      });
    }

    // 단정 표현: 적용 조건이 있는 카드나, 문장과 같은 대상을 말하는 원문 조건 줄이 있는데 "모든·어떤 ~든·제한 없이"로 쓰면 사양 불일치.
    const m = it.text.match(ABSOLUTE_RE);
    if (m) {
      const conditioned = linked.filter((c) => c.conditions.length > 0);
      const lines = [...refs.values()]
        .flatMap((r) =>
          (pageText.get(pageKey(r)) ?? "")
            .split(/\n+/)
            .map((l) => l.trim())
            .filter((l) => CONDITION_RE.test(l))
            .map((line) => ({ line, overlap: contextOverlap(it.text, line), ...r })),
        )
        .filter((l) => l.overlap >= CONDITION_CONTEXT_MIN)
        .sort((a, b) => b.overlap - a.overlap);
      if (conditioned.length > 0 || lines.length > 0) {
        const best = lines[0];
        add({
          type: "spec-mismatch",
          sentenceKey: it.key,
          message: `'${m[1].trim()}' 같은 단정 표현이 적용 조건이 있는 사실과 함께 쓰였습니다.`,
          detail: [
            ...conditioned.map((c) => `${c.id} ${c.name}: ${c.conditions.join("; ")}`),
            ...(best ? [`원문 조건: "${best.line}" — ${docLabel(docs, best.docId, best.page)}`] : []),
          ].join(" / "),
          quote: best?.line,
          source: best ? { docId: best.docId, page: best.page } : undefined,
          sentencePart: m[1].trim(),
        });
      }
    }
  }
  return warnings;
}

function linkKey(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export type ChecklistItem = {
  group: "keyword" | "emphasis" | "link" | "contact";
  label: string;
  ok: boolean;
  decider: "code" | "model";
  /** 충족한 문장 키. 제목·해시태그처럼 문장 밖에서만 찾았으면 비어 있을 수 있다 */
  sentenceKeys: string[];
  note?: string;
};

/**
 * 가이드라인 필수 키워드(제목·본문), 하단 링크, 문의처를 코드로 판정한 점검표.
 * 강조 내용은 의미 판단이 필요해 judge 모델 결과로 따로 채운다.
 */
export function guidelineChecklist(g: Guideline, title: string | null, body: string, items: CheckItem[]): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const nb = normalize(body);
  const nt = title === null ? null : normalize(title);
  const where = (pred: (text: string) => boolean) => items.filter((i) => pred(i.text)).map((i) => i.key);
  for (const kw of g.requiredKeywords) {
    const k = normalize(kw);
    const inBody = nb.includes(k);
    const inTitle = nt === null ? null : nt.includes(k);
    out.push({
      group: "keyword",
      label: kw,
      ok: inBody && inTitle !== false,
      decider: "code",
      sentenceKeys: where((t) => normalize(t).includes(k)),
      note: inTitle === false ? (inBody ? "본문에는 있으나 제목에 없음" : "제목과 본문에 없음") : inBody ? undefined : "본문에 없음",
    });
  }
  const linkHas = (url: string) => (t: string) => t.toLowerCase().replace(/\s+/g, "").includes(linkKey(url));
  const phoneHas = (c: string) => {
    const phones = (c.match(/\d{2,4}-\d{3,4}(-\d{4})?/g) ?? []).map((p) => p.replace(/\D/g, ""));
    return (t: string) => phones.length > 0 && phones.every((p) => t.replace(/\D/g, "").includes(p));
  };
  // 문의처와 이름이 같은 링크(예: "상담 문의" 페이지)는 문의 정보 한 항목으로 묶는다. 링크나 번호 중 하나가 있으면 충족.
  const merged = new Set<string>();
  for (const c of g.contact) {
    const link = g.links.find((l) => normalize(c).includes(normalize(l.label)));
    if (link) merged.add(link.url);
    const hasPhone = phoneHas(c);
    const hasLink = link ? linkHas(link.url) : () => false;
    const has = (t: string) => hasPhone(t) || hasLink(t);
    const parts = [c, link?.url].filter(Boolean).join(" · ");
    out.push({
      group: "contact",
      label: parts,
      ok: has(body),
      decider: "code",
      sentenceKeys: where(has),
      note: has(body) && !(hasPhone(body) && hasLink(body)) && link ? `${hasPhone(body) ? "링크" : "대표번호"}는 없음` : undefined,
    });
  }
  for (const l of g.links) {
    if (merged.has(l.url)) continue;
    const has = linkHas(l.url);
    out.push({ group: "link", label: `${l.label} ${l.url}`, ok: has(body), decider: "code", sentenceKeys: where(has) });
  }
  return out;
}

/** 점검표에서 빠진 항목을 '가이드라인 누락' 경고로 바꾼다. */
export function checklistWarnings(list: ChecklistItem[]): Warning[] {
  const name = { keyword: "필수 키워드", emphasis: "강조 내용", link: "하단 링크", contact: "문의처" };
  return list
    .filter((x) => !x.ok)
    .map((x, i) => ({
      id: `G${i + 1}`,
      type: "guideline-missing" as const,
      decider: x.decider,
      sentenceKey: null,
      message: `${name[x.group]} '${x.label.length > 40 ? `${x.label.slice(0, 40)}…` : x.label}'${x.note ? `: ${x.note}` : "이(가) 없습니다."}`,
      detail: x.group === "emphasis" ? x.label : undefined,
    }));
}

export type CheckMetrics = {
  sentences: number;
  linked: number;
  linkedRatio: number;
  factual: number;
  factualLinked: number;
  warnings: number;
  byType: Record<Warning["type"], number>;
  byDecider: Record<Warning["decider"], number>;
};

export function computeMetrics(items: CheckItem[], warnings: Warning[]): CheckMetrics {
  const linked = items.filter((i) => i.cardIds.length + i.photoIds.length > 0).length;
  const factual = items.filter((i) => i.kind === "fact");
  const byType = { "no-evidence": 0, "spec-mismatch": 0, "numeric-conflict": 0, "guideline-missing": 0 };
  const byDecider = { code: 0, model: 0 };
  for (const w of warnings) {
    byType[w.type]++;
    byDecider[w.decider]++;
  }
  return {
    sentences: items.length,
    linked,
    linkedRatio: items.length ? linked / items.length : 0,
    factual: factual.length,
    factualLinked: factual.filter((i) => i.cardIds.length + i.photoIds.length > 0).length,
    warnings: warnings.length,
    byType,
    byDecider,
  };
}
