"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LlmMeta } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { formatMs } from "./model";
import type { JobState } from "./workbench";

/** 한 번에 하나만 보이는 작업 화면. 주소 해시(#step-1 등)와 같다. */
export type View = "step-1" | "step-2" | "step-3" | "step-4" | "paste-check" | "run-info";
export const VIEWS: View[] = ["step-1", "step-2", "step-3", "step-4", "paste-check", "run-info"];
export const STEPS = [
  { view: "step-1", n: 1, title: "제품 분석", short: "제품 분석" },
  { view: "step-2", n: 2, title: "사진 판독", short: "사진 판독" },
  { view: "step-3", n: 3, title: "콘텐츠 생성", short: "콘텐츠" },
  { view: "step-4", n: 4, title: "게시 전 점검", short: "점검" },
] as const satisfies readonly { view: View; n: number; title: string; short: string }[];

type Nav = { view: View; go: (v: View, opts?: { replace?: boolean }) => void };
export const NavContext = createContext<Nav>({ view: "step-1", go: () => {} });
export const useNav = () => useContext(NavContext);

/** 화면 안 탭(밑줄형). 좁은 폭에서는 줄을 바꾸고, 선택 밑줄은 목록의 아래 테두리에 겹친다. */
export const LINE_TABS = "w-full flex-wrap justify-start gap-x-6 rounded-none border-b p-0 group-data-horizontal/tabs:h-auto";
export const LINE_TAB = "h-11 flex-none px-0 text-base group-data-horizontal/tabs:after:bottom-[-1px]";

export type Tone = "neutral" | "success" | "warning" | "danger" | "doc" | "photo" | "model" | "code";
const TONE: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  success: "border-success-border bg-success-soft text-success",
  warning: "border-warning-border bg-warning-soft text-warning",
  danger: "border-danger-border bg-danger-soft text-danger",
  doc: "border-doc-border bg-doc-soft text-doc",
  photo: "border-photo-border bg-photo-soft text-photo",
  model: "border-transparent bg-judge-model-soft text-judge-model",
  code: "border-transparent bg-judge-code-soft text-judge-code",
};

/** 작은 상태 표시. 색만으로 뜻을 전하지 않도록 항상 글자를 함께 쓴다. */
export function Pill({ tone = "neutral", className, children, ...rest }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-px align-middle text-xs font-medium whitespace-nowrap", TONE[tone], className)} {...rest}>
      {children}
    </span>
  );
}

/** 옅은 바탕의 안내 상자. 왼쪽 굵은 색 테두리 대신 1px 테두리를 쓴다. */
export function Note({ tone = "neutral", className, children, ...rest }: React.ComponentProps<"div"> & { tone?: Tone }) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", TONE[tone], className)} {...rest}>
      {children}
    </div>
  );
}

export function StepHeader({
  title,
  desc,
  meta,
  actions,
  blockReason,
}: {
  title: string;
  desc: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  blockReason?: string | null;
}) {
  return (
    <header>
      <h2 className="text-2xl font-semibold text-balance">{title}</h2>
      <p className="mt-1 max-w-[70ch] text-muted-foreground">{desc}</p>
      {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
      {(actions || blockReason) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {actions}
          {blockReason && <p className="text-sm text-muted-foreground">{blockReason}</p>}
        </div>
      )}
    </header>
  );
}

/** 입력 구획. 결과가 없으면 펼쳐 두고, 결과가 생기면 접는다. 접혀도 파일 입력은 문서에 남는다. */
export function InputPanel({ summary, hasResults, children }: { summary: React.ReactNode; hasResults: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!hasResults);
  const prev = useRef(hasResults);
  useEffect(() => {
    if (prev.current === hasResults) return;
    prev.current = hasResults;
    setOpen(!hasResults);
  }, [hasResults]);
  const id = useId();
  return (
    <section className="rounded-xl border">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/60">
        <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} />
        <span className="font-semibold">입력</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{summary}</span>
        <span className="shrink-0 text-sm text-muted-foreground">{open ? "접기" : "펼치기"}</span>
      </button>
      <div id={id} hidden={!open} className="border-t px-4 py-4">
        {children}
      </div>
    </section>
  );
}

export type Stat = { label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: "danger" | "warning" | "success" };

/**
 * 결과 요약: 판단에 필요한 수치 셋을 크게 한 줄로, 나머지는 그 아래 작은 보조 줄 하나로 묶는다.
 * `aside`(예: 승인으로 건너뛰는 링크)는 큰 수치 줄 오른쪽 끝에 둔다.
 */
export function SummaryLine({ main, details, aside }: { main: Stat[]; details: React.ReactNode[]; aside?: React.ReactNode }) {
  return (
    <div className="border-y py-3">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <dl className="contents">
          {main.map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className={cn("text-2xl font-semibold tabular-nums", s.tone === "danger" && "text-danger", s.tone === "warning" && "text-warning", s.tone === "success" && "text-success")}>
                {s.value}
                {s.detail && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{s.detail}</span>}
              </dd>
            </div>
          ))}
        </dl>
        {aside && <div className="ml-auto self-center">{aside}</div>}
      </div>
      {details.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          {details.map((d, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden> · </span>}
              {d}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground", className)}>{children}</div>;
}

export function MetaLine({ metas, task }: { metas: LlmMeta[]; task: string }) {
  const m = [...metas].reverse().find((x) => x.role === task);
  if (!m) return null;
  return (
    <span className="break-all">
      {m.provider}:{m.model} · {formatMs(m.ms)}
      {m.cached && (
        <Pill tone="neutral" className="ml-1.5">
          캐시
        </Pill>
      )}
    </span>
  );
}

/** 진행 중(진행 줄 + 자리 표시)과 실패(원인 + 재시도 안내) 상태. */
export function Running({ job, label }: { job: JobState; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!job.running) return;
    const t = setInterval(() => setElapsed(Date.now() - (job.startedAt ?? Date.now())), 1000);
    return () => clearInterval(t);
  }, [job.running, job.startedAt]);
  if (job.running)
    return (
      <div role="status" className="rounded-xl border border-doc-border bg-doc-soft px-4 py-3 text-sm text-doc">
        <div className="flex items-center gap-2 font-medium">
          <span aria-hidden className="size-2 rounded-full bg-doc motion-safe:animate-pulse" />
          {label} 진행 중 · <span className="tabular-nums">{formatMs(elapsed)}</span>
        </div>
        <div aria-hidden className="mt-3 space-y-2">
          <div className="h-2 w-3/4 rounded bg-doc/15 motion-safe:animate-pulse" />
          <div className="h-2 w-1/2 rounded bg-doc/15 motion-safe:animate-pulse" />
        </div>
      </div>
    );
  if (job.error)
    return (
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          <b className="font-semibold">실패:</b> {job.error} — 입력은 그대로 남아 있습니다. 버튼을 다시 누르면 재시도합니다.
        </p>
      </div>
    );
  return null;
}

/** 이전·다음 단계 이동. */
export function StepPager({ prev, next }: { prev?: { view: View; label: string }; next?: { view: View; label: string } }) {
  const { go } = useNav();
  return (
    <nav aria-label="단계 이동" className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      {prev ? (
        <Button variant="ghost" onClick={() => go(prev.view)}>
          <ArrowLeft /> 이전: {prev.label}
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button variant="outline" onClick={() => go(next.view)}>
          다음: {next.label} <ArrowRight />
        </Button>
      )}
    </nav>
  );
}

/** 접어 두는 세부 정보. 키보드로 열 수 있는 기본 요소를 쓴다. */
export function Disclosure({ summary, children, className, defaultOpen }: { summary: React.ReactNode; children: React.ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cn("group/disc", className)} open={defaultOpen}>
      <summary className="inline-flex list-none items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform duration-150 group-open/disc:rotate-90" />
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
