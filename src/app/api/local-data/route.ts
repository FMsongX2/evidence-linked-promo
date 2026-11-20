import fs from "node:fs/promises";
import path from "node:path";
import { cacheDir, isDeployed } from "@/lib/env";

const PARTS = ["llm", "url", "runs"] as const;

async function countFiles(dir: string): Promise<number> {
  try {
    return (await fs.readdir(dir)).length;
  } catch {
    return 0;
  }
}

/** 이 서버(로컬 기기)에 남은 모델 응답 캐시, URL 본문 캐시, 실행 기록의 파일 수. 배포 환경에는 남기지 않는다. */
export async function GET() {
  if (isDeployed) return Response.json({ stored: false, files: {} });
  const files = Object.fromEntries(await Promise.all(PARTS.map(async (p) => [p, await countFiles(path.join(cacheDir, p))] as const)));
  return Response.json({ stored: true, files });
}

/** 로컬 캐시와 실행 기록을 모두 지운다. */
export async function DELETE() {
  if (isDeployed) return Response.json({ deleted: 0 });
  let deleted = 0;
  for (const p of PARTS) {
    deleted += await countFiles(path.join(cacheDir, p));
    await fs.rm(path.join(cacheDir, p), { recursive: true, force: true });
  }
  return Response.json({ deleted });
}
