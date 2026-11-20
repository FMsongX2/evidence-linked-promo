/** 대조용 정규화: 유니코드 호환 분해 후 소문자, 공백·문장부호·기호 제거. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

/**
 * 인용문 q가 원문 t 안의 어느 구간과 가장 가까운지 편집 거리로 찾는다(Sellers 알고리즘).
 * 반환값은 1 - 거리/인용문 길이. 정확히 들어 있으면 1이다.
 */
export function bestSubstringScore(q: string, t: string): number {
  const m = q.length;
  if (m === 0) return 0;
  if (t.includes(q)) return 1;
  let prev = new Uint16Array(m + 1);
  let cur = new Uint16Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  let best = m;
  for (let j = 1; j <= t.length; j++) {
    cur[0] = 0;
    const tc = t.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const cost = q.charCodeAt(i - 1) === tc ? 0 : 1;
      cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + cost);
    }
    if (cur[m] < best) best = cur[m];
    [prev, cur] = [cur, prev];
  }
  return 1 - best / m;
}

/** 근사 일치로 인정하는 최소 일치율. */
export const APPROX_THRESHOLD = 0.9;

export function matchQuote(quote: string, pageText: string): { match: "exact" | "approx" | "none"; score: number } {
  const q = normalize(quote);
  const t = normalize(pageText);
  // 수치 근거는 "150+"처럼 짧을 수 있으므로 정규화 후 2글자부터 대조한다.
  if (q.length < 2) return { match: "none", score: 0 };
  const score = bestSubstringScore(q, t);
  if (score === 1) return { match: "exact", score };
  if (score >= APPROX_THRESHOLD) return { match: "approx", score };
  return { match: "none", score };
}

/* ---------- 수치 ---------- */

export type UnitClass = "percent" | "count" | "seat" | "user" | "won" | "year" | "time" | "line" | "other";
export type NumberToken = {
  raw: string;
  value: number;
  unit: UnitClass;
  /** 이상·여·+ 같은 어림 표기 */
  approx: boolean;
  index: number;
};

const UNIT_MAP: [RegExp, UnitClass][] = [
  [/^(%|퍼센트|프로)/, "percent"],
  [/^(석)/, "seat"],
  [/^(user|유저|명)/i, "user"],
  [/^(원)/, "won"],
  [/^(년)/, "year"],
  [/^(초|분|시간|개월|일)/, "time"],
  [/^(회선)/, "line"],
  [/^(곳|개소|개사|개 ?기업|개|기업|학교|건|대|노드|층)/, "count"],
];

const NUM_RE =
  /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만|천|억)?\s*(\+|여|이상|개 이상)?\s*(%|퍼센트|프로|석|user|유저|명|원|년|초|분|시간|개월|일|회선|곳|개소|개사|개 ?기업|개|기업|학교|건|대|노드|층)?\s*(\+|여|이상)?/gi;

export function extractNumbers(text: string): NumberToken[] {
  const s = text.normalize("NFKC");
  const out: NumberToken[] = [];
  for (const m of s.matchAll(NUM_RE)) {
    const [raw, num, mult, q1, unitRaw, q2] = m;
    const base = parseFloat(num.replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const factor = mult === "만" ? 1e4 : mult === "천" ? 1e3 : mult === "억" ? 1e8 : 1;
    let unit: UnitClass = "other";
    if (unitRaw) {
      for (const [re, cls] of UNIT_MAP) {
        if (re.test(unitRaw)) {
          unit = cls;
          break;
        }
      }
    }
    // 앞뒤 문맥이 영어·숫자에 붙은 경우(모델명, 버전 등)는 제외한다.
    const before = s[m.index - 1] ?? "";
    if (/[a-z0-9.\-]/i.test(before)) continue;
    out.push({ raw: raw.trim(), value: base * factor, unit, approx: Boolean(q1 || q2), index: m.index });
  }
  return out;
}

/** 같은 지표로 비교할 수 있는 단위인지. 단위 없이 적힌 수(150+)는 개수류와 비교한다. */
export function comparableUnits(a: NumberToken, b: NumberToken): boolean {
  if (a.unit === b.unit) return true;
  const countish: UnitClass[] = ["count", "seat", "user", "line"];
  return (a.unit === "other" && countish.includes(b.unit)) || (b.unit === "other" && countish.includes(a.unit));
}

/** 비교할 수 있는 두 수치가 같은 값인지. */
export function sameValue(a: NumberToken, b: NumberToken): boolean {
  return comparableUnits(a, b) && Math.abs(a.value - b.value) < 1e-9;
}

/* ---------- 문장 나누기 ---------- */

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?。])\s+(?=\S)/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
