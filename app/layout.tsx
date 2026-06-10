import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden flex flex-col">{children}</body>
    </html>
  );
}
