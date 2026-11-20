import type { CheckItem } from "@/lib/check";
import { errorResponse, rateLimited } from "@/lib/guard";
import { structured } from "@/lib/llm";
import { REGENERATE_SYSTEM, cardsBlock, photosBlock } from "@/lib/prompts";
import { regenerateSchema, type Card, type PhotoReading, type Warning } from "@/lib/schemas";

export const maxDuration = 300;

/** 경고를 받은 문장만 다시 쓴다. */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const { items, warnings, cards, readings } = (await req.json()) as {
      items: CheckItem[];
      warnings: Warning[];
      cards: Card[];
      readings: PhotoReading[];
    };
    if (!items?.length) return Response.json({ error: "다시 쓸 문장이 없습니다." }, { status: 400 });
    const block = items
      .map((it) => {
        const ws = warnings.filter((w) => w.sentenceKey === it.key).map((w) => `- ${w.message}${w.detail ? ` (${w.detail})` : ""}`);
        return `### ${it.key}\n문장: ${it.text}\n현재 근거: ${it.cardIds.join(", ") || "없음"}\n경고:\n${ws.join("\n")}`;
      })
      .join("\n\n");
    const { data, meta } = await structured({
      role: "main",
      task: "경고 문장 다시 쓰기",
      system: REGENERATE_SYSTEM,
      prompt: `## 차별점 카드\n${cardsBlock(cards)}\n\n## 사진\n${readings?.length ? photosBlock(readings) : "(없음)"}\n\n## 고칠 문장\n${block}\n\n각 문장의 key를 그대로 돌려준다.`,
      schema: regenerateSchema,
    });
    return Response.json({ replacements: data.sentences, meta });
  } catch (e) {
    return errorResponse(e);
  }
}
