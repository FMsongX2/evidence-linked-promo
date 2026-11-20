"use client";

import { FileText, ImageIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Card, Evidence, PhotoReading, Sentence, SourceDoc, Warning } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { PHOTO_KIND_LABEL, WARNING_LABEL, docLabel, type Photo } from "./model";

type DocLite = Pick<SourceDoc, "id" | "title" | "kind"> & { pages?: SourceDoc["pages"] };

export function MatchBadge({ ev }: { ev: Evidence }) {
  if (ev.match === "exact") return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">원문 일치</span>;
  if (ev.match === "approx")
    return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">근사 일치 {Math.round(ev.score * 100)}%</span>;
  return <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">근거 미확인</span>;
}

export function StatusBadge({ status }: { status: Card["status"] }) {
  const map = {
    confirmed: ["확인", "bg-emerald-600 text-white"],
    unverified: ["근거 미확인", "bg-red-600 text-white"],
    conflict: ["수치 충돌", "bg-orange-500 text-white"],
  } as const;
  const [label, cls] = map[status];
  return <span className={cn("rounded-md px-2 py-0.5 text-sm font-semibold", cls)}>{label}</span>;
}

/** 인용문과, 원문이 있으면 그 쪽 텍스트를 보여 준다. */
export function EvidenceDetail({ ev, docs }: { ev: Evidence; docs: DocLite[] }) {
  const page = docs.find((d) => d.id === ev.docId)?.pages?.find((p) => p.page === ev.page);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{docLabel(docs, ev.docId, ev.page)}</span>
        <MatchBadge ev={ev} />
      </div>
      <blockquote className="border-l-4 border-blue-400 bg-blue-50 px-3 py-2 text-[0.95rem] leading-relaxed">“{ev.quote}”</blockquote>
      {page && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">이 쪽 원문 전체 보기</summary>
          <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-sans text-xs leading-relaxed">{page.text}</pre>
        </details>
      )}
    </div>
  );
}

function CardChip({ card, docs }: { card: Card; docs: DocLite[] }) {
  const bad = card.status !== "confirmed";
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-xs font-semibold",
          bad ? "border-orange-300 bg-orange-50 text-orange-800" : "border-blue-300 bg-blue-50 text-blue-800",
        )}
      >
        <FileText className="size-3" />
        {card.id} {card.evidence[0] ? docLabel(docs, card.evidence[0].docId, card.evidence[0].page) : ""}
        {card.evidence.length > 1 ? ` 외 ${card.evidence.length - 1}` : ""}
      </PopoverTrigger>
      <PopoverContent className="w-[34rem] max-w-[90vw] space-y-3">
        <div className="text-sm font-bold">
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
      <PopoverTrigger className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 align-middle text-xs font-semibold text-amber-900">
        <ImageIcon className="size-3" />
        사진 {id}
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-2">
        {p?.src && <img src={p.src} alt={p.name} className="max-h-56 w-full rounded object-contain" />}
        <div className="text-sm font-semibold">
          사진 근거 {id} {r ? `· ${PHOTO_KIND_LABEL[r.kind]}` : ""}
        </div>
        {r && <p className="text-sm">{r.caption}</p>}
        {p?.sourceLabel && <p className="text-xs text-muted-foreground">출처: {p.sourceLabel}</p>}
      </PopoverContent>
    </Popover>
  );
}

export function EvidenceChips({ s, cards, docs, photos, readings }: { s: Sentence; cards: Card[]; docs: DocLite[]; photos: Photo[]; readings: PhotoReading[] }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {s.cardIds.map((id) => {
        const c = cards.find((x) => x.id === id);
        return c ? (
          <CardChip key={id} card={c} docs={docs} />
        ) : (
          <span key={id} className="rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800">
            {id} 없음
          </span>
        );
      })}
      {s.photoIds.map((id) => (
        <PhotoChip key={id} id={id} photos={photos} readings={readings} />
      ))}
      {s.kind === "fact" && s.cardIds.length + s.photoIds.length === 0 && (
        <span className="rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800">근거 없음</span>
      )}
    </span>
  );
}

export function WarningTags({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {warnings.map((w) => (
        <span key={w.id} title={`${w.message}${w.detail ? `\n${w.detail}` : ""}`} className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          {WARNING_LABEL[w.type]}
        </span>
      ))}
    </span>
  );
}
