import type { Metadata } from 'next';
import { LegalSections, type LegalSection } from '../../components/legal/legal-sections';
import { LegalShell } from '../../components/legal/legal-shell';
import { LEGAL_UPDATED, OPERATOR, SELF_HOSTED_NOTE } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — Arvo',
  description:
    'How Arvo, the self-hosted personal finance OS, processes account, statement and transaction data, how AI providers and MCP clients are involved, and the rights you have.',
  alternates: { canonical: '/privacy' },
};

const sections: LegalSection[] = [
  {
    id: 'scope',
    title: 'Who this policy applies to',
    body: (
      <>
        <p>
          Arvo is open-source software that you install and run yourself. This policy explains how the software handles
          personal data and who is responsible for it. Responsibility depends on how Arvo is being used:
        </p>
        <h3>Self-hosted instances</h3>
        <p>
          When you, your household or your organization run Arvo on your own computer, server or cloud account, the person
          or organization running that instance decides what data is collected and how it is used, and acts as the{' '}
          <strong>data controller</strong> (or &ldquo;data fiduciary&rdquo; under India&rsquo;s Digital Personal Data
          Protection Act, 2023). The authors and contributors of the Arvo project <strong>receive no data</strong> from
          self-hosted instances. The software does not send telemetry, analytics or usage reports to the project.
        </p>
        <h3>Hosted services</h3>
        <p>
          If someone offers Arvo as a hosted service to other people, the operator of that service is the data controller
          for the accounts and data on it and is responsible for honoring this policy. Questions about the Arvo project
          itself can be sent to <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
        </p>
        <h3>This website</h3>
        <p>
          This marketing website describes the software. It does not ask you to create an account, makes no calls to the
          Arvo app, and uses no tracking or advertising cookies.
        </p>
      </>
    ),
  },
  {
    id: 'data',
    title: 'Data the software processes',
    body: (
      <>
        <p>Depending on the features you use, an Arvo instance processes the following categories of data:</p>
        <ul>
          <li>
            <strong>Account and profile data:</strong> your name, email address, a hashed password, preferences such as
            default currency and locale, and session tokens.
          </li>
          <li>
            <strong>Financial data:</strong> accounts you create (bank, card, loan, investment and cash accounts),
            transactions, transfers, balances, categories, merchants, rules, budgets and goals.
          </li>
          <li>
            <strong>Uploaded files:</strong> bank and card statements you import in CSV, XLSX or PDF format, and the rows
            parsed from them during review.
          </li>
          <li>
            <strong>AI conversations:</strong> if you use AI features, the questions you ask and the answers returned.
          </li>
          <li>
            <strong>Technical logs:</strong> application and server logs such as request timestamps, error messages and IP
            addresses, used to operate and troubleshoot the instance.
          </li>
        </ul>
        <p>
          Statements can contain sensitive information, including account numbers, counterparties and spending patterns.
          Arvo does not need, and you should not upload, government identifiers, card CVVs, PINs or online banking
          passwords.
        </p>
      </>
    ),
  },
  {
    id: 'use',
    title: 'How the data is used',
    body: (
      <>
        <p>Data is used only to provide the features of the software to the account that owns it, namely to:</p>
        <ul>
          <li>authenticate you and keep your session secure;</li>
          <li>import, review, de-duplicate and store your statements and transactions;</li>
          <li>categorize transactions using your rules, known merchants, history and, if enabled, an AI provider;</li>
          <li>compute analytics such as cash flow, net worth, spending by category and recurring charges;</li>
          <li>answer questions you ask through AI features or connected MCP clients; and</li>
          <li>diagnose errors and protect the instance against abuse.</li>
        </ul>
        <p>
          The operator&rsquo;s legal basis for this processing is typically your consent and the performance of the service
          you asked for. For a personal self-hosted instance, you are processing your own data.
        </p>
      </>
    ),
  },
  {
    id: 'storage',
    title: 'Where and how data is stored',
    body: (
      <>
        <p>
          Arvo stores structured data in a <strong>PostgreSQL database</strong> and uploaded files in{' '}
          <strong>local file storage</strong>, both configured by whoever runs the instance. With the default Docker Compose
          setup, both live on the same machine as the application. Data does not leave that infrastructure unless you
          enable a feature that sends it elsewhere, as described in the sections on AI providers and MCP clients.
        </p>
        <p>
          The physical location of your data is wherever the instance is hosted. If you use an instance run by someone
          else, ask its operator where it is hosted.
        </p>
      </>
    ),
  },
  {
    id: 'no-selling',
    title: 'No selling, no ads, no tracking',
    body: (
      <ul>
        <li>Arvo does not sell, rent or trade personal data.</li>
        <li>The application contains no advertising and no third-party advertising or analytics trackers.</li>
        <li>Your financial data is not used to profile you for marketing or shared with data brokers.</li>
        <li>
          An operator of a hosted service must not add these practices without updating this policy and, where required,
          obtaining your consent.
        </li>
      </ul>
    ),
  },
  {
    id: 'ai',
    title: 'AI providers',
    body: (
      <>
        <p>
          AI features are <strong>optional</strong>. Arvo computes its numbers deterministically, and the core features work
          without any AI provider. When AI is enabled, the instance can be configured to use one of these providers:
        </p>
        <ul>
          <li>
            <strong>Local models through Ollama.</strong> Prompts and data are processed on hardware controlled by the
            operator and do not leave that infrastructure.
          </li>
          <li>
            <strong>Cloud providers</strong> such as Anthropic, OpenAI or Google Gemini. Cloud AI is opt-in and is disclosed
            in the app when in use.
          </li>
        </ul>
        <p>
          When a cloud provider is enabled and you use an AI feature, your question and the relevant financial data needed
          to answer it (for example computed totals, category summaries or selected transactions) are sent to that
          provider. The provider processes the data under <strong>its own terms and privacy policy</strong>, which may
          include retention for abuse monitoring. Review those terms before enabling a cloud provider. API keys for cloud
          providers are supplied by the operator.
        </p>
        <p>
          AI outputs can be inaccurate. Any budgets, goals or rules drafted by AI features are presented as suggestions and
          are saved only when you approve them.
        </p>
      </>
    ),
  },
  {
    id: 'mcp',
    title: 'MCP clients',
    body: (
      <>
        <p>
          Arvo includes a Model Context Protocol (MCP) server that lets AI clients you choose, such as desktop assistants,
          call tools like spending summaries and cash-flow reports. An MCP client can only access data after you
          authorize it with your own credentials, and its tools are scoped to your account.
        </p>
        <p>
          Data returned to a connected client is then handled by that client and any AI provider behind it, under their
          terms. You can stop sharing at any time by disconnecting the client or signing out its session.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security measures',
    body: (
      <>
        <p>The software is designed with the following safeguards:</p>
        <ul>
          <li>
            Passwords are hashed with <strong>Argon2</strong>; plain-text passwords are never stored.
          </li>
          <li>
            Short-lived access tokens are used for API requests, and refresh tokens are kept in an httpOnly cookie that
            page scripts cannot read.
          </li>
          <li>
            <strong>Per-user data isolation:</strong> every query for financial data is scoped to the authenticated user.
          </li>
          <li>
            <strong>File validation</strong> on uploads, including type and size checks, before a statement is parsed.
          </li>
          <li>Imports go through a review step, and nothing is written to the ledger until you commit it.</li>
        </ul>
        <p>
          No system is perfectly secure. Operators are responsible for the security of their infrastructure, including
          HTTPS, operating-system updates, database access controls, secrets management and backups. If you believe you
          have found a vulnerability, contact <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Retention and deletion',
    body: (
      <>
        <p>Data is kept until you or the operator delete it. You can:</p>
        <ul>
          <li>delete imports and the uploaded statement files associated with them;</li>
          <li>delete individual transactions, accounts, categories and rules; and</li>
          <li>
            ask for your account to be deleted, which removes your profile, financial data and files from the live
            database and storage. Where the app does not yet offer self-service account deletion, the operator performs
            it on request; on your own instance you can do it directly in the database.
          </li>
        </ul>
        <p>
          <strong>Backups are the operator&rsquo;s responsibility.</strong> Deleted data may persist in database backups,
          snapshots or logs until those are rotated according to the operator&rsquo;s backup schedule. Data already sent to a cloud AI provider is retained under that
          provider&rsquo;s policy.
        </p>
      </>
    ),
  },
  {
    id: 'export',
    title: 'Data export',
    body: (
      <p>
        You have the right to a copy of your data in a portable format. Because Arvo stores everything in PostgreSQL, the
        operator can export your records with standard database tools, and your original statement files remain in
        storage until you delete them. Where the app offers in-app export, you can also download your data yourself. On a
        hosted service, request an export from its operator.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: (
      <>
        <p>The Arvo application uses a minimal set of browser storage, all strictly necessary or preference-related:</p>
        <ul>
          <li>
            <strong>Refresh-token cookie:</strong> an httpOnly cookie that keeps you signed in. It is used only for
            authentication.
          </li>
          <li>
            <strong>Local storage:</strong> your light, dark or system theme preference.
          </li>
        </ul>
        <p>
          This marketing website stores only your theme preference in local storage and uses <strong>no tracking cookies</strong>.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Arvo is intended for adults managing their own finances. A hosted service should not knowingly create accounts for
        children under 18, or the age of digital consent in your jurisdiction, without verifiable consent from a parent or
        guardian. If you believe a child&rsquo;s data has been provided without that consent, contact the operator so it can
        be deleted.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'International users and your rights',
    body: (
      <>
        <p>
          Depending on where you live, laws such as the EU and UK General Data Protection Regulation (GDPR), India&rsquo;s
          Digital Personal Data Protection Act, 2023 (DPDP Act) and US state privacy laws such as the California Consumer
          Privacy Act (CCPA) give you rights over your personal data. Subject to applicable law, you can ask the data
          controller to:
        </p>
        <ul>
          <li>
            <strong>Access</strong> the personal data held about you and learn how it is processed;
          </li>
          <li>
            <strong>Correct</strong> inaccurate or incomplete data;
          </li>
          <li>
            <strong>Delete</strong> your data (erasure);
          </li>
          <li>
            <strong>Port</strong> your data in a structured, machine-readable format;
          </li>
          <li>
            <strong>Withdraw consent</strong> at any time, for example by disabling AI features or disconnecting an MCP client,
            without affecting processing that already took place;
          </li>
          <li>object to or restrict certain processing, and not be discriminated against for exercising your rights; and</li>
          <li>
            nominate another person to exercise your rights in the event of death or incapacity, where the DPDP Act allows.
          </li>
        </ul>
        <h3>Grievances</h3>
        <p>
          To raise a request or grievance, email <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. For an instance
          run by someone else, contact that instance&rsquo;s operator, who should respond within the time required by law. If you are not satisfied, you may complain to your data protection authority, such as the
          Data Protection Board of India or your local supervisory authority in the EU or UK.
        </p>
        <p>
          On a self-hosted instance you run for yourself, you can exercise these rights directly using the app and your
          database.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        This policy may be updated as the software or the law changes. The &ldquo;Last updated&rdquo; date at the top shows
        when it last changed. For material changes, a hosted service operator should notify users in the app or by email
        before the change takes effect.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <>
        <p>Questions or requests about this policy or your data can be sent to:</p>
        <p>
          <strong>{OPERATOR.name}</strong>
          <br />
          Email: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        </p>
        <p>
          See also the <a href="/terms">Terms of Use</a> and the <a href="/disclaimer">Financial Disclaimer</a>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated={LEGAL_UPDATED}
      summary="Arvo is built so your financial data stays with you. This policy explains what the software processes, where it is stored, when it is shared with AI providers or MCP clients you enable, and the rights you have."
      notice={SELF_HOSTED_NOTE}
      toc={sections.map(({ id, title }) => ({ id, title }))}
    >
      <LegalSections sections={sections} />
    </LegalShell>
  );
}
