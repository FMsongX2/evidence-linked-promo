import path from "node:path";

/** Vercel 같은 서버리스 배포 환경인지. 이 환경에서는 로컬 CLI 공급자와 디스크 캐시를 끈다. */
export const isDeployed = Boolean(process.env.VERCEL);

/** 티링크 자료 폴더. 저장소에 넣지 않는 로컬 자료다. */
export const dataDir = path.resolve(process.cwd(), process.env.TLINK_DATA_DIR ?? "../data/tlink");

/** 모델 호출 캐시 폴더. 배포 환경에서는 쓰지 않는다. */
export const cacheDir = path.resolve(process.cwd(), ".cache");
export const cacheEnabled = !isDeployed && process.env.LLM_CACHE !== "off";

/** 업로드 제한. Vercel 함수 요청 본문 4.5MB 한계보다 작게 잡는다. */
export const LIMITS = {
  photos: 5,
  photoBytes: 800_000,
  // 배포 환경은 Vercel 요청 본문 한계 아래로, 로컬은 원본 제안서·회사소개서 PDF가 들어가게 크게 둔다.
  pdfBytes: isDeployed ? 4_000_000 : 300_000_000,
  pasteChars: 20_000,
};
