import type { CheckItem } from "./check";
import type { Generation, Sentence } from "./schemas";

/**
 * 생성물의 문장마다 안정된 키를 붙여 한 줄로 편다.
 * blog.title / blog.s{단}.{문장} / blog.footer.{n} / card.{장}.h / card.{장}.b{n} / case.{n}
 */
export function flattenGeneration(g: Generation): CheckItem[] {
  const out: CheckItem[] = [{ key: "blog.title", ...g.blog.title }];
  g.blog.sections.forEach((s, i) => s.sentences.forEach((x, j) => out.push({ key: `blog.s${i}.${j}`, ...x })));
  g.blog.footer.forEach((x, j) => out.push({ key: `blog.footer.${j}`, ...x }));
  g.cardnews.forEach((c, i) => {
    out.push({ key: `card.${i}.h`, ...c.headline });
    c.body.forEach((x, j) => out.push({ key: `card.${i}.b${j}`, ...x }));
  });
  g.caseStudy.sentences.forEach((x, j) => out.push({ key: `case.${j}`, ...x }));
  return out;
}

/** 키로 문장 하나를 바꾼 새 생성물을 돌려준다. */
export function replaceSentence(g: Generation, key: string, s: Sentence): Generation {
  const next: Generation = structuredClone(g);
  const parts = key.split(".");
  if (key === "blog.title") next.blog.title = s;
  else if (parts[0] === "blog" && parts[1] === "footer") next.blog.footer[Number(parts[2])] = s;
  else if (parts[0] === "blog") next.blog.sections[Number(parts[1].slice(1))].sentences[Number(parts[2])] = s;
  else if (parts[0] === "card" && parts[2] === "h") next.cardnews[Number(parts[1])].headline = s;
  else if (parts[0] === "card") next.cardnews[Number(parts[1])].body[Number(parts[2].slice(1))] = s;
  else if (parts[0] === "case") next.caseStudy.sentences[Number(parts[1])] = s;
  return next;
}

/** 가이드라인 대조 범위: 블로그 제목과 본문(단 제목·하단 안내·해시태그 포함). */
export function blogScope(g: Generation): { title: string; body: string } {
  const body = [
    g.blog.title.text,
    ...g.blog.sections.flatMap((s) => [s.heading, ...s.sentences.map((x) => x.text)]),
    ...g.blog.footer.map((x) => x.text),
    g.blog.hashtags.join(" "),
  ].join("\n");
  return { title: g.blog.title.text, body };
}

/** 복사용 블로그 본문. */
export function blogPlainText(g: Generation): string {
  return [
    g.blog.title.text,
    "",
    ...g.blog.sections.flatMap((s) => [s.heading, s.sentences.map((x) => x.text).join(" "), ""]),
    ...g.blog.footer.map((x) => x.text),
    "",
    g.blog.hashtags.join(" "),
  ].join("\n");
}

export function caseStudyPlainText(g: Generation): string {
  return [g.caseStudy.title, "", g.caseStudy.sentences.map((x) => x.text).join(" ")].join("\n");
}
