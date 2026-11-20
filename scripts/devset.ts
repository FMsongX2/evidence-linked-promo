/**
 * 조정용 시험 문장 묶음(stage2/devset.md: 고친 문장 V01~V20, 바른 짝 W01~W20)을 한 원고로 붙여 넣어 점검한다.
 * 실행(app/ 에서): bun scripts/devset.ts [--cards .cache/eval/cards.json] [--label 이름] [--cache]
 * 결과: 표준 출력에 집계, .cache/eval/devset-<시각>.json·.md 에 문장별 결과.
 */
import { EVAL_DIR, ROOT, caseTable, cells, checkCases, expectedTypes, gitHead, loadCards, loadInputs, opt, shuffle, summarize, type Case } from "./eval-common";
import fs from "node:fs";
import path from "node:path";

function parseDevset(md: string): Case[] {
  const bad: Case[] = [];
  const good: Case[] = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("| V") && !line.startsWith("| W")) continue;
    const c = cells(line);
    if (/^V\d\d$/.test(c[0]) && c.length >= 6) bad.push({ id: c[0], category: c[1], text: c[4], bad: true, expected: expectedTypes(c[5]) });
    else if (/^W\d\d$/.test(c[0]) && c.length >= 3) good.push({ id: c[0], category: "바른 짝", text: c[2], bad: false, expected: [] });
  }
  return [...bad, ...good];
}

const cases = parseDevset(fs.readFileSync(path.join(ROOT, "stage2", "devset.md"), "utf8"));
if (cases.length !== 40) throw new Error(`devset 문장이 40개가 아닙니다: ${cases.length}`);
const { docs, guideline } = await loadInputs();
const cards = loadCards();
const order = shuffle(cases);
const { res, results, wallMs } = await checkCases(order, cards, docs, guideline, null);
const s = summarize(results);
const at = new Date().toISOString();
const label = opt("label", "run")!;
const report = {
  label,
  commit: gitHead(),
  at,
  cache: process.env.LLM_CACHE !== "off",
  cardsFile: { at: cards.at, commit: cards.commit, cards: cards.cards.length },
  wallMs,
  serverMs: res.elapsedMs,
  metas: res.metas,
  judgeError: res.judgeError,
  suggestError: res.suggestError,
  disagreements: res.disagreements.length,
  ...s,
};
const stamp = at.replace(/[:.]/g, "-");
fs.writeFileSync(path.join(EVAL_DIR, `devset-${stamp}.json`), JSON.stringify({ report, results, res }, null, 1));
fs.writeFileSync(path.join(EVAL_DIR, `devset-${stamp}.md`), `# devset ${label} ${at}\n\n${caseTable(results.sort((a, b) => a.id.localeCompare(b.id)))}\n`);
console.log(JSON.stringify(report, null, 1));
console.log(`문장별: ${path.join(EVAL_DIR, `devset-${stamp}.md`)}`);
