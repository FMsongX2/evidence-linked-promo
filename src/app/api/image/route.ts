/**
 * 홈페이지 사진 중계. 다른 출처 이미지가 PNG 내보내기에서 캔버스를 오염시키지 않게 같은 출처로 내려 준다.
 * 허용 호스트를 고정해 임의 주소를 중계하지 않는다.
 */
const ALLOWED_HOSTS = (process.env.IMAGE_RELAY_HOSTS ?? "tlinkcrm.com,www.tlinkcrm.com").split(",").map((h) => h.trim());
const MAX_BYTES = 5_000_000;

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src");
  let u: URL;
  try {
    u = new URL(src ?? "");
  } catch {
    return new Response("잘못된 주소", { status: 400 });
  }
  if (!["http:", "https:"].includes(u.protocol) || !ALLOWED_HOSTS.includes(u.hostname)) {
    return new Response("허용하지 않은 호스트", { status: 403 });
  }
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(15_000), redirect: "error" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) return new Response("이미지가 아님", { status: 502 });
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return new Response("이미지가 너무 큼", { status: 413 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response("이미지가 너무 큼", { status: 413 });
    return new Response(buf, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
  } catch {
    return new Response("원본 사이트 응답 없음", { status: 504 });
  }
}
