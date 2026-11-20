"use client";

export type LoadedPhoto = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  /** 원본 해상도 기준 긴 변. 카드뉴스 배치(전면/액자형)를 고르는 데 쓴다. */
  sourceLong: number;
  sourceUrl?: string;
  sourceLabel?: string;
};

export const MAX_LONG_SIDE = 1600;

/** 브라우저 캔버스로 긴 변을 1600px 이하로 줄여 JPEG data URL로 만든다. */
export async function resizeImage(blob: Blob, quality = 0.85): Promise<{ dataUrl: string; width: number; height: number; sourceLong: number }> {
  const bitmap = await createImageBitmap(blob);
  const sourceLong = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, MAX_LONG_SIDE / sourceLong);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height, sourceLong };
}

export async function photoFromUrl(url: string, id: string, name: string, extra?: Partial<LoadedPhoto>): Promise<LoadedPhoto> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: 사진을 불러오지 못했습니다(${res.status}).`);
  const r = await resizeImage(await res.blob());
  return { id, name, ...r, ...extra };
}
