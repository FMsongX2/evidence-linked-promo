/**
 * 측정 스크립트 공통: 입력(문서·가이드라인·카드) 불러오기, 원고 점검 실행과 집계.
 * 모델 캐시는 기본으로 끈다(--cache 로 켠다). env-setup 이 env.ts 보다 먼저 평가되도록 첫 import 로 둔다.
 */
import "./env-setup";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadDocs, loadGuideline } from "../src/lib/data";
import { runCheck, type CardsResult } from "../src/lib/pipeline";
import type { Guideline, SourceDoc } from "../src/lib/schemas";
import { splitSentences } from "../src/lib/text";
import { ingestUrl } from "../src/lib/web";

export const args = process.argv.slice(2);
export const flag = (name: string) => args.includes(`--${name}`);
export const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

export const APP = path.resolve(import.meta.dir, "..");
export const ROOT = path.resolve(APP, "..");
export const EVAL_DIR = path.join(APP, ".cache", "eval");
fs.mkdirSync(EVAL_DIR, { recursive: true });

export const HOMEPAGE_URL = "https://www.tlinkcrm.com/recording.php";

export function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function gitHead(): string {
  const r = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: APP });
  const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--", "src", "scripts", "tests"], { cwd: APP }).stdout.toString().trim();
  return r.stdout.toString().trim() + (dirty ? "+dirty" : "");
}

/** 자료 폴더 문서 + 홈페이지 'AI 녹취' 구간. 홈페이지는 이전에 받아 둔 URL 캐시를 입력 자료로 쓴다. */
export async function loadInputs(): Promise<{ docs: SourceDoc[]; guideline: Guideline | null }> {
  const docs = await loadDocs();
  const guideline = await loadGuideline();
  const urlFile = path.join(APP, ".cache", "url", `${sha256(new URL(HOMEPAGE_URL).toString())}.json`);
  if (fs.existsSync(urlFile)) docs.push(JSON.parse(fs.readFileSync(urlFile, "utf8")).doc);
  else {
    docs.push((await ingestUrl(HOMEPAGE_URL)).doc);
  }
  return { docs, guideline };
}

export type CardsFile = CardsResult & { at: string; commit: string; ms: number };

export function loadCards(file = opt("cards", path.join(EVAL_DIR, "cards.json"))!): CardsFile {
  if (!fs.existsSync(file)) throw new Error(`카드 파일이 없습니다: ${file}. 먼저 bun scripts/cards.ts 를 실행하세요.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** 마크다운 표의 한 줄을 칸으로 나눈다. */
export function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

export const TYPE_LABEL: Record<string, string> = {
  "no-evidence": "근거 없음",
  "spec-mismatch": "사양 불일치",
  "numeric-conflict": "수치 충돌",
  "guideline-missing": "가이드라인 누락",
};

/** 기대 경고 글("근거 없음 또는 수치 충돌")을 경고 종류 목록으로. */
export function expectedTypes(s: string): string[] {
  return Object.entries(TYPE_LABEL)
    .filter(([, label]) => s.includes(label))
    .map(([k]) => k);
}

export type Case = { id: string; text: string; bad: boolean; category: string; expected: string[] };

export type CaseResult = Case & {
  key: string;
  warned: boolean;
  types: string[];
  deciders: string[];
  typeMatch: boolean;
  cardIds: string[];
  kind: string;
  messages: string[];
};

/** 원고 문장 순서를 섞는다(시드 고정). */
export function shuffle<T>(xs: T[], seed = 7): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 원고를 한 번 점검하고 문장별 결과를 낸다. */
export async function checkCases(cases: Case[], cards: CardsFile, docs: SourceDoc[], guideline: Guideline | null, title: string | null) {
  const text = [title, ...cases.map((c) => c.text)].filter(Boolean).join("\n");
  const started = Date.now();
  const res = await runCheck({
    pasted: text,
    scope: { title, body: text },
    cards: cards.cards,
    conflicts: cards.conflicts,
    docs,
    guideline,
    readings: [],
  });
  const wallMs = Date.now() - started;
  const lines = splitSentences(text);
  const results: CaseResult[] = cases.map((c) => {
    const idx = lines.indexOf(c.text);
    const item = res.items[idx];
    const ws = item ? res.warnings.filter((w) => w.sentenceKey === item.key) : [];
    const types = [...new Set(ws.map((w) => w.type))];
    return {
      ...c,
      key: item?.key ?? "(없음)",
      warned: ws.length > 0,
      types,
      // 코드 경고에 교차 판정이 같은 종류로 동의했으면(agreed) 두 주체 모두로 센다.
      deciders: [...new Set(ws.flatMap((w) => (w.agreed ? ["code", "model"] : [w.decider])))],
      typeMatch: c.expected.length > 0 && types.some((t) => c.expected.includes(t)),
      cardIds: item?.cardIds ?? [],
      kind: item?.kind ?? "",
      messages: ws.map((w) => `[${w.decider}/${TYPE_LABEL[w.type]}] ${w.message}${w.detail ? ` — ${w.detail}` : ""}${"quote" in w && w.quote ? ` «${String(w.quote)}»` : ""}`),
    };
  });
  return { res, results, wallMs, text };
}

export function summarize(results: CaseResult[]) {
  const bad = results.filter((r) => r.bad);
  const good = results.filter((r) => !r.bad);
  const byCat: Record<string, { n: number; detected: number; typeMatch: number }> = {};
  for (const r of bad) {
    const x = (byCat[r.category] ??= { n: 0, detected: 0, typeMatch: 0 });
    x.n++;
    if (r.warned) x.detected++;
    if (r.typeMatch) x.typeMatch++;
  }
  const count = (rs: CaseResult[], f: (r: CaseResult) => string[]) => {
    const o: Record<string, number> = {};
    for (const r of rs) for (const k of f(r)) o[k] = (o[k] ?? 0) + 1;
    return o;
  };
  return {
    detected: bad.filter((r) => r.warned).length,
    bad: bad.length,
    typeMatch: bad.filter((r) => r.typeMatch).length,
    falseAlarms: good.filter((r) => r.warned).length,
    good: good.length,
    byCategory: byCat,
    badByType: count(bad, (r) => r.types),
    badByDecider: count(bad, (r) => r.deciders),
    falseByType: count(good.filter((r) => r.warned), (r) => r.types),
    falseByDecider: count(good.filter((r) => r.warned), (r) => r.deciders),
  };
}

export function caseTable(results: CaseResult[]): string {
  const rows = results.map(
    (r) =>
      `| ${r.id} | ${r.bad ? r.category : "바른 짝"} | ${r.warned ? "경고" : "-"} | ${r.types.map((t) => TYPE_LABEL[t]).join(", ")} | ${r.deciders.join(", ")} | ${r.kind} | ${r.cardIds.join(" ")} | ${r.messages.join(" / ").replace(/\|/g, "\\|").replace(/\n/g, " ")} |`,
  );
  return ["| ID | 유형 | 결과 | 경고 종류 | 판정 주체 | kind | 연결 | 경고 내용 |", "|---|---|---|---|---|---|---|---|", ...rows].join("\n");
}
