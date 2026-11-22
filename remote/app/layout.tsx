import type { ReactNode } from "react";

export const metadata = {
  title: "x402 Security Check",
  description: "Check an x402 seller's API server code from claude.ai.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
