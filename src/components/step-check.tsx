"use client";

import { useState } from "react";
import { ChevronRight, ClipboardCheck, Copy, Download, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { guidelineChecklist, type ChecklistItem, type CheckItem } from "@/lib/check";
import type { Card, Warning } from "@/lib/schemas";
import { blogPlainText, caseStudyPlainText } from "@/lib/sentences";
import { cn } from "@/lib/utils";
import { EvidenceChips, EvidenceDetail } from "./evidence";
import { WARNING_LABEL, formatMs, type CheckResult } from "./model";
import { Disclosure, EmptyState, LINE_TAB, LINE_TABS, Note, Pill, Running, StatLine, StepHeader, StepPager, useNav, type Stat } from "./step-frame";
import type { W } from "./workbench";

/** 시연 원고(stage2/measurements.md 2.5절, 번호 표시 제거). 틀린 문장 3개와 필수 키워드·문의처 누락이 들어 있다. */
const DEMO_PASTE = `제목: 티링크 비즈레코딩으로 바꾼 영업사원 통화관리, 통화요약부터 콜센터 프로그램까지

콜센터 프로그램을 알아보다가 티링크 비즈레코딩을 써 보았습니다.
예전에는 외근 중 휴대폰 통화와 사무실 인터넷전화 통화가 따로 남아 상담 이력이 흩어져 있었습니다.
티링크 비즈레코딩은 인터넷전화와 휴대폰, PC 소프트폰 통화를 하나의 서버에 모아 고객별 이력으로 합쳐 줍니다.
통화가 끝나면 한줄요약과 키워드, 화자별 대화가 자동으로 기록되어 통화요약을 따로 쓸 일이 없습니다.
녹취 성공률이 100%라서 놓치는 통화가 하나도 없습니다.
PC폰만 설치하면 모든 통화가 PC에 저장됩니다.
전국 학교 300곳에서도 이미 쓰고 있다고 합니다.
녹취 파일은 AES256으로 암호화되어 보관됩니다.
관리자는 종합리포트의 경영 분석 대시보드에서 이번 주 상황을 한눈에 봅니다.

홈페이지(www.tlinkcrm.com) / 블로그 (https://blog.naver.com/mobilecrm)`;

const flaggedCount = (r: CheckResult) => new Set(r.warnings.map((x) => x.sentenceKey).filter(Boolean)).size;

/** 요약 줄: 경고 문장 수와 점검표 충족 수를 맨 앞에, 그다음 경고 4종과 점검 정보. 승인 구획으로 건너뛰는 링크를 끝에 둔다. */
function ResultSummary({ r, approveId }: { r: CheckResult; approveId?: string }) {
  const m = r.metrics;
  const flagged = flaggedCount(r);
  const ok = r.checklist.filter((x) => x.ok).length;
  const items: Stat[] = [
    { label: "경고 문장", value: `${flagged}개`, tone: flagged > 0 ? "danger" : "success" },
    ...(r.checklist.length ? [{ label: "가이드라인 점검표", value: `충족 ${ok}/${r.checklist.length}`, tone: ok < r.checklist.length ? ("warning" as const) : ("success" as const) }] : []),
    { label: "전체 문장", value: m.sentences },
    { label: "근거가 연결된 문장", value: `${Math.round(m.linkedRatio * 100)}% (${m.linked}/${m.sentences})` },
    ...(["no-evidence", "spec-mismatch", "numeric-conflict", "guideline-missing"] as const).map((t) => ({ label: WARNING_LABEL[t], value: m.byType[t], tone: m.byType[t] > 0 ? ("danger" as const) : undefined })),
    { label: "점검 시간", value: formatMs(r.elapsedMs) },
    { label: `코드 판정 ${m.byDecider.code} · 모델 판정 ${m.byDecider.model}` },
  ];
  return (
    <div className="space-y-2">
      <StatLine items={items} />
      {approveId && (
        <a
          href={`#${approveId}`}
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById(approveId);
            el?.scrollIntoView({ block: "center" });
            el?.querySelector<HTMLElement>("button:not([disabled])")?.focus({ preventScroll: true });
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          승인하러 가기 <ChevronRight aria-hidden className="size-4" />
        </a>
      )}
    </div>
  );
}

function Checklist({ list, items, pending = false }: { list: ChecklistItem[]; items: CheckItem[]; pending?: boolean }) {
  if (list.length === 0) return null;
  const groups: { id: string; match: ChecklistItem["group"][]; title: string }[] = [
    { id: "kw", match: ["keyword"], title: "필수 키워드(제목·본문)" },
    { id: "em", match: ["emphasis"], title: "강조 내용" },
    { id: "bottom", match: ["link", "contact"], title: "하단 링크·문의 정보" },
  ];
  const textOf = (k: string) => items.find((i) => i.key === k)?.text ?? k;
  const ok = list.filter((x) => x.ok).length;
  return (
    <details className="group/cl rounded-xl border" open={pending}>
      <summary className="flex list-none items-center gap-3 rounded-xl px-4 py-3 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/cl:rotate-90" />
        <span className="font-semibold">가이드라인 점검표 {list.length}개 항목</span>
        <span className="flex-1 text-sm text-muted-foreground">{pending ? "점검 전" : `충족 ${ok}/${list.length} · 누락 ${list.length - ok}개`}</span>
        <span className="text-sm text-muted-foreground group-open/cl:hidden">펼치기</span>
        <span className="hidden text-sm text-muted-foreground group-open/cl:inline">접기</span>
      </summary>
      <div className="grid gap-6 border-t px-4 py-4 lg:grid-cols-3">
        {groups.map(({ id: g, match, title }) => {
          // 누락 항목을 먼저 보인다.
          const rows = list.filter((x) => match.includes(x.group)).sort((a, b) => Number(a.ok) - Number(b.ok));
          if (rows.length === 0) return null;
          return (
            <div key={g}>
              <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {title} <span className="font-normal text-muted-foreground tabular-nums">{pending ? rows.length : `${rows.filter((x) => x.ok).length}/${rows.length}`}</span>
                <Pill tone={rows[0].decider === "code" ? "code" : "model"}>{rows[0].decider === "code" ? "코드 판정" : "모델 판정"}</Pill>
              </h4>
              <ul className="mt-2 space-y-2 text-sm">
                {rows.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <Pill tone={pending ? "neutral" : x.ok ? "success" : "danger"} className="mt-0.5">
                      {pending ? "점검 전" : x.ok ? "충족" : "누락"}
                    </Pill>
                    <span className="min-w-0">
                      <span className={cn(g === "em" && "line-clamp-2")} title={x.label}>
                        {x.label}
                      </span>
                      {x.note && <span className="block text-xs text-danger">{x.note}</span>}
                      {x.ok && x.sentenceKeys.length > 0 && (
                        <span className="block truncate text-xs text-muted-foreground" title={x.sentenceKeys.map(textOf).join("\n")}>
                          ↳ “{textOf(x.sentenceKeys[0])}”{x.sentenceKeys.length > 1 ? ` 외 ${x.sentenceKeys.length - 1}문장` : ""}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** 모델만 지적했고 코드 대조로 확인되지 않은 판정. 경고로 세지 않고 사람이 확인할 항목으로 보인다. */
function ReviewList({ w, r }: { w: W; r: CheckResult }) {
  if (!r.reviews?.length) return null;
  return (
    <section data-testid="review-list" className="space-y-3">
      <h3 className="text-lg font-semibold">확인 필요 {r.reviews.length}건 — 모델만 지적했고 코드 대조로는 확인되지 않은 문장</h3>
      <ul className="space-y-3">
        {r.reviews.map((x, i) => {
          const item = r.items.find((it) => it.key === x.key);
          return (
            <li key={i} data-testid="review-item" className="rounded-xl border border-warning-border bg-warning-soft/60 p-4 text-sm">
              <p className="text-base font-medium">“{item?.text ?? x.key}”</p>
              {item && <EvidenceChips s={item} cards={w.cards} docs={w.docs} photos={w.photos} readings={w.readings} />}
              {x.sentencePart && <span className="mt-2 block">모델이 지적한 구절: “{x.sentencePart}”</span>}
              <span className="block text-warning">{x.reason}</span>
              {x.why && <span className="block text-xs text-muted-foreground">{x.why}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WarningList({ w, r, onRewriteOne }: { w: W; r: CheckResult; onRewriteOne?: (key: string) => void }) {
  const rows = r.warnings.filter((x) => x.sentenceKey);
  if (rows.length === 0)
    return (
      <Note tone="success" className="font-medium">
        경고가 없습니다.
      </Note>
    );
  const bySentence = new Map<string, Warning[]>();
  for (const x of rows) bySentence.set(x.sentenceKey!, [...(bySentence.get(x.sentenceKey!) ?? []), x]);
  const cardMap = new Map<string, Card>(w.cards.map((c) => [c.id, c]));
  return (
    <ul className="space-y-3">
      {[...bySentence.entries()].map(([key, ws]) => {
        const item = r.items.find((i) => i.key === key);
        const suggestion = r.suggestions.find((s) => s.key === key);
        const split = (r.disagreements ?? []).find((d) => d.key === key);
        const linked = (item?.cardIds ?? []).map((id) => cardMap.get(id)).filter((c): c is Card => Boolean(c));
        const sourced = ws.filter((x) => x.quote && x.source);
        return (
          <li key={key} data-testid="warning-item" data-sentence-key={key} className="space-y-3 rounded-xl border p-4">
            <p className="text-base font-medium">
              “{item?.text ?? key}”{item && <EvidenceChips s={item} cards={w.cards} docs={w.docs} photos={w.photos} readings={w.readings} />}
            </p>
            {split && (
              <Note tone="warning" className="py-2">
                <span className="font-semibold">
                  판정 엇갈림 · 코드 {split.code ? "경고" : "통과"} / 모델 {split.model ? "경고" : "통과"}
                </span>{" "}
                — 한쪽이라도 경고하면 경고로 띄우고 사람이 확인합니다
                {!split.model && <span className="mt-0.5 block text-xs">모델 의견: {split.reason}</span>}
              </Note>
            )}
            <ul className="space-y-2">
              {ws.map((x) => (
                <li key={x.id} className="text-sm">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Pill tone="danger">{WARNING_LABEL[x.type]}</Pill>
                    <Pill tone={x.decider === "code" ? "code" : "model"}>{x.decider === "code" ? "코드 판정" : "모델 판정"}</Pill>
                    <span>{x.message}</span>
                  </span>
                  {x.sentencePart && <span className="mt-1 block">문제 구절: “{x.sentencePart}”</span>}
                  {x.detail && <span className="mt-0.5 block text-muted-foreground">{x.detail}</span>}
                </li>
              ))}
            </ul>
            {(sourced.length > 0 || linked.length > 0) && (
              <Disclosure summary="원문 근거 비교" className="border-t pt-3">
                <div className="space-y-4">
                  {sourced.map((x) => (
                    <EvidenceDetail key={x.id} ev={{ docId: x.source!.docId, page: x.source!.page, quote: x.quote!, match: "exact", score: 1 }} docs={w.docs} />
                  ))}
                  {linked.length > 0 && (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {linked.flatMap((c) =>
                        c.evidence.slice(0, 2).map((e, i) => (
                          <div key={`${c.id}-${i}`}>
                            <div className="mb-1 text-xs font-semibold text-doc">
                              맞는 근거 · {c.id} {c.name}
                            </div>
                            <EvidenceDetail ev={e} docs={w.docs} />
                          </div>
                        )),
                      )}
                    </div>
                  )}
                </div>
              </Disclosure>
            )}
            {suggestion && (
              <Note tone="success" className="text-foreground">
                <div className="text-xs font-semibold text-success">고쳐 쓴 제안 (근거 {suggestion.cardIds.join(", ") || "없음"})</div>
                <p className="mt-0.5 text-base">{suggestion.text}</p>
              </Note>
            )}
            {onRewriteOne && w.live && (
              <Button
                data-testid="rewrite-one"
                size="sm"
                variant="outline"
                onClick={() => onRewriteOne(key)}
                disabled={Boolean(w.modelBlock) || w.jobs.regen.running || w.jobs.check.running || w.jobs.paste.running || (r.suggestions.length > 0 && !suggestion)}
              >
                <Wand2 /> 이 문장만 다시 쓰기
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 점검 전에 보여 줄 가이드라인 항목 목록(코드 항목 + 강조 내용). */
function pendingChecklist(w: W): ChecklistItem[] {
  if (!w.guideline) return [];
  return [
    ...guidelineChecklist(w.guideline, "", "", []),
    ...w.guideline.emphasisPoints.map((p) => ({ group: "emphasis" as const, label: p, ok: false, decider: "model" as const, sentenceKeys: [] })),
  ];
}

function DraftCheck({ w }: { w: W }) {
  const [copied, setCopied] = useState<string | null>(null);
  const r = w.check;
  const flagged = r ? flaggedCount(r) : 0;
  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }
  return (
    <div className="space-y-8">
      <Running job={w.jobs.check} label="게시 전 점검(코드 대조 → 교차 판정)" />
      <Running job={w.jobs.regen} label="경고 문장 다시 쓰기" />
      {w.checkStale && (
        <Note tone="warning" className="font-medium">
          문장을 고쳤습니다. 다시 점검해야 승인할 수 있습니다.
        </Note>
      )}
      {!r && !w.jobs.check.running && <EmptyState>아직 점검 결과가 없습니다. 3단계 초안을 만든 뒤 점검하기를 누르세요.</EmptyState>}
      {r && (
        <>
          <ResultSummary r={r} approveId="approve-draft" />
          {r.judgeError && <Note tone="warning">교차 판정 모델 호출 실패: {r.judgeError} — 코드 판정 결과만 표시합니다.</Note>}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="mr-auto text-lg font-semibold">사양 경고 — 문장 {flagged}개</h3>
              {w.live && (
                <Button data-testid="rewrite-all" variant="outline" onClick={() => w.regenerateFlagged()} disabled={flagged === 0 || w.jobs.regen.running || w.jobs.check.running || Boolean(w.modelBlock)}>
                  <Wand2 /> 경고 문장만 다시 쓰기
                </Button>
              )}
            </div>
            <WarningList w={w} r={r} onRewriteOne={(k) => w.regenerateFlagged(k)} />
          </section>
          <ReviewList w={w} r={r} />
          <Checklist list={r.checklist} items={r.items} />
          <section id="approve-draft" aria-labelledby="approve-title" className="space-y-3 rounded-xl border bg-rail p-4">
            <h3 id="approve-title" className="text-lg font-semibold">
              승인과 복사
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={w.approved ? "secondary" : "default"}
                onClick={() => w.setApproved(true)}
                disabled={!w.live || w.checkStale || w.approved}
                title={w.checkStale ? "다시 점검한 뒤 승인할 수 있습니다." : undefined}
              >
                <ClipboardCheck /> {w.approved ? "승인됨" : "검수 승인"}
              </Button>
              {!w.approved && flagged > 0 && <span className="text-sm font-medium text-danger">경고 문장 {flagged}개가 남아 있습니다.</span>}
              <Button variant="outline" disabled={!w.approved || !w.generation} onClick={() => copy("블로그", blogPlainText(w.generation!))}>
                <Copy /> 블로그 글 복사
              </Button>
              <Button variant="outline" disabled={!w.approved || !w.generation} onClick={() => copy("설치 사례", caseStudyPlainText(w.generation!))}>
                <Copy /> 설치 사례 글 복사
              </Button>
              {copied && (
                <span role="status" className="text-sm font-medium text-success">
                  {copied} 글을 복사했습니다.
                </span>
              )}
            </div>
            {!w.approved && <p className="text-sm text-muted-foreground">복사는 검수 승인 뒤에 켜집니다.</p>}
          </section>
        </>
      )}
    </div>
  );
}

function PasteCheck({ w }: { w: W }) {
  // 원고 검수는 예시 보기에서도 서버에 모델 키가 있으면 예시 카드로 바로 돌릴 수 있다.
  const pasteModelBlock = w.live ? w.modelBlock : w.config?.providers.main ? null : (w.config?.providers.mainReason ?? "모델을 쓸 수 없습니다.");
  const pasteBlock = pasteModelBlock ?? (w.paste.trim().length === 0 ? "원고를 붙여 넣으세요." : null);
  const pr = w.pasteResult;
  return (
    <div id="paste-check" className="space-y-8">
      <div className="space-y-3">
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          외부 작성자에게 받은 원고를 붙여 넣으면 가이드라인 항목과 사양을 한 번에 대조합니다. 차별점 카드가 이미 있으면 다시 만들지 않습니다.
        </p>
        <Textarea
          data-testid="paste-input"
          value={w.paste}
          onChange={(e) => w.setPaste(e.target.value)}
          rows={8}
          placeholder="리뷰 원고를 붙여 넣으세요(첫 줄은 제목으로 봅니다)."
          aria-label="리뷰 원고"
          className="max-h-[28rem] text-base"
          readOnly={Boolean(pasteModelBlock)}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button data-testid="paste-check-run" size="lg" onClick={w.runPasteCheck} disabled={Boolean(pasteBlock) || w.jobs.paste.running}>
            <RefreshCw /> 원고 검수하기
          </Button>
          {w.live && (
            <Button data-testid="paste-demo" variant="ghost" onClick={() => w.setPaste(DEMO_PASTE)}>
              시연 원고 넣기
            </Button>
          )}
          {pasteBlock && <p className="text-sm text-muted-foreground">{pasteBlock}</p>}
        </div>
      </div>
      <Running job={w.jobs.paste} label={w.cards.length ? "원고 검수(문장 근거 연결 → 코드 대조 → 교차 판정 → 고쳐 쓴 제안)" : "원고 검수(차별점 카드 먼저 만드는 중)"} />
      {!pr && w.guideline && <Checklist pending list={pendingChecklist(w)} items={[]} />}
      {!pr && !w.guideline && !w.jobs.paste.running && <EmptyState>원고를 붙여 넣고 원고 검수하기를 누르면 경고와 가이드라인 점검표가 여기에 나옵니다.</EmptyState>}
      {pr && (
        <>
          <div className="space-y-3">
            <p data-testid="paste-run-status" className="text-sm font-medium text-success">
              검수 {w.pasteRun}회차 완료 · {new Date(pr.checkedAt).toLocaleTimeString("ko-KR")} · 점검 {formatMs(pr.elapsedMs)}
            </p>
            <ResultSummary r={pr} />
          </div>
          {pr.judgeError && <Note tone="warning">교차 판정 모델 호출 실패: {pr.judgeError}</Note>}
          {pr.suggestError && <Note tone="warning">고쳐 쓴 제안 생성 실패: {pr.suggestError}</Note>}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="mr-auto text-lg font-semibold">사양 경고 — 문장 {flaggedCount(pr)}개</h3>
              {w.live && (
                <Button data-testid="rewrite-all-paste" variant="outline" onClick={() => w.applySuggestions()} disabled={pr.suggestions.length === 0 || w.jobs.paste.running || Boolean(w.modelBlock)}>
                  <Wand2 /> 경고 문장만 제안대로 고치고 다시 검수
                </Button>
              )}
            </div>
            <WarningList w={w} r={pr} onRewriteOne={(k) => w.applySuggestions(k)} />
          </section>
          <ReviewList w={w} r={pr} />
          <Checklist list={pr.checklist} items={pr.items} />
          <div>
            <Button variant="outline" onClick={w.downloadRunLog}>
              <Download /> 점검 기록(JSON) 내려받기
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function StepCheck({ w }: { w: W }) {
  const { view, go } = useNav();
  const tab = view === "paste-check" ? "paste" : "draft";
  const r = w.check;
  const blockReason = w.modelBlock ?? (!w.generation ? "3단계 초안이 먼저 필요합니다." : null);
  return (
    <section id="step-4" className="space-y-6">
      <StepHeader
        title="게시 전 점검"
        desc="숫자·키워드·링크는 코드로 대조하고, 주장과 인용의 뜻이 맞는지와 강조 내용 반영은 생성에 쓰지 않은 다른 회사 모델이 판정합니다. 게시는 사람이 합니다."
        actions={
          tab === "draft" ? (
            <Button data-testid="check-run" size="lg" variant={r ? "outline" : "default"} onClick={() => w.runCheck()} disabled={Boolean(blockReason) || w.jobs.check.running}>
              <ShieldCheck /> {r ? "다시 점검" : "점검하기"}
            </Button>
          ) : undefined
        }
        blockReason={tab === "draft" && w.live ? blockReason : null}
      />
      <Tabs value={tab} onValueChange={(v) => go(v === "paste" ? "paste-check" : "step-4")} className="gap-0">
        <TabsList variant="line" className={LINE_TABS}>
          <TabsTrigger value="draft" className={LINE_TAB}>
            생성한 초안 점검
          </TabsTrigger>
          <TabsTrigger value="paste" className={LINE_TAB}>
            외부 리뷰 원고 검수
          </TabsTrigger>
        </TabsList>
        <TabsContent keepMounted value="draft" className="mt-6 text-base">
          <DraftCheck w={w} />
        </TabsContent>
        <TabsContent keepMounted value="paste" className="mt-6 text-base">
          <PasteCheck w={w} />
        </TabsContent>
      </Tabs>
      <StepPager prev={{ view: "step-3", label: "콘텐츠 생성" }} />
    </section>
  );
}
