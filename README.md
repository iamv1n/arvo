# Arvo

A local-first, self-hostable personal finance OS. Import your bank and card statements, understand where your money goes, and let AI clients ask questions about your finances through MCP. Your data stays in your own PostgreSQL.

- **No bank APIs required.** Bring CSV, XLSX or PDF statements.
- **Review before anything is saved.** Imports are staged, duplicates are flagged, and nothing reaches the ledger until you commit.
- **Deterministic numbers.** Balances, cash flow and analytics are computed exactly by the Finance Core; AI explains them but never calculates them.

> Status: early development. See [`plan/plan.md`](plan/plan.md) for the full roadmap.

## What works today

| Area | Features |
| --- | --- |
| Accounts | Bank, credit card, cash, broker, mutual fund and loan accounts; balances; net worth |
| Transactions | Create, edit, delete, search, filter, bulk categorize; merchants; categories with hierarchy |
| Transfers | Linked transfer pairs that never count as income or spending |
| Imports | CSV, XLSX and PDF; header and column detection; remembered mappings; duplicate detection; review and commit |
| Categorization | User rules → known merchants → history |
| Analytics | Income, expenses, cash flow, savings rate, spending by category, monthly trend |
| Web app | Dashboard, accounts, transactions, transfers, imports, settings; light and dark themes |
| Landing site | Independent Next.js app in `apps/site` |
| MCP server | Read-only finance tools for Claude, ChatGPT and other MCP clients, authenticated with personal access tokens |

Coming next: scenarios and planning, the AI advisor, and a personal finance manager for spend reduction.

## Quick start with Docker

Requirements: Docker with Compose.

```bash
git clone <repo-url> arvo && cd arvo
cp .env.example .env
# Set a real secret; the API refuses to start in production with the example value.
sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|" .env
docker compose up -d
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:3300 |
| API + Swagger docs | http://localhost:3301/docs |
| MCP server | http://localhost:3302/mcp |
| Landing site | http://localhost:3400 |

The API applies database migrations on startup. Uploaded statements are stored in the `statement-files` volume.

Optional local LLM (large download): `docker compose --profile ollama up -d`.

```bash
docker compose logs -f        # follow logs
docker compose down           # stop (data volumes are kept)
```

## Local development

Requirements: Node.js 24, pnpm 9, Docker (for PostgreSQL).

```bash
pnpm install
cp .env.example .env
pnpm db:up          # PostgreSQL on localhost:5433
pnpm db:migrate
pnpm db:seed        # optional demo data: demo@arvo.local / arvo-demo-password
pnpm dev            # api :3301, web :3300, site :3400
```

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run all apps with hot reload |
| `pnpm build` | Build every package and app |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | Unit tests (Finance Core, import parsers) |
| `pnpm test:e2e` | API integration tests against PostgreSQL (`TEST_DATABASE_URL`, recreated each run) |
| `pnpm test:browser` | Playwright tests against a running web app and API |
| `pnpm db:migrate` / `pnpm db:revert` | Apply or revert migrations |
| `pnpm db:generate <Name>` | Generate a migration from entity changes |
| `pnpm db:seed` | Reset the demo user with 6 months of sample data |

## Connecting AI assistants (MCP)

1. In the web app, open **Settings → Connect AI assistants** and create a token (read-only; shown once).
2. Add Arvo to your MCP client:

```bash
# Claude Code
claude mcp add --transport http arvo http://localhost:3302/mcp --header "Authorization: Bearer arvo_pat_…"
```

```json
{ "mcpServers": { "arvo": { "type": "http", "url": "http://localhost:3302/mcp", "headers": { "Authorization": "Bearer arvo_pat_…" } } } }
```

Or run it locally over stdio: `ARVO_TOKEN=arvo_pat_… DATABASE_URL=… node apps/mcp/dist/main.js --stdio`.

Tools: `finance_get_accounts`, `finance_get_account_balance`, `finance_get_transactions`, `finance_search_transactions`, `finance_get_cashflow`, `finance_get_spending_summary`, `finance_get_income_summary`, `finance_get_net_worth`, `finance_get_recurring_expenses`, `finance_compare_periods`, `finance_get_financial_snapshot`, `finance_analyze_spending`, `finance_analyze_cashflow`. Every call is scoped to the token's user; tools are read-only and return computed results with provenance. Tool names use underscores because several LLM APIs reject dots.

## Architecture

```text
apps/web ─┐                          ┌─ apps/mcp (MCP server)
          ▼                          ▼
      apps/api ──────────► packages/finance-core ◄── packages/imports (parsers)
                                     │
                              packages/database (TypeORM repositories)
                                     │
                                 PostgreSQL
```

| Package | Responsibility |
| --- | --- |
| `packages/finance-core` | Domain rules and services: ledger, transfers, analytics, imports, rules. No framework dependencies; exact decimal money |
| `packages/database` | TypeORM entities, migrations, repositories implementing Finance Core ports |
| `packages/imports` | File detection, CSV/XLSX/PDF extraction, column mapping, normalization |
| `packages/finance-tools` | Business-level tool definitions (zod schemas + handlers over Finance Core) shared by MCP and the AI advisor |
| `packages/types` | Shared enums and wire types |
| `packages/ui` | Design tokens and theme bindings for antd and styled-components |
| `apps/api` | NestJS REST API: auth, validation, OpenAPI, thin controllers |
| `apps/mcp` | MCP server (Streamable HTTP and stdio) exposing the finance tools |
| `apps/web` | Next.js app |
| `apps/site` | Public landing page, deployable on its own |

Every financial query is scoped to the authenticated user; identity never comes from request bodies.

## Configuration

See [`.env.example`](.env.example). Key settings:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET` | Access token signing secret (at least 32 characters) |
| `STORAGE_PATH` | Where uploaded statements are stored |
| `AI_PROVIDER` | `none`, `openai`, `anthropic`, `gemini` or `ollama`. Cloud providers receive the financial data you ask about; Ollama keeps it local |
| `NEXT_PUBLIC_API_URL` | API URL used by the browser (build time) |
| `NEXT_PUBLIC_APP_URL` | App URL linked from the landing site (build time) |

## Backup

```bash
docker compose exec postgres pg_dump -U arvo arvo > arvo-backup-$(date +%F).sql
# Restore into an empty database:
docker compose exec -T postgres psql -U arvo arvo < arvo-backup-YYYY-MM-DD.sql
```

Back up the `statement-files` volume too if you want to keep original statements.
