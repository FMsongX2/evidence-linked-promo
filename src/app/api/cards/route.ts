import { errorResponse, rateLimited } from "@/lib/guard";
import { structured } from "@/lib/llm";
import { CARD_SYSTEM, docsBlock } from "@/lib/prompts";
import { cardDraftSchema, type SourceDoc } from "@/lib/schemas";
import { buildCards } from "@/lib/verify";

export const maxDuration = 300;

/** 1단계: 문서 쪽 텍스트에서 차별점 카드를 뽑고, 인용문 대조와 수치 충돌은 코드가 판정한다. */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const { docs, company } = (await req.json()) as { docs: SourceDoc[]; company?: string };
    if (!docs?.length) return Response.json({ error: "근거 문서가 없습니다." }, { status: 400 });
    const { data, meta } = await structured({
      role: "main",
      task: "차별점 카드 추출",
      system: CARD_SYSTEM,
      prompt: `회사: ${company ?? "(미상)"}\n\n아래는 제품 자료의 쪽별 텍스트다.\n\n${docsBlock(docs)}`,
      schema: cardDraftSchema,
    });
    const { cards, conflicts } = buildCards(docs, data);
    return Response.json({ cards, conflicts, metrics: data.metrics, meta });
  } catch (e) {
    return errorResponse(e);
  }
}
