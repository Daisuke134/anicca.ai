import type { Metadata } from "next";
import { Noto_Serif_JP, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const notoSerifJP = Noto_Serif_JP({ subsets: ["latin"], weight: ["400","700"] });

export const metadata: Metadata = {
  title: "Anicca – 静けさの中で動くAGI",
  description: "雑念なく、今この画面に寄り添う。プライバシー優先の音声AGI。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${inter.className} ${notoSerifJP.className}`}>{children}</body>
    </html>
  );
}
