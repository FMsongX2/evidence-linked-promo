import { errorResponse, rateLimited } from "@/lib/guard";
import { structured } from "@/lib/llm";
import { GENERATE_SYSTEM, generatePrompt } from "@/lib/prompts";
import { generationSchema, type Card, type Conflict, type Guideline, type PhotoReading } from "@/lib/schemas";

export const maxDuration = 300;

/** 3단계: 고른 카드와 사진으로 블로그 리뷰형 초안·카드뉴스 5장·설치 사례 글을 만든다. 문장마다 근거 번호를 단다. */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const { cards, readings, guideline, company, conflicts } = (await req.json()) as {
      cards: Card[];
      readings: PhotoReading[];
      guideline: Guideline | null;
      company?: string;
      conflicts?: Conflict[];
    };
    if (!cards?.length) return Response.json({ error: "고른 차별점 카드가 없습니다." }, { status: 400 });
    const { data, meta } = await structured({
      role: "main",
      task: "콘텐츠 생성",
      system: GENERATE_SYSTEM,
      prompt: generatePrompt(cards, readings ?? [], guideline, company ?? "(미상)", (conflicts ?? []).filter((c) => c.cardIds.some((id) => cards.some((x) => x.id === id)))),
      schema: generationSchema,
    });
    return Response.json({ generation: data, meta });
  } catch (e) {
    return errorResponse(e);
  }
}
