"use client";

import { useState } from "react";
import { ClipboardCheck, Copy, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { guidelineChecklist, type ChecklistItem, type CheckItem } from "@/lib/check";
import type { Card, Warning } from "@/lib/schemas";
import { blogPlainText, caseStudyPlainText } from "@/lib/sentences";
import { cn } from "@/lib/utils";
import { EvidenceChips, EvidenceDetail } from "./evidence";
import { WARNING_LABEL, formatMs, type CheckResult } from "./model";
import { Running, SectionHeader, type W } from "./workbench";

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

function Metrics({ r }: { r: CheckResult }) {
  const m = r.metrics;
  const box = "rounded-xl border bg-white px-4 py-3";
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <div className={box}>
        <div className="text-sm text-muted-foreground">전체 문장</div>
        <div className="text-2xl font-extrabold">{m.sentences}</div>
      </div>
      <div className={box}>
        <div className="text-sm text-muted-foreground">근거가 연결된 문장</div>
        <div className="text-2xl font-extrabold">
          {Math.round(m.linkedRatio * 100)}% <span className="text-base font-semibold text-muted-foreground">({m.linked}/{m.sentences})</span>
        </div>
      </div>
      {(["no-evidence", "spec-mismatch", "numeric-conflict", "guideline-missing"] as const).map((t) => (
        <div key={t} className={cn(box, m.byType[t] > 0 && "border-red-300 bg-red-50")}>
          <div className="text-sm text-muted-foreground">{WARNING_LABEL[t]}</div>
          <div className="text-2xl font-extrabold">{m.byType[t]}</div>
        </div>
      ))}
      <div className={box}>
        <div className="text-sm text-muted-foreground">점검 시간</div>
        <div className="text-2xl font-extrabold">{formatMs(r.elapsedMs)}</div>
        <div className="text-xs text-muted-foreground">
          코드 판정 {m.byDecider.code} · 모델 판정 {m.byDecider.model}
        </div>
      </div>
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
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="mb-2 text-lg font-bold">
        가이드라인 점검표 {list.length}개 항목{" "}
        <span className="text-base font-semibold text-muted-foreground">{pending ? "점검 전" : `충족 ${list.filter((x) => x.ok).length}/${list.length}`}</span>
      </h3>
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map(({ id: g, match, title }) => {
          const rows = list.filter((x) => match.includes(x.group));
          if (rows.length === 0) return null;
          return (
            <div key={g}>
              <h4 className="mb-1 flex items-center gap-2 font-semibold">
                {title} {pending ? rows.length : `${rows.filter((x) => x.ok).length}/${rows.length}`}
                <span className={cn("rounded px-1.5 text-xs font-semibold", rows[0].decider === "code" ? "bg-slate-200 text-slate-800" : "bg-violet-100 text-violet-800")}>
                  {rows[0].decider === "code" ? "코드 판정" : "모델 판정"}
                </span>
              </h4>
              <ul className="space-y-1 text-[0.95rem]">
                {rows.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={cn("mt-0.5 shrink-0 rounded px-1.5 text-xs font-bold text-white", pending ? "bg-slate-400" : x.ok ? "bg-emerald-600" : "bg-red-600")}>
                      {pending ? "점검 전" : x.ok ? "충족" : "누락"}
                    </span>
                    <span className="min-w-0">
                      <span className={cn(g === "em" && "line-clamp-2")} title={x.label}>
                        {x.label}
                      </span>
                      {x.note && <span className="block text-xs text-red-700">{x.note}</span>}
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
    </div>
  );
}

function WarningList({ w, r, onlySentence }: { w: W; r: CheckResult; onlySentence?: boolean }) {
  const rows = r.warnings.filter((x) => (onlySentence ? x.sentenceKey : true));
  if (rows.length === 0) return <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-900">경고가 없습니다.</p>;
  const bySentence = new Map<string, Warning[]>();
  const general: Warning[] = [];
  for (const x of rows) {
    if (x.sentenceKey) bySentence.set(x.sentenceKey, [...(bySentence.get(x.sentenceKey) ?? []), x]);
    else general.push(x);
  }
  const cardMap = new Map<string, Card>(w.cards.map((c) => [c.id, c]));
  return (
    <div className="space-y-3">
      {[...bySentence.entries()].map(([key, ws]) => {
        const item = r.items.find((i) => i.key === key);
        const suggestion = r.suggestions.find((s) => s.key === key);
        const split = (r.disagreements ?? []).find((d) => d.key === key);
        const linked = (item?.cardIds ?? []).map((id) => cardMap.get(id)).filter((c): c is Card => Boolean(c));
        return (
          <div key={key} className="rounded-xl border border-red-200 bg-white p-4">
            <p className="text-[1.05rem] font-semibold">“{item?.text ?? key}”</p>
            {item && <EvidenceChips s={item} cards={w.cards} docs={w.docs} photos={w.photos} readings={w.readings} />}
            {split && (
              <p className="mt-2 inline-block rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900">
                판정 엇갈림 · 코드 {split.code ? "경고" : "통과"} / 모델 {split.model ? "경고" : "통과"} — 한쪽이라도 경고하면 경고로 띄우고 사람이 확인합니다
                {!split.model && <span className="block text-xs font-normal">모델 의견: {split.reason}</span>}
              </p>
            )}
            <ul className="mt-2 space-y-1">
              {ws.map((x) => (
                <li key={x.id} className="text-[0.95rem]">
                  <span className="mr-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">{WARNING_LABEL[x.type]}</span>
                  <span className={cn("mr-2 rounded px-1.5 py-0.5 text-xs font-semibold", x.decider === "code" ? "bg-slate-200 text-slate-800" : "bg-violet-100 text-violet-800")}>
                    {x.decider === "code" ? "코드 판정" : "모델 판정"}
                  </span>
                  {x.message}
                  {x.detail && <span className="block pl-2 text-sm text-muted-foreground">{x.detail}</span>}
                </li>
              ))}
            </ul>
            {linked.length > 0 && (
              <div className="mt-3 grid gap-3 border-t pt-3 lg:grid-cols-2">
                {linked.flatMap((c) =>
                  c.evidence.slice(0, 2).map((e, i) => (
                    <div key={`${c.id}-${i}`}>
                      <div className="mb-1 text-xs font-semibold text-blue-800">
                        맞는 근거 · {c.id} {c.name}
                      </div>
                      <EvidenceDetail ev={e} docs={w.docs} />
                    </div>
                  )),
                )}
              </div>
            )}
            {suggestion && (
              <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                <div className="text-xs font-bold text-emerald-800">고쳐 쓴 제안 (근거 {suggestion.cardIds.join(", ") || "없음"})</div>
                <p className="text-[1.02rem]">{suggestion.text}</p>
              </div>
            )}
          </div>
        );
      })}
      {general.length > 0 && !onlySentence && (
        <div className="rounded-xl border bg-white p-4">
          <h4 className="mb-1 font-semibold">문장 밖 경고</h4>
          <ul className="space-y-1 text-[0.95rem]">
            {general.map((x) => (
              <li key={x.id}>
                <span className="mr-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">{WARNING_LABEL[x.type]}</span>
                {x.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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

export function StepCheck({ w }: { w: W }) {
  const [copied, setCopied] = useState<string | null>(null);
  const r = w.check;
  const blockReason = w.modelBlock ?? (!w.generation ? "3단계 초안이 먼저 필요합니다." : null);
  const flaggedSentences = r ? new Set(r.warnings.map((x) => x.sentenceKey).filter(Boolean)).size : 0;
  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }
  const pasteBlock = w.modelBlock ?? (w.paste.trim().length === 0 ? "원고를 붙여 넣으세요." : null);
  return (
    <section id="step-4" className="scroll-mt-32 space-y-6 rounded-2xl border bg-white p-6">
      <SectionHeader
        n={4}
        title="게시 전 점검"
        desc="숫자·키워드·링크는 코드로 대조하고, 주장과 인용의 뜻이 맞는지와 강조 내용 반영은 생성에 쓰지 않은 다른 회사 모델이 판정합니다. 게시는 사람이 합니다."
      >
        <Button size="lg" onClick={() => w.runCheck()} disabled={Boolean(blockReason) || w.jobs.check.running}>
          <ShieldCheck /> {r ? "다시 점검" : "점검하기"}
        </Button>
      </SectionHeader>
      {blockReason && w.live && <p className="-mt-4 text-right text-sm text-muted-foreground">{blockReason}</p>}
      <Running job={w.jobs.check} label="게시 전 점검(코드 대조 → 교차 판정)" />
      <Running job={w.jobs.regen} label="경고 문장 다시 쓰기" />
      {w.checkStale && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-900">문장을 고쳤습니다. 다시 점검해야 승인할 수 있습니다.</p>}
      {!r && !w.jobs.check.running && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">아직 점검 결과가 없습니다.</p>}
      {r && (
        <div className="space-y-4">
          <Metrics r={r} />
          {r.judgeError && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">교차 판정 모델 호출 실패: {r.judgeError} — 코드 판정 결과만 표시합니다.</p>}
          <Checklist list={r.checklist} items={r.items} />
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-lg font-bold">사양 경고 — 문장 {flaggedSentences}개</h3>
            {w.live && (
              <Button variant="outline" onClick={w.regenerateFlagged} disabled={flaggedSentences === 0 || w.jobs.regen.running || w.jobs.check.running || Boolean(w.modelBlock)}>
                <Wand2 /> 경고 문장만 다시 쓰기
              </Button>
            )}
            <Button
              variant={w.approved ? "secondary" : "default"}
              onClick={() => w.setApproved(true)}
              disabled={!w.live || w.checkStale || w.approved}
              title={w.checkStale ? "다시 점검한 뒤 승인할 수 있습니다." : undefined}
            >
              <ClipboardCheck /> {w.approved ? "승인됨" : "검수 승인"}
            </Button>
            <Button variant="outline" disabled={!w.approved || !w.generation} onClick={() => copy("블로그", blogPlainText(w.generation!))}>
              <Copy /> 블로그 글 복사
            </Button>
            <Button variant="outline" disabled={!w.approved || !w.generation} onClick={() => copy("설치 사례", caseStudyPlainText(w.generation!))}>
              <Copy /> 설치 사례 글 복사
            </Button>
            {copied && <span className="text-sm font-semibold text-emerald-700">{copied} 글을 복사했습니다.</span>}
          </div>
          {!w.approved && <p className="-mt-2 text-right text-sm text-muted-foreground">복사는 검수 승인 뒤에 켜집니다.</p>}
          <WarningList w={w} r={r} onlySentence />
        </div>
      )}

      <div className="space-y-4 border-t pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold">외부 리뷰 원고 검수</h3>
            <p className="text-[0.95rem] text-muted-foreground">
              외부 작성자에게 받은 원고를 붙여 넣으면 가이드라인 항목과 사양을 한 번에 대조합니다. 차별점 카드가 이미 있으면 다시 만들지 않습니다.
            </p>
          </div>
          <div className="flex gap-2">
            {w.live && (
              <Button variant="ghost" onClick={() => w.setPaste(DEMO_PASTE)}>
                시연 원고 넣기
              </Button>
            )}
            <Button size="lg" onClick={w.runPasteCheck} disabled={Boolean(pasteBlock) || w.jobs.paste.running}>
              <RefreshCw /> 원고 검수하기
            </Button>
          </div>
        </div>
        {pasteBlock && w.live && <p className="-mt-2 text-right text-sm text-muted-foreground">{pasteBlock}</p>}
        <Textarea value={w.paste} onChange={(e) => w.setPaste(e.target.value)} rows={8} placeholder="리뷰 원고를 붙여 넣으세요(첫 줄은 제목으로 봅니다)." className="text-[1rem]" readOnly={!w.live} />
        <Running job={w.jobs.paste} label={w.cards.length ? "원고 검수(문장 근거 연결 → 코드 대조 → 교차 판정 → 고쳐 쓴 제안)" : "원고 검수(차별점 카드 먼저 만드는 중)"} />
        {!w.pasteResult && w.guideline && <Checklist pending list={pendingChecklist(w)} items={[]} />}
        {w.pasteResult && (
          <div className="space-y-4">
            <Metrics r={w.pasteResult} />
            {w.pasteResult.judgeError && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">교차 판정 모델 호출 실패: {w.pasteResult.judgeError}</p>}
            {w.pasteResult.suggestError && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">고쳐 쓴 제안 생성 실패: {w.pasteResult.suggestError}</p>}
            <Checklist list={w.pasteResult.checklist} items={w.pasteResult.items} />
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-lg font-bold">사양 경고 — 문장 {new Set(w.pasteResult.warnings.map((x) => x.sentenceKey).filter(Boolean)).size}개</h3>
              {w.live && (
                <Button variant="outline" onClick={w.applySuggestions} disabled={w.pasteResult.suggestions.length === 0 || w.jobs.paste.running || Boolean(w.modelBlock)}>
                  <Wand2 /> 경고 문장만 제안대로 고치고 다시 검수
                </Button>
              )}
              <Button variant="ghost" onClick={w.downloadRunLog}>
                점검 기록(JSON) 내려받기
              </Button>
            </div>
            <WarningList w={w} r={w.pasteResult} onlySentence />
          </div>
        )}
      </div>
    </section>
  );
}
