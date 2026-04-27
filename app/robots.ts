/**
 * /robots.txt — generated dynamically by Next 14 metadata route.
 *
 * Closed-beta policy: index nothing. The site itself is gated behind
 * magic-link auth; nothing crawlable would be valuable to a search engine
 * yet, and indexing the placeholder landing risks Google snapshotting an
 * empty product.
 *
 * Flip-the-switch path for V1 launch:
 *   - layout.tsx already has metadata.robots = { index: false, follow: false }.
 *     Remove that.
 *   - Below, replace the catch-all disallow with allow: '/' and disallow
 *     the auth/admin paths.
 *
 * Refs:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // Closed beta: disallow everything. Even the landing page is "blank"
        // marketing right now; we don't want it cached as the canonical
        // product description.
        disallow: '/',
      },
    ],
    // sitemap is still emitted (see sitemap.ts) but it advertises only
    // public paths — when we open up indexing, both files flip together.
    sitemap: `${publicEnv.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
