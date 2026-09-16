import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/config';
import { LEGAL_UPDATED } from '../lib/legal';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    ...(process.env.NEXT_PUBLIC_SHOW_SELF_HOST === 'true'
      ? [{ url: `${SITE_URL}/self-host`, changeFrequency: 'monthly' as const, priority: 0.8 }]
      : []),
    { url: `${SITE_URL}/privacy`, lastModified: LEGAL_UPDATED, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: LEGAL_UPDATED, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/disclaimer`, lastModified: LEGAL_UPDATED, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
