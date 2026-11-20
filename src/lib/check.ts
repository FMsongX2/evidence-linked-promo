/**
 * 게시 전 점검 중 코드가 판정하는 부분: 근거 없는 사실 문장, 수치 대조, 단정 표현과 적용 조건, 가이드라인 필수 항목.
 * 의미 판단(주장-인용 일치, 강조점 반영)은 judge 모델이 하고 decider: "model"로 표시한다.
 */
import type { Card, Conflict, Guideline, Sentence, SourceDoc, Warning } from "./schemas";
import { comparableUnits, extractNumbers, normalize, sameValue, type NumberToken } from "./text";

export type CheckItem = Sentence & { key: string };

/** 전화번호·날짜처럼 수치 대조 대상이 아닌 숫자를 지운다. */
function stripNonMetric(text: string): string {
  return text
    .replace(/\b\d{2,4}-\d{3,4}-\d{4}\b/g, " ")
    .replace(/\b\d{4}-\d{4}\b/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, " ");
}

function metricNumbers(text: string): NumberToken[] {
  return extractNumbers(stripNonMetric(text));
}

const ABSOLUTE_RE = /(모든|전부|무조건|항상|완벽|누구나|어디서나|언제나|100\s*%|만 설치하면|만 있으면|만으로)/;

function docLabel(docs: SourceDoc[], docId: string, page: number): string {
  const d = docs.find((x) => x.id === docId);
  return `${d?.title ?? docId} ${d?.kind === "url" ? "구간" : "p."}${page}`;
}

export function codeChecks(items: CheckItem[], cards: Card[], conflicts: Conflict[], docs: SourceDoc[]): Warning[] {
  const warnings: Warning[] = [];
  const add = (w: Omit<Warning, "id" | "decider">) => warnings.push({ ...w, id: `W${warnings.length + 1}`, decider: "code" });
  const cardMap = new Map(cards.map((c) => [c.id, c]));

  for (const it of items) {
    if (it.kind === "cta") continue;
    const linked = it.cardIds.map((id) => cardMap.get(id)).filter((c): c is Card => Boolean(c));
    const missingIds = it.cardIds.filter((id) => !cardMap.has(id));

    if (it.kind === "fact" && linked.length === 0 && it.photoIds.length === 0) {
      add({
        type: "no-evidence",
        sentenceKey: it.key,
        message: missingIds.length ? `근거 카드(${missingIds.join(", ")})가 카드 보드에 없습니다.` : "근거 카드가 연결되지 않은 사실 문장입니다.",
      });
    }

    // 수치 대조: 문장 속 수치를 연결된 카드의 원문 인용 수치와 비교한다.
    const pool = linked.flatMap((c) => c.evidence.flatMap((e) => metricNumbers(e.quote).map((n) => ({ n, e }))));
    for (const n of metricNumbers(it.text)) {
      if (pool.some((p) => sameValue(p.n, n))) {
        const conflict = conflicts.find((x) => x.values.some((v) => extractNumbers(v.value).some((vn) => sameValue(vn, n))) && x.cardIds.some((id) => it.cardIds.includes(id)));
        if (conflict) {
          const approved = conflict.approvedValue ? extractNumbers(conflict.approvedValue)[0] : null;
          if (approved && sameValue(approved, n)) continue;
          add({
            type: "numeric-conflict",
            sentenceKey: it.key,
            message: approved
              ? `'${n.raw}'은 승인한 값(${conflict.approvedValue})과 다릅니다(${conflict.metric}).`
              : `'${n.raw}'은 자료마다 다르게 적힌 수치입니다(${conflict.metric}). 쓸 값을 승인하세요.`,
            detail: conflict.values.map((v) => `${v.value} — ${docLabel(docs, v.docId, v.page)}`).join(" / "),
          });
        }
        continue;
      }
      const diff = pool.filter((p) => comparableUnits(p.n, n));
      if (diff.length > 0) {
        // 문장과 낱말이 많이 겹치는 인용을 먼저 보여 준다.
        const words = it.text.normalize("NFKC").split(/[\s,.·()]+/).filter((x) => x.length >= 2 && !/\d/.test(x));
        const overlap = (q: string) => words.filter((x) => q.includes(x)).length;
        const ranked = [...new Map(diff.map((p) => [p.e.quote, p])).values()].sort((a, b) => overlap(b.e.quote) - overlap(a.e.quote));
        add({
          type: "numeric-conflict",
          sentenceKey: it.key,
          message: `문장의 '${n.raw}'이 근거 원문 수치와 다릅니다.`,
          detail: ranked
            .slice(0, 2)
            .map((p) => `원문 '${p.n.raw}': "${p.e.quote}" — ${docLabel(docs, p.e.docId, p.e.page)}`)
            .join(" / "),
        });
        continue;
      }
      // 연결된 카드에 비교할 수치가 없으면 전체 자료에서 같은 수치를 찾는다.
      const where = docs.flatMap((d) => d.pages.filter((p) => metricNumbers(p.text).some((x) => sameValue(x, n))).map((p) => docLabel(docs, d.id, p.page)));
      add({
        type: "no-evidence",
        sentenceKey: it.key,
        message: where.length
          ? `'${n.raw}'의 근거가 연결된 카드에 없습니다. 원문에는 있습니다: ${where.slice(0, 3).join(", ")}.`
          : `'${n.raw}'은 입력한 자료 어디에도 없는 수치입니다.`,
      });
    }

    // 단정 표현: 적용 조건이 있는 카드를 근거로 "모든·무조건·~만 설치하면" 식으로 쓰면 사양 불일치로 본다.
    const m = it.text.match(ABSOLUTE_RE);
    const conditioned = linked.filter((c) => c.conditions.length > 0);
    if (m && conditioned.length > 0) {
      add({
        type: "spec-mismatch",
        sentenceKey: it.key,
        message: `'${m[1].trim()}' 같은 단정 표현이 적용 조건이 있는 카드와 함께 쓰였습니다.`,
        detail: conditioned.map((c) => `${c.id} ${c.name}: ${c.conditions.join("; ")}`).join(" / "),
      });
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
