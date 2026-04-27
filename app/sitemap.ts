/**
 * /sitemap.xml — generated dynamically by Next 14 metadata route.
 *
 * V0 closed beta: lists only the marketing surfaces (landing, calc) and
 * the public profile pattern is excluded because we don't want to enumerate
 * users. The robots.txt currently disallows everything anyway — this file
 * is here so the wiring exists when we flip indexing on.
 *
 * For V1 launch we'd add public circuits dynamically (a Postgres query
 * scoped to visibility='public'). Skipped for V0 since the public set is
 * tiny and changes rapidly.
 *
 * Refs:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const now = new Date();

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${base}/calc`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${base}/login`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];
}
