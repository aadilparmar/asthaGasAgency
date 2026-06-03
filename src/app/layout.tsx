import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Astha Gas Agency - Payroll Management",
  description: "Payroll automation system for Astha Gas Agency, Desainagar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-[family-name:var(--font-inter)] antialiased bg-slate-50 text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
