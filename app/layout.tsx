import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import "./globals.css";

const themeInitializationScript = `
  (function () {
    try {
      var preference = localStorage.getItem('notara-theme') || 'system';
      if (preference !== 'light' && preference !== 'dark') preference = 'system';
      var resolved = preference === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : preference;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = resolved;
    } catch (_) {
      document.documentElement.dataset.theme = 'light';
      document.documentElement.dataset.themePreference = 'system';
      document.documentElement.style.colorScheme = 'light';
    }
  })();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Notara — AI-Powered Lecture & Meeting Summarizer",
  description: "Ubah rekaman kuliah dan rapat panjang menjadi rangkuman terstruktur, daftar istilah kunci, dan prediksi soal ujian dalam hitungan detik.",
  keywords: ["AI summarizer", "transkripsi kuliah", "AI notes", "productivity student", "meeting recorder", "notulen rapat AI"],
  authors: [{ name: "Henry & Notara Team" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Notara — Reduksi Audio Kuliah Jadi Rangkuman AI",
    description: "Rekam langsung atau unggah berkas audio besar. Notara memotong audio secara asinkron dan merangkum konsep kunci secara cerdas.",
    url: "https://notara.vercel.app",
    siteName: "Notara",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Notara AI Dashboard",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Notara — Reduksi Audio Kuliah Jadi Rangkuman AI",
    description: "Ubah rekaman kuliah panjang menjadi rangkuman terstruktur dengan Llama 3.3 dan Whisper.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="notara-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
      </head>
      <body className="h-full overflow-hidden flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
