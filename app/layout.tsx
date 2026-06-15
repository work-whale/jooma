import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Lora,
  Playfair_Display,
  Inter,
  Archivo_Black,
} from "next/font/google";
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

// Slideshow theme fonts — referenced by name in the slide renderers
// (`makeText` picks `theme.fonts.heading` / `theme.fonts.body` as the CSS
// font-family). Without these `next/font` imports the browser silently
// falls back to the same system serif/sans for every theme and theme
// switching has no visible font effect.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: ["400"],
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
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${bricolage.variable} ${geistMono.variable} ${lora.variable} ${playfair.variable} ${inter.variable} ${archivoBlack.variable} h-full antialiased scroll-smooth`}
    >
      <body className="min-h-full flex flex-col" style={{ backgroundColor: "#F1EFE3" }} suppressHydrationWarning>
        <NextTopLoader color="#1a1a1a" showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
