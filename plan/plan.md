# AI Finance OS

## Claude Code Implementation & Engineering Plan

**Version:** 1.0
**Status:** Build Specification
**Project:** AI Finance OS
**Primary Goal:** Build a local-first personal finance platform with a Web UI and first-class MCP server integration for AI clients such as ChatGPT, Claude, Gemini, and other MCP-compatible clients.

---

# 1. Mission

Build an open-source, self-hostable financial intelligence platform.

The system allows a user to:

1. Create financial accounts.
2. Import financial statements.
3. Normalize transactions.
4. Categorize transactions.
5. Track income and expenses.
6. Analyze cash flow.
7. Track net worth.
8. Detect recurring expenses.
9. Run financial scenarios.
10. Ask an AI questions about their finances.
11. Expose their financial data and analytical capabilities through MCP.
12. Run the entire system locally using Docker Compose.

The product must work **without bank APIs**.

The initial data source is user-provided:

* CSV
* XLSX
* PDF
* Manual entries

Bank, broker, Account Aggregator, and other financial integrations are explicitly out of scope for MVP.

---

# 2. Core Product Idea

The product consists of two primary interfaces:

```text
                    AI Finance OS
                         │
              ┌──────────┴──────────┐
              │                     │
           Web UI                  MCP
              │                     │
           Humans              AI Clients
                                  │
                         ┌────────┼────────┐
                         │        │        │
                      ChatGPT   Claude   Gemini
```

The Web UI is for managing financial data.

MCP is for allowing AI systems to interact with that financial data.

Both interfaces must use the same Finance Core.

---

# 3. Non-Negotiable Architecture

The following architecture must be maintained:

```text
Web
 │
 ▼
REST API
 │
 ├───────────────┐
 │               │
 ▼               ▼
Finance Core    MCP Server
 │               │
 └───────┬───────┘
         ▼
    Repository Layer
         │
         ▼
      TypeORM
         │
         ▼
    PostgreSQL
```

MCP must NOT directly query PostgreSQL.

MCP must call application/domain services.

The Web API must also call the same application/domain services.

---

# 4. Technology Stack

## Frontend

* Next.js
* TypeScript
* App Router
* Tailwind CSS
* shadcn/ui
* React Query / TanStack Query where appropriate
* React Hook Form where appropriate

## Backend

* NestJS
* TypeScript
* REST
* OpenAPI / Swagger
* TypeORM
* PostgreSQL

## MCP

* MCP TypeScript SDK
* MCP server implemented as a dedicated application/module
* Business-level tools only

## AI

Provider abstraction supporting:

* OpenAI
* Anthropic
* Google Gemini
* Ollama

The application must not hardcode itself to one LLM provider.

## Validation

* class-validator
* class-transformer
* DTOs

## Authentication

Initial implementation:

* Email/password
* Argon2 password hashing
* Access token
* Refresh token
* Secure session handling

Do not over-engineer authentication in MVP.

## Files

Initial:

* Local filesystem

Future:

* S3-compatible object storage

## Background jobs

Optional during early MVP.

If asynchronous processing becomes necessary:

* Redis
* BullMQ

Do not introduce Redis simply because it exists.

## Testing

* Jest
* Supertest
* Playwright

## Infrastructure

* Docker
* Docker Compose

## Monorepo

* pnpm
* Turborepo

---

# 5. Repository Structure

Create:

```text
finance-os/
│
├── apps/
│   ├── web/
│   ├── api/
│   ├── mcp/
│   └── worker/
│
├── packages/
│   ├── finance-core/
│   ├── database/
│   ├── imports/
│   ├── ai/
│   ├── types/
│   ├── config/
│   └── ui/
│
├── docker/
│
├── docs/
│
├── scripts/
│
├── .github/
│
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

`worker` can initially contain only scaffolding if background jobs are not required.

---

# 6. Package Responsibilities

## `apps/web`

Responsible for:

* Dashboard
* Accounts UI
* Transactions UI
* Import UI
* Analytics UI
* Goals UI
* Scenario UI
* AI Chat UI
* Settings

Must not contain financial calculation logic.

---

## `apps/api`

Responsible for:

* HTTP endpoints
* Authentication
* Request validation
* DTOs
* Authorization
* Calling application services

Controllers should remain thin.

---

## `apps/mcp`

Responsible for:

* MCP transport
* MCP authentication
* Tool definitions
* Tool input validation
* Mapping MCP requests to Finance Core services

MCP tools must not contain financial calculations.

---

## `packages/finance-core`

This is the most important package.

Contains:

* Account logic
* Transaction logic
* Transfer logic
* Categorization
* Rules
* Analytics
* Recurring detection
* Net-worth calculations
* Scenario calculations
* Financial snapshots

This package should have minimal framework coupling.

---

## `packages/database`

Contains:

* TypeORM configuration
* Entities
* Repositories
* Database migrations
* Database utilities

---

## `packages/imports`

Contains:

* CSV parser
* XLSX parser
* PDF parser
* Normalization
* Import validation
* Duplicate detection

---

## `packages/ai`

Contains:

* AI provider interface
* OpenAI provider
* Anthropic provider
* Gemini provider
* Ollama provider
* Prompt definitions
* AI classification
* AI extraction

---

# 7. Database

Use PostgreSQL.

Use TypeORM.

Use migrations from day one.

Never use:

```typescript
synchronize: true
```

for normal development/production environments.

Use:

```text
migration:generate
migration:run
migration:revert
```

---

# 8. Initial Database Entities

Create the following entities.

## User

```text
id
email
password_hash
name
currency
timezone
created_at
updated_at
```

---

## Account

```text
id
user_id
name
type
institution
currency
opening_balance
is_active
created_at
updated_at
```

Types:

```text
BANK
CREDIT_CARD
CASH
BROKER
MUTUAL_FUND
LOAN
OTHER
```

---

## Category

```text
id
user_id nullable
name
parent_id nullable
type
is_system
created_at
updated_at
```

Support hierarchical categories.

Example:

```text
Food
 ├── Restaurants
 ├── Groceries
 └── Delivery
```

---

## Merchant

```text
id
user_id
name
normalized_name
created_at
updated_at
```

---

## Transaction

```text
id
user_id
account_id
date
description
merchant_id nullable
category_id nullable
amount
currency
type
status
source
source_reference nullable
notes nullable
metadata jsonb
created_at
updated_at
```

Types:

```text
INCOME
EXPENSE
TRANSFER
REFUND
FEE
INTEREST
UNKNOWN
```

---

# 9. Transfers

Transfers must not count as expenses.

Example:

```text
HDFC
-₹10,000
   │
   ▼
ICICI
+₹10,000
```

Represent the relationship explicitly.

Potential model:

```text
Transfer
- id
- user_id
- from_transaction_id
- to_transaction_id
- created_at
```

The analytics engine must exclude transfer movements from expense calculations.

---

# 10. Import Entities

Create:

```text
ImportBatch
ImportedTransaction
ImportError
```

## ImportBatch

```text
id
user_id
filename
file_type
file_hash
status
total_rows
processed_rows
created_at
completed_at
```

Statuses:

```text
PENDING
PROCESSING
REVIEW
COMPLETED
FAILED
CANCELLED
```

---

# 11. Import Pipeline

The pipeline must be:

```text
Upload
 ↓
File Detection
 ↓
Parser
 ↓
Raw Extraction
 ↓
Normalization
 ↓
Validation
 ↓
Categorization
 ↓
Duplicate Detection
 ↓
Preview
 ↓
User Confirmation
 ↓
Ledger Commit
```

Do not directly insert extracted data into the financial ledger.

---

# 12. CSV Import

Support:

```text
Date
Description
Amount
Debit
Credit
Currency
```

Allow column mapping.

Example:

```text
Date        → date
Narration   → description
Debit       → debit
Credit      → credit
```

Remember mappings where practical.

---

# 13. XLSX Import

Support:

* XLSX
* Multiple sheets
* Header detection
* Column mapping
* Empty-row handling

The user must preview the detected data before committing.

---

# 14. PDF Import

PDF extraction should support common bank/credit-card statement layouts.

Pipeline:

```text
PDF
 ↓
Text/Table extraction
 ↓
Row detection
 ↓
Transaction parsing
 ↓
Normalization
 ↓
Validation
```

PDF parsing must be modular.

Do not build one parser containing every possible bank format.

Create a provider-independent extraction interface.

---

# 15. Import Preview

Before commit show:

```text
1,284 transactions detected

1,201 valid
61 possible duplicates
22 ambiguous
```

Allow:

* Accept
* Reject
* Edit
* Categorize
* Ignore

Then commit.

---

# 16. Duplicate Detection

Duplicate detection should consider:

```text
user
account
date
amount
normalized description
```

Use a deterministic fingerprint.

Example:

```text
SHA256(
 account_id +
 date +
 amount +
 normalized_description
)
```

Store the fingerprint.

Never silently discard a possible duplicate.

Mark it as:

```text
POSSIBLE_DUPLICATE
```

---

# 17. Categorization Engine

Categorization priority:

```text
User Rule
   ↓
Known Merchant
   ↓
Historical Pattern
   ↓
AI Classification
   ↓
Uncategorized
```

AI must return structured output.

Example:

```json
{
  "category": "Food",
  "subcategory": "Delivery",
  "confidence": 0.96
}
```

Do not allow free-form AI responses to directly modify transactions.

---

# 18. Rules Engine

Users can create rules.

Example:

```text
IF merchant contains "SWIGGY"
THEN category = Food/Delivery
```

Another:

```text
IF merchant contains "NETFLIX"
THEN category = Entertainment
AND recurring = true
```

Rule priority must be deterministic.

---

# 19. Analytics Engine

Implement deterministic functions for:

```text
getIncome()
getExpenses()
getCashflow()
getSpendingByCategory()
getSpendingByMerchant()
getNetWorth()
comparePeriods()
getRecurringExpenses()
```

These functions should be callable independently of HTTP or MCP.

---

# 20. Financial Snapshot

Create one central concept:

```text
FinancialSnapshot
```

Example:

```json
{
  "period": "2026-08",
  "income": 120000,
  "expenses": 78400,
  "investments": 15000,
  "net_cashflow": 26600,
  "account_balance": 240000,
  "recurring_expenses": 42000
}
```

The AI layer should use this structured information.

---

# 21. Net Worth

Basic formula:

```text
Assets - Liabilities = Net Worth
```

Assets:

```text
Cash
Bank balances
Investments
```

Liabilities:

```text
Credit card outstanding
Loans
Other liabilities
```

Do not treat transfers as income or expenses.

---

# 22. Recurring Detection

Identify recurring transactions using:

* Merchant
* Amount similarity
* Frequency
* Date interval

Example:

```text
Netflix
₹649
Monthly
Confidence: 0.98
```

Store:

```text
RecurringTransaction
```

with:

```text
merchant
expected_amount
frequency
last_seen
next_expected
confidence
```

---

# 23. Scenario Engine

The scenario engine must be deterministic.

Example:

```text
Base monthly income:
₹120,000

Base expenses:
₹78,000

Scenario:
+₹10,000 rent
-₹5,000 transport

Result:
new monthly surplus = ₹17,000
```

The LLM should never be responsible for calculating this.

---

# 24. Scenario API

Support:

```text
POST /scenarios
POST /scenarios/:id/run
GET /scenarios/:id
```

Input:

```json
{
  "changes": {
    "rent": 10000,
    "income": 150000
  },
  "duration_months": 12
}
```

Return deterministic results.

---

# 25. AI Architecture

Create:

```typescript
interface AIProvider {
  chat(...);
  classifyTransaction(...);
  extractDocument(...);
}
```

Implement:

```text
OpenAIProvider
AnthropicProvider
GeminiProvider
OllamaProvider
```

AI provider selection should be configurable.

---

# 26. AI Safety Boundary

AI may:

* Interpret
* Categorize
* Summarize
* Explain
* Choose tools
* Generate natural-language responses

AI must not independently:

* Calculate account balances
* Modify financial records without authorization
* Execute arbitrary SQL
* Execute financial transactions
* Invent financial data

---

# 27. MCP Server

MCP is a P0 component.

Implement it alongside the API.

Initial tools:

```text
finance.get_accounts
finance.get_account_balance
finance.get_transactions
finance.search_transactions

finance.get_cashflow
finance.get_spending_summary
finance.get_income_summary
finance.get_net_worth

finance.get_recurring_expenses
finance.compare_periods

finance.get_financial_snapshot

finance.analyze_spending
finance.analyze_cashflow

finance.simulate_purchase
finance.simulate_budget
```

---

# 28. MCP Tool Design

Tools must operate at the business level.

Bad:

```text
database.query
sql.execute
```

Good:

```text
finance.get_cashflow
finance.search_transactions
finance.simulate_purchase
```

MCP tools must call Finance Core services.

---

# 29. MCP User Context

Every MCP request must resolve to a specific user.

Conceptually:

```text
AI Client
   ↓
MCP Authentication
   ↓
User Identity
   ↓
Authorization
   ↓
Finance Service
   ↓
User's Data
```

Never expose another user's data.

Never accept `user_id` from an AI tool as the sole authorization mechanism.

The authenticated identity must determine the user context.

---

# 30. MCP Read/Write Separation

MVP should primarily expose read/analysis operations.

Read:

```text
get_accounts
get_transactions
get_cashflow
get_spending
get_net_worth
analyze_spending
simulate
```

Later write tools:

```text
create_transaction
update_transaction
create_goal
create_rule
```

Write operations require explicit authorization.

---

# 31. Web Application

Create the following pages.

```text
/dashboard

/accounts
/accounts/:id

/transactions

/imports
/imports/:id

/analytics

/recurring

/goals

/scenarios

/ai

/settings
```

---

# 32. Dashboard

Display:

```text
Net Worth
Cash
Income
Expenses
Monthly Surplus
Recurring Expenses
```

Charts:

```text
Income vs Expenses
Spending by Category
Cashflow
Net Worth
```

Avoid overloading the dashboard.

---

# 33. Transactions UI

Features:

* Search
* Date filter
* Account filter
* Category filter
* Merchant filter
* Income/expense filter
* Edit
* Categorize
* Delete
* Bulk categorization

Table:

```text
Date | Merchant | Description | Category | Amount | Account
```

---

# 34. Import UI

Flow:

```text
Upload
 ↓
Detect
 ↓
Preview
 ↓
Review
 ↓
Commit
```

Make import status obvious.

---

# 35. AI Chat UI

Create a simple chat interface.

Example:

```text
Ask about your finances

> Why did I spend more in August?
```

The backend should execute MCP-like tools internally.

The AI response should show supporting information.

Example:

```text
August spending increased by 18%.

Main contributors:
Food       +₹3,200
Shopping   +₹4,100
Travel     +₹2,700
```

---

# 36. AI Answer Provenance

Where practical, expose:

```text
Data used:
127 transactions
2 accounts
Aug 1–31
```

The user should be able to inspect the transactions behind a financial conclusion.

---

# 37. Authentication

Implement:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

Use Argon2.

Never store plaintext passwords.

Use secure token handling.

---

# 38. Authorization

All financial resources must be scoped by authenticated user.

Every repository query must enforce user ownership.

Example conceptual pattern:

```typescript
repository.find({
  where: {
    userId: authenticatedUser.id
  }
});
```

Never trust a user ID supplied from the frontend.

---

# 39. API Standards

Every endpoint should have:

* DTO
* Validation
* Swagger documentation
* Consistent response format
* Proper HTTP status
* Error handling

Example:

```text
GET /transactions
GET /transactions/:id
POST /transactions
PATCH /transactions/:id
DELETE /transactions/:id
```

---

# 40. Error Handling

Use consistent errors.

Example:

```json
{
  "error": {
    "code": "TRANSACTION_NOT_FOUND",
    "message": "Transaction not found"
  }
}
```

Do not expose stack traces in production.

---

# 41. Logging

Use structured logging.

Include:

```text
request_id
user_id
operation
duration
status
error_code
```

Never log:

* Passwords
* Access tokens
* Refresh tokens
* Financial documents
* Full transaction descriptions unnecessarily

---

# 42. Privacy

Financial data is sensitive.

Default behavior:

```text
User
 ↓
Self-hosted server
 ↓
PostgreSQL
 ↓
Local files
```

No mandatory cloud financial-data service.

If a cloud LLM is enabled, clearly indicate that financial information may be sent to the selected provider.

Local LLM support should avoid this.

---

# 43. File Security

Uploaded files must:

* Have size limits
* Have MIME validation
* Have safe filenames
* Be stored outside executable directories
* Be associated with the authenticated user
* Be removable
* Be exportable

Never execute uploaded files.

---

# 44. Docker Compose

MVP:

```yaml
services:

  web:
    ...

  api:
    ...

  mcp:
    ...

  postgres:
    ...

  ollama:
    ...
```

Ollama should be optional.

Do not force users to download a large model just to run the application.

---

# 45. Environment Configuration

Example:

```text
DATABASE_URL=

JWT_SECRET=

AI_PROVIDER=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

OLLAMA_BASE_URL=

STORAGE_PATH=
```

Provide:

```text
.env.example
```

Never commit real secrets.

---

# 46. Development Commands

Provide:

```bash
pnpm install

pnpm dev

pnpm build

pnpm test

pnpm test:e2e

pnpm lint

pnpm typecheck

pnpm db:migrate

pnpm db:generate
```

Docker:

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

---

# 47. Testing Strategy

## Unit Tests

Finance Core must have extensive unit tests.

Test:

```text
Income calculations
Expense calculations
Transfers
Cashflow
Net worth
Category aggregation
Period comparison
Recurring detection
Scenario calculations
Duplicate detection
```

Finance calculations should not depend on the HTTP layer.

---

# 48. Integration Tests

Test:

```text
API → Finance Core → PostgreSQL
```

Test import:

```text
File
 ↓
Parser
 ↓
Normalizer
 ↓
Database
```

---

# 49. MCP Tests

Every MCP tool should have tests.

Example:

```text
Authenticated user
 ↓
finance.get_cashflow
 ↓
Correct user data
```

Also test:

```text
User A cannot access User B
```

---

# 50. E2E Test

Create one complete happy path:

```text
Register
 ↓
Create account
 ↓
Upload CSV
 ↓
Review import
 ↓
Commit
 ↓
View transactions
 ↓
View analytics
 ↓
Ask AI question
 ↓
AI retrieves financial data
```

This flow must remain functional throughout development.

---

# 51. Seed Data

Create development seed data.

Include:

```text
1 user
3 accounts
6 months transactions
Multiple categories
Transfers
Recurring expenses
Unusual transactions
Income
Credit card transactions
```

This makes the dashboard and AI easy to test.

---

# 52. Sample Questions

Use these during development:

```text
How much did I spend last month?

How much did I spend on food?

What was my biggest expense?

Why did my spending increase?

Compare August with July.

What are my recurring expenses?

What is my monthly surplus?

What is my net worth?

Show my largest transactions.

Can I afford a ₹70,000 purchase?

What happens if my rent increases by ₹10,000?
```

The answers must come from real data.

---

# 53. MCP Acceptance Tests

Claude/ChatGPT-style clients should be able to ask:

```text
"What did I spend on food in August?"
```

Expected MCP flow:

```text
AI
 ↓
finance.get_spending_summary
 ↓
Finance Core
 ↓
Postgres
 ↓
Structured result
 ↓
AI response
```

Another:

```text
"Why was August more expensive?"
```

Expected:

```text
get_spending_summary
+
compare_periods
+
top_transactions
```

The AI should compose multiple tools when required.

---

# 54. Financial Calculation Rules

## Expense

```text
EXPENSE transactions
```

## Income

```text
INCOME transactions
```

## Transfer

Excluded from income/expense.

## Refund

Should reduce the associated expense category where possible.

## Credit Card

Do not double count:

```text
Credit Card Purchase
+
Credit Card Payment
```

A payment from bank → credit card is a transfer.

---

# 55. Currency

MVP should support a base currency.

Default:

```text
INR
```

But schema must support currency codes.

Use:

```text
ISO 4217
```

Do not implement live currency conversion in MVP.

---

# 56. Time

Store timestamps in UTC.

Financial transaction dates should preserve the original transaction date and user's timezone.

Be careful around month boundaries.

Analytics must use an explicit timezone.

---

# 57. Performance

MVP targets:

```text
API p95 < 300ms
Normal transaction queries < 200ms
Dashboard API < 500ms
```

Large imports should not block the request indefinitely.

Optimize only after profiling.

---

# 58. Database Indexes

Initial indexes:

```text
transactions(user_id, date)
transactions(user_id, account_id, date)
transactions(user_id, category_id, date)
transactions(user_id, merchant_id, date)
transactions(user_id, fingerprint)
```

Add indexes based on actual query patterns.

Do not blindly index every column.

---

# 59. Search

MVP:

* PostgreSQL `ILIKE`
* Appropriate indexes

Later:

* PostgreSQL full-text search
* Trigram indexes

Do not introduce Elasticsearch.

---

# 60. Observability

Expose:

```text
/health
/ready
/metrics
```

Metrics:

```text
http_requests_total
http_request_duration
imports_total
imports_failed_total
transactions_imported_total
ai_requests_total
ai_request_duration
mcp_tool_calls_total
mcp_tool_duration
```

Use OpenTelemetry where practical.

---

# 61. Backup

Provide database backup instructions.

MVP:

```bash
pg_dump
```

Provide full data export.

Later:

* Automated backups
* S3-compatible backups
* Encrypted backups

---

# 62. Export

Support:

```text
CSV
JSON
XLSX
```

Later:

```text
Full application backup
```

The user must be able to retrieve their financial data.

---

# 63. MVP Scope

## P0

### Infrastructure

* Monorepo
* Docker Compose
* PostgreSQL
* NestJS
* Next.js
* TypeORM
* MCP server

### Finance

* Users
* Accounts
* Categories
* Merchants
* Transactions
* Transfers

### Imports

* CSV
* XLSX
* Basic PDF
* Preview
* Duplicate detection
* Import history

### Analytics

* Income
* Expenses
* Cashflow
* Spending categories
* Monthly comparisons
* Net worth

### AI

* Provider abstraction
* Transaction categorization
* AI chat
* Tool calling

### MCP

* Authentication
* Account tools
* Transaction tools
* Analytics tools
* Scenario tool

### Deployment

* Docker Compose
* Local storage
* `.env.example`
* README

---

# 64. Explicitly Out of MVP

Do NOT build:

```text
Bank APIs
Account Aggregator
Broker APIs
UPI integration
Payment processing
Money transfers
Stock trading
Automatic bill payment
Tax filing
Insurance integration
Mobile application
Kubernetes
Microservices
Kafka
ClickHouse
Elasticsearch
Vector database
Complex agent framework
```

These are future considerations.

---

# 65. Development Phases

## Phase 0 — Foundation

Build:

```text
Monorepo
Docker
Postgres
NestJS
Next.js
TypeORM
Migrations
Environment configuration
CI
```

Acceptance:

```text
docker compose up
```

starts the system successfully.

---

# 66. Phase 1 — Financial Core

Build:

```text
User
Account
Category
Merchant
Transaction
Transfer
```

Implement:

```text
CRUD
ownership
validation
migrations
tests
```

Acceptance:

A user can manually create and manage financial data.

---

# 67. Phase 2 — Import Engine

Build:

```text
CSV
XLSX
PDF
```

Implement:

```text
Parsing
Normalization
Validation
Duplicate detection
Preview
Commit
```

Acceptance:

User can import a real statement without corrupting existing data.

---

# 68. Phase 3 — Analytics

Build:

```text
Cashflow
Spending
Income
Net worth
Period comparison
Recurring detection
```

Acceptance:

Dashboard values exactly match deterministic test fixtures.

---

# 69. Phase 4 — Web Application

Build:

```text
Dashboard
Accounts
Transactions
Imports
Analytics
Recurring
Scenarios
Settings
```

Focus on usability.

Do not spend excessive time on animations.

---

# 70. Phase 5 — MCP

Build:

```text
MCP Server
Authentication
Tool definitions
User context
Read-only tools
Analytics tools
Scenario tools
```

Acceptance:

External MCP client can retrieve the authenticated user's financial data.

---

# 71. Phase 6 — AI

Build:

```text
AI provider abstraction
Transaction categorization
AI chat
Tool calling
Financial explanations
```

Acceptance:

AI answers financial questions using actual Finance Core data.

---

# 72. Phase 7 — Scenario Engine

Build:

```text
Scenario creation
Scenario execution
Scenario comparison
Purchase simulation
Budget simulation
```

Acceptance:

Scenario calculations are deterministic and independently testable.

---

# 72A. Phase 7B — Personal Finance Manager (Spend Reduction & Planning)

Goal: a personal AI finance manager that helps the user **reduce spending** and **plan**.
It has two layers. The deterministic layer works with AI disabled; the AI layer explains results and drafts plans on top of it.

## Deterministic engine (Finance Core)

Build as pure, tested Finance Core services:

```text
Subscriptions & Recurring
  - Detect recurring charges (merchant, amount similarity, interval)
  - Monthly/annual cost, next expected date
  - Flag price increases and possibly unused subscriptions

Spend-Reduction Insights
  - Category spend vs trailing 3-month average
  - Merchant creep (e.g. food delivery +40%)
  - Unusual one-off spikes
  - Avoidable fees and interest
  - Each insight carries an estimated monthly saving and supporting transactions

Budgets
  - Per-category monthly limits
  - Pacing: spent, remaining, % of month elapsed, projected month-end overspend

Goals
  - Target amount + date (e.g. emergency fund ₹2,00,000 by March)
  - Required monthly contribution, on-track status

Planning
  - Affordability check ("Can I afford ₹70,000?") against cash, buffer and goals
  - What-if scenarios ("rent +₹10,000", "halve delivery spend") projected 12 months
```

All results must be reproducible from ledger data and covered by deterministic test fixtures.

## AI advisor layer

```text
User question / weekly briefing
        ↓
AI provider (Anthropic | OpenAI | Gemini | Ollama — configurable)
        ↓
Tool calls → Finance Core insight, budget, goal and scenario services
        ↓
Explanation + suggested plan + provenance ("Data used: 127 transactions, Aug 1–31")
```

Rules:

* All four providers are supported behind the AIProvider abstraction and selected by configuration.
* The AI never calculates figures itself; every number comes from a tool result.
* **Suggest, user approves:** the AI may draft budgets, goals and categorization rules as pending suggestions. Nothing is saved until the user explicitly approves.
* When a cloud provider is enabled, the UI clearly states that financial data is sent to that provider.
* The same tools are exposed through MCP (e.g. `finance.get_savings_opportunities`, `finance.get_budget_status`, `finance.plan_goal`, `finance.simulate_purchase`).

## Web UI

```text
/insights     Savings opportunities, subscriptions, anomalies
/budgets      Category budgets with pacing
/goals        Goals with progress and required contributions
/scenarios    Affordability and what-if planning
/ai           Advisor chat + weekly briefing + pending suggestions to approve
```

## Acceptance

* With AI disabled, the user sees savings opportunities, budget pacing and goal status computed from their data.
* With any configured provider, the user can ask "How can I spend ₹5,000 less per month?" and get a plan whose numbers match the deterministic engine, with supporting transactions.
* AI-drafted budgets, goals or rules appear as pending suggestions, and only an explicit approval persists them.

---

# 73. Phase 8 — Hardening

Focus on:

```text
Security
Authorization
Data isolation
Import edge cases
Performance
Testing
Documentation
Backup
Export
Observability
```

---

# 73A. Expansion Products (Phases 9–14)

New products built on the same ledger, Finance Core and tool layer. Each one is a separate area of the web app with its own nav group. Each exposes read-only MCP tools, and each can be switched off per install.

## Shared principles

* **Numbers from engines, words from AI.** Every figure comes from a tested, deterministic service. The AI explains, compares and drafts; it never computes.
* **Your data first.** Features work from imported statements, tradebooks and holdings. Live market data is optional, pluggable and cached.
* **Suggest, you approve.** Nothing is saved, and no order is placed, without an explicit action by the user.
* **Levels of advice.** Every feature declares its level, and levels 3 and 4 stay behind config flags:

| Level | What it does | Default |
|---|---|---|
| 0 | Analysis of the user's own data (P&L, risk, charges, tax) | on |
| 1 | Education: strategy explainers, payoff diagrams, glossary | on |
| 2 | Simulation: backtests, paper trading, what-ifs | on |
| 3 | Rule-based alerts the user writes ("notify me if…") | on |
| 4 | Personalised buy/sell recommendations, targets, signals | **off** |

* **SEBI compliance.** In India, level 4 needs SEBI Research Analyst (RA) or Investment Adviser (IA) registration. Until an install declares `ADVICE_LEVEL=4` together with registration details, the engine refuses to produce security-specific calls. The UI then shows "educational, not a recommendation" disclaimers. Past performance of backtests is always labelled as such.

---

# 74A. Phase 9 — AI Advisor (finishes Phase 7B)

```text
/advisor   Chat over your data + weekly briefing + pending suggestions inbox
```

* **Providers:** Anthropic, OpenAI, Gemini and Ollama, behind `AIProvider`, selected in Settings. A clear notice appears when a cloud provider is on.
* **Tool access:** the advisor calls the existing tools: highlights, savings, budgets, goals, affordability, what-if, recurring and net worth.
* **Weekly briefing:** a scheduled job that sends email and an in-app card covering what changed, what is pacing over, and one decision to make.
* **Suggestions inbox:**
  * The advisor drafts budgets, goals, categorization rules and scenarios.
  * The user approves, edits or dismisses each one.
  * The audit log keeps the provenance ("Data used: 127 transactions, Aug").
* **Life-event playbooks:** job change, marriage, a baby, buying a home, moving city, and a bonus received. Each is a guided checklist with a plan draft.
* **Money personality:** a quarterly report on spending style (impulse vs planned, weekend skew, subscription creep) with nudges.

---

# 74B. Phase 10 — Wealth & Portfolio

```text
/portfolio   Holdings, allocation, XIRR, goals mapping
```

* **Imports:**
  * CAS statements (CAMS/KFintech PDF) for mutual funds
  * broker holdings CSVs (Zerodha Console, Groww, Upstox, Angel)
  * NPS, EPF passbook, PPF, FD/RD, SGB, gold and real estate (manual entry)
* **Returns:** XIRR per holding, per asset class and overall, plus benchmark comparison (Nifty 50 / Nifty 500 TRI).
* **Allocation:** equity/debt/gold/cash, large/mid/small, sector and AMC concentration, and overlap between funds.
* **Mutual fund health:** expense ratio drag, regular vs direct plan cost ("you pay ₹X/yr more"), exit load windows.
* **Rebalancing calculator:** the target allocation and the minimum trades to reach it. Education level; tax impact is shown.
* **Tax view:**
  * LTCG/STCG realised this year, and harvesting room under the LTCG exemption
  * ELSS lock-ins
  * indexation where it still applies
* **Goal mapping:** assign holdings to goals, then project the probability of reaching each goal (Monte Carlo, seeded and reproducible).

---

# 74C. Phase 11 — Trading Journal

```text
/trading/journal   Every trade, grouped into positions, with P&L after all costs
```

* **Imports:** tradebook and P&L CSVs from Zerodha, Upstox, Groww, Angel One, Dhan and Fyers; contract notes (PDF).
* **Instruments and styles:**
  * instruments: equity delivery, intraday, futures, options (index and stock), commodities (MCX), currency
  * styles: intraday, BTST, swing, positional
* **Position reconstruction:** FIFO matching, partial exits, rollovers, and expiry/assignment for options.
* **Real P&L:**
  * charges: brokerage, STT, exchange txn, SEBI fee, stamp duty, GST, DP charges
  * "gross vs net" breakdown
  * charges as a % of gross profit
* **Metrics:**
  * win rate, average win/loss, expectancy, profit factor
  * max drawdown, longest losing streak
  * R-multiples (if a stop is recorded)
  * holding time distribution
  * time-of-day and day-of-week edge
  * performance by setup tag
* **Behaviour analytics:**
  * over-trading days, revenge trades (a new trade within N minutes of a loss)
  * size creep after wins, and averaging down on losers
  * expiry-day gambling ratio
* **Journal:** per-trade notes, screenshots (local storage), setup tags, emotions and a mistakes checklist, plus a weekly review template.
* **F&O reality check:** yearly net F&O P&L vs what the same capital would have earned in an index fund or FD. Shown neutrally.
* **Tax:**
  * speculative (intraday) vs non-speculative business income (F&O) vs capital gains (delivery)
  * turnover calculation for tax audit thresholds
  * an ITR-3 helper export

---

# 74D. Phase 12 — Strategy Lab (Education + Simulation)

```text
/trading/lab   Payoffs, backtests and paper trading — never live orders
```

* **Options payoff builder:**
  * multi-leg strategies (straddle, strangle, iron condor, butterflies, spreads, calendars)
  * P&L at expiry and before expiry (Black-Scholes)
  * breakevens, max profit/loss, margin estimate
  * Greeks: delta, gamma, theta, vega
  * IV scenarios
* **Futures calculator:** lot sizes, margin, MTM, rollover cost, and basis.
* **Position sizing and risk:** fixed-fractional and fixed-risk sizing, risk of ruin, and a Kelly (fractional) explainer.
* **Backtester:**
  * rules DSL or form (indicators: SMA/EMA, RSI, MACD, VWAP, ATR, Supertrend, breakouts)
  * entry/exit/stop/target, intraday session handling
  * slippage and full Indian charges model
  * results: equity curve, drawdown, trade list, walk-forward split, and an overfitting warning
* **Data:** historical OHLC imports (CSV) at first. Later, optional providers (broker APIs, NSE bhavcopy) behind a `MarketData` port, cached locally.
* **Paper trading:** virtual capital, the same rules or manual trades, forward-tested against live or delayed prices. It feeds the Trading Journal as "paper".
* **Strategy library:** explainers with worked examples, risks and "when it fails" sections, labelled as educational.

---

# 74E. Phase 13 — Markets & Alerts

```text
/markets   Watchlists, calendars and user-defined alerts
```

* **Watchlists:** delayed quotes via a pluggable provider, 52-week range, and your average cost when you hold the stock.
* **Calendars:**
  * corporate actions for holdings (dividends, splits, bonus, results dates)
  * F&O expiry calendar
  * IPO calendar
* **User-written alerts (level 3):**
  * a price crossing a level
  * a portfolio drawdown above X%
  * a SIP not debited
  * an option position's delta beyond a limit
  * daily loss limit hit (from journal imports)
* **Delivery:** email, web push, and optional Telegram.
* **Risk guardrails for traders:** a personal max loss per day or week and a max trades per day. When one is breached Arvo shows a "cool-off" banner and sends an email. It is informational only.
* **News digest (optional AI):** a summary of news only for holdings and watchlist, with sources linked, and no opinions on direction.

---

# 74F. Phase 14 — More Everyday Money Products

* **Credit cards:**
  * statement imports per card, reward points value, lounge/fee waivers tracking
  * utilisation %, due-date reminders
  * a "best card for this spend" suggestion from your own cards' reward rules
* **Loans & EMIs:**
  * a loan book (home, car, personal, education, BNPL)
  * an amortization schedule reconciled against actual EMIs
  * prepayment vs invest comparison
  * a balance-transfer calculator
* **Taxes (India):**
  * old vs new regime comparison from actual income and deductions
  * 80C/80D/HRA tracking from categorized transactions
  * advance tax reminders, Form 26AS/AIS reconciliation (imported)
* **Insurance:** a policy vault (term, health, vehicle), premium calendar, cover-adequacy check (term cover vs income × years, health cover vs city).
* **Bills & subscriptions:** cancel/pause guidance, renewal reminders, and a shared-subscription splitter.
* **Shared money:**
  * household mode with partners and family, per-member views
  * split expenses and settle-up (Splitwise-style) from imported transactions
* **Net worth over time:** snapshots, milestones, and an "FI number" (financial independence) tracker with years-to-FI.
* **Document vault:** encrypted local storage for statements, contract notes, policies and tax proofs, linked to transactions.
* **Receipts OCR:** snap a receipt, match it to a transaction and split it into line items (local OCR by default).
* **Exports and accountants:** a year-end pack (P&L, capital gains, charges, 26AS match) as PDF, XLSX or CSV, plus read-only share links for a CA.

---

## Suggested order

1. Phase 9, AI Advisor. It reuses everything already built.
2. Phase 11, Trading Journal. It needs only imports and analysis, is high value and low risk.
3. Phase 10, Wealth & Portfolio.
4. Phase 12, Strategy Lab: payoff builder first, then the backtester.
5. Phase 13, Markets & Alerts, which needs a market data provider decision.
6. Phase 14, picked item by item based on usage.

## Acceptance (applies to every expansion phase)

* Engines are deterministic with fixture tests; money is exact and charges models are tested against real contract notes.
* All data is user-scoped with isolation tests. MCP tools for each area are read-only.
* Advice level is declared per feature and enforced server-side; level 4 cannot be enabled without configuration.
* Each area can be disabled per install and degrades cleanly with no market data provider.

---

# 74. Claude Code Working Rules

Claude Code must follow these rules while implementing the project.

## Rule 1

Do not rewrite working architecture without a concrete reason.

## Rule 2

Do not introduce dependencies without justification.

## Rule 3

Do not add infrastructure prematurely.

## Rule 4

Financial calculations must be deterministic.

## Rule 5

Never allow LLM output to directly modify financial data without validation.

## Rule 6

Never allow MCP to bypass Finance Core.

## Rule 7

Never allow MCP to execute arbitrary SQL.

## Rule 8

Every financial record must belong to an authenticated user.

## Rule 9

Use TypeORM migrations.

## Rule 10

Write tests for financial calculations.

## Rule 11

Prefer PostgreSQL features over introducing another database.

## Rule 12

Keep modules cohesive.

## Rule 13

Do not create microservices unless there is a demonstrated requirement.

## Rule 14

Do not implement bank integrations during MVP.

## Rule 15

Keep the application self-hostable.

---

# 75. Definition of Done

The project is considered MVP-complete when:

```text
docker compose up
```

starts:

```text
Web
API
MCP
Postgres
```

A user can:

```text
Register
 ↓
Create account
 ↓
Import statement
 ↓
Review transactions
 ↓
Commit
 ↓
Categorize
 ↓
View analytics
 ↓
Ask AI
 ↓
AI calls Finance tools
 ↓
Receive accurate answer
```

And an external MCP client can securely ask:

```text
"What did I spend last month?"

"How much did I spend on food?"

"What is my cashflow?"

"What are my recurring expenses?"

"Can I afford a ₹70k purchase?"
```

with results based on the user's actual financial data.

---

# 76. Long-Term Architecture

The MVP should leave room for:

```text
                         AI Finance OS
                              │
               ┌──────────────┼──────────────┐
               │              │              │
              Web           Mobile           MCP
               │              │              │
               └──────────────┼──────────────┘
                              │
                       Finance Core
                              │
             ┌────────────────┼────────────────┐
             │                │                │
          Postgres         Importers       Integrations
             │                                 │
             │                         ┌───────┼────────┐
             │                         │       │        │
             │                       Banks  Brokers   Email
             │
             └─────────────────────────────────────────
```

The core should remain independent of those future integrations.

---

# 77. Final Engineering Philosophy

Build the project in this order:

```text
                    ┌──────────────┐
                    │ PostgreSQL   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ Finance Core │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
             API         Import        MCP
              │                         │
              ▼                         ▼
             Web                    AI Clients
```

The **Finance Core is the product**.

The Web UI is one interface.

MCP is another interface.

AI is an intelligent consumer of the Finance Core.

PostgreSQL is the source of truth.

LLMs explain and reason over deterministic financial data.

The architecture should remain simple enough that a developer can clone the repository, run Docker Compose, import a statement, and have a functioning private AI finance system within minutes.
