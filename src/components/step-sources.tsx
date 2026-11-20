"use client";

import { useState } from "react";
import { Eye, FileText, FolderOpen, Globe, Pencil, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Card } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { EvidenceDetail, StatusBadge } from "./evidence";
import { docLabel } from "./model";
import { Disclosure, EmptyState, InputPanel, MetaLine, Running, StatLine, StepHeader, StepPager, useNav } from "./step-frame";
import { FileButton, type W } from "./workbench";

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
  const first = card.evidence[0];
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        card.status === "unverified" && "border-danger-border",
        card.status === "conflict" && "border-warning-border",
      )}
    >
      <header className="flex items-start gap-2.5">
        <Checkbox data-testid="card-toggle" className="mt-1.5" checked={on} onCheckedChange={() => w.toggleCard(card.id)} aria-label={`${card.id} 콘텐츠에 사용`} />
        <span className="mt-0.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold">{card.id}</span>
        <h3 className={cn("min-w-0 flex-1 text-lg font-semibold", !on && "text-muted-foreground")}>{card.name}</h3>
        <StatusBadge status={card.status} />
      </header>
      {!on && <p className="-mt-2 text-xs text-muted-foreground">콘텐츠에 쓰지 않는 카드</p>}
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
          <p>{card.claim}</p>
          {(card.comparison || card.conditions.length > 0) && (
            <dl className="space-y-1 text-sm">
              {card.comparison && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted-foreground">비교 대상</dt>
                  <dd>{card.comparison}</dd>
                </div>
              )}
              {card.conditions.length > 0 && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted-foreground">적용 조건</dt>
                  <dd>
                    <ul className="space-y-0.5">
                      {card.conditions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          )}
          {first && (
            <p className="flex items-center gap-1.5 text-sm text-doc">
              <FileText aria-hidden className="size-4 shrink-0" />
              {docLabel(w.docs, first.docId, first.page)}
              {card.evidence.length > 1 && <span className="text-muted-foreground">외 {card.evidence.length - 1}곳</span>}
            </p>
          )}
          {conflicts.map((x) => (
            <div key={x.id} className={cn("rounded-lg border p-3 text-sm", x.approvedValue ? "border-success-border bg-success-soft" : "border-warning-border bg-warning-soft")}>
              <p className={cn("font-semibold", x.approvedValue ? "text-success" : "text-warning")}>
                수치 충돌 · {x.metric}
                {x.approvedValue ? ` — 승인한 값 ${x.approvedValue}` : " — 쓸 값을 골라 승인하세요(승인 전에는 초안에 쓰지 않음)"}
              </p>
              <ul className="mt-2 space-y-1.5 text-foreground">
                {x.values.map((v, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <b className="font-semibold">{v.value}</b> — {docLabel(w.docs, v.docId, v.page)}
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
                <Button size="xs" variant="ghost" className="mt-1" onClick={() => w.approveConflict(x.id, null)}>
                  승인 취소
                </Button>
              )}
            </div>
          ))}
          <Disclosure summary={`근거 인용 ${card.evidence.length}개 보기`} className="border-t pt-3">
            <div className="space-y-4">
              {card.evidence.map((e, i) => (
                <EvidenceDetail key={i} ev={e} docs={w.docs} />
              ))}
            </div>
          </Disclosure>
          {w.live && (
            <div className="mt-auto flex gap-1">
              <Button data-testid="card-edit" size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil /> 고치기
              </Button>
              <Button data-testid="card-remove" size="sm" variant="ghost" onClick={() => w.removeCard(card.id)}>
                <Trash2 /> 빼기
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

/** 첫 실행 안내: 예시 보기, 티링크 자료로 실행, 외부 원고만 점검. */
function StartPanel({ w }: { w: W }) {
  const { go } = useNav();
  const box = "flex flex-col gap-2 rounded-xl border p-5";
  return (
    <section aria-labelledby="start-title" className="space-y-4">
      <div>
        <h3 id="start-title" className="text-lg font-semibold">
          시작하기
        </h3>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">사진과 제품 정보에서 게시 전 점검까지 끝난 초안을 자동으로 만듭니다. 사람은 확인하고 승인만 합니다.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className={box}>
          <h4 className="font-semibold">예시로 먼저 보기</h4>
          <p className="flex-1 text-sm text-muted-foreground">티링크 자료로 실제 실행해 저장한 결과를 네 단계 모두 봅니다. 모델을 호출하지 않습니다.</p>
          <Button
            className="self-start"
            onClick={async () => {
              await w.loadExample();
              go("step-1");
            }}
            disabled={w.jobs.load.running}
          >
            <Eye /> 티링크 예시로 보기
          </Button>
        </div>
        <div className={box}>
          <h4 className="font-semibold">티링크 자료로 실행</h4>
          <p className="flex-1 text-sm text-muted-foreground">문서·가이드라인·사진 후보를 불러온 뒤 머리글의 자동 실행을 누릅니다.</p>
          <Button variant="outline" className="self-start" onClick={w.loadTlink} disabled={w.jobs.load.running}>
            <FolderOpen /> 티링크 자료 불러오기
          </Button>
        </div>
        <div className={box}>
          <h4 className="font-semibold">외부 원고만 점검</h4>
          <p className="flex-1 text-sm text-muted-foreground">받은 리뷰 원고를 붙여 넣어 가이드라인 항목과 사양을 대조합니다.</p>
          <Button variant="outline" className="self-start" onClick={() => go("paste-check")}>
            외부 리뷰 원고 검수 열기
          </Button>
        </div>
      </div>
    </section>
  );
}

export function StepSources({ w }: { w: W }) {
  const [url, setUrl] = useState("");
  const verified = w.cards.filter((c) => c.status !== "unverified").length;
  const blockReason = w.modelBlock ?? (w.docs.length === 0 ? "근거 문서를 먼저 넣으세요." : null);
  const first = w.live && w.docs.length === 0 && w.cards.length === 0;
  const g = w.guideline;
  const summary = [`근거 문서 ${w.docs.length}개`, g ? `홍보 가이드라인(필수 키워드 ${g.requiredKeywords.length}개, 강조 내용 ${g.emphasisPoints.length}개)` : "가이드라인 없음"].join(" · ");
  return (
    <section id="step-1" className="space-y-6">
      <StepHeader
        title="제품 분석 — 차별점 카드"
        desc="제품 자료 PDF와 홈페이지를 쪽 단위로 색인하고, 차별점마다 원문 인용과 문서·쪽을 붙입니다. 인용문은 서버 코드가 원문과 글자 단위로 대조합니다."
        meta={<MetaLine metas={w.metas} task="차별점 카드 추출" />}
        actions={
          <Button data-testid="cards-run" size="lg" variant="outline" onClick={w.extractCards} disabled={Boolean(blockReason) || w.jobs.cards.running}>
            <Sparkles /> 차별점 카드 뽑기
          </Button>
        }
        blockReason={w.live ? blockReason : null}
      />

      <Running job={w.jobs.cards} label="차별점 카드 추출(문서 전체를 모델이 읽습니다)" />
      {first && <StartPanel w={w} />}

      <InputPanel summary={summary} hasResults={w.cards.length > 0}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">근거 문서 {w.docs.length}개</h3>
              {w.live && <FileButton testid="pdf-input" accept="application/pdf" label="PDF 올리기" icon={<Upload />} onFiles={(fs) => w.uploadPdf(fs[0])} />}
            </div>
            {w.pdfProgress && (
              <p role="status" className="mt-2 text-sm font-medium text-doc">
                {w.pdfProgress.emptyPages === null
                  ? `PDF 쪽 색인 중: ${w.pdfProgress.name} ${w.pdfProgress.page}/${w.pdfProgress.total || "?"}쪽`
                  : `${w.pdfProgress.name} ${w.pdfProgress.total}쪽 색인 완료${w.pdfProgress.emptyPages ? ` (글자 없는 쪽 ${w.pdfProgress.emptyPages}개)` : ""}`}
              </p>
            )}
            {w.docs.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">문서가 없습니다. 머리글의 티링크 자료 불러오기를 누르거나 PDF를 올리세요. PPTX·XLSX는 PDF로 변환해 올립니다.</p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {w.docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-10 shrink-0 rounded bg-muted py-px text-center text-xs font-medium text-muted-foreground uppercase">{d.kind === "url" ? "web" : d.kind}</span>
                      <span className="truncate">{d.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-muted-foreground tabular-nums">
                      {d.pages.length > 0 ? `${d.pages.length}${d.kind === "url" ? "구간" : "쪽"}` : ""}
                      {w.live && (
                        <Button size="icon-xs" variant="ghost" aria-label={`${d.title} 빼기`} onClick={() => w.removeDoc(d.id)}>
                          <X />
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold">홈페이지 URL(선택)</h3>
              <form
                className="mt-2 flex gap-2"
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
              <div className="mt-2 flex flex-wrap gap-2">
                {SUGGESTED_URLS.map((s) => (
                  <Button key={s.url} data-testid={`url-${s.url.split("/").pop()?.replace(".php", "")}`} size="xs" variant="outline" className="rounded-full" disabled={!w.live} onClick={() => w.ingestUrl(s.url)}>
                    {s.label} 페이지 넣기
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">본문은 근거 문서(구간 단위)로, 같은 호스트의 사진은 2단계 사진 후보로 불러옵니다.</p>
            </div>
            <div>
              <h3 className="font-semibold">홍보 가이드라인</h3>
              {g ? (
                <p className="mt-1 text-sm">
                  필수 키워드 {g.requiredKeywords.length}개({g.requiredKeywords.join(", ")}) · 강조 내용 {g.emphasisPoints.length}개 · 하단 링크 {g.links.length}개 · 문의처 {g.contact.length}개
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">가이드라인이 없습니다. 티링크 자료를 불러오면 함께 들어옵니다.</p>
              )}
            </div>
          </div>
        </div>
      </InputPanel>

      {w.cards.length > 0 && (
        <div className="space-y-4">
          <StatLine
            items={[
              { label: "카드", value: `${w.cards.length}장` },
              { label: "인용 대조 통과", value: `${verified}장`, tone: "success" },
              { label: "근거 미확인", value: `${w.cards.filter((c) => c.status === "unverified").length}장`, tone: w.cards.some((c) => c.status === "unverified") ? "danger" : undefined },
              { label: "수치 충돌", value: `${w.conflicts.length}건`, tone: w.conflicts.length ? "warning" : undefined },
              { label: `체크한 카드 ${w.selected.length}장으로 콘텐츠를 만듭니다.` },
            ]}
          />
          <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {w.cards.map((c) => (
              <CardTile key={c.id} w={w} card={c} />
            ))}
          </div>
        </div>
      )}
      {w.cards.length === 0 && !w.jobs.cards.running && !first && <EmptyState>아직 카드가 없습니다. 문서를 넣고 차별점 카드 뽑기를 누르세요.</EmptyState>}

      <StepPager next={{ view: "step-2", label: "사진 판독" }} />
    </section>
  );
}
