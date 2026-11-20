import { z } from "zod";

/** 근거로 쓸 수 있는 문서 하나. PDF는 쪽, 웹 페이지는 구간 단위로 나눈다. */
export type SourcePage = { page: number; text: string };
export type SourceDoc = {
  id: string;
  title: string;
  kind: "pdf" | "pptx" | "xlsx" | "url";
  sourceFile?: string;
  url?: string;
  pages: SourcePage[];
};

export type Guideline = {
  requiredKeywords: string[];
  emphasisPoints: string[];
  links: { label: string; url: string }[];
  contact: string[];
  notes: string[];
  tags?: string[];
};

/* ---------- 1단계: 차별점 카드 ---------- */

export const cardDraftSchema = z.object({
  cards: z
    .array(
      z.object({
        id: z.string().describe("C1, C2 … 형식의 카드 번호"),
        name: z.string().describe("차별점 이름, 15자 안팎"),
        claim: z.string().describe("구매자에게 하는 주장 한 문장"),
        comparison: z
          .string()
          .nullable()
          .describe("자료에 적힌 비교 대상. 자료에 없으면 null"),
        evidence: z
          .array(
            z.object({
              docId: z.string(),
              page: z.number().int(),
              quote: z.string().describe("그 쪽 텍스트에서 그대로 복사한 연속된 원문 1~2문장"),
            }),
          )
          .min(1),
        conditions: z
          .array(z.string())
          .describe("자료에 적힌 적용 조건·제한. 없으면 빈 배열"),
      }),
    )
    .min(6)
    .max(10),
  metrics: z
    .array(
      z.object({
        metric: z.string().describe("지표 이름. 같은 지표는 문서가 달라도 같은 이름을 쓴다"),
        value: z.string().describe("원문에 적힌 수치 표기 그대로(예: 200여개, 150+)"),
        docId: z.string(),
        page: z.number().int(),
        quote: z.string().describe("수치가 들어 있는 원문 그대로의 짧은 구절"),
        cardId: z.string().nullable().describe("이 지표와 관련된 카드 번호"),
      }),
    )
    .describe("실적·성능 수치. 같은 지표가 여러 문서에 나오면 모두 적는다"),
});
export type CardDraft = z.infer<typeof cardDraftSchema>;

export type QuoteMatch = "exact" | "approx" | "none";
export type Evidence = {
  docId: string;
  page: number;
  quote: string;
  match: QuoteMatch;
  /** 정규화한 인용문과 원문 최적 구간의 일치율(0~1) */
  score: number;
};
export type CardStatus = "confirmed" | "unverified" | "conflict";
export type Card = {
  id: string;
  name: string;
  claim: string;
  comparison: string | null;
  evidence: Evidence[];
  conditions: string[];
  status: CardStatus;
  conflictIds: string[];
  edited?: boolean;
  /** conflict: 어느 카드에도 붙지 않은 수치 충돌을 코드가 카드로 올린 것 */
  origin?: "model" | "conflict";
};
export type ConflictValue = {
  value: string;
  docId: string;
  page: number;
  quote: string;
  match: QuoteMatch;
};
export type Conflict = {
  id: string;
  metric: string;
  values: ConflictValue[];
  cardIds: string[];
  /** 사용자가 고르고 승인한 값. 승인하면 카드의 수치 충돌 배지가 풀리고, 점검은 이 값과 대조한다 */
  approvedValue?: string | null;
};

/* ---------- 2단계: 사진 판독 ---------- */

export const photoKinds = ["install", "workspace", "screen", "other"] as const;
export type PhotoKind = (typeof photoKinds)[number];

export const photoReadingSchema = z.object({
  photos: z.array(
    z.object({
      photoId: z.string().describe("P1, P2 … 입력 순서대로"),
      kind: z
        .enum(photoKinds)
        .describe("install=설치 장비, workspace=고객사 업무 공간, screen=제품 화면, other=기타"),
      visible: z.array(z.string()).describe("사진에 실제로 보이는 것만. 추측 금지"),
      caption: z.string().describe("사진에 보이는 것만으로 쓴 설명 한 문장"),
      links: z.array(
        z.object({ cardId: z.string(), reason: z.string().describe("사진의 어떤 부분이 이 카드와 관련되는지") }),
      ),
      exposure: z
        .array(
          z.object({
            type: z.enum(["face", "phone", "signage", "document", "other"]),
            detail: z.string(),
          }),
        )
        .describe("얼굴·전화번호·고객사 간판·문서처럼 노출하면 안 되는 것"),
    }),
  ),
});
export type PhotoReading = z.infer<typeof photoReadingSchema>["photos"][number];

/* ---------- 3단계: 생성 ---------- */

export const sentenceSchema = z.object({
  text: z.string(),
  cardIds: z.array(z.string()).describe("이 문장의 근거로 쓴 카드 번호. 없으면 빈 배열"),
  photoIds: z.array(z.string()).describe("이 문장의 근거로 쓴 사진 번호. 없으면 빈 배열"),
  kind: z
    .enum(["fact", "opinion", "cta"])
    .describe("fact=제품·회사 사실, opinion=감상·연결 문장, cta=문의·링크 안내"),
});
export type Sentence = z.infer<typeof sentenceSchema>;

export const generationSchema = z.object({
  blog: z.object({
    title: sentenceSchema,
    sections: z
      .array(z.object({ heading: z.string(), sentences: z.array(sentenceSchema) }))
      .length(5),
    footer: z.array(sentenceSchema).describe("하단 링크·문의 안내"),
    hashtags: z.array(z.string()),
  }),
  cardnews: z
    .array(
      z.object({
        headline: sentenceSchema,
        body: z.array(sentenceSchema).min(1).max(3),
        photoId: z.string().nullable(),
      }),
    )
    .length(5),
  caseStudy: z.object({
    title: z.string(),
    sentences: z.array(sentenceSchema).min(3).max(8),
  }),
});
export type Generation = z.infer<typeof generationSchema>;

export const regenerateSchema = z.object({
  sentences: z.array(z.object({ key: z.string(), replacement: sentenceSchema })),
});

/* ---------- 4단계: 점검 ---------- */

/** 교차 판정(문장). 경고는 어긋나는 원문·문장 구절을 그대로 인용할 때만 인정한다(코드가 인용을 대조한다). */
export const judgeVerdicts = ["supported", "contradicted", "condition-omitted", "not-in-sources", "not-factual"] as const;
export type JudgeVerdict = (typeof judgeVerdicts)[number];

export const judgeSentencesSchema = z.object({
  sentences: z.array(
    z.object({
      key: z.string().describe("### 뒤의 문장 키 그대로"),
      kind: z.enum(["fact", "opinion", "cta"]).describe("fact=제품·회사 사실 주장, opinion=감상·연결 문장, cta=문의·링크 안내"),
      cardIds: z.array(z.string()).describe("이 문장이 말하는 대상과 같은 후보 카드 번호. 없으면 빈 배열"),
      verdict: z
        .enum(judgeVerdicts)
        .describe(
          "supported=근거 쪽에 같은 사실이 있다, contradicted=근거 쪽의 특정 구절과 값·대상·동작이 다르다, condition-omitted=근거 쪽에 적힌 조건·제한과 반대로 단정한다, not-in-sources=문장의 특정 요소(기능·수치·비교·순위·효과)가 근거 쪽 어디에도 없다, not-factual=사실 주장이 아니다",
        ),
      sentencePart: z.string().describe("문제가 되는(또는 근거로 확인한) 문장 속 구절을 문장에서 그대로 복사. not-factual이면 빈 문자열"),
      sourcePage: z.string().describe("인용한 근거 쪽 표시 그대로(예: proposal p.4). 인용이 없으면 빈 문자열"),
      sourceQuote: z
        .string()
        .describe("supported면 뒷받침하는 원문, contradicted면 어긋나는 원문, condition-omitted면 조건 원문을 그 쪽 텍스트에서 한 글자도 바꾸지 않고 복사. not-in-sources·not-factual이면 빈 문자열"),
      reason: z.string().describe("한 문장"),
      fix: z.string().describe("supported·not-factual이 아니면 근거 쪽 사실만으로 고쳐 쓴 문장. 아니면 빈 문자열"),
    }),
  ),
});
export type JudgeSentence = z.infer<typeof judgeSentencesSchema>["sentences"][number];

export const emphasisSchema = z.object({
  emphasis: z.array(
    z.object({
      index: z.number().int().describe("강조점 번호(0부터)"),
      covered: z.boolean(),
      sentenceKeys: z.array(z.string()).describe("이 강조 내용을 반영한 문장 키([ ] 안의 값). 없으면 빈 배열"),
      reason: z.string(),
    }),
  ),
});

export type WarningType = "no-evidence" | "spec-mismatch" | "numeric-conflict" | "guideline-missing";
export type Decider = "code" | "model";
export type Warning = {
  id: string;
  type: WarningType;
  decider: Decider;
  /** 문장 키(예: blog.s2.3). 가이드라인 누락처럼 문장이 없으면 null */
  sentenceKey: string | null;
  message: string;
  detail?: string;
  /** 경고의 근거가 된 원문 구절(코드가 그 쪽 텍스트와 대조해 확인한 것) */
  quote?: string;
  /** quote가 있는 문서·쪽 */
  source?: { docId: string; page: number };
  /** 문장에서 문제가 된 구절 */
  sentencePart?: string;
  /** 코드 경고에 교차 판정도 같은 종류로 경고했으면 true(두 판정이 일치) */
  agreed?: boolean;
};

export type LlmMeta = {
  role: string;
  provider: string;
  model: string;
  cached: boolean;
  ms: number;
  /** 공급자가 돌려준 토큰 사용량(모든 시도 합). 캐시 적중이면 null */
  usage?: { inputTokens: number | null; outputTokens: number | null } | null;
  /** 실제 모델 호출 시도 수(캐시 적중이면 0, 상한 MAX_ATTEMPTS) */
  attempts?: number;
};
