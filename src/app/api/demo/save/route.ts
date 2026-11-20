import fs from "node:fs/promises";
import path from "node:path";
import { isDeployed } from "@/lib/env";
import type { ExampleSnapshot } from "@/components/model";

/**
 * 로컬 실행 결과를 공개 데모용 예시 결과(public/demo/example.json)로 저장한다. 로컬 전용.
 * - 원본 문서는 이름만 남긴다(쪽 텍스트는 저장하지 않는다).
 * - 홈페이지 설치 사례 사진은 원본 주소만 남기고, 화면에서 중계 경로로 불러온다.
 * - 티링크 공식 블로그 사진은 후원사 허락에 따라 줄인 사본을 public/demo/photos에 둔다.
 * - 직접 올린 사진이 있으면 저장하지 않는다.
 */
export async function POST(req: Request) {
  if (isDeployed) return Response.json({ error: "배포 환경에서는 저장하지 않습니다." }, { status: 403 });
  const snap = (await req.json()) as ExampleSnapshot;
  const dir = path.join(process.cwd(), "public", "demo");
  await fs.mkdir(path.join(dir, "photos"), { recursive: true });
  const photos = [];
  for (const p of snap.photos) {
    const host = p.sourceUrl ? new URL(p.sourceUrl).hostname : "";
    if (/(^|\.)tlinkcrm\.com$/.test(host)) {
      photos.push({ ...p, src: null });
    } else if (host === "blogfiles.pstatic.net" && p.src?.startsWith("data:image/jpeg;base64,")) {
      const file = `${p.id}.jpg`;
      await fs.writeFile(path.join(dir, "photos", file), Buffer.from(p.src.split(",")[1], "base64"));
      photos.push({ ...p, src: `/demo/photos/${file}` });
    } else {
      return Response.json({ error: `${p.id}: 출처가 티링크 홈페이지·공식 블로그가 아닌 사진은 예시로 저장하지 않습니다.` }, { status: 400 });
    }
  }
  const out: ExampleSnapshot = { ...snap, docs: snap.docs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, url: d.url })), photos };
  await fs.writeFile(path.join(dir, "example.json"), JSON.stringify(out, null, 1));
  return Response.json({ ok: true, photos: photos.length });
}
