import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "근거 달린 홍보문 — 문장마다 원문 근거가 달린 B2B 홍보 초안과 게시 전 점검",
  description:
    "티링크 제품 자료와 현장 사진으로 블로그·카드뉴스·설치 사례 초안을 자동으로 만들고, 문장마다 원문 근거를 대조해 사양과 다른 문장, 수치 충돌, 가이드라인 누락을 게시 전에 경고하는 웹 앱. '티링크 예시로 보기'로 실제 실행 결과를 볼 수 있습니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
