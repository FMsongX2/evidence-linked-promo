/**
 * 모델 공급자를 고르는 유일한 곳.
 *
 * 역할
 *   main   : 차별점 카드 추출·문안 생성·원고 문장 근거 연결·경고 문장 다시 쓰기  (LLM_MAIN)
 *   vision : 현장 사진 판독                                                    (LLM_VISION)
 *   judge  : 생성에 쓰지 않은 모델의 주장-인용 일치·강조 내용 반영 판정           (LLM_JUDGE)
 *
 * 값 형식은 "<공급자>:<모델>"이다.
 *   deepseek:<모델>    OpenAI 호환 API(DEEPSEEK_BASE_URL, 기본 Hive) + DEEPSEEK_API_KEY
 *   anthropic:<모델>   Vercel AI SDK + ANTHROPIC_API_KEY
 *   google:<모델>      Vercel AI SDK + GOOGLE_GENERATIVE_AI_API_KEY
 *   claude-cli:<모델>  로컬 Claude Code CLI(`claude -p`). 로컬 개발 전용
 *   agy-cli:<모델>     로컬 Antigravity CLI(`agy`). 로컬 개발 전용
 *
 * 기본값: main·vision은 DeepSeek(키가 있을 때). judge는 로컬이면 Gemini(agy-cli), 배포 환경이면
 * 다른 회사 키가 없어 DeepSeek 별도 호출로 판정한다(화면과 README에 그렇게 표시).
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateText, Output, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { cacheDir, cacheEnabled, isDeployed } from "./env";
import type { LlmMeta } from "./schemas";

export type Role = "main" | "vision" | "judge";
const PROVIDERS = ["deepseek", "anthropic", "google", "claude-cli", "agy-cli"] as const;
type ProviderName = (typeof PROVIDERS)[number];
export type ModelSpec = { provider: ProviderName; model: string };

const CLI_PROVIDERS: ProviderName[] = ["claude-cli", "agy-cli"];
const DEEPSEEK_DEFAULT: ModelSpec = { provider: "deepseek", model: "deepseek-ai/deepseek-v4.1-flash-1017" };

/** 공급자를 만든 회사. 교차 판정이 다른 회사 모델인지 표시하는 데 쓴다. */
export function vendorOf(p: ProviderName): string {
  return { deepseek: "DeepSeek", anthropic: "Anthropic", google: "Google", "claude-cli": "Anthropic", "agy-cli": "Google" }[p];
}

function parseSpec(value: string | undefined): ModelSpec | null {
  if (!value) return null;
  const i = value.indexOf(":");
  if (i < 0) return null;
  const provider = value.slice(0, i) as ProviderName;
  const model = value.slice(i + 1);
  if (!PROVIDERS.includes(provider) || !model) return null;
  return { provider, model };
}

function hasKey(p: ProviderName): boolean {
  if (p === "deepseek") return Boolean(process.env.DEEPSEEK_API_KEY);
  if (p === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (p === "google") return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  return !isDeployed;
}

function defaultSpec(role: Role): ModelSpec | null {
  if (role === "judge") {
    if (!isDeployed) return { provider: "agy-cli", model: "gemini-4-argon-high" };
    if (hasKey("google")) return { provider: "google", model: "gemini-4-argon" };
    if (hasKey("anthropic")) return { provider: "anthropic", model: "claude-opus-5-5" };
    return hasKey("deepseek") ? DEEPSEEK_DEFAULT : null;
  }
  if (hasKey("deepseek")) return DEEPSEEK_DEFAULT;
  if (!isDeployed) return { provider: "claude-cli", model: "claude-opus-5-5" };
  return null;
}

/** 역할별 모델. 쓸 수 있는 공급자가 없으면 null과 그 이유를 돌려준다. */
export function resolveModel(role: Role): { spec: ModelSpec | null; reason: string | null } {
  const env = { main: process.env.LLM_MAIN, vision: process.env.LLM_VISION, judge: process.env.LLM_JUDGE }[role];
  const explicit = parseSpec(env);
  if (explicit) {
    if (isDeployed && CLI_PROVIDERS.includes(explicit.provider)) {
      return { spec: null, reason: `배포 환경에서는 로컬 CLI 공급자(${explicit.provider})를 쓸 수 없습니다.` };
    }
    if (!hasKey(explicit.provider)) {
      return { spec: null, reason: `${explicit.provider} API 키가 서버 환경 변수에 없습니다.` };
    }
    return { spec: explicit, reason: null };
  }
  const spec = defaultSpec(role);
  if (spec) return { spec, reason: null };
  return {
    spec: null,
    reason: role === "vision" ? "사진 판독에는 이미지 입력 모델 키가 필요합니다." : "서버에 모델 API 키(DEEPSEEK_API_KEY)가 없습니다.",
  };
}

export class LlmUnavailableError extends Error {}

export type ImageInput = { mediaType: string; base64: string };

type StructuredArgs<T extends z.ZodType> = {
  role: Role;
  /** 화면에 보일 작업 이름(예: 차별점 카드 추출) */
  task: string;
  system: string;
  prompt: string;
  images?: ImageInput[];
  schema: T;
  timeoutMs?: number;
};

export async function structured<T extends z.ZodType>(args: StructuredArgs<T>): Promise<{ data: z.infer<T>; meta: LlmMeta }> {
  const { spec, reason } = resolveModel(args.role);
  if (!spec) throw new LlmUnavailableError(reason ?? "모델을 쓸 수 없습니다.");
  // CLI들의 스키마 검사기는 draft 2020-12 메타 스키마를 모르므로 draft-07로 내보낸다.
  const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(args.schema, { target: "draft-7" }) };
  delete jsonSchema.$schema;
  const key = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        spec,
        system: args.system,
        prompt: args.prompt,
        images: (args.images ?? []).map((i) => crypto.createHash("sha256").update(i.base64).digest("hex")),
        schema: jsonSchema,
      }),
    )
    .digest("hex");

  const started = Date.now();
  const cached = await readCache(key);
  if (cached !== undefined) {
    const parsed = args.schema.safeParse(cached);
    if (parsed.success) {
      return { data: parsed.data, meta: { role: args.task, provider: spec.provider, model: spec.model, cached: true, ms: Date.now() - started } };
    }
  }

  if (isDeployed) consumeDailyQuota();
  const timeoutMs = args.timeoutMs ?? 600_000;
  // 구조화 출력이 스키마와 맞지 않으면 한 번 더 요청한다.
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: unknown;
    try {
      if (spec.provider === "claude-cli") raw = await callClaudeCli(spec.model, args, jsonSchema, timeoutMs);
      else if (spec.provider === "agy-cli") raw = await callAgyCli(spec.model, args, jsonSchema, timeoutMs);
      else raw = await callSdk(spec, args, timeoutMs);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    const parsed = args.schema.safeParse(raw);
    if (parsed.success) {
      await writeCache(key, parsed.data);
      return { data: parsed.data, meta: { role: args.task, provider: spec.provider, model: spec.model, cached: false, ms: Date.now() - started } };
    }
    lastError = `모델 출력이 스키마와 맞지 않습니다. ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
  }
  throw new Error(`${args.task}: ${lastError}`);
}

/** 배포 환경의 하루 모델 호출 상한(서버 인스턴스 메모리 기준). 공개 주소에서 키가 소진되지 않게 한다. */
const DAILY_LIMIT = Number(process.env.DAILY_CALL_LIMIT ?? 150);
let quotaDay = "";
let quotaUsed = 0;
function consumeDailyQuota() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDay) {
    quotaDay = today;
    quotaUsed = 0;
  }
  if (quotaUsed >= DAILY_LIMIT) throw new LlmUnavailableError(`오늘 공개 데모의 모델 호출 상한(${DAILY_LIMIT}회)에 도달했습니다. '티링크 예시로 보기'로 결과를 확인하세요.`);
  quotaUsed++;
}

/* ---------- Vercel AI SDK 공급자 ---------- */

async function callSdk<T extends z.ZodType>(spec: ModelSpec, args: StructuredArgs<T>, timeoutMs: number): Promise<unknown> {
  const model =
    spec.provider === "deepseek"
      ? createOpenAICompatible({
          name: "deepseek",
          baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api-cdn.thehive.ai/api/v3",
          apiKey: process.env.DEEPSEEK_API_KEY,
          supportsStructuredOutputs: true,
        })(spec.model)
      : spec.provider === "anthropic"
        ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(spec.model)
        : createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(spec.model);
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        ...(args.images ?? []).map((img) => ({ type: "file" as const, mediaType: img.mediaType, data: img.base64 })),
        { type: "text" as const, text: args.prompt },
      ],
    },
  ];
  const { output } = await generateText({
    model,
    system: args.system,
    messages,
    output: Output.object({ schema: args.schema }),
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  return output;
}

/* ---------- 로컬 CLI 공급자 ---------- */

function run(cmd: string, argv: string[], opts: { cwd: string; stdin?: string; timeoutMs: number; env?: NodeJS.ProcessEnv }): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const child = spawn(cmd, argv, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  let err = "";
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    reject(new Error(`${cmd} 시간 초과(${Math.round(opts.timeoutMs / 1000)}초)`));
  }, opts.timeoutMs);
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("error", (e) => {
    clearTimeout(timer);
    reject(e);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code === 0) resolve(out);
    else reject(new Error(`${cmd} 종료 코드 ${code}: ${(err || out).trim().split("\n").slice(-3).join(" | ")}`));
  });
  child.stdin.end(opts.stdin ?? "");
  return promise;
}

async function callClaudeCli<T extends z.ZodType>(model: string, args: StructuredArgs<T>, jsonSchema: unknown, timeoutMs: number): Promise<unknown> {
  const wd = await fs.mkdtemp(path.join(os.tmpdir(), "geunger-claude-"));
  try {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.ANTHROPIC_API_KEY;
    const content = [
      ...(args.images ?? []).map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } })),
      { type: "text", text: args.prompt },
    ];
    const stdin = JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n";
    const out = await run(
      "claude",
      [
        "-p",
        "--setting-sources",
        "project",
        "--model",
        model,
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--tools",
        "",
        "--no-session-persistence",
        "--system-prompt",
        args.system,
        "--json-schema",
        JSON.stringify(jsonSchema),
      ],
      { cwd: wd, stdin, timeoutMs, env },
    );
    const last = out
      .trim()
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((x) => x && x.type === "result")
      .pop();
    if (!last) throw new Error("claude 응답에 결과가 없습니다.");
    if (last.is_error) throw new Error(`claude 오류: ${String(last.result).slice(0, 300)}`);
    const used = Object.keys(last.modelUsage ?? {});
    if (used.length && !used.some((u) => u.startsWith(model))) throw new Error(`claude가 다른 모델로 응답했습니다: ${used.join(", ")}`);
    return last.structured_output ?? JSON.parse(last.result);
  } finally {
    await fs.rm(wd, { recursive: true, force: true });
  }
}

async function callAgyCli<T extends z.ZodType>(model: string, args: StructuredArgs<T>, jsonSchema: unknown, timeoutMs: number): Promise<unknown> {
  const wd = await fs.mkdtemp(path.join(os.tmpdir(), "geunger-agy-"));
  try {
    const schemaPath = path.join(wd, "_schema.json");
    await fs.writeFile(schemaPath, JSON.stringify(jsonSchema));
    let prompt = `${args.system}\n\n---\n\n${args.prompt}`;
    if (args.images?.length) {
      const names: string[] = [];
      for (const [i, img] of args.images.entries()) {
        const name = `photo-${i + 1}.${img.mediaType.split("/")[1] ?? "jpg"}`;
        await fs.writeFile(path.join(wd, name), Buffer.from(img.base64, "base64"));
        names.push(name);
      }
      prompt += `\n\n작업 폴더의 사진 파일(입력 순서): ${names.join(", ")}`;
    }
    const secs = Math.round(timeoutMs / 1000);
    const out = await run(
      "agy",
      ["--model", model, "--print-timeout", `${secs}s`, "--output-format", "json", "--add-dir", wd, "--json-schema", schemaPath, "-p", prompt],
      { cwd: wd, timeoutMs: timeoutMs + 30_000 },
    );
    const res = JSON.parse(out);
    if (res.status && res.status !== "SUCCESS") throw new Error(`agy 상태 ${res.status}`);
    if (res.structured_output) return res.structured_output;
    const text = String(res.response ?? "").trim();
    if (!text) throw new Error("agy 빈 응답");
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } finally {
    await fs.rm(wd, { recursive: true, force: true });
  }
}

/* ---------- 입력 해시 캐시 ---------- */

async function readCache(key: string): Promise<unknown | undefined> {
  if (!cacheEnabled) return undefined;
  try {
    return JSON.parse(await fs.readFile(path.join(cacheDir, "llm", `${key}.json`), "utf8"));
  } catch {
    return undefined;
  }
}

async function writeCache(key: string, value: unknown): Promise<void> {
  if (!cacheEnabled) return;
  await fs.mkdir(path.join(cacheDir, "llm"), { recursive: true });
  await fs.writeFile(path.join(cacheDir, "llm", `${key}.json`), JSON.stringify(value));
}

/** 화면에 보일 공급자 설정 요약. */
export function providerSummary() {
  const main = resolveModel("main");
  const vision = resolveModel("vision");
  const judge = resolveModel("judge");
  const label = (s: ModelSpec | null) => (s ? `${s.provider}:${s.model}` : null);
  return {
    deployed: isDeployed,
    main: label(main.spec),
    vision: label(vision.spec),
    judge: label(judge.spec),
    mainReason: main.reason,
    visionReason: vision.reason,
    judgeReason: judge.reason,
    /** 교차 판정 모델이 생성 모델과 같은 회사인지(같으면 '같은 공급자의 별도 호출'로 표시) */
    judgeSameVendor: Boolean(main.spec && judge.spec && vendorOf(main.spec.provider) === vendorOf(judge.spec.provider)),
  };
}
