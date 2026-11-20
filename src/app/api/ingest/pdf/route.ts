import { getDocumentProxy } from "unpdf";
import { LIMITS } from "@/lib/env";
import { errorResponse } from "@/lib/guard";
import type { SourceDoc } from "@/lib/schemas";

export const maxDuration = 120;

/**
 * 올린 PDF를 쪽 단위 텍스트로 떼어 근거 문서로 만든다.
 * 응답은 줄 단위 JSON 스트림: {"type":"progress","page":n,"total":t} … {"type":"done","doc":…,"emptyPages":k}
 */
export async function POST(req: Request) {
  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) return Response.json({ error: "PDF 파일이 없습니다." }, { status: 400 });
    if (f.size > LIMITS.pdfBytes) {
      return Response.json({ error: `PDF가 ${(LIMITS.pdfBytes / 1e6).toFixed(0)}MB를 넘습니다. 쪽을 나눠 올리세요.` }, { status: 413 });
    }
    file = f;
  } catch (e) {
    return errorResponse(e);
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
        const pages: SourceDoc["pages"] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text = content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join("");
          pages.push({ page: i, text });
          send({ type: "progress", page: i, total: pdf.numPages });
        }
        const base = file.name.replace(/\.pdf$/i, "");
        const doc: SourceDoc = {
          id: `upload-${base.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase().slice(0, 40)}`,
          title: base,
          kind: "pdf",
          sourceFile: file.name,
          pages,
        };
        send({ type: "done", doc, emptyPages: pages.filter((p) => p.text.trim().length === 0).length });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
}
