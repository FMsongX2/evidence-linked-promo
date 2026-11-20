import { LlmUnavailableError } from "./llm";

/** IP별 모델 호출 횟수 제한(서버 인스턴스 메모리 기준, 10분에 30회). */
const WINDOW_MS = 10 * 60_000;
const MAX_CALLS = 30;
const hits = new Map<string, number[]>();

export function rateLimited(req: Request): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) {
    return Response.json({ error: `요청이 너무 많습니다. ${Math.ceil((WINDOW_MS - (now - recent[0])) / 60_000)}분 뒤 다시 시도하세요.` }, { status: 429 });
  }
  recent.push(now);
  hits.set(ip, recent);
  return null;
}

/** 라우트 오류를 화면에 보일 수 있는 문장으로 바꾼다. */
export function errorResponse(e: unknown): Response {
  if (e instanceof LlmUnavailableError) return Response.json({ error: e.message, unavailable: true }, { status: 503 });
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  return Response.json({ error: message }, { status: 500 });
}
