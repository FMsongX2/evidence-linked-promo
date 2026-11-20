import { loadBrand, loadDocs, loadGuideline, loadPhotos } from "@/lib/data";

/** TLINK_DATA_DIR의 문서·가이드라인·사진 목록·브랜드를 불러온다. 파일은 /api/tlink/file 로 받는다. */
export async function GET() {
  const [docs, guideline, photos, brand] = await Promise.all([loadDocs(), loadGuideline(), loadPhotos(), loadBrand()]);
  if (docs.length === 0) {
    return Response.json({ error: "TLINK_DATA_DIR에 docs/index.json이 없습니다." }, { status: 404 });
  }
  return Response.json({
    docs,
    guideline,
    photos: photos.map((p) => ({ ...p, url: `/api/tlink/file/photos/${encodeURIComponent(p.file)}` })),
    brand: brand ? { ...brand, logoUrl: `/api/tlink/file/brand/${encodeURIComponent(brand.logo)}` } : null,
  });
}
