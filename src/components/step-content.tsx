"use client";

import { useState } from "react";
import { Check, PenLine, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Sentence, Warning } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { CardNews } from "./cardnews";
import { EvidenceChips, WarningTags } from "./evidence";
import { formatMs } from "./model";
import { MetaLine, Running, SectionHeader, type W } from "./workbench";

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
    <span className={cn("group rounded px-0.5", warnings.length > 0 && "bg-red-50 underline decoration-red-500 decoration-wavy decoration-1 underline-offset-4")}>
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
          className="ml-1 inline-flex align-middle text-slate-400 opacity-0 hover:text-slate-900 group-hover:opacity-100"
        >
          <PenLine className="size-4" />
        </button>
      )}{" "}
    </span>
  );
}

export function StepContent({ w }: { w: W }) {
  const g = w.generation;
  const blockReason = w.modelBlock ?? (w.selected.length === 0 ? "1단계에서 콘텐츠에 쓸 카드를 1장 이상 체크하세요." : null);
  const ws = (k: string) => w.warningsByKey.get(k) ?? [];
  const editable = w.live && !w.approved;
  return (
    <section id="step-3" className="scroll-mt-32 rounded-2xl border bg-white p-6">
      <SectionHeader
        n={3}
        title="콘텐츠 생성 — 문장마다 근거 칩"
        desc="체크한 카드와 판독한 사진으로 블로그 리뷰형 초안(가이드라인 추천 구성 5단), 인스타그램 카드뉴스 5장, 설치 사례 글을 만듭니다. 파란 칩은 문서 근거, 노란 칩은 사진 근거입니다."
      >
        <MetaLine metas={w.metas} task="콘텐츠 생성" />
        {w.photoToDraftMs !== null && <span className="rounded-md bg-slate-900 px-2 py-1 text-sm font-semibold text-white">사진 업로드 → 초안 {formatMs(w.photoToDraftMs)}</span>}
        <Button size="lg" onClick={w.generate} disabled={Boolean(blockReason) || w.jobs.generate.running}>
          <Wand2 /> 초안 만들기
        </Button>
      </SectionHeader>
      {blockReason && w.live && <p className="-mt-2 mb-3 text-right text-sm text-muted-foreground">{blockReason}</p>}
      <Running job={w.jobs.generate} label={`콘텐츠 생성(카드 ${w.selected.length}장, 사진 ${w.readings.length}장)`} />
      {!g && !w.jobs.generate.running && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">아직 초안이 없습니다.</p>}
      {g && (
        <Tabs defaultValue="blog" className="mt-2">
          <TabsList className="h-11">
            <TabsTrigger value="blog" className="px-4 text-base">
              네이버 블로그 리뷰형 초안
            </TabsTrigger>
            <TabsTrigger value="cards" className="px-4 text-base">
              인스타그램 카드뉴스 5장
            </TabsTrigger>
            <TabsTrigger value="case" className="px-4 text-base">
              설치 사례 짧은 글
            </TabsTrigger>
          </TabsList>
          <TabsContent value="blog" className="mt-4">
            <article className="max-w-[1100px] space-y-5 text-[1.08rem] leading-[1.9]">
              <h3 className="text-2xl font-extrabold leading-snug">
                <SentenceLine w={w} k="blog.title" s={g.blog.title} warnings={ws("blog.title")} editable={editable} />
              </h3>
              {g.blog.sections.map((sec, i) => (
                <div key={i}>
                  <h4 className="mb-1 text-lg font-bold text-slate-700">
                    {i + 1}. {sec.heading}
                  </h4>
                  <p>
                    {sec.sentences.map((s, j) => (
                      <SentenceLine key={`${j}-${s.text}`} w={w} k={`blog.s${i}.${j}`} s={s} warnings={ws(`blog.s${i}.${j}`)} editable={editable} />
                    ))}
                  </p>
                </div>
              ))}
              <div className="rounded-lg bg-slate-50 p-3">
                {g.blog.footer.map((s, j) => (
                  <p key={`${j}-${s.text}`}>
                    <SentenceLine w={w} k={`blog.footer.${j}`} s={s} warnings={ws(`blog.footer.${j}`)} editable={editable} />
                  </p>
                ))}
              </div>
              <p className="text-blue-700">{g.blog.hashtags.join(" ")}</p>
            </article>
          </TabsContent>
          <TabsContent value="cards" className="mt-4 space-y-4">
            <CardNews slides={g.cardnews} photos={w.photos} brand={w.brand} />
            <div className="grid gap-2 text-[0.98rem] lg:grid-cols-2">
              {g.cardnews.map((c, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <b className="mr-2">{i + 1}장</b>
                  <SentenceLine w={w} k={`card.${i}.h`} s={c.headline} warnings={ws(`card.${i}.h`)} editable={editable} />
                  <div className="mt-1 text-sm">
                    {c.body.map((s, j) => (
                      <SentenceLine key={`${j}-${s.text}`} w={w} k={`card.${i}.b${j}`} s={s} warnings={ws(`card.${i}.b${j}`)} editable={editable} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="case" className="mt-4">
            <article className="max-w-[1100px] space-y-3 text-[1.08rem] leading-[1.9]">
              <h3 className="text-xl font-extrabold">{g.caseStudy.title}</h3>
              <p>
                {g.caseStudy.sentences.map((s, j) => (
                  <SentenceLine key={`${j}-${s.text}`} w={w} k={`case.${j}`} s={s} warnings={ws(`case.${j}`)} editable={editable} />
                ))}
              </p>
              <div className="flex flex-wrap gap-3">
                {w.photos
                  .filter((p) => g.caseStudy.sentences.some((s) => s.photoIds.includes(p.id)))
                  .map((p) => (
                    <figure key={p.id} className="w-56">
                      {p.src ? <img src={p.src} alt={p.name} className="max-h-48 rounded border object-contain" /> : <div className="text-xs text-red-700">{p.loadError}</div>}
                      <figcaption className="text-xs text-muted-foreground">
                        {p.id} · 출처: {p.sourceLabel}
                      </figcaption>
                    </figure>
                  ))}
              </div>
            </article>
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
