"use client";

import { AlertTriangle, ScanEye, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PHOTO_KIND_LABEL, type Photo } from "./model";
import { MetaLine, Running, SectionHeader, type TlinkPhoto, type W } from "./workbench";

const OFFICIAL_LABEL = "티링크 홈페이지 설치 사례(tlinkcrm.com/case.php)";

function tlinkLabel(p: TlinkPhoto): string {
  if (p.officialFieldPhoto) return `${OFFICIAL_LABEL}${p.industry ? ` · ${p.industry}` : ""}`;
  return `티링크 공식 블로그${p.license ? ` · ${p.license}` : ""}`;
}

function PhotoThumb({ p, onRemove }: { p: Photo; onRemove?: () => void }) {
  return (
    <div className="relative w-44 shrink-0">
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border bg-slate-100">
        {p.src ? (
          <img src={p.src} alt={p.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="p-2 text-center text-xs text-red-700">{p.loadError ?? "불러오는 중…"}</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1 text-sm font-bold">
        <span className="rounded bg-amber-500 px-1.5 text-white">{p.id}</span>
        <span className="truncate font-normal">{p.name}</span>
      </div>
      <div className="line-clamp-2 text-xs text-muted-foreground">출처: {p.sourceLabel ?? "미상"}</div>
      {onRemove && (
        <button aria-label={`${p.id} 빼기`} onClick={onRemove} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function StepPhotos({ w }: { w: W }) {
  const full = w.photos.length >= (w.config?.limits.photos ?? 5);
  const blockReason = w.visionBlock ?? (w.cards.length === 0 ? "1단계 차별점 카드가 먼저 필요합니다." : w.photos.length === 0 ? "사진을 1장 이상 넣으세요." : null);
  const inTray = new Set(w.photos.map((p) => p.sourceUrl).filter(Boolean));
  return (
    <section id="step-2" className="scroll-mt-32 rounded-2xl border bg-white p-6">
      <SectionHeader n={2} title="현장 사진 판독과 카드 연결" desc="사진 1~5장(긴 변 1,600px 이하로 줄여 보냄)의 종류와 보이는 것을 읽고 관련 차별점 카드를 연결합니다. 사진에서 나온 내용은 '사진 근거'로 따로 표시합니다.">
        <MetaLine metas={w.metas} task="사진 판독" />
        <Button size="lg" onClick={w.readPhotos} disabled={Boolean(blockReason) || w.jobs.photos.running}>
          <ScanEye /> 사진 판독하기
        </Button>
      </SectionHeader>
      {blockReason && w.live && <p className="-mt-2 mb-3 text-right text-sm text-muted-foreground">{blockReason}</p>}

      <div className="rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold">고른 사진 {w.photos.length}/5</h3>
          {w.live && (
            <label className={cn("inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-sm font-medium hover:bg-muted", full && "pointer-events-none opacity-50")}>
              <Upload className="size-4" /> 사진 올리기
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  if (fs.length) w.addPhotoFiles(fs);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        {w.photos.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-muted-foreground">사진이 없습니다. 아래 설치 사례 사진을 누르거나 직접 올리세요.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {w.photos.map((p) => (
              <PhotoThumb key={p.id} p={p} onRemove={w.live ? () => w.removePhoto(p.id) : undefined} />
            ))}
          </div>
        )}

        {w.live && (w.tlinkPhotos.length > 0 || w.pageImages.length > 0) && (
          <div className="mt-4 border-t pt-3">
            <h4 className="mb-2 text-sm font-bold text-slate-600">사진 후보 — 눌러서 추가</h4>
            <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
              {w.tlinkPhotos.map((p) => (
                <button
                  key={p.file}
                  disabled={full || inTray.has(p.sourceUrl) || w.jobs.photos.running}
                  onClick={() => w.addPhotoUrl(p.url, { name: p.alt || p.file, sourceUrl: p.sourceUrl, sourceLabel: tlinkLabel(p) })}
                  className="group relative h-24 w-24 overflow-hidden rounded-md border bg-slate-100 disabled:opacity-40"
                  title={`${p.alt ?? p.file}\n출처: ${tlinkLabel(p)}`}
                >
                  <img src={p.url} alt={p.alt ?? p.file} className="h-full w-full object-contain" />
                  <span className={cn("absolute bottom-0 left-0 right-0 text-[10px] font-semibold text-white", p.officialFieldPhoto ? "bg-blue-700/85" : "bg-slate-700/85")}>
                    {p.officialFieldPhoto ? "설치 사례" : "블로그"}
                  </span>
                </button>
              ))}
              {w.pageImages.map((p) => (
                <button
                  key={p.src}
                  disabled={full || inTray.has(p.src) || w.jobs.photos.running}
                  onClick={() =>
                    w.addPhotoUrl(`/api/image?src=${encodeURIComponent(p.src)}`, { name: p.alt || p.src.split("/").pop()!, sourceUrl: p.src, sourceLabel: `홈페이지 ${p.pageUrl}` })
                  }
                  className="relative h-24 w-24 overflow-hidden rounded-md border bg-slate-100 disabled:opacity-40"
                  title={`${p.alt}\n${p.src}`}
                >
                  <img src={`/api/image?src=${encodeURIComponent(p.src)}`} alt={p.alt} className="h-full w-full object-contain" />
                  <span className="absolute bottom-0 left-0 right-0 bg-emerald-700/85 text-[10px] font-semibold text-white">URL</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <Running job={w.jobs.photos} label="사진 판독" />
        {w.readings.length === 0 && !w.jobs.photos.running && (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">아직 판독 결과가 없습니다.</p>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          {w.readings.map((r) => {
            const p = w.photos.find((x) => x.id === r.photoId);
            return (
              <div key={r.photoId} className="flex gap-4 rounded-xl border bg-white p-4">
                {p && <PhotoThumb p={p} />}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-500 px-2 py-0.5 text-sm font-bold text-white">사진 근거 {r.photoId}</span>
                    <span className="rounded-md border px-2 py-0.5 text-sm font-semibold">{PHOTO_KIND_LABEL[r.kind]}</span>
                  </div>
                  <p className="text-[1.02rem]">{r.caption}</p>
                  <p className="text-sm text-muted-foreground">보이는 것: {r.visible.join(", ")}</p>
                  <div className="space-y-1">
                    {r.links.length === 0 && <p className="text-sm text-red-700">연결된 카드가 없습니다.</p>}
                    {r.links.map((l, i) => {
                      const c = w.cards.find((x) => x.id === l.cardId);
                      return (
                        <p key={i} className="text-sm">
                          <span className="mr-1 rounded border border-blue-300 bg-blue-50 px-1.5 font-semibold text-blue-800">
                            {l.cardId} {c?.name}
                          </span>
                          {l.reason}
                        </p>
                      );
                    })}
                  </div>
                  {r.exposure.length > 0 && (
                    <div className="flex gap-2 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-900">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>
                        <b>노출 경고</b>(자동으로 가리지 않습니다): {r.exposure.map((x) => x.detail).join(" · ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
