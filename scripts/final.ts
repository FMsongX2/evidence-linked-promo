/**
 * 최종 측정(고정 커밋에서 한 번). stage2/measurements.md 의 정의대로 M1·M2·M3·M6·M7·M8·M9·M11·M14 값을 낸다.
 * 실행(app/ 에서): bun scripts/final.ts            (모델 캐시 끔. 서버를 쓰지 않고 lib 함수를 직접 부른다)
 * 고정 문장 해시가 NOTES.md 값과 다르면 멈춘다.
 * 결과: .cache/eval/final-<시각>.json 과 표준 출력 요약.
 */
import { EVAL_DIR, ROOT, cells, checkCases, expectedTypes, gitHead, loadInputs, sha256, summarize, TYPE_LABEL, type Case, type CardsFile } from "./eval-common";
import fs from "node:fs";
import path from "node:path";
import { structured } from "../src/lib/llm";
import { extractCards, runCheck } from "../src/lib/pipeline";
import { GENERATE_SYSTEM, PHOTO_SYSTEM, cardsBlock, generatePrompt } from "../src/lib/prompts";
import { generationSchema, photoReadingSchema, type LlmMeta } from "../src/lib/schemas";
import { blogScope, flattenGeneration } from "../src/lib/sentences";

const FIXED_SHA = "d36ce367c0edfebdfa9482438dddd68edddae27a7e1a7f40a9f650c2e900333f";
const md = fs.readFileSync(path.join(ROOT, "stage2", "measurements.md"), "utf8");
const lines = md.split("\n");
const from = lines.findIndex((l) => l.startsWith("### 2.1 "));
const to = lines.findIndex((l) => l.startsWith("### 2.4 "));
const fixedHash = sha256(lines.slice(from, to).join("\n") + "\n");
if (fixedHash !== FIXED_SHA) throw new Error(`고정 문장 해시가 다릅니다: ${fixedHash}`);

const started = new Date().toISOString();
const commit = gitHead();
const allMetas: { step: string; meta: LlmMeta }[] = [];
const keep = (step: string, metas: LlmMeta[]) => metas.forEach((meta) => allMetas.push({ step, meta }));
const { docs, guideline } = await loadInputs();

/* M1·M2·M3·M9c: 카드 추출 */
let t = Date.now();
const r = await extractCards(docs, "티링크");
const cardsMs = Date.now() - t;
keep("카드 추출", [r.meta]);
const cards: CardsFile = { ...r, at: started, commit, ms: cardsMs };
fs.writeFileSync(path.join(EVAL_DIR, "cards-final.json"), JSON.stringify(cards, null, 1));
const quotes = r.cards.flatMap((c) => c.evidence);
const m1 = {
  docs: docs.map((d) => ({ id: d.id, pages: d.pages.length, empty: d.pages.filter((p) => p.text.trim().length === 0).length })),
  pages: docs.reduce((n, d) => n + d.pages.length, 0),
  emptyPages: docs.reduce((n, d) => n + d.pages.filter((p) => p.text.trim().length === 0).length, 0),
};

/* M6: 고정 문장 20개(고정 순서) */
const fixed: Record<string, Case> = {};
for (const l of lines.slice(from, to)) {
  const c = cells(l);
  if (/^E\d\d$/.test(c[0]) && c.length >= 7) fixed[c[0]] = { id: c[0], category: c[1], text: c[5], bad: true, expected: expectedTypes(c[6]) };
  if (/^C\d\d$/.test(c[0]) && c.length >= 3) fixed[c[0]] = { id: c[0], category: "바른 짝", text: c[2], bad: false, expected: [] };
}
const orderLine = lines.slice(from, to).find((l) => /^C03, /.test(l))!;
const m6cases = orderLine.split(",").map((s) => fixed[s.trim()]);
if (m6cases.length !== 20 || m6cases.some((c) => !c)) throw new Error("M6 고정 순서를 읽지 못했습니다.");
// 제목 없이 20문장만 붙여 넣는다(2.3절). 가이드라인 누락 경고는 M6 집계에서 뺀다.
const m6 = await checkCases(m6cases, cards, docs, guideline, null);
keep("원고 점검(M6)", m6.res.metas);
const m6s = summarize(m6.results);
const m6d = m6.res.warnings.filter((w) => w.type !== "guideline-missing").reduce<Record<string, number>>((o, w) => {
  const k = w.agreed ? "code+model" : w.decider;
  o[k] = (o[k] ?? 0) + 1;
  return o;
}, {});

/* M7·M8: 시연 원고 */
const demoBlock = md.slice(md.indexOf("### 2.5")).match(/```text\n([\s\S]*?)```/)![1];
const demo = demoBlock.replace(/[①②③]\s*/g, "").trim();
const demoTitle = demo.split("\n").map((l) => l.trim()).find(Boolean) ?? null;
t = Date.now();
const m7 = await runCheck({ pasted: demo, scope: { title: demoTitle, body: demo }, cards: r.cards, conflicts: r.conflicts, docs, guideline, readings: [] });
const m7Ms = Date.now() - t;
keep("원고 점검(M7)", m7.metas);
const wrong = [/100%/, /PC폰만 설치하면/, /300곳/].map((re) => {
  const it = m7.items.find((i) => re.test(i.text));
  const ws = it ? m7.warnings.filter((w) => w.sentenceKey === it.key) : [];
  return { text: it?.text, warned: ws.length > 0, warnings: ws.map((w) => `${w.agreed ? "code+model" : w.decider}/${TYPE_LABEL[w.type]}: ${w.message}${w.quote ? ` «${w.quote}»` : ""}`) };
});
const otherWarned = m7.items.filter((i) => !wrong.some((w) => w.text === i.text) && m7.warnings.some((w) => w.sentenceKey === i.key)).map((i) => ({
  text: i.text,
  warnings: m7.warnings.filter((w) => w.sentenceKey === i.key).map((w) => `${w.decider}/${TYPE_LABEL[w.type]}: ${w.message}`),
}));

/* M9h·M14: 자동 실행(카드 → 사진 판독 → 생성 → 점검)을 lib 호출로 재현 */
const autoStart = Date.now();
const auto: Record<string, number> = {};
t = Date.now();
const ar = await extractCards(docs, "티링크");
auto.cardsMs = Date.now() - t;
keep("자동 실행: 카드", [ar.meta]);
const usable = ar.cards.filter((c) => c.status !== "unverified");
const photoFiles = ["install-wall-server-switch.jpg", "install-desk-hub.jpg", "install-stand-server.jpg", "install-case-b.jpg"];
const images = photoFiles.map((f) => ({ mediaType: "image/jpeg", base64: fs.readFileSync(path.join(ROOT, "data", "tlink", "photos", f)).toString("base64") }));
t = Date.now();
const photos = await structured({
  role: "vision",
  task: "사진 판독",
  system: PHOTO_SYSTEM,
  prompt: `사진 ${images.length}장(${images.map((_, i) => `P${i + 1}`).join(", ")})을 판독하라.\n\n## 차별점 카드\n${cardsBlock(usable, false)}`,
  images,
  schema: photoReadingSchema,
});
auto.photosMs = Date.now() - t;
keep("자동 실행: 사진", [photos.meta]);
const known = new Set(usable.map((c) => c.id));
const readings = photos.data.photos.map((p) => ({ ...p, links: p.links.filter((l) => known.has(l.cardId)) }));
const linkedFirst = [...usable].sort((a, b) => Number(readings.some((p) => p.links.some((l) => l.cardId === b.id))) - Number(readings.some((p) => p.links.some((l) => l.cardId === a.id))));
t = Date.now();
const gen = await structured({
  role: "main",
  task: "콘텐츠 생성",
  system: GENERATE_SYSTEM,
  prompt: generatePrompt(linkedFirst, readings, guideline, "티링크", ar.conflicts.filter((c) => c.cardIds.some((id) => known.has(id)))),
  schema: generationSchema,
});
auto.generateMs = Date.now() - t;
keep("자동 실행: 생성", [gen.meta]);
t = Date.now();
const items = flattenGeneration(gen.data);
const genCheck = await runCheck({ items, scope: blogScope(gen.data), cards: ar.cards, conflicts: ar.conflicts, docs, guideline, readings });
auto.checkMs = Date.now() - t;
keep("자동 실행: 점검", genCheck.metas);
auto.totalMs = Date.now() - autoStart;

/* 집계 */
const tokens = (step?: (s: string) => boolean) =>
  allMetas
    .filter((m) => !step || step(m.step))
    .reduce(
      (o, { meta }) => ({ calls: o.calls + 1, input: o.input + (meta.usage?.inputTokens ?? 0), output: o.output + (meta.usage?.outputTokens ?? 0), attempts: o.attempts + (meta.attempts ?? 0) }),
      { calls: 0, input: 0, output: 0, attempts: 0 },
    );
const blogItems = genCheck.items.filter((i) => i.key.startsWith("blog."));
const out = {
  commit,
  started,
  finished: new Date().toISOString(),
  cache: process.env.LLM_CACHE !== "off",
  fixedHash,
  models: [...new Set(allMetas.map((m) => `${m.meta.provider}:${m.meta.model}`))],
  M1: m1,
  M2: {
    cards: r.cards.length,
    modelCards: r.cards.filter((c) => c.origin !== "conflict").length,
    quotes: quotes.length,
    exact: quotes.filter((e) => e.match === "exact").length,
    approx: quotes.filter((e) => e.match === "approx").length,
    none: quotes.filter((e) => e.match === "none").length,
    cardStatus: r.cards.map((c) => `${c.id} ${c.status}`),
  },
  M3: { conflicts: r.conflicts.map((c) => `${c.metric}: ${c.values.map((v) => `${v.value}(${v.docId} p.${v.page})`).join(" / ")}`) },
  M6: { ...m6s, wallMs: m6.wallMs, warningsByDecider: m6d, disagreements: m6.res.disagreements.length, reviews: m6.res.reviews.length, judgeError: m6.res.judgeError },
  M6rows: m6.results.map((c) => ({ id: c.id, category: c.category, warned: c.warned, types: c.types, deciders: c.deciders, messages: c.messages })),
  M7: { ms: m7Ms, wrong, otherWarned, disagreements: m7.disagreements.length, reviews: m7.reviews, judgeError: m7.judgeError, timings: m7.timings },
  M8: m7.checklist.map((c) => ({ group: c.group, label: c.label, ok: c.ok, decider: c.decider, note: c.note })),
  M9: { cardsMs, m6CheckMs: m6.wallMs, m7CheckMs: m7Ms, auto },
  M14: { all: tokens(), auto: tokens((s) => s.startsWith("자동 실행")), byStep: Object.fromEntries([...new Set(allMetas.map((m) => m.step))].map((s) => [s, tokens((x) => x === s)])) },
  M5app: { metrics: genCheck.metrics, blogSentences: blogItems.length, blogWarnings: genCheck.warnings.filter((w) => w.sentenceKey?.startsWith("blog.")).length },
  M11: { m6Disagreements: m6.res.disagreements, m7Disagreements: m7.disagreements, genDisagreements: genCheck.disagreements.length, approxQuotes: quotes.filter((e) => e.match === "approx").map((e) => `${e.docId} p.${e.page}: ${e.quote}`) },
  photos: readings,
  generation: gen.data,
  genCheck: { warnings: genCheck.warnings, items: genCheck.items, checklist: genCheck.checklist },
  autoCards: { cards: ar.cards.length, conflicts: ar.conflicts.length },
  metas: allMetas,
};
const file = path.join(EVAL_DIR, `final-${started.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, M6rows: undefined, photos: undefined, generation: undefined, genCheck: undefined, metas: undefined, M11: { ...out.M11, m6Disagreements: out.M11.m6Disagreements.length, m7Disagreements: out.M11.m7Disagreements.length } }, null, 1));
console.log(`전체 기록: ${file}`);
