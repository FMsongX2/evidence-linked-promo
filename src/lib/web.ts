import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { cacheDir, cacheEnabled } from "./env";
import type { SourceDoc } from "./schemas";

const SECTION_CHARS = 1200;

function assertPublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("http 또는 https 주소만 받습니다.");
  const h = u.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    throw new Error("내부망 주소는 받지 않습니다.");
  }
  return u;
}

/** 마크다운에서 이미지·링크 주소를 걷어 내고 글자만 남긴다. */
function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 문단 경계에서 SECTION_CHARS 안팎으로 자른다. 구간 번호가 근거의 쪽 번호 역할을 한다. */
function toSections(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > SECTION_CHARS) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

async function viaJina(u: URL): Promise<{ title: string; text: string }> {
  const res = await fetch(`https://r.jina.ai/${u.toString()}`, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Jina Reader 응답 ${res.status}`);
  const body = await res.text();
  const title = body.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? u.hostname;
  const md = body.split(/^Markdown Content:\s*$/m)[1] ?? body;
  return { title, text: cleanMarkdown(md) };
}

async function viaReadability(u: URL): Promise<{ title: string; text: string }> {
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
  if (!res.ok) throw new Error(`페이지 응답 ${res.status}`);
  const { document } = parseHTML(await res.text());
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.textContent) throw new Error("본문을 찾지 못했습니다.");
  return { title: article.title || u.hostname, text: article.textContent.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim() };
}

export type PageImage = { src: string; alt: string };

function sameSite(a: string, b: string): boolean {
  return a.replace(/^www\./, "") === b.replace(/^www\./, "");
}

/** 페이지 HTML에서 같은 호스트의 사진(jpg·png·webp)을 사진 후보로 모은다. 로고·아이콘은 뺀다. */
async function pageImages(u: URL): Promise<PageImage[]> {
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (!res.ok) return [];
    const { document } = parseHTML(await res.text());
    const seen = new Set<string>();
    const out: PageImage[] = [];
    for (const img of document.querySelectorAll("img")) {
      const raw = img.getAttribute("src") || img.getAttribute("data-src");
      if (!raw) continue;
      let abs: URL;
      try {
        abs = new URL(raw, u);
      } catch {
        continue;
      }
      if (!sameSite(abs.hostname, u.hostname)) continue;
      if (!/\.(jpe?g|png|webp)$/i.test(abs.pathname)) continue;
      if (/(logo|icon|ico_|btn|arrow|banner|bg_)/i.test(abs.pathname)) continue;
      if (seen.has(abs.href)) continue;
      seen.add(abs.href);
      out.push({ src: abs.href, alt: (img.getAttribute("alt") ?? "").trim() });
    }
    return out;
  } catch {
    return [];
  }
}

export async function ingestUrl(raw: string): Promise<{ doc: SourceDoc; images: PageImage[]; via: "jina" | "readability"; cached: boolean }> {
  const u = assertPublicUrl(raw);
  const key = crypto.createHash("sha256").update(u.toString()).digest("hex");
  const file = path.join(cacheDir, "url", `${key}.json`);
  if (cacheEnabled) {
    try {
      return { ...JSON.parse(await fs.readFile(file, "utf8")), cached: true };
    } catch {}
  }
  let via: "jina" | "readability" = "jina";
  let got: { title: string; text: string };
  try {
    got = await viaJina(u);
    if (got.text.length < 200) throw new Error("본문이 너무 짧습니다.");
  } catch {
    via = "readability";
    got = await viaReadability(u);
  }
  const slug = (u.pathname.replace(/\.[a-z]+$/, "").split("/").filter(Boolean).pop() ?? "home").toLowerCase();
  const doc: SourceDoc = {
    id: `web-${slug}`,
    title: `${got.title} (홈페이지)`,
    kind: "url",
    url: u.toString(),
    pages: toSections(got.text).map((text, i) => ({ page: i + 1, text })),
  };
  const images = await pageImages(u);
  if (cacheEnabled) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ doc, images, via }));
  }
  return { doc, images, via, cached: false };
}
