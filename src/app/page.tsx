import { Workbench } from "@/components/workbench";
import { PUBLIC_DEMO_NOTE } from "@/components/model";
import { providerSummary } from "@/lib/llm";

const REPO_URL = "https://github.com/FMsongX2/evidence-linked-promo";
const VIDEO_URL = "https://www.youtube.com/watch?v=uVVEGTupDpo";

export default function Page() {
  // 서버에 모델 키가 없으면(공개 데모) 직접 실행을 약속하지 않는다.
  const noModel = !providerSummary().main;
  return (
    <Workbench>
      {/* 서버에서 렌더링되는 제품 소개. 자바스크립트 없이 첫 HTML만 읽어도 무엇을 하는 앱인지 알 수 있게 한다. */}
      <footer data-testid="about" className="mt-16 max-w-[70ch] space-y-2 border-t pt-6 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">근거 달린 홍보문 소개</h2>
        <p>
          티링크 제품 자료(PDF·홈페이지)와 현장 사진으로 블로그 리뷰형 초안, 카드뉴스 5장, 설치 사례 글을 자동으로 만들고, 문장마다 원문 근거(문서·쪽 또는 사진)를 달아 사양과 다른 문장, 자료 간
          수치 충돌, 가이드라인 누락을 게시 전에 경고하는 웹 앱입니다. 사람은 경고를 보고 승인한 뒤 복사합니다.
        </p>
        <p>
          처음 오셨다면 머리글의 &ldquo;티링크 예시로 보기&rdquo;를 눌러 로컬에서 티링크 자료로 실제 실행해 저장한 결과를 보세요.{" "}
          {noModel ? PUBLIC_DEMO_NOTE : <>4단계의 &ldquo;외부 리뷰 원고 검수&rdquo; 탭에서 원고 검수를 직접 다시 돌려 볼 수 있습니다.</>}
        </p>
        <p>
          측정 결과(로컬 측정 구성: 생성 deepseek-ai/deepseek-v4.1-flash-1017, 판정 claude-opus-5-5): 실제 사양을 고쳐 만든 고정 문장 10개 중 10개 경고, 바르게 쓴 짝 문장 10개 오경고 0개, 문장
          20개 점검 18.3초.
        </p>
        <p>
          시연 영상:{" "}
          <a className="font-medium break-all text-doc underline underline-offset-2" href={VIDEO_URL}>
            {VIDEO_URL}
          </a>
        </p>
        <p>
          소스 코드와 측정 기록:{" "}
          <a className="font-medium break-all text-doc underline underline-offset-2" href={REPO_URL}>
            {REPO_URL}
          </a>
        </p>
      </footer>
    </Workbench>
  );
}
