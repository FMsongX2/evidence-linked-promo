# 화면 선택자(녹화·자동 확인용)

녹화가 끝날 때까지 이 이름과 화면 문구를 바꾸지 않는다. 바꿔야 하면 먼저 알린다.

| data-testid | 위치 | 동작 |
|---|---|---|
| `load-tlink` | 머리글 | 티링크 자료 불러오기(`TLINK_DATA_DIR`의 문서·가이드라인·사진 후보) |
| `load-example` | 머리글 | 미리 계산한 예시 결과 보기 |
| `auto-run` | 머리글 | 자동 실행(카드 → 사진 판독 → 초안 → 점검) |
| `total-elapsed` | 머리글 | 자동 실행 총 경과 시간(실행 중 1초마다 갱신, "경과 mm:ss" / "완료 mm:ss" / "중단 mm:ss") |
| `save-example` | 머리글(로컬, 점검 결과가 있을 때) | 현재 결과를 `public/demo/example.json`으로 저장 |
| `example-banner` | 머리글 아래 | 예시 결과 보기 중 표시 |
| `url-recording` | 1단계 | "AI 녹취 페이지 넣기" |
| `url-case` | 1단계 | "설치 사례 페이지 넣기"(본문 + 사진 후보) |
| `pdf-input` | 1단계 | 숨겨진 PDF 파일 입력. 한 번에 1개, 넣을 때마다 "PDF 쪽 색인 중 n/N쪽" 표시 |
| `cards-run` | 1단계 | 차별점 카드 뽑기 |
| `card-toggle` | 카드 | 콘텐츠에 사용 체크 |
| `card-edit` / `card-remove` | 카드 | 고치기 / 빼기 |
| `conflict-option` | 수치 충돌 상자 | "이 값으로 승인"(값마다 하나) |
| `photo-candidate` | 2단계 사진 후보 | `data-kind`: `case`(설치 사례) / `blog`(공식 블로그) / `url`(URL에서 가져온 사진) |
| `photo-input` | 2단계 | 숨겨진 사진 파일 입력 |
| `photos-run` | 2단계 | 사진 판독하기 |
| `generate-run` | 3단계 | 초안 만들기 |
| `tab-blog` / `tab-cardnews` / `tab-case` | 3단계 탭 | 블로그 / 카드뉴스 / 설치 사례 |
| `cardnews-download` | 카드뉴스 탭 | PNG 5장 내려받기 |
| `evidence-chip` | 문장 옆 | 문서 근거 칩(누르면 인용·문서·쪽 팝오버) |
| `photo-chip` | 문장 옆 | 사진 근거 칩 |
| `check-run` | 4단계 | 점검하기 / 다시 점검 |
| `rewrite-all` | 4단계 | 경고 문장만 다시 쓰기(생성물) |
| `warning-item` | 경고 목록 | 경고 문장 한 건(`data-sentence-key`에 문장 키) |
| `rewrite-one` | 경고 항목 안 | 이 문장만 다시 쓰기 |
| `paste-demo` | 원고 검수 | 시연 원고 넣기 |
| `paste-input` | 원고 검수 | 원고 입력 칸 |
| `paste-check-run` | 원고 검수 | 원고 검수하기 |
| `paste-run-status` | 원고 검수 결과 맨 위 | "검수 n회차 완료 · 시각 · 점검 n초". 검수를 시작하면 이전 결과가 지워지고 끝나면 회차가 오른다 |
| `rewrite-all-paste` | 원고 검수 | 경고 문장만 제안대로 고치고 다시 검수 |

주소: `/?step=check` 는 자료와 가이드라인을 불러온 뒤 원고 검수 칸(17개 항목 목록)으로 바로 연다. 첫 화면은 실제 실행 모드다(예시 보기는 `load-example` 버튼으로만 들어간다).
