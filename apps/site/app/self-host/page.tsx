import type { Metadata } from 'next';
import { CodeBlock } from '../../components/code-block';
import { LegalSections, type LegalSection } from '../../components/legal/legal-sections';
import { LegalShell } from '../../components/legal/legal-shell';
import { ArchitectureDiagram } from '../../components/self-host/architecture-diagram';
import { LEGAL_UPDATED } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Self-host Arvo — installation and configuration guide',
  description:
    'Run Arvo yourself with Docker Compose: requirements, quick start, ports, environment variables, backups, updates, local development, architecture, security and troubleshooting.',
  alternates: { canonical: '/self-host' },
};

const envVars: [string, string, string][] = [
  ['DATABASE_URL', 'postgres://arvo:arvo@localhost:5433/arvo', 'PostgreSQL connection string used by the API and migrations.'],
  ['JWT_SECRET', 'change-me-…', 'Signs access tokens. At least 32 characters; must be changed in production.'],
  ['JWT_ACCESS_TTL_SECONDS', '900', 'Lifetime of an access token, in seconds.'],
  ['REFRESH_TOKEN_TTL_DAYS', '30', 'Lifetime of the refresh-token cookie, in days.'],
  ['CORS_ORIGIN', 'http://localhost:3300', 'The web app URL allowed to call the API.'],
  ['STORAGE_PATH', './storage', 'Directory where uploaded statement files are stored.'],
  ['AI_PROVIDER', 'none', 'One of none, openai, anthropic, gemini or ollama.'],
  ['OPENAI_API_KEY', '(empty)', 'Required when AI_PROVIDER=openai.'],
  ['ANTHROPIC_API_KEY', '(empty)', 'Required when AI_PROVIDER=anthropic.'],
  ['GEMINI_API_KEY', '(empty)', 'Required when AI_PROVIDER=gemini.'],
  ['OLLAMA_BASE_URL', 'http://localhost:11434', 'Ollama server URL when AI_PROVIDER=ollama.'],
  ['NEXT_PUBLIC_API_URL', 'http://localhost:3301', 'API URL the web app calls from the browser. Inlined at build time.'],
  ['NEXT_PUBLIC_APP_URL', 'http://localhost:3300', 'Web app URL the landing site links to. Inlined at build time.'],
];

const sections: LegalSection[] = [
  {
    id: 'requirements',
    title: 'Requirements',
    body: (
      <>
        <p>To run Arvo:</p>
        <ul>
          <li>
            <strong>Docker</strong> with <strong>Docker Compose</strong> (Docker Desktop, or Docker Engine with the compose
            plugin).
          </li>
          <li>About 1 GB of free memory and a few GB of disk for the database, images and uploaded statements.</li>
        </ul>
        <p>To develop Arvo from source:</p>
        <ul>
          <li>
            <strong>Node.js 24</strong> and <strong>pnpm 9</strong>
          </li>
          <li>
            <strong>PostgreSQL</strong>, which you can run with Docker using <code>pnpm db:up</code>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'quick-start',
    title: 'Quick start',
    body: (
      <>
        <p>Clone the repository, create your configuration, set a strong secret, and start the stack.</p>
        <CodeBlock
          code={[
            '# 1. Get the code',
            'git clone <repo-url> arvo && cd arvo',
            '# 2. Create your configuration',
            'cp .env.example .env',
            '# 3. Generate a secret and paste it into JWT_SECRET in .env',
            'openssl rand -base64 48',
            '# 4. Start everything',
            'docker compose up -d',
          ].join('\n')}
        />
        <p>
          Open <a href="http://localhost:3300">http://localhost:3300</a> and create your first account. Database migrations
          run automatically when the API starts.
        </p>
      </>
    ),
  },
  {
    id: 'services',
    title: 'Services and ports',
    body: (
      <>
        <table>
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Port</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Web app</td>
              <td>
                <code>3300</code>
              </td>
              <td>The Arvo interface.</td>
            </tr>
            <tr>
              <td>API</td>
              <td>
                <code>3301</code>
              </td>
              <td>
                REST API, with interactive Swagger docs at <code>http://localhost:3301/docs</code>.
              </td>
            </tr>
            <tr>
              <td>Landing site</td>
              <td>
                <code>3400</code>
              </td>
              <td>This website.</td>
            </tr>
            <tr>
              <td>PostgreSQL</td>
              <td>
                <code>5433</code>
              </td>
              <td>Mapped to the host for local tools. Keep it private.</td>
            </tr>
            <tr>
              <td>Ollama (optional)</td>
              <td>
                <code>11434</code>
              </td>
              <td>Local AI models, started with the ollama profile.</td>
            </tr>
          </tbody>
        </table>
        <p>To also run a local model server with Ollama:</p>
        <CodeBlock code="docker compose --profile ollama up -d" />
        <p>
          Host ports can be changed with <code>WEB_PORT</code>, <code>API_PORT</code>, <code>SITE_PORT</code> and{' '}
          <code>POSTGRES_PORT</code> in <code>.env</code>.
        </p>
      </>
    ),
  },
  {
    id: 'configuration',
    title: 'Configuration',
    body: (
      <>
        <p>
          All settings live in <code>.env</code>. The defaults in <code>.env.example</code> work for a local install; change
          secrets and URLs before exposing Arvo to a network.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col">Example</th>
              <th scope="col">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {envVars.map(([name, example, purpose]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>
                  <code>{example}</code>
                </td>
                <td>{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Cloud AI providers receive the financial data you ask about. <code>AI_PROVIDER=ollama</code> keeps it on your
          machine, and <code>none</code> disables AI features.
        </p>
      </>
    ),
  },
  {
    id: 'backups',
    title: 'Backup and restore',
    body: (
      <>
        <p>Back up the database regularly and keep copies somewhere other than the Arvo server.</p>
        <CodeBlock code={['# Back up', 'docker compose exec postgres pg_dump -U arvo arvo > arvo-backup.sql'].join('\n')} />
        <CodeBlock code={['# Restore into an empty database', 'docker compose exec -T postgres psql -U arvo arvo < arvo-backup.sql'].join('\n')} />
        <p>
          Uploaded statement files live in the storage directory (<code>STORAGE_PATH</code>); back that up too if you want to
          keep the originals.
        </p>
      </>
    ),
  },
  {
    id: 'updating',
    title: 'Updating',
    body: (
      <>
        <p>Back up first, then pull the latest code and rebuild. New migrations run when the API restarts.</p>
        <CodeBlock code="git pull && docker compose up -d --build" />
      </>
    ),
  },
  {
    id: 'development',
    title: 'Local development',
    body: (
      <>
        <CodeBlock
          code={[
            'pnpm install',
            '# Start PostgreSQL in Docker',
            'pnpm db:up',
            'pnpm db:migrate',
            '# Optional: load demo data',
            'pnpm db:seed',
            'pnpm dev',
          ].join('\n')}
        />
        <p>
          The seed creates a demo account: <code>demo@arvo.local</code> with password <code>arvo-demo-password</code>. Use it
          only on your own machine.
        </p>
      </>
    ),
  },
  {
    id: 'architecture',
    title: 'Architecture',
    body: (
      <>
        <ArchitectureDiagram />
        <ul>
          <li>
            <strong>Web app</strong> (Next.js) talks to the <strong>REST API</strong> (NestJS) over HTTP.
          </li>
          <li>
            The <strong>Finance Core</strong> computes analytics deterministically: income, expenses, cash flow, net worth
            and spending. The API and the MCP server both use it, so every client sees the same numbers.
          </li>
          <li>
            Data is stored in <strong>PostgreSQL</strong> through <strong>TypeORM</strong>, with migrations in the database
            package.
          </li>
          <li>
            <strong>Import parsers</strong> turn CSV, XLSX and PDF statements into rows for review.
          </li>
          <li>
            An <strong>AI provider abstraction</strong> lets you switch between OpenAI, Anthropic, Gemini and Ollama without
            changing anything else.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'mcp',
    title: 'Connecting AI clients over MCP',
    body: (
      <>
        <p>
          <strong>Coming soon.</strong> Arvo will expose a Model Context Protocol endpoint on port <code>3302</code> so
          assistants such as Claude, ChatGPT and Gemini can call read-only finance tools like cash flow and spending
          summaries. Access will use <strong>personal access tokens</strong> that you create and revoke in the web app, and
          every tool is scoped to the token&rsquo;s user.
        </p>
        <p>Setup instructions will be added here when the endpoint ships.</p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security notes',
    body: (
      <ul>
        <li>Passwords are hashed with Argon2, and every query is scoped to the signed-in user.</li>
        <li>
          Keep the PostgreSQL port private. Do not expose <code>5433</code> to the internet.
        </li>
        <li>
          When Arvo is reachable from a network, put the web app and API behind <strong>HTTPS</strong> with a reverse proxy
          such as Caddy, nginx or Traefik, and set <code>CORS_ORIGIN</code> and <code>NEXT_PUBLIC_API_URL</code> to the
          public URLs.
        </li>
        <li>
          Use a long random <code>JWT_SECRET</code> and rotate it if it may have leaked. Rotating signs everyone out.
        </li>
        <li>Change the default database password before using Arvo anywhere other than your own machine.</li>
      </ul>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    body: (
      <>
        <h3>The API won&rsquo;t start: &ldquo;JWT_SECRET must be changed from the example value&rdquo;</h3>
        <p>
          In production (<code>NODE_ENV=production</code>) the API refuses the example secret. Generate one with{' '}
          <code>openssl rand -base64 48</code>, put it in <code>.env</code>, and run <code>docker compose up -d</code> again.
          The secret must be at least 32 characters.
        </p>
        <h3>A port is already in use</h3>
        <p>
          Another program is using 3300, 3301, 3400 or 5433. Stop it, or change <code>WEB_PORT</code>, <code>API_PORT</code>,{' '}
          <code>SITE_PORT</code> or <code>POSTGRES_PORT</code> in <code>.env</code> (and update the matching URLs).
        </p>
        <h3>Migrations are pending</h3>
        <p>
          In Docker, restart the API with <code>docker compose restart api</code> so migrations run on start, and check{' '}
          <code>docker compose logs api</code>. In development, run <code>pnpm db:migrate</code>.
        </p>
        <h3>CORS errors in the browser</h3>
        <p>
          The web app&rsquo;s URL must match <code>CORS_ORIGIN</code> exactly, including scheme and port, and{' '}
          <code>NEXT_PUBLIC_API_URL</code> must point at the API as the browser sees it. Rebuild the web image after changing{' '}
          <code>NEXT_PUBLIC_*</code> values, because they are inlined at build time.
        </p>
      </>
    ),
  },
];

export default function SelfHostPage() {
  return (
    <LegalShell
      eyebrow="Self-host"
      title="Run Arvo yourself"
      updated={LEGAL_UPDATED}
      summary="Everything you need to install, configure, back up and update your own Arvo instance."
      toc={sections.map(({ id, title }) => ({ id, title }))}
    >
      <LegalSections sections={sections} />
    </LegalShell>
  );
}
