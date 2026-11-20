"use client";

import { useState } from "react";
import { Check, FileText, ImageIcon, PenLine, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Sentence, Warning } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { CardNews } from "./cardnews";
import { EvidenceChips, WarningTags } from "./evidence";
import { formatMs } from "./model";
import { EmptyState, LINE_TAB, LINE_TABS, MetaLine, Pill, Running, StepHeader, StepPager } from "./step-frame";
import type { W } from "./workbench";

export function SentenceLine({ w, k, s, warnings, editable }: { w: W; k: string; s: Sentence; warnings: Warning[]; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.text);
  if (editing)
    return (
      <span className="my-1 block">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="문장 고치기" />
        <span className="mt-1 flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              w.editSentence(k, text);
              setEditing(false);
            }}
          >
            <Check /> 반영
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            취소
          </Button>
        </span>
      </span>
    );
  return (
    <span className={cn("group rounded px-0.5", warnings.length > 0 && "bg-danger-soft underline decoration-danger decoration-wavy decoration-1 underline-offset-4")}>
      {s.text}
      <EvidenceChips s={s} cards={w.cards} docs={w.docs} photos={w.photos} readings={w.readings} />
      <WarningTags warnings={warnings} />
      {editable && (
        <button
          aria-label="문장 고치기"
          onClick={() => {
            setText(s.text);
            setEditing(true);
          }}
          className="ml-1 inline-flex align-middle text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <PenLine className="size-4" />
        </button>
      )}{" "}
    </span>
  );
}

/** 근거 칩 범례. 색과 함께 아이콘과 글자로 구분한다. */
function ChipLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Pill tone="doc">
          <FileText aria-hidden className="size-3" /> 문서
        </Pill>
        문서 근거
      </span>
      <span className="flex items-center gap-1.5">
        <Pill tone="photo">
          <ImageIcon aria-hidden className="size-3" /> 사진
        </Pill>
        사진 근거
      </span>
      <span className="flex items-center gap-1.5">
        <Pill>근거 없음</Pill>
        사실 문장에 근거가 없음
      </span>
      <span className="flex items-center gap-1.5">
        <Pill tone="danger">경고</Pill>
        4단계 점검에서 걸린 문장(물결 밑줄)
      </span>
    </p>
  );
}

export function StepContent({ w }: { w: W }) {
  const g = w.generation;
  const blockReason = w.modelBlock ?? (w.selected.length === 0 ? "1단계에서 콘텐츠에 쓸 카드를 1장 이상 체크하세요." : null);
  const ws = (k: string) => w.warningsByKey.get(k) ?? [];
  const editable = w.live && !w.approved;
  return (
    <section id="step-3" className="space-y-6">
      <StepHeader
        title="콘텐츠 생성 — 문장마다 근거 칩"
        desc="체크한 카드와 판독한 사진으로 블로그 리뷰형 초안(가이드라인 추천 구성 5단), 인스타그램 카드뉴스 5장, 설치 사례 글을 만듭니다. 파란 칩은 문서 근거, 주황 칩은 사진 근거입니다."
        meta={
          <>
            <MetaLine metas={w.metas} task="콘텐츠 생성" />
            {w.photoToDraftMs !== null && <Pill>사진 업로드 → 초안 {formatMs(w.photoToDraftMs)}</Pill>}
          </>
        }
        actions={
          <Button
            data-testid="generate-run"
            size="lg"
            variant={!blockReason && !w.jobs.generate.running && !g ? "default" : "outline"}
            onClick={w.generate}
            disabled={Boolean(blockReason) || w.jobs.generate.running}
          >
            <Wand2 /> 초안 만들기
          </Button>
        }
        blockReason={blockReason}
      />
      <Running job={w.jobs.generate} label={`콘텐츠 생성(카드 ${w.selected.length}장, 사진 ${w.readings.length}장)`} />
      {!g && !w.jobs.generate.running && <EmptyState>아직 초안이 없습니다. 1단계 카드를 체크하고 초안 만들기를 누르세요.</EmptyState>}
      {g && (
        <Tabs defaultValue="blog" className="gap-0">
          <TabsList variant="line" className={LINE_TABS}>
            <TabsTrigger data-testid="tab-blog" value="blog" className={LINE_TAB}>
              네이버 블로그 리뷰형 초안
            </TabsTrigger>
            <TabsTrigger data-testid="tab-cardnews" value="cards" className={LINE_TAB}>
              인스타그램 카드뉴스 5장
            </TabsTrigger>
            <TabsTrigger data-testid="tab-case" value="case" className={LINE_TAB}>
              설치 사례 짧은 글
            </TabsTrigger>
          </TabsList>
          <div className="mt-4">
            <ChipLegend />
          </div>
          <TabsContent value="blog" className="mt-6 text-base">
            <article className="max-w-[46rem] space-y-6 text-article">
              <h3 className="text-2xl font-semibold">
                <SentenceLine w={w} k="blog.title" s={g.blog.title} warnings={ws("blog.title")} editable={editable} />
              </h3>
              {g.blog.sections.map((sec, i) => (
                <div key={i}>
                  <h4 className="mb-2 text-lg font-semibold">
                    {i + 1}. {sec.heading}
                  </h4>
                  <p>
                    {sec.sentences.map((s, j) => (
                      <SentenceLine key={`${j}-${s.text}`} w={w} k={`blog.s${i}.${j}`} s={s} warnings={ws(`blog.s${i}.${j}`)} editable={editable} />
                    ))}
                  </p>
                </div>
              ))}
              <div className="rounded-lg border bg-muted/50 p-4">
                {g.blog.footer.map((s, j) => (
                  <p key={`${j}-${s.text}`}>
                    <SentenceLine w={w} k={`blog.footer.${j}`} s={s} warnings={ws(`blog.footer.${j}`)} editable={editable} />
                  </p>
                ))}
              </div>
              <p className="text-doc">{g.blog.hashtags.join(" ")}</p>
            </article>
          </TabsContent>
          <TabsContent value="cards" className="mt-6 space-y-6 text-base">
            <CardNews slides={g.cardnews} photos={w.photos} brand={w.brand} />
            <ol className="grid gap-3 lg:grid-cols-2">
              {g.cardnews.map((c, i) => (
                <li key={i} className="rounded-xl border p-4">
                  <span className="mr-2 text-sm font-semibold text-muted-foreground">{i + 1}장</span>
                  <span className="font-semibold">
                    <SentenceLine w={w} k={`card.${i}.h`} s={c.headline} warnings={ws(`card.${i}.h`)} editable={editable} />
                  </span>
                  <div className="mt-2 text-sm">
                    {c.body.map((s, j) => (
                      <SentenceLine key={`${j}-${s.text}`} w={w} k={`card.${i}.b${j}`} s={s} warnings={ws(`card.${i}.b${j}`)} editable={editable} />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </TabsContent>
          <TabsContent value="case" className="mt-6 text-base">
            <article className="max-w-[46rem] space-y-4 text-article">
              <h3 className="text-2xl font-semibold">{g.caseStudy.title}</h3>
              <p>
                {g.caseStudy.sentences.map((s, j) => (
                  <SentenceLine key={`${j}-${s.text}`} w={w} k={`case.${j}`} s={s} warnings={ws(`case.${j}`)} editable={editable} />
                ))}
              </p>
              <div className="flex flex-wrap gap-4">
                {w.photos
                  .filter((p) => g.caseStudy.sentences.some((s) => s.photoIds.includes(p.id)))
                  .map((p) => (
                    <figure key={p.id} className="w-56">
                      {p.src ? <img src={p.src} alt={p.name} className="max-h-48 rounded-lg border object-contain" /> : <div className="text-xs text-danger">{p.loadError}</div>}
                      <figcaption className="mt-1 text-xs text-muted-foreground">
                        {p.id} · 출처: {p.sourceLabel}
                      </figcaption>
                    </figure>
                  ))}
              </div>
            </article>
          </TabsContent>
        </Tabs>
      )}

      <StepPager prev={{ view: "step-2", label: "사진 판독" }} next={{ view: "step-4", label: "게시 전 점검" }} />
    </section>
  );
}
