import fs from "node:fs/promises";
import path from "node:path";
import { cacheDir, isDeployed } from "@/lib/env";

/** 실행마다 측정 기록(JSON)을 로컬 .cache/runs 에 남긴다. 배포 환경에서는 저장하지 않는다. */
export async function POST(req: Request) {
  if (isDeployed) return Response.json({ ok: false });
  const log = (await req.json()) as { kind?: string; at?: string };
  const dir = path.join(cacheDir, "runs");
  await fs.mkdir(dir, { recursive: true });
  const name = `${(log.at ?? new Date().toISOString()).replace(/[:.]/g, "-")}-${log.kind ?? "run"}.json`;
  await fs.writeFile(path.join(dir, name), JSON.stringify(log, null, 2));
  return Response.json({ ok: true, file: name });
}
