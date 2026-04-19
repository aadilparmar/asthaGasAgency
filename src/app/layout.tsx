import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jb-mono",
  display: "swap",
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
      <body className={`${inter.variable} ${fraunces.variable} ${jbmono.variable} font-[family-name:var(--font-inter)] antialiased bg-slate-50 text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
