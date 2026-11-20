import { errorResponse, rateLimited } from "@/lib/guard";
import { extractCards } from "@/lib/pipeline";
import type { SourceDoc } from "@/lib/schemas";

export const maxDuration = 300;

/** 1단계: 문서 쪽 텍스트에서 차별점 카드를 뽑고, 인용문 대조와 수치 충돌은 코드가 판정한다(src/lib/pipeline.ts). */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const { docs, company } = (await req.json()) as { docs: SourceDoc[]; company?: string };
    if (!docs?.length) return Response.json({ error: "근거 문서가 없습니다." }, { status: 400 });
    return Response.json(await extractCards(docs, company));
  } catch (e) {
    return errorResponse(e);
  }
}
