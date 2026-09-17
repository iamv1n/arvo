# @arvo/site

The public landing page for Arvo. It is a standalone Next.js 16 app, separate from the product app in `apps/web`, and it makes no API calls.

## Develop

```sh
pnpm --filter @arvo/site dev   # http://localhost:3400
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | unset | Base URL of the Arvo web app. When set, "Open Arvo" buttons link to `${NEXT_PUBLIC_APP_URL}/dashboard`. When unset or empty, they open a closed-beta modal asking visitors to email for access. |
| `NEXT_PUBLIC_SHOW_SELF_HOST` | unset | Set to `true` to publish the `/self-host` guide and list it in the sitemap. Otherwise the route returns 404. Nothing links to it yet. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3400` | Public URL of this site. Used for `metadataBase`, canonical links, `/sitemap.xml` and `/robots.txt`. |

These variables are inlined at build time, so set them before `next build`.

## Build and deploy

```sh
NEXT_PUBLIC_APP_URL=https://app.example.com NEXT_PUBLIC_SITE_URL=https://example.com pnpm --filter @arvo/site build
pnpm --filter @arvo/site start   # port 3400
```

The build uses `output: 'standalone'`, so `.next/standalone` can run as its own Node server or container.

On Vercel, import the repo, set the root directory to `apps/site`, and set `NEXT_PUBLIC_APP_URL`. Vercel detects the pnpm workspace and builds `@arvo/ui` from source through `transpilePackages`.

## Pages

| Route | Contents |
| --- | --- |
| `/` | Landing page, including the planning tools section and the roadmap advisor section. |
| `/self-host` | Hidden unless `NEXT_PUBLIC_SHOW_SELF_HOST=true`. Installation, configuration, backups, architecture and troubleshooting. Technical detail lives here, not on the home page. |
| `/privacy`, `/terms`, `/disclaimer` | Legal pages. Contact details and the remaining `[License]` and `[Jurisdiction]` placeholders live in `lib/legal.ts`. |

Figures in the planning tools section are computed by `lib/finance-examples.ts` (EMI, amortization with prepayment, avalanche/snowball payoff, SIP future value), not typed by hand.
