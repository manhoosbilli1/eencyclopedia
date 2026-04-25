/**
 * Root layout. Holds <html>/<body>, font setup, and global CSS.
 * Per Next.js App Router, every route under app/ inherits this layout.
 *
 * Refs:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/layout
 *   https://nextjs.org/docs/app/api-reference/components/font
 */

import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { publicEnv } from '@/lib/env';
import './globals.css';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'eencyclopedia — circuits, fast',
    template: '%s · eencyclopedia',
  },
  description:
    'A reference, search, and AI analysis tool for electronic circuits. Upload .kicad_sch files, ask questions, run trivial calculations. Closed beta.',
  applicationName: 'eencyclopedia',
  authors: [{ name: 'eencyclopedia' }],
  keywords: [
    'electronics',
    'circuits',
    'KiCad',
    'schematic',
    'EE',
    'analog',
    'digital',
    'AI',
    'engineer',
  ],
  openGraph: {
    type: 'website',
    siteName: 'eencyclopedia',
    title: 'eencyclopedia — circuits, fast',
    description:
      'Upload schematics, search circuits, ask an EE-tuned AI. Closed beta.',
    url: publicEnv.NEXT_PUBLIC_SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'eencyclopedia — circuits, fast',
    description:
      'Upload schematics, search circuits, ask an EE-tuned AI. Closed beta.',
  },
  robots: {
    // Closed beta: allow indexing of the landing page only once we open up.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'hsl(0 0% 100%)' },
    { media: '(prefers-color-scheme: dark)', color: 'hsl(222 47% 5%)' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
