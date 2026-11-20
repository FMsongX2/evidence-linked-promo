/** 측정은 모델 캐시를 끈 상태가 기본이다(--cache 로 켠다). 다른 모듈이 src/lib/env.ts 를 읽기 전에 import 해야 한다. */
if (!process.argv.includes("--cache")) process.env.LLM_CACHE = "off";
