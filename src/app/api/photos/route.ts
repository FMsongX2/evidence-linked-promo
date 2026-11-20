import { LIMITS } from "@/lib/env";
import { errorResponse, rateLimited } from "@/lib/guard";
import { structured, type ImageInput } from "@/lib/llm";
import { PHOTO_SYSTEM, cardsBlock } from "@/lib/prompts";
import { photoReadingSchema, type Card } from "@/lib/schemas";

export const maxDuration = 300;

/** 2단계: 사진 종류·보이는 것·노출 경고를 읽고 관련 차별점 카드를 연결한다. */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const { cards, photos } = (await req.json()) as { cards: Card[]; photos: { id: string; dataUrl: string }[] };
    if (!photos?.length) return Response.json({ error: "사진이 없습니다." }, { status: 400 });
    if (photos.length > LIMITS.photos) return Response.json({ error: `사진은 ${LIMITS.photos}장까지 올릴 수 있습니다.` }, { status: 400 });
    const images: ImageInput[] = [];
    for (const p of photos) {
      const m = p.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return Response.json({ error: `${p.id}: JPEG·PNG·WebP 사진만 받습니다.` }, { status: 400 });
      if ((m[2].length * 3) / 4 > LIMITS.photoBytes) return Response.json({ error: `${p.id}: 사진이 너무 큽니다.` }, { status: 413 });
      images.push({ mediaType: m[1], base64: m[2] });
    }
    const { data, meta } = await structured({
      role: "vision",
      task: "사진 판독",
      system: PHOTO_SYSTEM,
      prompt: `사진 ${photos.length}장(${photos.map((p) => p.id).join(", ")})을 판독하라.\n\n## 차별점 카드\n${cardsBlock(cards, false)}`,
      images,
      schema: photoReadingSchema,
    });
    const known = new Set(cards.map((c) => c.id));
    const readings = data.photos.map((r) => ({ ...r, links: r.links.filter((l) => known.has(l.cardId)) }));
    return Response.json({ readings, meta });
  } catch (e) {
    return errorResponse(e);
  }
}
