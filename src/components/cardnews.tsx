"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { snapdom } from "@zumer/snapdom";
import { Button } from "@/components/ui/button";
import type { Generation } from "@/lib/schemas";
import type { Brand, Photo } from "./model";

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
/** 긴 변이 이보다 작은 사진은 확대하지 않고 액자형으로 둔다. */
const SMALL_PHOTO = 600;

type Slide = Generation["cardnews"][number];

/**
 * 카드뉴스 한 장(1080×1350). 사진은 자르거나 글자를 얹지 않고 원본 비율 그대로 액자 영역에 두며, 출처를 적는다.
 */
function SlideView({ slide, index, total, photo, brand }: { slide: Slide; index: number; total: number; photo: Photo | null; brand: Brand | null }) {
  const dark = index === 0 || index === total - 1;
  const navy = brand?.colors[1] ?? "#2c3d84";
  const accent = brand?.colors[0] ?? "#6c9aff";
  const fg = dark ? "#ffffff" : "#14213d";
  const small = photo ? photo.sourceLong < SMALL_PHOTO : false;
  // 작은 사진은 원본 크기의 1.5배까지만 키운다.
  const maxW = small && photo ? Math.round((photo.width / Math.max(photo.width, photo.height)) * photo.sourceLong * 1.5) : 960;
  const maxH = small && photo ? Math.round((photo.height / Math.max(photo.width, photo.height)) * photo.sourceLong * 1.5) : 640;
  return (
    <div
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        background: dark ? navy : "#f5f7fb",
        color: fg,
        fontFamily: "Pretendard, 'Pretendard Variable', sans-serif",
        wordBreak: "keep-all",
        display: "flex",
        flexDirection: "column",
        padding: 60,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 56 }}>
        {brand?.logoUrl ? (
          <div style={{ background: dark ? "#ffffff" : "transparent", borderRadius: 10, padding: dark ? "8px 14px" : 0 }}>
            <img src={brand.logoUrl} alt={brand.name} style={{ height: 36, display: "block" }} />
          </div>
        ) : (
          <span style={{ fontSize: 30, fontWeight: 800 }}>{brand?.name ?? ""}</span>
        )}
        <span style={{ fontSize: 28, fontWeight: 600, opacity: 0.8 }}>
          {index + 1} / {total}
        </span>
      </div>

      <div style={{ marginTop: 48, flex: photo ? "0 0 auto" : "1 1 auto", display: "flex", flexDirection: "column", justifyContent: photo ? "flex-start" : "center" }}>
        <div style={{ width: 80, height: 8, background: accent, borderRadius: 4, marginBottom: 28 }} />
        <div style={{ fontSize: photo ? 64 : 80, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.02em" }}>{slide.headline.text}</div>
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
          {slide.body.map((b, i) => (
            <div key={i} style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.45, opacity: 0.92 }}>
              {b.text}
            </div>
          ))}
        </div>
      </div>

      {photo && (
        <div style={{ flex: "1 1 auto", marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", minHeight: 0 }}>
          <div
            style={{
              flex: "1 1 auto",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: dark ? "rgba(255,255,255,0.08)" : "#ffffff",
              borderRadius: 24,
              border: dark ? "2px solid rgba(255,255,255,0.25)" : "2px solid #dde3ef",
              padding: small ? 40 : 16,
              minHeight: 0,
            }}
          >
            {photo.src ? (
              <img
                src={photo.src}
                alt={photo.name}
                style={{ maxWidth: Math.min(maxW, 980), maxHeight: Math.min(maxH, 560), width: "auto", height: "auto", objectFit: "contain", display: "block", borderRadius: 8 }}
              />
            ) : (
              <span style={{ fontSize: 28 }}>원본 사진을 불러오지 못했습니다</span>
            )}
          </div>
          <div style={{ marginTop: 12, fontSize: 22, opacity: 0.75, alignSelf: "flex-start" }}>사진 출처: {photo.sourceLabel ?? photo.name}</div>
        </div>
      )}
    </div>
  );
}

export function CardNews({ slides, photos, brand }: { slides: Generation["cardnews"]; photos: Photo[]; brand: Brand | null }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scale = 0.3;

  async function exportSlide(i: number) {
    const el = refs.current[i];
    if (!el) return;
    await document.fonts.ready;
    const shot = await snapdom(el, { embedFonts: true });
    await shot.download({ format: "png", filename: `cardnews-${i + 1}` });
  }

  async function run(target: number | "all") {
    setBusy(target);
    setError(null);
    try {
      if (target === "all") for (let i = 0; i < slides.length; i++) await exportSlide(i);
      else await exportSlide(target);
    } catch (e) {
      setError(`PNG 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button data-testid="cardnews-download" onClick={() => run("all")} disabled={busy !== null}>
          <Download /> {busy === "all" ? "PNG 저장 중…" : "PNG 5장 내려받기"}
        </Button>
        <span className="text-sm text-muted-foreground">1080×1350 · Pretendard · 사진은 자르지 않고 원본 비율로 배치</span>
        {error && <span className="text-sm font-semibold text-red-700">{error}</span>}
      </div>
      <div className="flex flex-wrap gap-4">
        {slides.map((s, i) => {
          const photo = s.photoId ? (photos.find((p) => p.id === s.photoId) ?? null) : null;
          return (
            <div key={i} className="space-y-1">
              <div style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, overflow: "hidden" }} className="rounded-lg shadow ring-1 ring-black/10">
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: SLIDE_W, height: SLIDE_H }}>
                  <div ref={(el) => void (refs.current[i] = el)}>
                    <SlideView slide={s} index={i} total={slides.length} photo={photo} brand={brand} />
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => run(i)} disabled={busy !== null}>
                <Download /> {i + 1}장 PNG
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
