/** Base URL of the Arvo web app that the site's CTAs link to. */
export const APP_URL: string | null = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || null;

/** False when no app URL was configured at build time; app CTAs then open the closed-beta modal. */
export const IS_APP_AVAILABLE = !!APP_URL;

/** Canonical public URL of this site, used for the sitemap, robots.txt and metadata. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3400').replace(/\/$/, '');
