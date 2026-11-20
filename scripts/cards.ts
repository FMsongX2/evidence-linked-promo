/**
 * 1단계 차별점 카드 추출을 한 번 돌려 시간·카드 수·인용 대조·수치 충돌을 내고 카드를 저장한다.
 * 실행(app/ 에서): bun scripts/cards.ts [--out .cache/eval/cards.json] [--cache]
 */
import { EVAL_DIR, gitHead, loadInputs, opt, type CardsFile } from "./eval-common";
import fs from "node:fs";
import path from "node:path";
import { extractCards } from "../src/lib/pipeline";

const out = opt("out", path.join(EVAL_DIR, "cards.json"))!;
const { docs } = await loadInputs();
const started = Date.now();
const r = await extractCards(docs, "티링크");
const ms = Date.now() - started;
const file: CardsFile = { ...r, at: new Date().toISOString(), commit: gitHead(), ms };
fs.writeFileSync(out, JSON.stringify(file, null, 1));

const quotes = r.cards.flatMap((c) => c.evidence);
console.log(
  JSON.stringify(
    {
      commit: file.commit,
      at: file.at,
      cache: process.env.LLM_CACHE !== "off",
      ms,
      docs: docs.length,
      pages: docs.reduce((n, d) => n + d.pages.length, 0),
      cards: r.cards.length,
      modelCards: r.cards.filter((c) => c.origin !== "conflict").length,
      confirmedOrConflict: r.cards.filter((c) => c.status !== "unverified").length,
      quotes: quotes.length,
      quoteExact: quotes.filter((e) => e.match === "exact").length,
      quoteApprox: quotes.filter((e) => e.match === "approx").length,
      quoteNone: quotes.filter((e) => e.match === "none").length,
      conflicts: r.conflicts.map((c) => `${c.metric}: ${c.values.map((v) => `${v.value}(${v.docId} p.${v.page})`).join(" / ")}`),
      metas: "metas" in r ? r.metas : [r.meta],
      out,
    },
    null,
    1,
  ),
);
