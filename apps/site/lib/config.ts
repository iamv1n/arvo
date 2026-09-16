/** Base URL of the Arvo web app that the site's CTAs link to. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3300').replace(/\/$/, '');

/** Canonical public URL of this site, used for the sitemap, robots.txt and metadata. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3400').replace(/\/$/, '');
