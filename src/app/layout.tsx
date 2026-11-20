import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "근거 달린 홍보문",
  description: "제품 자료와 현장 사진으로 문장마다 원문 근거가 달린 B2B 홍보 콘텐츠를 만들고 게시 전에 점검합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
