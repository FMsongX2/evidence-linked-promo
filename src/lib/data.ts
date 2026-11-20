import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./env";
import type { Guideline, SourceDoc } from "./schemas";

type RawPage = { page: number; text: string; notes?: string; imageText?: string };
type IndexEntry = { id: string; title: string; sourceFile: string; sourceUrl?: string; kind: SourceDoc["kind"] | "web"; pages: number };

export type PhotoEntry = {
  file: string;
  sourceUrl: string;
  pageUrl?: string;
  kind: string;
  note: string;
  caption?: string;
  alt?: string;
  industry?: string;
  width?: number;
  height?: number;
  lowRes?: boolean;
  license?: string;
  /** 후원사가 지정한 현장 사진(홈페이지 설치 사례) */
  officialFieldPhoto?: boolean;
};
export type Brand = { name: string; logo: string; colors: string[] };

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** 쪽 텍스트에 발표자 노트와 이미지 글자를 덧붙여 하나의 근거 텍스트로 만든다. */
function pageText(p: RawPage): string {
  const parts = [p.text];
  if (p.notes) parts.push(`[발표자 노트]\n${p.notes}`);
  if (p.imageText) parts.push(`[이미지 속 글자]\n${p.imageText}`);
  return parts.join("\n");
}

export async function loadDocs(): Promise<SourceDoc[]> {
  const index = await readJson<IndexEntry[]>("docs/index.json");
  if (!index) return [];
  const docs: SourceDoc[] = [];
  for (const entry of index) {
    const pages = (await readJson<RawPage[]>(`docs/${entry.id}.pages.json`)) ?? [];
    docs.push({
      id: entry.id,
      title: entry.title,
      kind: entry.kind === "web" ? "url" : entry.kind,
      sourceFile: entry.sourceFile,
      url: entry.sourceUrl,
      pages: pages.map((p) => ({ page: p.page, text: pageText(p) })),
    });
  }
  return docs;
}

export async function loadGuideline(): Promise<Guideline | null> {
  const g = await readJson<Guideline>("guideline.json");
  if (!g) return null;
  return {
    requiredKeywords: g.requiredKeywords ?? [],
    emphasisPoints: g.emphasisPoints ?? [],
    links: g.links ?? [],
    contact: g.contact ?? [],
    notes: g.notes ?? [],
    tags: g.tags ?? [],
  };
}

export async function loadPhotos(): Promise<PhotoEntry[]> {
  return (await readJson<PhotoEntry[]>("photos/index.json")) ?? [];
}

export async function loadBrand(): Promise<Brand | null> {
  return readJson<Brand>("brand/brand.json");
}

/** 자료 폴더 안의 파일만 읽는다. 폴더 밖 경로는 거절한다. */
export async function readDataFile(rel: string): Promise<Buffer | null> {
  const full = path.resolve(dataDir, rel);
  if (!full.startsWith(dataDir + path.sep)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}
