"use client";

import { useState } from "react";
import { Globe, Pencil, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Card } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { EvidenceDetail, StatusBadge } from "./evidence";
import { docLabel } from "./model";
import { MetaLine, Running, SectionHeader, type W } from "./workbench";

const SUGGESTED_URLS = [
  { label: "AI 녹취", url: "https://www.tlinkcrm.com/recording.php" },
  { label: "설치 사례", url: "https://www.tlinkcrm.com/case.php" },
];

function CardEditor({ card, onSave, onCancel }: { card: Card; onSave: (c: Card) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(card);
  return (
    <div className="space-y-2">
      <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="차별점 이름" />
      <Textarea value={draft.claim} onChange={(e) => setDraft({ ...draft, claim: e.target.value })} aria-label="주장" rows={3} />
      <Textarea
        value={draft.conditions.join("\n")}
        onChange={(e) => setDraft({ ...draft, conditions: e.target.value.split("\n").filter((x) => x.trim()) })}
        aria-label="적용 조건(줄마다 하나)"
        placeholder="적용 조건(줄마다 하나)"
        rows={2}
      />
      {draft.evidence.map((e, i) => (
        <Textarea
          key={i}
          value={e.quote}
          aria-label={`인용문 ${i + 1}`}
          rows={2}
          onChange={(ev) => setDraft({ ...draft, evidence: draft.evidence.map((x, j) => (j === i ? { ...x, quote: ev.target.value } : x)) })}
        />
      ))}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(draft)}>
          저장하고 원문 다시 대조
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}

function CardTile({ w, card }: { w: W; card: Card }) {
  const [editing, setEditing] = useState(false);
  const on = w.selected.includes(card.id);
  const conflicts = w.conflicts.filter((c) => card.conflictIds.includes(c.id));
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm",
        card.status === "unverified" && "border-red-300",
        card.status === "conflict" && "border-orange-300",
        !on && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox data-testid="card-toggle" checked={on} onCheckedChange={() => w.toggleCard(card.id)} aria-label={`${card.id} 콘텐츠에 사용`} />
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-sm font-bold text-white">{card.id}</span>
          <span className="text-lg font-bold leading-tight">{card.name}</span>
        </div>
        <StatusBadge status={card.status} />
      </div>
      {editing ? (
        <CardEditor
          card={card}
          onCancel={() => setEditing(false)}
          onSave={(c) => {
            w.updateCard(c);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <p className="text-[1.02rem] leading-relaxed">{card.claim}</p>
          {card.comparison && (
            <p className="text-sm">
              <b className="text-slate-500">비교 대상</b> {card.comparison}
            </p>
          )}
          {card.conditions.length > 0 && (
            <div className="text-sm">
              <b className="text-slate-500">적용 조건</b>
              <ul className="ml-4 list-disc">
                {card.conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-3 border-t pt-3">
            {card.evidence.map((e, i) => (
              <EvidenceDetail key={i} ev={e} docs={w.docs} />
            ))}
          </div>
          {conflicts.map((x) => (
            <div key={x.id} className={cn("rounded-lg border p-2 text-sm", x.approvedValue ? "border-emerald-300 bg-emerald-50" : "border-orange-300 bg-orange-50")}>
              <b>
                수치 충돌 · {x.metric}
                {x.approvedValue ? ` — 승인한 값 ${x.approvedValue}` : " — 쓸 값을 골라 승인하세요(승인 전에는 초안에 쓰지 않음)"}
              </b>
              <ul className="mt-1 space-y-1">
                {x.values.map((v, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>
                      <b>{v.value}</b> — {docLabel(w.docs, v.docId, v.page)}
                    </span>
                    {w.live && x.approvedValue !== v.value && (
                      <Button data-testid="conflict-option" size="xs" variant="outline" onClick={() => w.approveConflict(x.id, v.value)}>
                        이 값으로 승인
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {w.live && x.approvedValue && (
                <Button size="xs" variant="ghost" onClick={() => w.approveConflict(x.id, null)}>
                  승인 취소
                </Button>
              )}
            </div>
          ))}
          {w.live && (
            <div className="mt-auto flex gap-2">
              <Button data-testid="card-edit" size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> 고치기
              </Button>
              <Button data-testid="card-remove" size="sm" variant="ghost" onClick={() => w.removeCard(card.id)}>
                <Trash2 /> 빼기
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function StepSources({ w }: { w: W }) {
  const [url, setUrl] = useState("");
  const verified = w.cards.filter((c) => c.status !== "unverified").length;
  const blockReason = w.modelBlock ?? (w.docs.length === 0 ? "근거 문서를 먼저 넣으세요." : null);
  return (
    <section id="step-1" className="scroll-mt-32 rounded-2xl border bg-white p-6">
      <SectionHeader n={1} title="제품 분석 — 차별점 카드" desc="제품 자료 PDF와 홈페이지를 쪽 단위로 색인하고, 차별점마다 원문 인용과 문서·쪽을 붙입니다. 인용문은 서버 코드가 원문과 글자 단위로 대조합니다.">
        <MetaLine metas={w.metas} task="차별점 카드 추출" />
        <Button data-testid="cards-run" size="lg" onClick={w.extractCards} disabled={Boolean(blockReason) || w.jobs.cards.running}>
          <Sparkles /> 차별점 카드 뽑기
        </Button>
      </SectionHeader>
      {blockReason && w.live && <p className="-mt-2 mb-3 text-right text-sm text-muted-foreground">{blockReason}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold">
              근거 문서 {w.docs.length}개
              {w.pdfProgress && (
                <span className="ml-2 text-sm font-semibold text-blue-800">
                  {w.pdfProgress.emptyPages === null
                    ? `PDF 쪽 색인 중: ${w.pdfProgress.name} ${w.pdfProgress.page}/${w.pdfProgress.total || "?"}쪽`
                    : `${w.pdfProgress.name} ${w.pdfProgress.total}쪽 색인 완료${w.pdfProgress.emptyPages ? ` (글자 없는 쪽 ${w.pdfProgress.emptyPages}개)` : ""}`}
                </span>
              )}
            </h3>
            {w.live && (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-sm font-medium hover:bg-muted">
                <Upload className="size-4" /> PDF 올리기
                <input
                  type="file"
                  accept="application/pdf"
                  data-testid="pdf-input"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) w.uploadPdf(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {w.docs.length === 0 ? (
            <p className="rounded-lg bg-muted p-4 text-muted-foreground">
              문서가 없습니다. 위의 <b>티링크 자료 불러오기</b>를 누르거나 PDF를 올리세요. PPTX·XLSX는 PDF로 변환해 올립니다.
            </p>
          ) : (
            <ul className="divide-y">
              {w.docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 rounded bg-slate-100 px-1.5 text-xs font-semibold uppercase text-slate-600">{d.kind === "url" ? "web" : d.kind}</span>
                    {d.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    {d.pages.length > 0 ? `${d.pages.length}${d.kind === "url" ? "구간" : "쪽"}` : ""}
                    {w.live && (
                      <button aria-label={`${d.title} 빼기`} onClick={() => w.removeDoc(d.id)}>
                        <X className="size-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border p-4">
          <h3 className="mb-2 font-bold">홈페이지 URL(선택)</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) w.ingestUrl(url.trim());
            }}
          >
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tlinkcrm.com/recording.php" aria-label="홈페이지 URL" disabled={!w.live} />
            <Button type="submit" variant="outline" disabled={!w.live || w.jobs.load.running}>
              <Globe /> 가져오기
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {SUGGESTED_URLS.map((s) => (
              <button key={s.url} data-testid={`url-${s.url.split("/").pop()?.replace(".php", "")}`} className="rounded-full border px-2.5 py-0.5 hover:bg-muted disabled:opacity-50" disabled={!w.live} onClick={() => w.ingestUrl(s.url)}>
                {s.label} 페이지 넣기
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">본문은 근거 문서(구간 단위)로, 같은 호스트의 사진은 2단계 사진 후보로 불러옵니다.</p>
          <h3 className="mb-1 mt-4 font-bold">홍보 가이드라인</h3>
          {w.guideline ? (
            <p className="text-sm">
              필수 키워드 {w.guideline.requiredKeywords.length}개({w.guideline.requiredKeywords.join(", ")}) · 강조 내용 {w.guideline.emphasisPoints.length}개 · 하단 링크{" "}
              {w.guideline.links.length}개 · 문의처 {w.guideline.contact.length}개
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">가이드라인이 없습니다. 티링크 자료를 불러오면 함께 들어옵니다.</p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <Running job={w.jobs.cards} label="차별점 카드 추출(문서 전체를 모델이 읽습니다)" />
        {w.cards.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 text-[0.95rem]">
            <b>카드 {w.cards.length}장</b>
            <span className="text-emerald-700">인용 대조 통과 {verified}장</span>
            <span className="text-red-700">근거 미확인 {w.cards.filter((c) => c.status === "unverified").length}장</span>
            <span className="text-orange-700">수치 충돌 {w.conflicts.length}건</span>
            <span className="text-muted-foreground">체크한 카드 {w.selected.length}장으로 콘텐츠를 만듭니다.</span>
          </div>
        )}
        {w.cards.length === 0 && !w.jobs.cards.running && (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">아직 카드가 없습니다. 문서를 넣고 차별점 카드 뽑기를 누르세요.</p>
        )}
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {w.cards.map((c) => (
            <CardTile key={c.id} w={w} card={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
