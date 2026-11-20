import { ingestUrl } from "@/lib/web";
import { errorResponse, rateLimited } from "@/lib/guard";

/** 홈페이지 URL 본문을 마크다운 텍스트로 받아 구간 단위 근거 문서로 만든다. */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url) return Response.json({ error: "URL이 없습니다." }, { status: 400 });
    return Response.json(await ingestUrl(url));
  } catch (e) {
    return errorResponse(e);
  }
}
