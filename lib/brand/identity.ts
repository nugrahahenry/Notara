export const PRODUCT_IDENTITY = Object.freeze({
  name: 'Nalira',
  assistantName: 'Tanya Nalira',
  service: 'nalira-web',
  description: 'Ubah rekaman kuliah menjadi materi belajar yang terstruktur, dapat dicari, dan dipahami kembali.',
  legacyName: 'Notara',
} as const);

export type ProductIdentity = typeof PRODUCT_IDENTITY;

const LEGACY_PUBLIC_SITE_URL = 'https://notara-hengs.vercel.app';

export function resolvePublicSiteUrl(
  configuredUrl: string | null | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  if (!configuredUrl) return LEGACY_PUBLIC_SITE_URL;

  try {
    const url = new URL(configuredUrl);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const hasSafeProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && isLocalhost);

    if (!hasSafeProtocol || url.username || url.password) {
      return LEGACY_PUBLIC_SITE_URL;
    }

    return url.origin;
  } catch {
    return LEGACY_PUBLIC_SITE_URL;
  }
}
