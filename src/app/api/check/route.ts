import { LIMITS } from "@/lib/env";
import { errorResponse, rateLimited } from "@/lib/guard";
import { CheckInputError, runCheck, type CheckBody } from "@/lib/pipeline";

export const maxDuration = 300;

/** 4단계 게시 전 점검. 실행 순서는 src/lib/pipeline.ts runCheck에 있다. */
export async function POST(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const body = (await req.json()) as CheckBody;
    return Response.json(await runCheck(body, { pasteLimit: LIMITS.pasteChars }));
  } catch (e) {
    if (e instanceof CheckInputError) return Response.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
