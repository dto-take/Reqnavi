import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { LoadingOverlayProvider } from "@/components/ui/loading-overlay";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ReqNavi",
  description: "要件定義を、迷わず前へ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={inter.variable}>
      <body>
        <ToastProvider>
          <LoadingOverlayProvider>{children}</LoadingOverlayProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
