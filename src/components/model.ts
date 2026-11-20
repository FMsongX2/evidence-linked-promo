import type { ChecklistItem, CheckItem, CheckMetrics } from "@/lib/check";
import type { Card, Conflict, Generation, Guideline, LlmMeta, PhotoKind, PhotoReading, SourceDoc, Warning, WarningType } from "@/lib/schemas";

export type Photo = {
  id: string;
  name: string;
  /** 판독·카드뉴스에 쓰는 이미지 주소(data URL 또는 같은 출처 주소). 불러오지 못하면 null */
  src: string | null;
  width: number;
  height: number;
  /** 원본 해상도 기준 긴 변 */
  sourceLong: number;
  sourceUrl?: string;
  sourceLabel?: string;
  loadError?: string;
};

export type Brand = { name: string; logoUrl: string | null; colors: string[] };

export type CheckResult = {
  items: CheckItem[];
  warnings: Warning[];
  checklist: ChecklistItem[];
  suggestions: { key: string; text: string; cardIds: string[] }[];
  metrics: CheckMetrics;
  metas: LlmMeta[];
  judgeError: string | null;
  suggestError: string | null;
  verdicts: { key: string; verdict: string; reason: string }[];
  /** 코드와 모델 중 한쪽만 경고한 문장. 하나라도 경고하면 경고로 띄운다 */
  disagreements: { key: string; code: boolean; model: boolean; reason: string }[];
  /** 모델만 지적했고 코드 대조로 확인되지 않아 '확인 필요'로 낮춘 판정 */
  reviews?: { key: string; verdict: string; sentencePart: string; reason: string; why: string }[];
  /** 서버에서 점검에 걸린 시간 */
  elapsedMs: number;
  checkedAt: number;
};

export type Providers = {
  deployed: boolean;
  main: string | null;
  vision: string | null;
  judge: string | null;
  mainReason: string | null;
  visionReason: string | null;
  judgeReason: string | null;
  judgeSameVendor: boolean;
};

/** 미리 계산한 예시 결과. 원본 문서 전체는 넣지 않고 문서 이름만 남긴다. */
export type ExampleSnapshot = {
  savedAt: string;
  providers: Providers;
  company: string;
  brand: Brand | null;
  docs: Pick<SourceDoc, "id" | "title" | "kind" | "url">[];
  guideline: Guideline | null;
  cards: Card[];
  conflicts: Conflict[];
  photos: Photo[];
  readings: PhotoReading[];
  generation: Generation | null;
  check: CheckResult | null;
  paste: { text: string; result: CheckResult | null };
  metas: LlmMeta[];
  timings: { photoToDraftMs: number | null };
};

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  install: "설치 장비",
  workspace: "고객사 업무 공간",
  screen: "제품 화면",
  other: "기타",
};

export const WARNING_LABEL: Record<WarningType, string> = {
  "no-evidence": "근거 없음",
  "spec-mismatch": "사양 불일치",
  "numeric-conflict": "수치 충돌",
  "guideline-missing": "가이드라인 누락",
};

export function docLabel(docs: Pick<SourceDoc, "id" | "title" | "kind">[], docId: string, page: number): string {
  const d = docs.find((x) => x.id === docId);
  return `${d?.title ?? docId} ${d?.kind === "url" ? "구간 " : "p."}${page}`;
}

export function formatMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `서버 응답을 읽지 못했습니다(${res.status}).` }));
  if (!res.ok || data.error) throw new Error(data.error ?? `요청 실패(${res.status})`);
  return data as T;
}
