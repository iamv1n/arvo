'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Button, Collapse } from 'antd';
import { useEffect, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { APP_URL } from '../../lib/config';
import { CONTACT_EMAIL } from '../../lib/legal';
import { ThemeToggle } from '../theme-toggle';
import { AdvisorSection } from './advisor';
import { Features } from './features';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { McpSection, PrivacySection } from './mcp-privacy';
import { Body, Container, Eyebrow, H3, Reveal, SectionHeading, SectionShell } from './primitives';
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

/* ---------- Nav ---------- */

const Header = styled.header<{ $scrolled: boolean }>`
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: saturate(160%) blur(12px);
  -webkit-backdrop-filter: saturate(160%) blur(12px);
  background: ${({ theme, $scrolled }) =>
    $scrolled ? (theme.mode === 'dark' ? 'rgba(12,14,14,0.78)' : 'rgba(247,248,248,0.82)') : 'transparent'};
  border-bottom: 1px solid ${({ theme, $scrolled }) => ($scrolled ? theme.colors.border : 'transparent')};
  transition:
    background ${({ theme }) => theme.motion.normal} ${({ theme }) => theme.motion.easing},
    border-color ${({ theme }) => theme.motion.normal};
`;

const NavInner = styled(Container)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  height: 64px;
`;

const Brand = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  font-size: 18px;
  letter-spacing: -0.01em;
  text-decoration: none;
`;

const NavLinks = styled.ul`
  display: none;
  list-style: none;
  margin: 0 0 0 ${({ theme }) => theme.space[6]}px;
  padding: 0;
  gap: ${({ theme }) => theme.space[6]}px;
  & a {
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: ${({ theme }) => theme.typography.fontSize.md}px;
    text-decoration: none;
    transition: color ${({ theme }) => theme.motion.fast};
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
  gap: ${({ theme }) => theme.space[3]}px;
`;

const HideSm = styled.span`
  display: none;
  @media (min-width: ${({ theme }) => theme.breakpoints.sm}px) {
    display: inline-flex;
  }
`;

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" style={{ color: 'var(--logo-bg)' }} />
      <path d="M8 23 L14 10 L20 23" fill="none" stroke="var(--logo-fg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 18 H17" stroke="var(--logo-fg)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 23 L25 13" stroke="var(--logo-accent)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const LogoVars = styled.span`
  display: inline-flex;
  --logo-bg: ${({ theme }) => theme.colors.brand};
  --logo-fg: ${({ theme }) => theme.colors.bgSurface};
  --logo-accent: ${({ theme }) => theme.colors.brandSubtle};
`;

const navItems: { href: string; label: string; page?: boolean }[] = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#planning-tools', label: 'Planning tools' },
  { href: '#advisor', label: 'Advisor' },
  { href: '#mcp', label: 'AI assistants' },
  { href: '#privacy', label: 'Privacy' },
  { href: '/self-host', label: 'Self-host', page: true },
];

/**
 * Site header. On the home page anchors are in-page (`#features`); other routes pass
 * `base="/"` so the same links navigate back to the home page sections.
 */
export function Nav({ base = '' }: { base?: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <Header $scrolled={scrolled}>
      <NavInner as="nav" aria-label="Primary">
        <Brand href={base ? '/' : '#top'} aria-label="Arvo home">
          <LogoVars>
            <Logo />
          </LogoVars>
          Arvo
        </Brand>
        <NavLinks>
          {navItems.map((item) => (
            <li key={item.href}>
              <a href={item.page ? item.href : `${base}${item.href}`}>{item.label}</a>
            </li>
          ))}
        </NavLinks>
        <NavRight>
          <ThemeToggle />
          <HideSm>
            <Button type="primary" href={`${APP_URL}/dashboard`}>
              Open Arvo
            </Button>
          </HideSm>
        </NavRight>
      </NavInner>
    </Header>
  );
}

/* ---------- Run it yourself ---------- */

const Teaser = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: center;
  padding: ${({ theme }) => theme.space[10]}px ${({ theme }) => theme.space[6]}px;
  border-radius: ${({ theme }) => theme.radii.xl}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  & h2 {
    margin: 0 0 8px;
    font-size: clamp(24px, 3vw, 32px);
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & p {
    max-width: 620px;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: 1fr auto;
    padding: ${({ theme }) => theme.space[12]}px;
  }
`;

function RunItYourself() {
  return (
    <SectionShell id="self-host" aria-labelledby="self-host-title" $muted>
      <Container>
        <Reveal>
          <Teaser>
            <div>
              <Eyebrow>Run it yourself</Eyebrow>
              <h2 id="self-host-title">Your computer, your data</h2>
              <Body>
                Arvo runs on your own computer or server, so your financial data never leaves it. Setting it up takes a few
                minutes, and it is free and open source.
              </Body>
            </div>
            <Button type="primary" size="large" href="/self-host" icon={<ArrowRightOutlined />} iconPlacement="end">
              How to run Arvo
            </Button>
          </Teaser>
        </Reveal>
      </Container>
    </SectionShell>
  );
}

/* ---------- FAQ ---------- */

const FaqWrap = styled.div`
  max-width: 820px;
  margin: 0 auto;
  & .ant-collapse {
    background: transparent;
  }
  & .ant-collapse-header-text {
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
    font-size: 16px;
  }
  & .ant-collapse-content-box p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSecondary};
    line-height: 1.7;
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
    a: 'AI assistants like Claude, ChatGPT and Gemini. They can only see your own account, through a few read-only views such as cash flow and spending summaries. Setup details are on the self-host page.',
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
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" center />
        <Reveal>
          <FaqWrap>
            <Collapse
              size="large"
              bordered={false}
              expandIconPlacement="end"
              defaultActiveKey={['0']}
              items={faqs.map((f, i) => ({ key: String(i), label: <H3 as="span">{f.q}</H3>, children: <p>{f.a}</p> }))}
            />
          </FaqWrap>
        </Reveal>
      </Container>
    </SectionShell>
  );
}

/* ---------- CTA + footer ---------- */

const CtaBand = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.space[12]}px ${({ theme }) => theme.space[6]}px;
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background:
    radial-gradient(circle at 50% 0%, ${({ theme }) => theme.colors.brandSubtle}, transparent 70%),
    ${({ theme }) => theme.colors.bgSurface};
  & h2 {
    margin: 0;
    font-size: clamp(24px, 3.5vw, 34px);
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & p {
    margin: 12px auto 24px;
    max-width: 520px;
  }
  & .actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 12px;
  }
`;

const Footer = styled.footer`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  padding: ${({ theme }) => theme.space[10]}px 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const FooterInner = styled(Container)`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: center;
  justify-content: space-between;
  & ul {
    display: flex;
    flex-wrap: wrap;
    gap: ${({ theme }) => theme.space[5]}px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  & a {
    color: ${({ theme }) => theme.colors.textSecondary};
    text-decoration: none;
  }
  & a:hover {
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
        <PrivacySection />
        <RunItYourself />
        <Faq />
        <section aria-labelledby="cta-title" style={{ paddingBottom: 96 }}>
          <Container>
            <Reveal>
              <CtaBand>
                <h2 id="cta-title">Take your finances home.</h2>
                <Body>Run Arvo on your own machine and see where your money goes, with numbers you can trace.</Body>
                <div className="actions">
                  <Button type="primary" size="large" href={`${APP_URL}/dashboard`} icon={<ArrowRightOutlined />} iconPlacement="end">
                    Open Arvo
                  </Button>
                  <Button size="large" href="/self-host">
                    Self-host it
                  </Button>
                </div>
              </CtaBand>
            </Reveal>
          </Container>
        </section>
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
  { href: '/self-host', label: 'Self-host' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/disclaimer', label: 'Disclaimer' },
];

export function SiteFooter({ base = '' }: { base?: string }) {
  return (
    <Footer>
      <FooterInner>
        <Brand href={base ? '/' : '#top'} aria-label={base ? 'Arvo home' : 'Arvo, back to top'}>
          <LogoVars>
            <Logo size={24} />
          </LogoVars>
          Arvo
          <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 8, color: 'inherit' }}>Local-first personal finance OS</span>
        </Brand>
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
              <a href={`${APP_URL}/dashboard`}>Open Arvo</a>
            </li>
          </ul>
        </nav>
      </FooterInner>
    </Footer>
  );
}
