import type { Metadata } from "next";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const display = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-spline-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mnemia: memory that survives, for AI coding agents",
  description:
    "Mnemia captures your coding-agent sessions and recalls them ranked in a fresh one — across Claude Code, Cursor, Codex and more. Solo, you stop re-explaining your codebase. On a team, it becomes one shared brain, reviewed and kept correct. The agent changes. The memory stays.",
  openGraph: {
    title: "Mnemia: memory for your AI coding agents — solo or team",
    description: "One command. Every agent remembers. Kept correct.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="bg-ground font-display text-ink antialiased">{children}</body>
    </html>
  );
}
