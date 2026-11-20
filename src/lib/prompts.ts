import type { Card, Conflict, Guideline, PhotoReading, SourceDoc } from "./schemas";

export function docsBlock(docs: SourceDoc[]): string {
  return docs
    .map((d) =>
      d.pages
        .map((p) => `<<<docId="${d.id}" title="${d.title}" page=${p.page}>>>\n${p.text.trim()}`)
        .join("\n\n"),
    )
    .join("\n\n");
}

export function cardsBlock(cards: Card[], withQuotes = true): string {
  return cards
    .map((c) => {
      const lines = [`[${c.id}] ${c.name}`, `주장: ${c.claim}`];
      if (c.comparison) lines.push(`비교 대상: ${c.comparison}`);
      if (c.conditions.length) lines.push(`적용 조건: ${c.conditions.join("; ")}`);
      if (withQuotes) for (const e of c.evidence) lines.push(`원문(${e.docId} p.${e.page}): "${e.quote}"`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function photosBlock(readings: PhotoReading[]): string {
  return readings
    .map((r) => `[${r.photoId}] 종류: ${r.kind} / 설명: ${r.caption} / 보이는 것: ${r.visible.join(", ")}`)
    .join("\n");
}

export function guidelineBlock(g: Guideline | null): string {
  if (!g) return "(가이드라인 없음)";
  return [
    `필수 키워드(제목과 본문에 모두): ${g.requiredKeywords.join(", ")}`,
    `강조 내용:\n${g.emphasisPoints.map((p, i) => `${i}. ${p}`).join("\n")}`,
    `하단 링크: ${g.links.map((l) => `${l.label} ${l.url}`).join(" / ")}`,
    `문의처: ${g.contact.join(" / ")}`,
    g.tags?.length ? `태그: ${g.tags.join(" ")}` : "",
    `기타 지침:\n${g.notes.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const CARD_SYSTEM = `너는 B2B 제품 자료에서 구매자에게 설명할 기술적 차별점을 근거와 함께 뽑는 분석가다.
규칙:
1. 차별점 카드를 6~10장 만든다. 회사 소개가 아니라 제품이 다른 방식과 어떻게 다른지에 집중한다.
2. evidence.quote는 <<<docId page>>>로 표시된 그 쪽 텍스트에서 연속된 구간을 한 글자도 바꾸지 말고 복사한다. 요약·의역·말줄임 금지. 20~150자.
3. docId와 page는 표시된 값을 그대로 쓴다.
4. comparison은 자료에 비교 대상(기존 방식, 다른 제품)이 적혀 있을 때만 쓰고, 없으면 null.
5. conditions에는 자료에 적힌 적용 조건과 제한(특정 계정·요금제·운영체제·설정에서만 되는 것 등)을 적는다. 자료에 없는 조건을 지어내지 않는다.
6. 자료에 없는 사실·수치를 만들지 않는다.
7. metrics에는 도입 수·성공률·좌석 수 같은 실적·성능 수치를 문서마다 하나씩 모두 적는다. 같은 지표가 여러 문서·쪽에 나오면 값이 같아도 각각 적고, 같은 metric 이름을 쓴다. 홈페이지 구간도 문서로 본다. metric 이름에는 무엇의 수치인지 대상(고객사·제품·기관 종류)을 넣는다(예: "A사 구축 좌석 수", "제품 도입 병원 수"). 서로 다른 대상의 수치를 같은 metric으로 묶지 않는다. quote는 수치와 그 대상이 함께 든 구절로 한다.
8. 도입 실적·신뢰 지표(도입 기업·기관 수, 대표 구축 규모, 성공률 등)는 '도입 실적' 카드 한 장으로 묶고, 그 카드 evidence에 지표가 적힌 원문을 문서별로 넣는다. 그 지표들의 metrics.cardId에는 이 카드 번호를 넣는다.`;
export const PHOTO_SYSTEM = `너는 B2B 제품 홍보 담당자를 돕는 현장 사진 판독가다.
규칙:
1. 사진은 입력 순서대로 P1, P2 … 이다.
2. kind는 install(녹취 서버·스위치·단자함·랙 같은 설치 장비), workspace(고객사 사무실·상담석 같은 업무 공간), screen(제품 화면·모니터 화면 캡처), other 중 하나다.
3. visible과 caption에는 사진에 실제로 보이는 것만 쓴다. 모델명·성능·고객사 이름을 추측하지 않는다.
4. links에는 사진과 관련된 차별점 카드를 1장 이상 연결하고, 사진의 어느 부분이 왜 관련되는지 reason에 쓴다. 관련 카드가 정말 없을 때만 비운다.
5. exposure에는 얼굴, 전화번호, 고객사 간판·상호, 문서·화면 속 개인정보처럼 게시 전에 가려야 할 것을 적는다. 없으면 빈 배열.`;

export const GENERATE_SYSTEM = `너는 B2B 제품의 홍보 문안을 쓰는 작가다. 모든 문장은 주어진 차별점 카드와 사진 판독 결과에만 근거한다.
규칙:
1. 문장마다 근거로 쓴 카드 번호(cardIds)와 사진 번호(photoIds)를 단다. 근거 없이 쓴 사실 문장은 만들지 않는다.
2. 수치는 카드 원문 인용에 있는 것만 그대로 쓴다. 자료마다 다른 수치는 쓰지 않거나 출처를 밝힌다.
3. 카드의 적용 조건을 지키고, 조건이 있는 기능을 '모든', '무조건'처럼 단정하지 않는다.
4. 사진에서 나온 문장은 사진에 보이는 것만 쓰고 photoIds를 단다.
5. kind: 제품·회사 사실은 fact, 감상·연결 문장은 opinion, 문의·링크 안내는 cta.
6. 한국어 존댓말, 과장 광고 표현(최고, 유일, 완벽) 금지.
7. 문장 하나는 한 가지 주장만 담는다.`;

export function generatePrompt(cards: Card[], readings: PhotoReading[], g: Guideline | null, company: string, conflicts: Conflict[] = []): string {
  const conflictBlock = conflicts.length
    ? conflicts
        .map((c) =>
          c.approvedValue
            ? `- ${c.metric}: 승인한 값 ${c.approvedValue}만 쓴다.`
            : `- ${c.metric}: 자료마다 다르다(${[...new Set(c.values.map((v) => v.value))].join(" / ")}). 이 수치는 쓰지 않는다.`,
        )
        .join("\n")
    : "(없음)";
  return `회사: ${company}

## 차별점 카드
${cardsBlock(cards)}

## 사진 판독
${readings.length ? photosBlock(readings) : "(사진 없음)"}

## 자료 간 수치 충돌
${conflictBlock}

## 홍보 가이드라인
${guidelineBlock(g)}

## 만들 것
1. blog: 네이버 블로그 리뷰형 초안. title은 필수 키워드를 모두 넣은 한 문장. sections는 가이드라인의 추천 본문 구성 5단을 순서대로 따른다(가이드라인이 없으면 문제 → 해결 → 기능 → 효과 → 정리). 각 단은 heading과 3~5문장. 필수 키워드를 본문에 모두 넣는다. 사진이 있으면 관련 단에서 사진을 설명한다. footer에는 하단 링크와 문의처를 모두 넣은 cta 문장. hashtags는 가이드라인 태그에서 고른다.
2. cardnews: 인스타그램 카드뉴스 5장. 1장은 문제 제기, 2~4장은 차별점, 5장은 정리와 문의. headline은 20자 이내, body는 1~2문장이며 각 45자 이내. 사진이 어울리는 장에는 photoId를 넣는다.
3. caseStudy: 설치 사례 짧은 글. 사진 속 설치 현장을 설명하고 어떤 차별점과 연결되는지 3~6문장.`;
}

export const ATTRIBUTION_SYSTEM = `너는 홍보 원고의 문장마다 어떤 차별점 카드에 대한 주장인지 연결하는 편집자다.
규칙:
1. 문장이 카드와 같은 대상·기능·지표를 말하면 그 카드를 연결한다. 수치나 조건이 카드와 달라도 같은 대상을 말하면 연결한다(틀린 내용은 다음 단계에서 잡는다).
2. 어느 카드와도 관련 없는 문장은 빈 배열.
3. kind: 제품·회사에 대한 사실 주장은 fact, 감상·연결 문장은 opinion, 문의·링크 안내는 cta.`;

export const JUDGE_SYSTEM = `너는 홍보 문장이 근거 자료와 맞는지 판정하는 검수자다. 이 문장들은 다른 모델이 썼다.
문장마다 연결된 카드의 원문 인용과 적용 조건만 보고 판정한다.
- supported: 원문 인용이 문장의 주장을 뒷받침한다.
- unsupported: 문장에 원문 인용에 없는 내용(기능, 수치, 대상, 효과)이 들어 있다.
- condition-violated: 카드의 적용 조건과 어긋나게 단정하거나 조건을 빼서 사실과 달라진다.
- not-factual: 사실 주장이 아니다(감상, 안내).
reason에는 어느 부분이 왜 그런지 한 문장으로 쓴다.
emphasis에는 가이드라인 강조 내용마다 원고 전체에 반영됐는지 판정한다.`;

export const REGENERATE_SYSTEM = `너는 경고를 받은 홍보 문장만 고쳐 쓰는 편집자다.
규칙: 경고 내용을 해소하도록 문장 하나를 다시 쓴다. 카드 원문 인용에 있는 사실과 수치만 쓰고, 적용 조건을 지킨다. 근거로 쓴 카드 번호를 cardIds에 단다. 근거를 찾을 수 없는 주장은 빼고 사실이 아닌 연결 문장(opinion)으로 바꾼다.`;
