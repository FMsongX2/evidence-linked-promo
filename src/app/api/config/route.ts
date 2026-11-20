import { dataDir, isDeployed, LIMITS } from "@/lib/env";
import { loadBrand, loadDocs, loadGuideline, loadPhotos } from "@/lib/data";
import { providerSummary } from "@/lib/llm";

export async function GET() {
  const [docs, guideline, photos, brand] = await Promise.all([loadDocs(), loadGuideline(), loadPhotos(), loadBrand()]);
  return Response.json({
    providers: providerSummary(),
    deployed: isDeployed,
    limits: LIMITS,
    data: {
      available: docs.length > 0,
      dir: isDeployed ? null : dataDir,
      docs: docs.length,
      guideline: Boolean(guideline),
      photos: photos.length,
      brand: Boolean(brand),
    },
  });
}
