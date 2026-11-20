"use client";

import { CircleAlert, CircleCheck, FileText, ImageIcon, TriangleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ItemSource } from "@/lib/check";
import type { Card, Evidence, PhotoReading, Sentence, SourceDoc, Warning } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { PHOTO_KIND_LABEL, WARNING_LABEL, docLabel, type Photo } from "./model";
import { Pill } from "./step-frame";

type DocLite = Pick<SourceDoc, "id" | "title" | "kind"> & { pages?: SourceDoc["pages"] };

export function MatchBadge({ ev }: { ev: Evidence }) {
  if (ev.match === "exact") return <Pill tone="success">원문 일치</Pill>;
  if (ev.match === "approx") return <Pill tone="success">근사 일치 {Math.round(ev.score * 100)}%</Pill>;
  return <Pill tone="danger">근거 미확인</Pill>;
}

export function StatusBadge({ status }: { status: Card["status"] }) {
  if (status === "confirmed")
    return (
      <Pill tone="success">
        <CircleCheck aria-hidden className="size-3.5" /> 확인
      </Pill>
    );
  if (status === "conflict")
    return (
      <Pill tone="warning">
        <TriangleAlert aria-hidden className="size-3.5" /> 수치 충돌
      </Pill>
    );
  return (
    <Pill tone="danger">
      <CircleAlert aria-hidden className="size-3.5" /> 근거 미확인
    </Pill>
  );
}

/** 인용문과, 원문이 있으면 그 쪽 텍스트를 보여 준다. */
export function EvidenceDetail({ ev, docs }: { ev: Evidence; docs: DocLite[] }) {
  const page = docs.find((d) => d.id === ev.docId)?.pages?.find((p) => p.page === ev.page);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <FileText aria-hidden className="size-4 shrink-0 text-doc" />
          {docLabel(docs, ev.docId, ev.page)}
        </span>
        <MatchBadge ev={ev} />
      </div>
      <blockquote className="rounded-lg border border-doc-border bg-doc-soft px-3 py-2 text-sm">“{ev.quote}”</blockquote>
      {page && (
        <details className="text-sm text-muted-foreground">
          <summary className="hover:text-foreground">이 쪽 원문 전체 보기</summary>
          <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-muted p-3 font-sans text-xs whitespace-pre-wrap">{page.text}</pre>
        </details>
      )}
    </div>
  );
}

/** 근거 칩. 보이는 크기는 작게 두고, 터치 화면에서는 위아래로 누를 영역을 넓혀 44px 이상이 되게 한다. */
const CHIP =
  "relative inline-flex items-center gap-1 rounded-md border px-1.5 py-px align-middle text-xs font-medium hover:brightness-95 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3";

function CardChip({ card, docs }: { card: Card; docs: DocLite[] }) {
  const bad = card.status !== "confirmed";
  return (
    <Popover>
      <PopoverTrigger
        data-testid="evidence-chip"
        className={cn(CHIP, bad ? "border-warning-border bg-warning-soft text-warning" : "border-doc-border bg-doc-soft text-doc")}
      >
        <FileText className="size-3" />
        {card.id} {card.evidence[0] ? docLabel(docs, card.evidence[0].docId, card.evidence[0].page) : ""}
        {card.evidence.length > 1 ? ` 외 ${card.evidence.length - 1}` : ""}
      </PopoverTrigger>
      <PopoverContent className="w-[34rem] max-w-[calc(100vw-2rem)] space-y-3 p-4">
        <div className="text-sm font-semibold">
          {card.id} {card.name}
        </div>
        <p className="text-sm">{card.claim}</p>
        {card.conditions.length > 0 && <p className="text-xs text-muted-foreground">적용 조건: {card.conditions.join(" · ")}</p>}
        {card.evidence.map((e, i) => (
          <EvidenceDetail key={i} ev={e} docs={docs} />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PhotoChip({ id, photos, readings }: { id: string; photos: Photo[]; readings: PhotoReading[] }) {
  const p = photos.find((x) => x.id === id);
  const r = readings.find((x) => x.photoId === id);
  return (
    <Popover>
      <PopoverTrigger data-testid="photo-chip" className={cn(CHIP, "border-photo-border bg-photo-soft text-photo")}>
        <ImageIcon className="size-3" />
        사진 {id}
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] space-y-2 p-4">
        {p?.src && <img src={p.src} alt={p.name} className="max-h-56 w-full rounded-lg object-contain" />}
        <div className="text-sm font-semibold">
          사진 근거 {id} {r ? `· ${PHOTO_KIND_LABEL[r.kind]}` : ""}
        </div>
        {r && <p className="text-sm">{r.caption}</p>}
        {p?.sourceLabel && <p className="text-xs text-muted-foreground">출처: {p.sourceLabel}</p>}
      </PopoverContent>
    </Popover>
  );
}

export function EvidenceChips({
  s,
  cards,
  docs,
  photos,
  readings,
  className,
}: {
  s: Sentence & { sources?: ItemSource[] };
  cards: Card[];
  docs: DocLite[];
  photos: Photo[];
  readings: PhotoReading[];
  className?: string;
}) {
  return (
    <span className={cn("ml-1 inline-flex flex-wrap gap-1 align-middle", className)}>
      {s.cardIds.map((id) => {
        const c = cards.find((x) => x.id === id);
        return c ? (
          <CardChip key={id} card={c} docs={docs} />
        ) : (
          <Pill key={id} tone="danger">
            {id} 없음
          </Pill>
        );
      })}
      {(s.sources ?? []).map((src, i) => (
        <Popover key={`src-${i}`}>
          <PopoverTrigger data-testid="evidence-chip" className={cn(CHIP, "border-doc-border bg-doc-soft text-doc")}>
            <FileText className="size-3" />
            {docLabel(docs, src.docId, src.page)}
          </PopoverTrigger>
          <PopoverContent className="w-[34rem] max-w-[calc(100vw-2rem)] p-4">
            <EvidenceDetail ev={{ ...src, match: "exact", score: 1 }} docs={docs} />
          </PopoverContent>
        </Popover>
      ))}
      {s.photoIds.map((id) => (
        <PhotoChip key={id} id={id} photos={photos} readings={readings} />
      ))}
      {s.kind === "fact" && s.cardIds.length + s.photoIds.length + (s.sources?.length ?? 0) === 0 && (
        <Pill data-testid="no-evidence-chip">근거 없음</Pill>
      )}
    </span>
  );
}

export function WarningTags({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {warnings.map((w) => (
        <Pill key={w.id} tone="danger" title={`${w.message}${w.detail ? `\n${w.detail}` : ""}`}>
          {WARNING_LABEL[w.type]}
        </Pill>
      ))}
    </span>
  );
}
