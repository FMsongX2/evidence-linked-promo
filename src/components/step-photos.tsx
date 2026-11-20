"use client";

import { useState } from "react";
import { AlertTriangle, ScanEye, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PHOTO_KIND_LABEL, type Photo } from "./model";
import { EmptyState, InputPanel, MetaLine, Pill, Running, StepHeader, StepPager } from "./step-frame";
import { FileButton, type TlinkPhoto, type W } from "./workbench";

const OFFICIAL_LABEL = "티링크 홈페이지 설치 사례(tlinkcrm.com/case.php)";

function tlinkLabel(p: TlinkPhoto): string {
  if (p.officialFieldPhoto) return `${OFFICIAL_LABEL}${p.industry ? ` · ${p.industry}` : ""}`;
  return `티링크 공식 블로그${p.pageUrl ? ` (${p.pageUrl})` : ""}`;
}

function PhotoThumb({ p, onRemove, className }: { p: Photo; onRemove?: () => void; className?: string }) {
  return (
    <figure className={cn("relative w-40 shrink-0", className)}>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {p.src ? (
          <img src={p.src} alt={p.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="p-2 text-center text-xs text-danger">{p.loadError ?? "불러오는 중…"}</span>
        )}
      </div>
      <figcaption className="mt-1.5 space-y-0.5">
        <span className="flex items-center gap-1.5 text-sm">
          <Pill tone="photo">{p.id}</Pill>
          <span className="truncate">{p.name}</span>
        </span>
        <span className="line-clamp-2 block text-xs text-muted-foreground">출처: {p.sourceLabel ?? "미상"}</span>
      </figcaption>
      {onRemove && (
        <Button size="icon-xs" variant="outline" aria-label={`${p.id} 빼기`} onClick={onRemove} className="absolute top-1.5 right-1.5 bg-background/95">
          <X />
        </Button>
      )}
    </figure>
  );
}

export function StepPhotos({ w }: { w: W }) {
  const [acked, setAcked] = useState<string[]>([]);
  const full = w.photos.length >= (w.config?.limits.photos ?? 5);
  const blockReason = w.visionBlock ?? (w.cards.length === 0 ? "1단계 차별점 카드가 먼저 필요합니다." : w.photos.length === 0 ? "사진을 1장 이상 넣으세요." : null);
  const inTray = new Set(w.photos.map((p) => p.sourceUrl).filter(Boolean));
  return (
    <section id="step-2" className="space-y-6">
      <StepHeader
        title="현장 사진 판독과 카드 연결"
        desc="사진 1~5장(긴 변 1,600px 이하로 줄여 보냄)의 종류와 보이는 것을 읽고 관련 차별점 카드를 연결합니다. 사진에서 나온 내용은 '사진 근거'로 따로 표시합니다."
        meta={<MetaLine metas={w.metas} task="사진 판독" />}
        actions={
          <Button data-testid="photos-run" size="lg" variant={w.readings.length === 0 ? "default" : "outline"} onClick={w.readPhotos} disabled={Boolean(blockReason) || w.jobs.photos.running}>
            <ScanEye /> 사진 판독하기
          </Button>
        }
        blockReason={w.live ? blockReason : null}
      />

      <Running job={w.jobs.photos} label="사진 판독" />
      <InputPanel summary={`고른 사진 ${w.photos.length}/5`} hasResults={w.readings.length > 0}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">고른 사진 {w.photos.length}/5</h3>
          {w.live && <FileButton testid="photo-input" accept="image/jpeg,image/png,image/webp" multiple label="사진 올리기" icon={<Upload />} disabled={full} onFiles={(fs) => w.addPhotoFiles(fs)} />}
        </div>
        {w.photos.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">사진이 없습니다. 아래 설치 사례 사진을 누르거나 직접 올리세요.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-4">
            {w.photos.map((p) => (
              <PhotoThumb key={p.id} p={p} onRemove={w.live ? () => w.removePhoto(p.id) : undefined} />
            ))}
          </div>
        )}

        {w.live && (w.tlinkPhotos.length > 0 || w.pageImages.length > 0) && (
          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-semibold">사진 후보 — 눌러서 추가</h4>
            <div className="mt-2 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
              {w.tlinkPhotos.map((p) => (
                <button
                  key={p.file}
                  data-testid="photo-candidate"
                  data-kind={p.officialFieldPhoto ? "case" : "blog"}
                  disabled={full || inTray.has(p.sourceUrl) || w.jobs.photos.running}
                  onClick={() => w.addPhotoUrl(p.url, { name: p.alt || p.note?.split(/[.,]/)[0] || p.file, sourceUrl: p.sourceUrl, sourceLabel: tlinkLabel(p) })}
                  className="relative size-24 overflow-hidden rounded-md border bg-muted hover:border-foreground/40 disabled:opacity-40"
                  title={`${p.alt ?? p.file}\n출처: ${tlinkLabel(p)}`}
                >
                  <img src={p.url} alt={p.alt ?? p.file} className="size-full object-contain" />
                  <span className="absolute inset-x-0 bottom-0 bg-foreground/80 text-xs font-medium text-background">{p.officialFieldPhoto ? "설치 사례" : "블로그"}</span>
                </button>
              ))}
              {w.pageImages.map((p) => (
                <button
                  key={p.src}
                  data-testid="photo-candidate"
                  data-kind="url"
                  disabled={full || inTray.has(p.src) || w.jobs.photos.running}
                  onClick={() =>
                    w.addPhotoUrl(`/api/image?src=${encodeURIComponent(p.src)}`, { name: p.alt || p.src.split("/").pop()!, sourceUrl: p.src, sourceLabel: `홈페이지 ${p.pageUrl}` })
                  }
                  className="relative size-24 overflow-hidden rounded-md border bg-muted hover:border-foreground/40 disabled:opacity-40"
                  title={`${p.alt}\n${p.src}`}
                >
                  <img src={`/api/image?src=${encodeURIComponent(p.src)}`} alt={p.alt} className="size-full object-contain" />
                  <span className="absolute inset-x-0 bottom-0 bg-foreground/80 text-xs font-medium text-background">URL</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </InputPanel>

      {w.readings.length === 0 && !w.jobs.photos.running && <EmptyState>아직 판독 결과가 없습니다. 사진을 고르고 사진 판독하기를 누르세요.</EmptyState>}
      {w.readings.length > 0 && (
        <ul className="grid items-start gap-4 2xl:grid-cols-2">
          {w.readings.map((r) => {
            const p = w.photos.find((x) => x.id === r.photoId);
            const anyConfirmed = r.links.some((l) => ["confirmed", "auto"].includes(w.linkDecisions[`${r.photoId}:${l.cardId}`] ?? ""));
            return (
              <li key={r.photoId} className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row">
                {p && <PhotoThumb p={p} className="sm:w-40" />}
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="photo">사진 근거 {r.photoId}</Pill>
                    <Pill>{PHOTO_KIND_LABEL[r.kind]}</Pill>
                  </div>
                  <p>{r.caption}</p>
                  <p className="text-sm text-muted-foreground">보이는 것: {r.visible.join(", ")}</p>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">연결 카드</h3>
                    {r.links.length === 0 && <p className="text-sm text-danger">연결된 카드가 없습니다.</p>}
                    <ul className="space-y-2">
                      {r.links.map((l, i) => {
                        const c = w.cards.find((x) => x.id === l.cardId);
                        const d = w.linkDecisions[`${r.photoId}:${l.cardId}`];
                        return (
                          <li key={i} data-testid="photo-link" data-decision={d ?? "pending"} className="flex flex-wrap items-start gap-2 text-sm">
                            <p className={cn("min-w-0 flex-1", d === "rejected" && "text-muted-foreground line-through")}>
                              <Pill tone="doc" className="mr-1.5">
                                {l.cardId} {c?.name}
                              </Pill>
                              {l.reason}
                            </p>
                            {d === "auto" && <Pill tone="doc">자동 확정</Pill>}
                            {d === "confirmed" && <Pill tone="success">확정</Pill>}
                            {d === "rejected" && <Pill>해제됨</Pill>}
                            {w.live && d !== "confirmed" && (
                              <Button data-testid="link-confirm" size="xs" variant="outline" onClick={() => w.decideLink(r.photoId, l.cardId, "confirmed")}>
                                연결 확정
                              </Button>
                            )}
                            {w.live && d !== "rejected" && (
                              <Button data-testid="link-reject" size="xs" variant="ghost" onClick={() => w.decideLink(r.photoId, l.cardId, "rejected")}>
                                연결 해제
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {r.links.length > 0 && !anyConfirmed && <p className="text-xs text-muted-foreground">확정한 연결이 없는 사진은 초안에 쓰지 않습니다.</p>}
                  </div>
                  {r.exposure.length > 0 && (
                    <div
                      className={cn(
                        "flex flex-wrap items-start gap-2 rounded-lg border p-3 text-sm",
                        acked.includes(r.photoId) ? "border-border bg-muted text-muted-foreground" : "border-danger-border bg-danger-soft text-danger",
                      )}
                    >
                      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <p className="min-w-0 flex-1">
                        <b className="font-semibold">노출 경고</b>(자동으로 가리지 않습니다): {r.exposure.map((x) => x.detail).join(" · ")}
                      </p>
                      {acked.includes(r.photoId) ? (
                        <span className="shrink-0 font-semibold">확인함</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setAcked((a) => [...a, r.photoId])}>
                          확인
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <StepPager prev={{ view: "step-1", label: "제품 분석" }} next={{ view: "step-3", label: "콘텐츠 생성" }} />
    </section>
  );
}
