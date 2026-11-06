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
  metadataBase: new URL("https://rickykleinhempel.github.io"),
  title: "Rückwärts-Rekorder 🔁",
  description:
    "Aufnehmen, rückwärts abspielen, Stimmverzerrer drauf und per WhatsApp verschicken – direkt im Browser.",
  applicationName: "Rückwärts-Rekorder",
  appleWebApp: {
    capable: true,
    title: "Rückwärts",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Rückwärts-Rekorder 🔁",
    description: "Nimm was auf, hör's dir rückwärts an & schick's deinen Leuten 🤯",
    type: "website",
    locale: "de_DE",
  },
};

export const viewport: Viewport = {
  themeColor: "#07030f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
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
