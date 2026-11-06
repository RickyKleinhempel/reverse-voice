import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";

const body = Bricolage_Grotesque({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Unbounded({
  variable: "--font-display-face",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rückwärts-Rekorder 🔁",
  description:
    "Aufnehmen, rückwärts abspielen, Effekte drauf und die Rückwärts-Challenge zocken – direkt im Browser.",
};

export const viewport: Viewport = {
  themeColor: "#07030f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${body.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
