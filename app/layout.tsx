import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Script from 'next/script';
import { PRODUCT_IDENTITY, resolvePublicSiteUrl } from '../lib/brand/identity';
import { ThemeProvider } from './components/theme/ThemeProvider';
import './globals.css';

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
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const publicSiteUrl = resolvePublicSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: `${PRODUCT_IDENTITY.name} — Rekaman Jadi Materi Belajar`,
  description: PRODUCT_IDENTITY.description,
  keywords: ['AI summarizer', 'transkripsi kuliah', 'AI notes', 'materi belajar', 'meeting recorder', 'notulen rapat AI'],
  authors: [{ name: 'Henry' }],
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: `${PRODUCT_IDENTITY.name} — Rekaman Jadi Materi Belajar`,
    description: PRODUCT_IDENTITY.description,
    url: publicSiteUrl,
    siteName: PRODUCT_IDENTITY.name,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${PRODUCT_IDENTITY.name} — ruang belajar dari rekaman`,
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PRODUCT_IDENTITY.name} — Rekaman Jadi Materi Belajar`,
    description: PRODUCT_IDENTITY.description,
    images: ['/og-image.png'],
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
