import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["200","300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jooma",
  description: "AI-powered tools built for teachers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col" style={{ backgroundColor: "#F1EFE3" }} suppressHydrationWarning>
        <NextTopLoader color="#1a1a1a" showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
