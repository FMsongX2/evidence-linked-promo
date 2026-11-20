import path from "node:path";
import { readDataFile } from "@/lib/data";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export async function GET(_req: Request, ctx: RouteContext<"/api/tlink/file/[...path]">) {
  const { path: parts } = await ctx.params;
  const rel = parts.map(decodeURIComponent).join("/");
  const type = TYPES[path.extname(rel).toLowerCase()];
  if (!type || !(rel.startsWith("photos/") || rel.startsWith("brand/"))) return new Response("not found", { status: 404 });
  const buf = await readDataFile(rel);
  if (!buf) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
}
