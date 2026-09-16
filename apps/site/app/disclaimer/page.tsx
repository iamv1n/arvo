import type { Metadata } from 'next';
import { LegalSections, type LegalSection } from '../../components/legal/legal-sections';
import { LegalShell } from '../../components/legal/legal-shell';
import { LEGAL_UPDATED, OPERATOR } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Financial Disclaimer — Arvo',
  description:
    'Arvo provides information and tools, not financial advice. Examples and calculators are illustrative, returns are not guaranteed, and you remain responsible for your decisions.',
  alternates: { canonical: '/disclaimer' },
};

const sections: LegalSection[] = [
  {
    id: 'informational',
    title: 'Educational and informational only',
    body: (
      <p>
        Arvo, its AI features and this website provide information and tools to help you understand your own finances.
        Nothing here is financial, investment, tax, accounting or legal advice, or a recommendation to buy, sell or hold any
        security, loan, insurance or other financial product.
      </p>
    ),
  },
  {
    id: 'examples',
    title: 'Examples and calculators are illustrative',
    body: (
      <>
        <p>
          Worked examples, such as EMI and prepayment calculations, debt payoff orders, SIP projections, budgets and
          affordability checks, use hypothetical figures and the assumptions stated next to them. They simplify reality:
          they may ignore taxes, fees, charges, inflation, changes in interest rates, lender-specific prepayment rules and
          your personal circumstances.
        </p>
        <p>Your actual results will differ. Use the examples to understand the mechanics, not as a forecast.</p>
      </>
    ),
  },
  {
    id: 'returns',
    title: 'Returns are not guaranteed',
    body: (
      <p>
        Past performance does not indicate future results. Assumed rates of return, such as 10% or 12% a year, are used
        only for illustration. Market-linked investments, including mutual funds and stocks, can lose value, and returns can
        be lower than assumed or negative. Read all scheme-related documents carefully before investing.
      </p>
    ),
  },
  {
    id: 'professional',
    title: 'Consult a qualified professional',
    body: (
      <p>
        Before making investment, borrowing, tax or insurance decisions, consult a SEBI-registered investment adviser, a
        chartered accountant, or another qualified and appropriately licensed professional who can consider your full
        situation.
      </p>
    ),
  },
  {
    id: 'accuracy',
    title: 'No guarantee of accuracy',
    body: (
      <p>
        Arvo parses statements that banks and card issuers format in many different ways. Imported or parsed data may be
        incomplete or wrong, for example because of layout changes, OCR errors in PDFs, duplicates that were not detected
        or categories that were misassigned. Analytics are only as accurate as the data behind them, and AI explanations can
        be mistaken. Always check important figures against your original statements.
      </p>
    ),
  },
  {
    id: 'responsibility',
    title: 'You are responsible for your decisions',
    body: (
      <>
        <p>
          You decide what to do with the information Arvo shows you. Suggestions from the planned advisor are only saved
          when you approve them, and Arvo never moves money on your behalf. The project authors, contributors and any
          operator of a hosted instance are not liable for losses arising from decisions you make using the software.
        </p>
        <p>
          Questions? Email <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. See also the{' '}
          <a href="/terms">Terms of Use</a> and the <a href="/privacy">Privacy Policy</a>.
        </p>
      </>
    ),
  },
];

export default function DisclaimerPage() {
  return (
    <LegalShell
      title="Financial Disclaimer"
      updated={LEGAL_UPDATED}
      summary="Arvo gives you information and tools to understand your money. It does not give financial advice."
      toc={sections.map(({ id, title }) => ({ id, title }))}
    >
      <LegalSections sections={sections} />
    </LegalShell>
  );
}
