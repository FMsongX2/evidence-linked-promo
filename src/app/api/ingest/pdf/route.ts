import { extractText, getDocumentProxy } from "unpdf";
import { LIMITS } from "@/lib/env";
import { errorResponse } from "@/lib/guard";
import type { SourceDoc } from "@/lib/schemas";

/** 올린 PDF를 쪽 단위 텍스트로 떼어 근거 문서로 만든다. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "PDF 파일이 없습니다." }, { status: 400 });
    if (file.size > LIMITS.pdfBytes) {
      return Response.json({ error: `PDF가 ${(LIMITS.pdfBytes / 1e6).toFixed(0)}MB를 넘습니다. 쪽을 나눠 올리세요.` }, { status: 413 });
    }
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    const base = file.name.replace(/\.pdf$/i, "");
    const doc: SourceDoc = {
      id: `upload-${base.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase().slice(0, 40)}`,
      title: base,
      kind: "pdf",
      sourceFile: file.name,
      pages: text.map((t, i) => ({ page: i + 1, text: t })),
    };
    const empty = doc.pages.filter((p) => p.text.trim().length === 0).length;
    return Response.json({ doc, emptyPages: empty });
  } catch (e) {
    return errorResponse(e);
  }
}
