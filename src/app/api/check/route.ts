import { checklistWarnings, codeChecks, computeMetrics, guidelineChecklist, type ChecklistItem, type CheckItem } from "@/lib/check";
import { LIMITS } from "@/lib/env";
import { errorResponse, rateLimited } from "@/lib/guard";
import { structured } from "@/lib/llm";
import { ATTRIBUTION_SYSTEM, JUDGE_SYSTEM, REGENERATE_SYSTEM, cardsBlock } from "@/lib/prompts";
import {
  attributionSchema,
  judgeSchema,
  regenerateSchema,
  type Card,
  type Conflict,
  type Guideline,
  type LlmMeta,
  type PhotoReading,
  type SourceDoc,
  type Warning,
} from "@/lib/schemas";
import { splitSentences } from "@/lib/text";

export const maxDuration = 300;

type Body = {
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

/**
 * 4단계 게시 전 점검.
 * 1) (붙여넣기) 문장마다 관련 카드 연결 2) 코드 판정: 근거 없음·수치·단정 표현·필수 키워드·링크·문의처
 * 3) 생성에 쓰지 않은 judge 모델: 주장-인용 일치, 강조 내용 반영 4) (붙여넣기) 경고 문장 고쳐 쓴 제안
 */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  const started = Date.now();
  try {
    const body = (await req.json()) as Body;
    const metas: LlmMeta[] = [];
    let items = body.items ?? [];
    const pasted = body.pasted !== undefined;

    if (pasted) {
      if (body.pasted!.length > LIMITS.pasteChars) return Response.json({ error: `원고는 ${LIMITS.pasteChars}자까지 받습니다.` }, { status: 413 });
      const lines = splitSentences(body.pasted!);
      if (lines.length === 0) return Response.json({ error: "원고가 비어 있습니다." }, { status: 400 });
      if (body.cards.length === 0) return Response.json({ error: "차별점 카드가 없습니다. 1단계를 먼저 실행하세요." }, { status: 400 });
      const { data, meta } = await structured({
        role: "main",
        task: "원고 문장 근거 연결",
        system: ATTRIBUTION_SYSTEM,
        prompt: `## 차별점 카드\n${cardsBlock(body.cards)}\n\n## 원고 문장\n${lines.map((l, i) => `${i}. ${l}`).join("\n")}`,
        schema: attributionSchema,
      });
      metas.push(meta);
      const known = new Set(body.cards.map((c) => c.id));
      items = lines.map((text, i) => {
        const a = data.sentences.find((s) => s.index === i);
        return { key: `paste.${i}`, text, cardIds: (a?.cardIds ?? []).filter((id) => known.has(id)), photoIds: [], kind: a?.kind ?? "fact" };
      });
    }

    const warnings: Warning[] = codeChecks(items, body.cards, body.conflicts, body.docs);
    const checklist: ChecklistItem[] = body.guideline && body.scope ? guidelineChecklist(body.guideline, body.scope.title, body.scope.body, items) : [];

    let judgeError: string | null = null;
    /** 문장별 모델 판정. 판정 엇갈림 표시에 쓴다 */
    const verdicts: { key: string; verdict: string; reason: string }[] = [];
    const facts = items.filter((i) => i.kind === "fact");
    const emphasis = body.guideline && body.scope ? body.guideline.emphasisPoints : [];
    if (facts.length > 0 || emphasis.length > 0) {
      try {
        const cardMap = new Map(body.cards.map((c) => [c.id, c]));
        const photoMap = new Map((body.readings ?? []).map((r) => [r.photoId, r]));
        const sentenceBlock = facts
          .map((it) => {
            const lines = [`### ${it.key}`, `문장: ${it.text}`];
            for (const id of it.cardIds) {
              const c = cardMap.get(id);
              if (!c) continue;
              lines.push(`카드 ${c.id} 주장: ${c.claim}`);
              for (const e of c.evidence) lines.push(`  원문(${e.docId} p.${e.page}): "${e.quote}"`);
              if (c.conditions.length) lines.push(`  적용 조건: ${c.conditions.join("; ")}`);
            }
            for (const id of it.photoIds) {
              const r = photoMap.get(id);
              if (r) lines.push(`사진 ${id}: ${r.caption}`);
            }
            if (it.cardIds.length + it.photoIds.length === 0) lines.push("(연결된 근거 없음)");
            return lines.join("\n");
          })
          .join("\n\n");
        const { data, meta } = await structured({
          role: "judge",
          task: "교차 판정",
          system: JUDGE_SYSTEM,
          prompt: `## 판정할 문장\n${sentenceBlock || "(사실 문장 없음. sentences는 빈 배열)"}\n\n## 가이드라인 강조 내용\n${
            emphasis.length ? emphasis.map((p, i) => `${i}. ${p}`).join("\n") : "(없음. emphasis는 빈 배열)"
          }\n\n## 원고 전체(문장 키와 문장)\n${body.scope?.title && !pasted ? `[제목] ${body.scope.title}\n` : ""}${items.map((i) => `[${i.key}] ${i.text}`).join("\n")}`,
          schema: judgeSchema,
        });
        metas.push(meta);
        const keys = new Set(facts.map((f) => f.key));
        for (const v of data.sentences) {
          if (!keys.has(v.key)) continue;
          verdicts.push({ key: v.key, verdict: v.verdict, reason: v.reason });
          if (v.verdict === "unsupported" || v.verdict === "condition-violated") {
            warnings.push({
              id: `M${warnings.length + 1}`,
              type: v.verdict === "unsupported" ? "no-evidence" : "spec-mismatch",
              decider: "model",
              sentenceKey: v.key,
              message: v.verdict === "unsupported" ? "근거 원문이 이 주장을 뒷받침하지 않습니다." : "카드의 적용 조건과 어긋납니다.",
              detail: v.reason,
            });
          }
        }
        const allKeys = new Set(items.map((i) => i.key));
        emphasis.forEach((p, i) => {
          const e = data.emphasis.find((x) => x.index === i);
          checklist.push({
            group: "emphasis",
            label: p,
            ok: Boolean(e?.covered),
            decider: "model",
            sentenceKeys: (e?.sentenceKeys ?? []).filter((k) => allKeys.has(k)),
            note: e ? (e.covered ? undefined : `반영되지 않음 — ${e.reason}`) : "판정 결과 없음",
          });
        });
      } catch (e) {
        judgeError = e instanceof Error ? e.message : String(e);
      }
    }
    warnings.push(...checklistWarnings(checklist));

    // 판정 엇갈림: 문장 단위로 코드와 모델 중 한쪽만 경고한 경우. 규칙은 "하나라도 경고하면 경고로 띄운다".
    const disagreements = verdicts
      .map((v) => {
        const code = warnings.some((w) => w.sentenceKey === v.key && w.decider === "code");
        const model = v.verdict === "unsupported" || v.verdict === "condition-violated";
        return { key: v.key, code, model, reason: v.reason };
      })
      .filter((d) => d.code !== d.model);

    // 붙여넣기 점검은 경고 문장마다 고쳐 쓴 제안을 함께 낸다.
    let suggestions: { key: string; text: string; cardIds: string[] }[] = [];
    let suggestError: string | null = null;
    const flagged = pasted ? items.filter((i) => warnings.some((w) => w.sentenceKey === i.key)) : [];
    if (flagged.length > 0) {
      try {
        const block = flagged
          .map((it) => {
            const ws = warnings.filter((w) => w.sentenceKey === it.key).map((w) => `- ${w.message}${w.detail ? ` (${w.detail})` : ""}`);
            return `### ${it.key}\n문장: ${it.text}\n현재 근거: ${it.cardIds.join(", ") || "없음"}\n경고:\n${ws.join("\n")}`;
          })
          .join("\n\n");
        const { data, meta } = await structured({
          role: "main",
          task: "고쳐 쓴 제안",
          system: REGENERATE_SYSTEM,
          prompt: `## 차별점 카드\n${cardsBlock(body.cards)}\n\n## 고칠 문장\n${block}\n\n각 문장의 key를 그대로 돌려준다.`,
          schema: regenerateSchema,
        });
        metas.push(meta);
        suggestions = data.sentences.map((s) => ({ key: s.key, text: s.replacement.text, cardIds: s.replacement.cardIds }));
      } catch (e) {
        suggestError = e instanceof Error ? e.message : String(e);
      }
    }

    return Response.json({
      items,
      warnings: warnings.map((w, i) => ({ ...w, id: `W${i + 1}` })),
      checklist,
      suggestions,
      metrics: computeMetrics(items, warnings),
      metas,
      judgeError,
      verdicts,
      disagreements,
      suggestError,
      elapsedMs: Date.now() - started,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
