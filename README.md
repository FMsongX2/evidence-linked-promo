# 근거 달린 홍보문

제품 자료(PDF·홈페이지)와 현장 사진에서 게시 전 점검까지 끝난 B2B 홍보 초안을 자동으로 만든다. 문장마다 원문 근거(문서·쪽 또는 사진)를 달고, 근거 없는 문장·사양과 다른 문장·자료 간 수치 충돌·가이드라인 누락을 표시한다. 사람은 확인하고 승인한 뒤 복사한다. 게시는 하지 않는다.

## 흐름(한 화면 4단계)

1. **제품 분석**: PDF(unpdf로 쪽 단위 색인)와 홈페이지 URL(Jina Reader, 막히면 @mozilla/readability)을 근거 문서로 만든다. 모델이 차별점 카드 6~10장(이름, 주장, 비교 대상, 원문 인용과 문서·쪽, 적용 조건)을 뽑는다. 인용문이 그 쪽 텍스트에 실제로 있는지는 **코드가** 공백·문장부호를 정규화한 뒤 포함 여부와 편집 거리(일치율 90% 이상은 "근사 일치")로 판정한다. 같은 지표의 값이 문서마다 다르면 수치 충돌로 표시하고, 사용자가 값을 골라 승인할 수 있다. 카드는 고치거나 뺄 수 있다.
2. **사진 판독**: 사진 1~5장(브라우저에서 긴 변 1,600px 이하로 줄임)의 종류(설치 장비/고객사 업무 공간/제품 화면/기타), 보이는 것, 연결할 카드와 이유, 노출 경고(자동 가림 없음)를 낸다. 설치 사례 페이지 URL을 넣으면 같은 호스트의 사진을 후보로 불러온다.
3. **콘텐츠 생성**: 네이버 블로그 리뷰형 초안(가이드라인 추천 구성 5단), 인스타그램 카드뉴스 5장(1080×1350, Pretendard, snapdom으로 PNG 저장, 사진은 자르거나 글자를 얹지 않고 원본 비율로 배치), 설치 사례 짧은 글. 문장마다 카드 번호·사진 번호를 달고 화면에 근거 칩(문서 파랑, 사진 주황)으로 보인다. 자료 간 충돌 수치는 승인 전에는 쓰지 않게 지시한다.
4. **게시 전 점검**: 경고 4종(근거 없음, 사양 불일치, 수치 충돌, 가이드라인 누락).
   - 코드 판정: 근거 카드 없는 사실 문장, 문장 수치와 근거 인용 수치 대조, 적용 조건이 있는 카드를 "모든·무조건·~만 설치하면" 같은 단정 표현으로 쓴 문장, 필수 키워드(제목·본문)·하단 링크·문의처.
   - 모델 판정: 주장과 인용의 뜻이 맞는지, 가이드라인 강조 내용 반영 여부(생성에 쓰지 않은 모델).
   - 판정 엇갈림 규칙: 코드와 모델 중 하나라도 경고하면 경고로 띄우고 "판정 엇갈림" 배지를 단다.
   - 경고 문장만 다시 쓰기, 문장 직접 고치기 → 다시 점검 → 승인 → 복사.
   - **외부 리뷰 원고 검수**: 원고를 붙여 넣으면 가이드라인 17개 항목 점검표(필수 키워드 3, 강조 내용 11, 하단 링크·문의 3)와 사양 경고, 고쳐 쓴 제안, 점검 경과 시간을 보인다.

"자동 실행" 버튼은 위 단계 함수를 순서대로 불러 카드 → 사진 판독 → 초안 → 점검까지 이어 가고 단계별 시간을 표시한다. 카드는 인용 대조를 통과한 것만, 사진과 연결된 카드를 앞에 둔다. 실행마다 측정 기록(JSON)을 로컬 `.cache/runs/`에 남기고 화면에서 내려받을 수 있다.

## 실행

```bash
npm install
# 모델 키(하나 이상). 값은 .env.local 에만 둔다(git 제외).
echo "DEEPSEEK_API_KEY=..." > .env.local
TLINK_DATA_DIR=../data/tlink npm run dev   # 기본값이 ../data/tlink
# 자료가 없으면 가상 시험 자료로: TLINK_DATA_DIR=./fixtures/tlink npm run dev
bun test   # 코드 판정 시험(인용 대조·수치·단정 표현·가이드라인)
```

`TLINK_DATA_DIR` 형식: `docs/index.json`, `docs/<id>.pages.json`, `guideline.json`, `brand/brand.json`, `photos/index.json`. 티링크 원본 자료는 이 저장소에 넣지 않는다.

## 모델 공급자

공급자는 `src/lib/llm.ts` 한 곳에서 정한다. 환경 변수 `LLM_MAIN`, `LLM_VISION`, `LLM_JUDGE`(형식 `<공급자>:<모델>`)로 바꿀 수 있다.

| 기능 | 기획서에 적은 모델 | 실제로 쓴 모델(로컬) | 배포 기본값 |
|---|---|---|---|
| 차별점 카드 추출, 초안 생성, 원고 문장 근거 연결, 경고 문장 다시 쓰기 | Claude Opus 5.5 | DeepSeek V4.1 Flash(`deepseek-ai/deepseek-v4.1-flash-1017`, Hive OpenAI 호환 API, Vercel AI SDK) | 같음 |
| 사진 판독 | Claude Opus 5.5 | DeepSeek V4.1 Flash(이미지 입력) | 같음 |
| 교차 판정(주장-인용 일치, 강조 내용) | Gemini 4 Argon | Gemini 4 Argon High(로컬 `agy` CLI) | 다른 회사 키가 없으면 DeepSeek **같은 공급자의 별도 호출**로 판정하고 화면에 그렇게 표시 |

Gemini·Claude API 키는 쓰지 않았다. 로컬 CLI 공급자(`claude-cli`, `agy-cli`)는 개발 기기 전용이며 배포 환경(`VERCEL` 설정 시)에서는 선택되지 않는다. 모델 호출 결과는 입력 해시로 `.cache/llm/`에 캐시하고 화면에 "캐시"로 표시한다(배포 환경에서는 끔, `LLM_CACHE=off`로도 끔).

## 배포(Vercel)

필요한 환경 변수: `DEEPSEEK_API_KEY`(필수), 선택 `DEEPSEEK_BASE_URL`, `LLM_MAIN`/`LLM_VISION`/`LLM_JUDGE`, `DAILY_CALL_LIMIT`(인스턴스당 하루 모델 호출 상한, 기본 150), `IMAGE_RELAY_HOSTS`(사진 중계 허용 호스트, 기본 `tlinkcrm.com,www.tlinkcrm.com`).

```bash
vercel link
printf '%s' "$KEY" | vercel env add DEEPSEEK_API_KEY production   # 값은 표준 입력으로
vercel --prod
```

공개 데모에는 자료 폴더가 없으므로 "티링크 예시로 보기"가 `public/demo/example.json`(로컬 실제 실행 결과를 저장한 것, 원본 문서 전문 없음)을 보여 준다. 직접 실행 경로에는 IP별 요청 제한(10분 30회)과 하루 호출 상한, 업로드 크기 제한(사진 5장·장당 0.8MB, PDF 4MB, 원고 2만 자)이 있다. 제한은 서버 인스턴스 메모리 기준이라 인스턴스가 여럿이면 합계가 아니다.

## 구조

- `src/lib/llm.ts` 공급자 선택·구조화 출력(zod)·재시도·캐시
- `src/lib/text.ts` 정규화, 편집 거리 대조, 수치 추출
- `src/lib/verify.ts` 인용 대조, 수치 충돌, 카드 상태
- `src/lib/check.ts` 문장 점검(코드 판정), 가이드라인 점검표
- `src/app/api/*` 수집(PDF·URL), 카드, 사진, 생성, 점검, 다시 쓰기, 사진 중계, 측정 기록
- `src/components/*` 4단계 화면, 카드뉴스 템플릿
- `tests/verify.test.ts` 코드 판정 시험(가상 자료 `fixtures/`)

## 사용한 오픈소스

| 이름 | 라이선스 | 쓴 방식 |
|---|---|---|
| Next.js | MIT | 웹 앱 틀 |
| Vercel AI SDK(`ai`, `@ai-sdk/*`) | Apache-2.0 | 모델 호출·구조화 출력 |
| zod | MIT | 출력 스키마 |
| shadcn/ui, Base UI | MIT | 화면 구성 요소(코드 복사) |
| snapdom(`@zumer/snapdom`) | MIT | 카드뉴스 PNG 저장 |
| Pretendard | SIL OFL-1.1 | 한글 글꼴(`public/fonts`, 라이선스 전문 동봉) |
| unpdf | MIT | PDF 쪽별 텍스트 추출 |
| @mozilla/readability | Apache-2.0 | 홈페이지 본문 추출(예비) |
| linkedom | ISC | HTML 파싱 |
| lucide-react | ISC | 아이콘 |
| Jina Reader API | 서비스 약관 | URL → 마크다운 |

사진 출처: 예시 결과의 현장 사진은 티링크 홈페이지 설치 사례(https://www.tlinkcrm.com/case.php)와 티링크 공식 블로그(https://blog.naver.com/mobilecrm, 후원사 허락)이며 화면에 출처를 표시한다.

## 완성한 것과 못 한 것

`docs/run-log.md`에 실제 실행 측정값을 적는다. 알려진 제한은 같은 파일에 적는다.
