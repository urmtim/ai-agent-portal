import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Семейный портал",
  description: "Семейный хаб: обучение, траты, ИИ-агенты",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
