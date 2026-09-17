'use client';

import { CloseOutlined, MenuOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { OpenAppLink } from '../beta-access';
import { CONTACT_EMAIL } from '../../lib/legal';
import { ThemeToggle } from '../theme-toggle';
import { AdvisorSection } from './advisor';
import { Features } from './features';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { McpSection, PrivacySection } from './mcp-privacy';
import { Body, Container, fonts, Reveal, SectionHeading, SectionShell } from './primitives';
import { PlanningToolsSection } from './planning-tools';

export const LandingGlobals = createGlobalStyle`
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    [data-landing] *, [data-landing] *::before, [data-landing] *::after {
      animation-duration: 1ms !important;
      animation-delay: 0ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }
  }
`;

export const Root = styled.div`
  min-height: 100dvh;
  background: ${({ theme }) => theme.colors.bgCanvas};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow-x: clip;
`;

export const SkipLink = styled.a`
  position: absolute;
  left: -9999px;
  &:focus {
    left: 16px;
    top: 12px;
    z-index: 100;
    padding: 8px 12px;
    background: ${({ theme }) => theme.colors.bgSurface};
    color: ${({ theme }) => theme.colors.textPrimary};
    border-radius: ${({ theme }) => theme.radii.md}px;
  }
`;

/* ---------- Masthead ---------- */

const Header = styled.header<{ $compact: boolean }>`
  position: sticky;
  top: 0;
  z-index: 50;
  background: ${({ theme }) => theme.colors.bgCanvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.textPrimary};
  transition: box-shadow ${({ theme }) => theme.motion.normal};
  box-shadow: ${({ $compact, theme }) => ($compact ? `0 1px 0 ${theme.colors.border}` : 'none')};
`;

const Bar = styled(Container)<{ $compact: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[6]}px;
  height: ${({ $compact }) => ($compact ? 56 : 72)}px;
  transition: height ${({ theme }) => theme.motion.normal} ${({ theme }) => theme.motion.easing};
`;

const Wordmark = styled.a`
  display: inline-flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
  text-decoration: none;
  & strong {
    font-family: ${fonts.serif};
    font-weight: 600;
    font-size: 30px;
    line-height: 1;
    letter-spacing: -0.03em;
    font-variation-settings: 'opsz' 144;
  }
  & span {
    display: none;
    padding-left: 14px;
    border-left: 1px solid ${({ theme }) => theme.colors.border};
    font-family: ${fonts.serif};
    font-style: italic;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.textSecondary};
    white-space: nowrap;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    & span {
      display: inline;
    }
  }
`;

const underline = `
  position: relative;
  text-decoration: none;
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -3px;
    height: 1px;
    background: currentColor;
    transform: scaleX(0);
    transform-origin: right;
    transition: transform 240ms cubic-bezier(0.2, 0, 0, 1);
  }
  &:hover::after,
  &:focus-visible::after {
    transform: scaleX(1);
    transform-origin: left;
  }
`;

const NavLinks = styled.ul`
  display: none;
  list-style: none;
  margin: 0 0 0 auto;
  padding: 0;
  gap: ${({ theme }) => theme.space[6]}px;
  & a {
    ${underline}
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: 14px;
  }
  & a:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.xl}px) {
    display: flex;
  }
`;

const NavRight = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.xl}px) {
    margin-left: ${({ theme }) => theme.space[6]}px;
  }
`;

const AppLink = styled.span`
  display: none;
  & a {
    ${underline}
    font-weight: 600;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.brandText};
    white-space: nowrap;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.sm}px) {
    display: inline;
  }
`;

const MenuButton = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  min-width: 44px;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 4px;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.xl}px) {
    display: none;
  }
`;

const Sheet = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  overscroll-behavior: contain;
  background: ${({ theme }) => theme.colors.bgCanvas};
  color: ${({ theme }) => theme.colors.textPrimary};
  & .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
    padding: 0 ${({ theme }) => theme.space[4]}px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.textPrimary};
  }
  & ol {
    list-style: none;
    margin: 0;
    padding: ${({ theme }) => theme.space[6]}px ${({ theme }) => theme.space[4]}px;
    overflow-y: auto;
  }
  & li {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
  & ol a {
    display: flex;
    align-items: baseline;
    gap: 16px;
    min-height: 56px;
    padding: 12px 0;
    font-family: ${fonts.serif};
    font-size: 30px;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: none;
  }
  & ol a small {
    font-family: ${fonts.mono};
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & .foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[4]}px;
    border-top: 1px solid ${({ theme }) => theme.colors.border};
  }
  & .foot a {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const navItems: { href: string; label: string }[] = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#planning-tools', label: 'Planning' },
  { href: '#advisor', label: 'Advisor' },
  { href: '#mcp', label: 'MCP' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * Editorial masthead. On the home page anchors are in-page (`#features`); other routes pass
 * `base="/"` so the same links navigate back to the home page sections.
 */
export function Nav({ base = '' }: { base?: string }) {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    menuRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      // Keep Tab and Shift+Tab cycling inside the open sheet.
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sheetRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !sheetRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <Header $compact={compact}>
      <Bar as="nav" aria-label="Primary" $compact={compact}>
        <Wordmark href={base ? '/' : '#top'} aria-label="Arvo home">
          <strong>Arvo</strong>
          <span>Personal finance, on your own machine</span>
        </Wordmark>
        <NavLinks>
          {navItems.map((item) => (
            <li key={item.href}>
              <a href={`${base}${item.href}`}>{item.label}</a>
            </li>
          ))}
        </NavLinks>
        <NavRight>
          <ThemeToggle />
          <AppLink>
            <OpenAppLink>Open Arvo →</OpenAppLink>
          </AppLink>
          <MenuButton ref={menuRef} type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(true)}>
            <MenuOutlined aria-hidden /> Menu
          </MenuButton>
        </NavRight>
      </Bar>
      {open ? (
        <Sheet ref={sheetRef} id="site-menu" role="dialog" aria-modal="true" aria-label="Site menu">
          <div className="top">
            <Wordmark href={base ? '/' : '#top'} onClick={() => setOpen(false)}>
              <strong>Arvo</strong>
            </Wordmark>
            <MenuButton ref={closeRef} type="button" onClick={close}>
              <CloseOutlined aria-hidden /> Close
            </MenuButton>
          </div>
          <ol>
            {navItems.map((item, i) => (
              <li key={item.href}>
                <a href={`${base}${item.href}`} onClick={() => setOpen(false)}>
                  <small>{String(i + 1).padStart(2, '0')}</small>
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
          <div className="foot" onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('a')) setOpen(false);
            }}>
            <OpenAppLink>Open Arvo →</OpenAppLink>
            <ThemeToggle />
          </div>
        </Sheet>
      ) : null}
    </Header>
  );
}

/* ---------- Privacy statement band ---------- */

const Band = styled.section`
  background: ${({ theme }) => (theme.mode === 'dark' ? theme.colors.bgSurfaceRaised : theme.colors.textPrimary)};
  color: ${({ theme }) => (theme.mode === 'dark' ? theme.colors.textPrimary : theme.colors.bgCanvas)};
  padding: ${({ theme }) => theme.space[16]}px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding: 96px 0;
  }
`;

const BandGrid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[8]}px;
  align-items: end;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
    gap: ${({ theme }) => theme.space[16]}px;
  }
  & .figure {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 400;
    font-size: clamp(88px, 17vw, 220px);
    line-height: 0.85;
    letter-spacing: -0.05em;
    font-variation-settings: 'opsz' 144;
  }
  & h2 {
    margin: 16px 0 0;
    font-family: ${fonts.serif};
    font-weight: 400;
    font-style: italic;
    font-size: clamp(24px, 3vw, 36px);
    line-height: 1.15;
    letter-spacing: -0.015em;
  }
  & p {
    margin: 0;
    font-size: 17px;
    line-height: 1.65;
    opacity: 0.8;
  }
  & .mono {
    display: block;
    margin-top: 20px;
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
  }
`;

function PrivacyBand() {
  return (
    <Band aria-labelledby="band-title">
      <Container>
        <Reveal>
          <BandGrid>
            <div>
              <p className="figure" aria-hidden>
                ₹0
              </p>
              <h2 id="band-title">worth of your data sent to anyone. Ever.</h2>
            </div>
            <div>
              <p>
                No bank logins, no data brokers, no ads, no tracking. Your statements stay in a database you own, and AI
                only sees what you choose to share.
              </p>
              <span className="mono">Open source · Runs on your machine</span>
            </div>
          </BandGrid>
        </Reveal>
      </Container>
    </Band>
  );
}

/* ---------- FAQ ---------- */

const FaqList = styled.dl`
  margin: 0;
  display: grid;
  border-top: 1px solid ${({ theme }) => theme.colors.textPrimary};
  & > div {
    display: grid;
    gap: 8px;
    padding: ${({ theme }) => theme.space[6]}px 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
  & dt {
    font-family: ${fonts.serif};
    font-size: 21px;
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & dd {
    margin: 0;
    max-width: 62ch;
    font-size: 15px;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    & > div {
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      gap: ${({ theme }) => theme.space[12]}px;
    }
  }
`;

const faqs = [
  {
    q: 'Do I need to connect my bank?',
    a: 'No. Arvo works with the statement files your bank and card issuers already let you download, including spreadsheets and PDFs. You never share bank passwords or link accounts.',
  },
  {
    q: 'Where is my data stored?',
    a: 'In your own database, on the computer or server where you run Arvo. Nothing is sent to an outside service unless you turn on a cloud AI.',
  },
  {
    q: 'Does the AI see my transactions?',
    a: 'Only if you use it, and only through the AI you choose. With a private AI running on your own computer, nothing leaves your machine. Cloud AI is optional and Arvo tells you clearly when one is in use. Either way, the AI explains numbers Arvo calculated rather than inventing its own.',
  },
  {
    q: 'What happens if I import the same statement twice?',
    a: 'Duplicate detection flags rows that already exist, and every import goes through a review step. Nothing is written to your ledger until you commit.',
  },
  {
    q: 'Which AI assistants can I connect?',
    a: 'AI assistants like Claude, ChatGPT and Gemini. They can only see your own account, through a few read-only views such as cash flow and spending summaries.',
  },
  {
    q: 'What is the personal finance manager, and is it available?',
    a: 'It is on the roadmap, not shipped yet. Arvo will calculate savings opportunities, recurring charges, budget pacing, goal contributions and affordability checks from your transactions. An AI advisor will explain those numbers and draft budgets, goals and rules as suggestions. Nothing it drafts is saved until you approve it, and it never moves money.',
  },
  {
    q: 'What data does the AI advisor see, and where does it go?',
    a: 'AI features are optional. When you ask a question, Arvo sends the question and the relevant computed figures and transactions to the provider you configured. With a private AI on your own computer, that stays on your machine. With a cloud AI such as Anthropic, OpenAI or Gemini, the data is handled under that company\'s terms, and Arvo tells you when a cloud AI is in use. Connected AI assistants only get what you allow.',
  },
  {
    q: 'Does Arvo give financial advice?',
    a: 'No. Arvo gives you information and tools: tracked transactions, computed analytics and illustrative calculations with stated assumptions. It is not a registered investment adviser and does not give financial, investment, tax or legal advice. For decisions, consult a SEBI-registered investment adviser or another qualified professional.',
  },
  {
    q: 'Can I track loans and investments?',
    a: 'Yes. Loans and credit cards are liability accounts, and SIPs, broker, EPF, PPF and deposit accounts are assets, so all of them count toward net worth. Moving money into an investment or paying down a loan principal is a transfer, not spending. Loan prepayment and what-if planning tools are on the roadmap.',
  },
  {
    q: 'How do I get in touch?',
    a: `Email ${CONTACT_EMAIL} with questions, privacy or data requests, or security reports. If you use an instance someone else hosts, contact that instance's operator about your account and data.`,
  },
  {
    q: 'Is it really free?',
    a: 'Arvo is open source. You run it on your own hardware, so the only costs are your computer and any cloud AI you choose to use.',
  },
];

function Faq() {
  return (
    <SectionShell id="faq" aria-labelledby="faq-title">
      <Container>
        <SectionHeading id="faq-title" eyebrow="Questions" index="07" title="Asked, and answered" />
        <Reveal>
          <FaqList>
            {faqs.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </FaqList>
        </Reveal>
      </Container>
    </SectionShell>
  );
}

/* ---------- Closing + footer ---------- */

const Closing = styled.section`
  padding: ${({ theme }) => theme.space[16]}px 0 96px;
  & h2 {
    margin: 0;
    max-width: 16ch;
    font-family: ${fonts.serif};
    font-weight: 450;
    font-size: clamp(40px, 6.5vw, 84px);
    line-height: 1;
    letter-spacing: -0.035em;
    font-variation-settings: 'opsz' 144;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & h2 em {
    color: ${({ theme }) => theme.colors.brandText};
  }
  & .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 32px;
    margin-top: 32px;
  }
  & .row a {
    ${underline}
    font-size: 18px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & .row p {
    margin: 0;
    max-width: 44ch;
  }
`;

const Footer = styled.footer`
  border-top: 1px solid ${({ theme }) => theme.colors.textPrimary};
  padding: ${({ theme }) => theme.space[8]}px 0 ${({ theme }) => theme.space[10]}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const FooterInner = styled(Container)`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: baseline;
  justify-content: space-between;
  & ul {
    display: flex;
    flex-wrap: wrap;
    gap: ${({ theme }) => theme.space[2]}px ${({ theme }) => theme.space[5]}px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  & ul a {
    ${underline}
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & ul a:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

export function LandingPage() {
  return (
    <Root data-landing id="top">
      <LandingGlobals />
      <SkipLink href="#main">Skip to content</SkipLink>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Features />
        <PlanningToolsSection />
        <AdvisorSection />
        <McpSection />
        <PrivacyBand />
        <PrivacySection />
        <Faq />
        <Closing aria-labelledby="cta-title">
          <Container>
            <Reveal>
              <h2 id="cta-title">
                Take your finances <em>home.</em>
              </h2>
              <div className="row">
                <OpenAppLink>Open Arvo →</OpenAppLink>
                <Body>See where your money goes, with numbers you can trace back to the statement line.</Body>
              </div>
            </Reveal>
          </Container>
        </Closing>
      </main>
      <SiteFooter />
    </Root>
  );
}

const footerLinks = [
  { href: '#features', label: 'Features', anchor: true },
  { href: '#planning-tools', label: 'Planning tools', anchor: true },
  { href: '#mcp', label: 'AI assistants', anchor: true },
  { href: '#faq', label: 'FAQ', anchor: true },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/disclaimer', label: 'Disclaimer' },
];

export function SiteFooter({ base = '' }: { base?: string }) {
  return (
    <Footer>
      <FooterInner>
        <Wordmark href={base ? '/' : '#top'} aria-label={base ? 'Arvo home' : 'Arvo, back to top'}>
          <strong>Arvo</strong>
          <span>Personal finance, on your own machine</span>
        </Wordmark>
        <nav aria-label="Footer">
          <ul>
            {footerLinks.map((l) => (
              <li key={l.href}>
                <a href={l.anchor ? `${base}${l.href}` : l.href}>{l.label}</a>
              </li>
            ))}
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
            </li>
            <li>
              <OpenAppLink />
            </li>
          </ul>
        </nav>
      </FooterInner>
    </Footer>
  );
}
