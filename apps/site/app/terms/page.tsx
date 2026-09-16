import type { Metadata } from 'next';
import { LegalSections, type LegalSection } from '../../components/legal/legal-sections';
import { LegalShell } from '../../components/legal/legal-shell';
import { LEGAL_UPDATED, OPERATOR, SELF_HOSTED_NOTE } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Use — Arvo',
  description:
    'Terms for using Arvo, the open-source, self-hosted personal finance OS: licence, self-hosting responsibilities, AI features, and why Arvo is not financial advice.',
  alternates: { canonical: '/terms' },
};

const sections: LegalSection[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of these terms',
    body: (
      <>
        <p>
          These Terms of Use (&ldquo;Terms&rdquo;) govern your use of the Arvo software, this website and any hosted Arvo
          service operated by <strong>{OPERATOR.name}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo; or the
          &ldquo;operator&rdquo;). By creating an account on, accessing or using a service covered by these Terms, you agree
          to them. If you do not agree, do not use the service.
        </p>
        <p>
          If you use Arvo on behalf of an organization, you confirm that you are authorized to accept these Terms for it.
          You must be at least 18 years old, or the age of legal majority where you live, to use a hosted service.
        </p>
      </>
    ),
  },
  {
    id: 'licence',
    title: 'Open-source software licence',
    body: (
      <>
        <p>
          The Arvo source code is made available under the <strong>{OPERATOR.license}</strong> licence published in the
          project repository. Your rights to use, copy, modify and distribute the software come from that licence. If
          anything in these Terms conflicts with the licence as it applies to the source code, the licence prevails.
        </p>
        <p>
          These Terms add conditions only for the use of a hosted service and this website. They do not restrict rights the
          licence grants you over the code.
        </p>
      </>
    ),
  },
  {
    id: 'self-hosting',
    title: 'Self-hosting responsibilities',
    body: (
      <>
        <p>When you run your own Arvo instance, you are the operator and you are responsible for:</p>
        <ul>
          <li>installing, configuring, updating and securing the software and the infrastructure it runs on;</li>
          <li>protecting secrets such as database passwords, signing keys and AI provider API keys;</li>
          <li>serving the app over HTTPS when it is reachable from a network;</li>
          <li>making and testing backups, and restoring from them when needed;</li>
          <li>
            complying with the laws that apply to you, including data protection laws if other people use your instance;
            and
          </li>
          <li>reviewing the terms of any AI provider or other third-party service you connect.</li>
        </ul>
        <p>The project authors do not operate, monitor or have access to self-hosted instances.</p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and security',
    body: (
      <ul>
        <li>Provide accurate registration information and keep it up to date.</li>
        <li>Choose a strong, unique password and keep your credentials confidential.</li>
        <li>You are responsible for activity under your account, including actions taken by MCP clients you authorize.</li>
        <li>
          Tell the operator promptly at <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> if you suspect
          unauthorized access.
        </li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>upload data you have no right to process, including another person&rsquo;s statements without permission;</li>
          <li>use the service for fraud, money laundering or any other unlawful purpose;</li>
          <li>attempt to access other users&rsquo; data, bypass authentication or probe for vulnerabilities without permission;</li>
          <li>upload malware or files designed to exploit the import pipeline;</li>
          <li>overload the service, scrape it at scale or interfere with other users; or</li>
          <li>use AI features to generate content that is illegal or infringes the rights of others.</li>
        </ul>
        <p>The operator may suspend access that breaches these rules or puts the service or other users at risk.</p>
      </>
    ),
  },
  {
    id: 'your-data',
    title: 'Your content and data ownership',
    body: (
      <>
        <p>
          <strong>You own your data.</strong> Statements, transactions, categories, rules, notes and other content you add
          remain yours. You grant the operator only the limited permission needed to store, process and display that
          content to provide the service to you, including sending it to AI providers you enable.
        </p>
        <p>
          The operator does not claim ownership of your data, does not sell it and does not use it for advertising. How data
          is handled is described in the <a href="/privacy">Privacy Policy</a>. You can delete your data or request an
          export as described there.
        </p>
      </>
    ),
  },
  {
    id: 'ai-features',
    title: 'AI features',
    body: (
      <>
        <p>Arvo can use optional AI features to categorize transactions, answer questions and, in future, draft plans.</p>
        <ul>
          <li>
            <strong>Outputs may be inaccurate.</strong> AI models can misread data, misunderstand questions or produce
            plausible but wrong statements. Check important information against your own records.
          </li>
          <li>
            Arvo computes figures deterministically and uses AI to explain them, but explanations and summaries can still be
            wrong or incomplete.
          </li>
          <li>
            <strong>Suggestions require your approval.</strong> Budgets, goals, rules or other changes drafted by AI are
            presented as suggestions and are not saved until you approve them.
          </li>
          <li>
            <strong>No automated execution.</strong> Arvo does not move money, make payments, place trades or execute any
            financial transaction on your behalf.
          </li>
          <li>Features described on this website as &ldquo;Coming soon&rdquo; or &ldquo;On the roadmap&rdquo; are not yet available and may change.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'not-advice',
    title: 'Not financial, investment, tax or legal advice',
    body: (
      <>
        <p>
          Arvo provides information and tools. Nothing in the software, its AI features, examples, calculators or this
          website is financial, investment, tax, accounting or legal advice, or a recommendation to buy, sell or hold any
          product. Neither the project authors nor the operator are acting as your adviser.
        </p>
        <p>
          Before making financial decisions, consult a SEBI-registered investment adviser, chartered accountant or other
          qualified professional. See the <a href="/disclaimer">Financial Disclaimer</a> for more.
        </p>
      </>
    ),
  },
  {
    id: 'third-parties',
    title: 'Third-party services',
    body: (
      <p>
        You may connect third-party services such as cloud AI providers (for example Anthropic, OpenAI or Google Gemini),
        local model runtimes, or MCP-compatible AI clients. Those services are provided by third parties under their own
        terms and privacy policies. The operator and the project authors are not responsible for their availability,
        accuracy, security or data practices. Using them is your choice, and you can disconnect them at any time.
      </p>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and changes to the service',
    body: (
      <p>
        A hosted service may be unavailable from time to time for maintenance, upgrades or reasons outside the
        operator&rsquo;s control. Features may be added, changed or removed. The operator will try to give reasonable notice
        of changes that materially reduce functionality, but does not promise any particular uptime unless agreed
        separately in writing.
      </p>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <>
        <p>
          The software and any hosted service are provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>
          , without warranties of any kind, whether express, implied or statutory, including warranties of merchantability,
          fitness for a particular purpose, accuracy and non-infringement, to the fullest extent permitted by law.
        </p>
        <p>
          In particular, there is no guarantee that statement parsing, duplicate detection, categorization, analytics or AI
          outputs are complete or error-free.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p>
          To the fullest extent permitted by law, neither the operator nor the project authors and contributors will be
          liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits,
          savings, data or goodwill, arising from your use of or inability to use the software or service, or from
          decisions you make based on it.
        </p>
        <p>
          Where liability cannot be excluded, the operator&rsquo;s total liability for all claims relating to a hosted
          service is limited to the amount you paid for the service in the 12 months before the claim. Nothing in these Terms limits liability that cannot be limited under
          applicable law.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: (
      <p>
        You agree to indemnify and hold harmless the operator from claims, losses and reasonable costs arising from your
        breach of these Terms, your misuse of the service, or content you upload that infringes someone else&rsquo;s rights,
        to the extent permitted by law.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Termination',
    body: (
      <p>
        You may stop using a hosted service and ask for your account to be deleted at any time. The operator may suspend or
        close an account that seriously or repeatedly breaches these Terms, or when required by law, and will where
        practical give notice and a chance to export your data first. Sections that by their nature should survive
        termination, including ownership, disclaimers, limitation of liability and governing law, continue to apply.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Governing law and disputes',
    body: (
      <p>
        These Terms are governed by the laws of <strong>{OPERATOR.jurisdiction}</strong>. Courts located in{' '}
        <strong>{OPERATOR.jurisdiction}</strong> have jurisdiction over disputes, unless the consumer protection laws of
        the place where you live give you the right to bring proceedings there. Before starting formal proceedings, please
        contact the operator so the issue can be resolved informally.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        These Terms may be updated from time to time. The &ldquo;Last updated&rdquo; date shows the current version. For
        material changes to a hosted service, the operator will notify users in the app or by email before the change takes
        effect. Continuing to use the service after that means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        <strong>{OPERATOR.name}</strong>
        <br />
        Email: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Use"
      updated={LEGAL_UPDATED}
      summary="The rules for using Arvo and any hosted Arvo service. In short: you own your data, you stay in control of AI suggestions, and Arvo is a tool for information, not financial advice."
      notice={SELF_HOSTED_NOTE}
      toc={sections.map(({ id, title }) => ({ id, title }))}
    >
      <LegalSections sections={sections} />
    </LegalShell>
  );
}
