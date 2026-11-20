/**
 * 코드가 판정하는 부분(인용문 대조, 수치 충돌, 단정 표현, 가이드라인 필수 항목)을 가상의 시험 자료로 확인한다.
 * 실행: bun test
 */
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { checklistWarnings, codeChecks, guidelineChecklist, type CheckItem } from "../src/lib/check";
import type { CardDraft, Guideline, SourceDoc } from "../src/lib/schemas";
import { extractNumbers, matchQuote } from "../src/lib/text";
import { buildCards } from "../src/lib/verify";

const dir = path.join(import.meta.dir, "..", "fixtures", "tlink");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const docs: SourceDoc[] = read("docs/index.json").map((d: { id: string; title: string; kind: string }) => ({
  id: d.id,
  title: d.title,
  kind: d.kind === "web" ? "url" : d.kind,
  pages: read(`docs/${d.id}.pages.json`),
}));
const guideline: Guideline = read("guideline.json");

const draft: CardDraft = {
  cards: [
    {
      id: "C1",
      name: "통합 녹음",
      claim: "사무실 전화와 휴대폰 통화를 한 서버에 녹음합니다.",
      comparison: null,
      evidence: [{ docId: "intro", page: 1, quote: "사무실 전화와 휴대폰 통화를 한 서버에 함께 녹음합니다." }],
      conditions: [],
    },
    {
      id: "C2",
      name: "PC폰 녹음",
      claim: "PC폰 통화도 녹음해 저장합니다.",
      comparison: null,
      evidence: [{ docId: "intro", page: 2, quote: "PC폰 녹음 저장은 가온 070 계정에서만 지원합니다." }],
      conditions: ["가온 070 계정에서만 녹음 저장"],
    },
    {
      id: "C3",
      name: "녹취 성공률",
      claim: "녹취 성공률이 높습니다.",
      comparison: null,
      evidence: [{ docId: "intro", page: 1, quote: "98% 녹취 성공률" }],
      conditions: [],
    },
    {
      id: "C4",
      name: "일부러 틀린 인용",
      claim: "AI가 통화를 자동 요약합니다.",
      comparison: null,
      evidence: [{ docId: "intro", page: 1, quote: "통화가 끝나면 AI가 자동으로 요약합니다." }],
      conditions: [],
    },
    { id: "C5", name: "다섯째", claim: "-", comparison: null, evidence: [{ docId: "intro", page: 1, quote: "500+ 도입 기업" }], conditions: [] },
    { id: "C6", name: "여섯째", claim: "-", comparison: null, evidence: [{ docId: "web-case", page: 1, quote: "98% 인터넷 전화 녹취 성공률" }], conditions: [] },
  ],
  metrics: [
    { metric: "녹취서버 도입 도서관 수", value: "80여 곳", docId: "intro", page: 2, quote: "전국 도서관 80여 곳 녹취서버 납품", cardId: null },
    { metric: "녹취서버 도입 도서관 수", value: "60+", docId: "web-case", page: 1, quote: "60+ 녹취서버를 도입한 전국 도서관", cardId: null },
    { metric: "녹취 성공률", value: "98%", docId: "intro", page: 1, quote: "98% 녹취 성공률", cardId: "C3" },
    { metric: "녹취 성공률", value: "98%", docId: "web-case", page: 1, quote: "98% 인터넷 전화 녹취 성공률", cardId: "C3" },
  ],
};

describe("인용문 대조", () => {
  test("줄바꿈·공백이 달라도 원문에 있으면 일치", () => {
    expect(matchQuote("사무실 전화와 휴대폰 통화를 한 서버에 함께 녹음합니다.", docs[0].pages[0].text).match).toBe("exact");
  });
  test("원문에 없는 인용은 근거 미확인", () => {
    expect(matchQuote("통화가 끝나면 AI가 자동으로 요약합니다.", docs[0].pages[0].text).match).toBe("none");
  });
  test("한두 글자 다른 인용은 근사 일치", () => {
    expect(matchQuote("PC폰 녹음 저장은 가온 070 계정에서만 지원됩니다.", docs[0].pages[1].text).match).toBe("approx");
  });
});

describe("카드 상태와 수치 충돌", () => {
  const { cards, conflicts } = buildCards(docs, draft);
  test("틀린 인용이 든 카드는 근거 미확인", () => {
    expect(cards.find((c) => c.id === "C4")?.status).toBe("unverified");
    expect(cards.find((c) => c.id === "C1")?.status).toBe("confirmed");
  });
  test("문서마다 다른 도입 수는 충돌, 같은 성공률은 충돌 아님", () => {
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].values.map((v) => v.value).sort()).toEqual(["60+", "80여 곳"]);
  });
  test("어느 카드에도 붙지 않은 충돌은 충돌 카드로 보드에 오른다", () => {
    const k = cards.find((c) => c.origin === "conflict");
    expect(k?.status).toBe("conflict");
    expect(conflicts[0].cardIds).toContain(k!.id);
  });
});

describe("문장 점검(코드 판정)", () => {
  const { cards, conflicts } = buildCards(docs, draft);
  const k = cards.find((c) => c.origin === "conflict")!.id;
  const items: CheckItem[] = [
    { key: "a", text: "녹취 성공률 100%라서 놓치는 통화가 없습니다.", cardIds: ["C3"], photoIds: [], kind: "fact" },
    { key: "b", text: "PC폰만 설치하면 모든 통화가 저장됩니다.", cardIds: ["C2"], photoIds: [], kind: "fact" },
    { key: "c", text: "전국 도서관 300곳이 쓰고 있습니다.", cardIds: [k], photoIds: [], kind: "fact" },
    { key: "d", text: "가온녹취는 업계 1위입니다.", cardIds: [], photoIds: [], kind: "fact" },
    { key: "e", text: "녹취 성공률은 98%입니다.", cardIds: ["C3"], photoIds: [], kind: "fact" },
  ];
  const ws = codeChecks(items, cards, conflicts, docs);
  const of = (key: string) => ws.filter((w) => w.sentenceKey === key).map((w) => w.type);
  test("근거와 다른 수치", () => expect(of("a")).toContain("numeric-conflict"));
  test("조건이 있는 카드를 단정 표현으로", () => expect(of("b")).toContain("spec-mismatch"));
  test("충돌 수치와도 다른 수치", () => expect(of("c")).toContain("numeric-conflict"));
  test("근거 없는 사실 문장", () => expect(of("d")).toContain("no-evidence"));
  test("근거와 같은 수치는 경고 없음", () => expect(of("e")).toEqual([]));
});

describe("가이드라인 점검표(코드 판정)", () => {
  const body = "가온녹취로 통화녹음을 한곳에서 봅니다.\n문의 1588-0000";
  const items: CheckItem[] = body.split("\n").map((t, i) => ({ key: `p${i}`, text: t, cardIds: [], photoIds: [], kind: "fact" }));
  const list = guidelineChecklist(guideline, "가온녹취 통화녹음 후기", body, items);
  test("빠진 필수 키워드와 링크를 잡는다", () => {
    const missing = list.filter((x) => !x.ok).map((x) => x.label);
    expect(missing).toContain("고객관리");
    expect(missing.some((m) => m.includes("www.example.com"))).toBe(true);
    expect(list.find((x) => x.label === "통화녹음")?.ok).toBe(true);
    expect(list.find((x) => x.group === "contact")?.sentenceKeys).toEqual(["p1"]);
  });
  test("누락 항목은 가이드라인 누락 경고가 된다", () => {
    expect(checklistWarnings(list).every((w) => w.type === "guideline-missing")).toBe(true);
  });
});

test("수치 추출(단위가 바로 붙지 않은 수는 other로 두고 개수류와 비교한다)", () => {
  expect(extractNumbers("1,000+ 도입 기업, 99% 녹취 성공률, 200여개").map((n) => [n.value, n.unit])).toEqual([
    [1000, "other"],
    [99, "percent"],
    [200, "count"],
  ]);
});
