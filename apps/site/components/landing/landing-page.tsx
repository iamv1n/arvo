'use client';

import { PixelLogo } from '../logo';
import { CloseOutlined, MenuOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { createGlobalStyle, keyframes } from 'styled-components';
import { OpenAppLink } from '../beta-access';
import { CONTACT_EMAIL } from '../../lib/legal';
import { ThemeToggle } from '../theme-toggle';
import { AdvisorSection } from './advisor';
import { Features } from './features';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { McpSection } from './mcp-switchboard';
import { PrivacySection } from './mcp-privacy';
import { drawStroke, play, useInView } from './motion';
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
  align-items: center;
  gap: 12px;
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
  & > span:last-child {
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
    & > span:last-child {
      display: inline;
    }
  }
`;


/* Brand lockup: the pixel mark in an ink tile (it rocks on hover), lowercase serif wordmark. */
const Tile = styled.span`
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.textPrimary};
  color: ${({ theme }) => theme.colors.bgCanvas};
  --arvo-logo-accent: #2fc4a0;
  box-shadow: 3px 3px 0 ${({ theme }) => theme.colors.brand};
  transition:
    transform 240ms cubic-bezier(0.34, 1.4, 0.64, 1),
    box-shadow 240ms cubic-bezier(0.34, 1.4, 0.64, 1);
`;

const Brand = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
  text-decoration: none;
  & strong {
    font-family: ${fonts.serif};
    font-weight: 600;
    font-size: 28px;
    line-height: 1;
    letter-spacing: -0.04em;
    font-variation-settings: 'opsz' 144;
  }
  & sup {
    align-self: flex-start;
    margin: 2px 0 0 -6px;
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.brandText};
  }
  &:hover ${Tile}, &:focus-visible ${Tile} {
    transform: translate(-2px, -2px) rotate(-6deg);
    box-shadow: 5px 5px 0 ${({ theme }) => theme.colors.brand};
  }
  @media (prefers-reduced-motion: reduce) {
    &:hover ${Tile} {
      transform: none;
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
  margin: 0 auto;
  padding: 0;
  gap: ${({ theme }) => theme.space[5]}px;
  & a {
    ${underline}
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: 14px;
    white-space: nowrap;
  }
  & small {
    display: none;
    font-family: ${fonts.mono};
    font-size: 10px;
    color: ${({ theme }) => theme.colors.textMuted};
    transition: color 200ms;
  }
  & a:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & a:hover small {
    color: ${({ theme }) => theme.colors.brandText};
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    display: flex;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.xl}px) {
    & small {
      display: inline;
    }
  }
`;

const NavRight = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  flex-shrink: 0;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    margin-left: 0;
  }
`;

/* Open-app button: square ink block that shifts onto its teal shadow when pressed. */
const AppLink = styled.span`
  display: none;
  & a {
    display: inline-flex;
    align-items: center;
    height: 36px;
    padding: 0 14px;
    border-radius: 4px;
    background: ${({ theme }) => theme.colors.textPrimary};
    color: ${({ theme }) => theme.colors.bgCanvas};
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    text-decoration: none;
    box-shadow: 3px 3px 0 ${({ theme }) => theme.colors.brand};
    transition:
      transform 160ms,
      box-shadow 160ms;
  }
  & a:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 ${({ theme }) => theme.colors.brand};
  }
  & a:active {
    transform: translate(3px, 3px);
    box-shadow: 0 0 0 ${({ theme }) => theme.colors.brand};
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
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
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
        <Brand href={base ? '/' : '#top'} aria-label="Arvo home">
          <Tile aria-hidden>
            <PixelLogo size={20} animate={false} />
          </Tile>
          <strong>arvo</strong>
          <sup>beta</sup>
        </Brand>
        <NavLinks>
          {navItems.map((item, i) => (
            <li key={item.href}>
              <a href={`${base}${item.href}`}>
                <small>{String(i + 1).padStart(2, '0')}</small>
                {item.label}
              </a>
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
            <Brand href={base ? '/' : '#top'} onClick={() => setOpen(false)}>
              <Tile aria-hidden>
                <PixelLogo size={20} animate={false} />
              </Tile>
              <strong>arvo</strong>
            </Brand>
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

const Drawer = styled.div`
  position: relative;
  display: grid;
  gap: 10px;
  counter-reset: card;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 14px 24px;
  }
`;

const flip = keyframes`
  from { opacity: 0; transform: translateY(-6px) rotateX(-12deg); }
  to { opacity: 1; transform: none; }
`;

/* An index card: mono tab, serif question, ruled answer with a handwritten gist. */
const IndexCard = styled.details<{ $tilt: number }>`
  position: relative;
  border: 2px solid ${({ theme }) => theme.colors.textPrimary};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgSurface};
  box-shadow: 0 0 0 ${({ theme }) => theme.colors.brand};
  transition:
    transform 220ms cubic-bezier(0.34, 1.4, 0.64, 1),
    box-shadow 220ms cubic-bezier(0.34, 1.4, 0.64, 1);
  & summary {
    list-style: none;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: baseline;
    min-height: 44px;
    padding: 16px 18px;
    cursor: pointer;
  }
  & summary::-webkit-details-marker {
    display: none;
  }
  & summary:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 3px;
  }
  & .tab {
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.08em;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & .q {
    font-family: ${fonts.serif};
    font-size: 19px;
    font-weight: 500;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .mark {
    font-family: ${fonts.mono};
    font-size: 18px;
    line-height: 1;
    color: ${({ theme }) => theme.colors.brandText};
    transition: transform 240ms;
  }
  &:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 ${({ theme }) => theme.colors.brand};
  }
  &[open] {
    transform: rotate(${({ $tilt }) => $tilt}deg);
    box-shadow: 5px 5px 0 ${({ theme }) => theme.colors.brand};
  }
  &[open] .mark {
    transform: rotate(45deg);
  }
  & .body {
    padding: 4px 18px 20px;
    border-top: 1px dashed ${({ theme }) => theme.colors.border};
    background: repeating-linear-gradient(
      180deg,
      transparent 0 27px,
      ${({ theme }) => theme.colors.borderSubtle} 27px 28px
    );
    animation: ${flip} 320ms cubic-bezier(0.2, 0, 0, 1) both;
    transform-origin: top;
  }
  & .gist {
    display: inline-block;
    margin: 10px 0 6px;
    font-family: ${fonts.hand};
    font-size: 26px;
    line-height: 1.1;
    color: ${({ theme }) => theme.colors.textPrimary};
    background: linear-gradient(transparent 58%, ${({ theme }) => theme.colors.brandSubtle} 58%);
  }
  & p {
    margin: 0;
    font-size: 15px;
    line-height: 28px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & a {
    color: ${({ theme }) => theme.colors.brandText};
  }
  @media (prefers-reduced-motion: reduce) {
    &:hover,
    &[open] {
      transform: none;
    }
  }
`;

const faqs = [
  {
    g: 'Nope. Just statement files.',
    q: 'Do I need to connect my bank?',
    a: 'No. Arvo works with the statement files your bank and card issuers already let you download, including spreadsheets and PDFs. You never share bank passwords or link accounts.',
  },
  {
    g: 'On your machine, in your database.',
    q: 'Where is my data stored?',
    a: 'In your own database, on the computer or server where you run Arvo. Nothing is sent to an outside service unless you turn on a cloud AI.',
  },
  {
    g: 'Only if you turn it on.',
    q: 'Does the AI see my transactions?',
    a: 'Only if you use it, and only through the AI you choose. With a private AI running on your own computer, nothing leaves your machine. Cloud AI is optional and Arvo tells you clearly when one is in use. Either way, the AI explains numbers Arvo calculated rather than inventing its own.',
  },
  {
    g: 'Duplicates get flagged.',
    q: 'What happens if I import the same statement twice?',
    a: 'Duplicate detection flags rows that already exist, and every import goes through a review step. Nothing is written to your ledger until you commit.',
  },
  {
    g: 'Claude, ChatGPT, Gemini — read-only.',
    q: 'Which AI assistants can I connect?',
    a: 'AI assistants like Claude, ChatGPT and Gemini. They can only see your own account, through a few read-only views such as cash flow and spending summaries.',
  },
  {
    g: 'Coming soon. Suggests, never saves alone.',
    q: 'What is the personal finance manager, and is it available?',
    a: 'It is on the roadmap, not shipped yet. Arvo will calculate savings opportunities, recurring charges, budget pacing, goal contributions and affordability checks from your transactions. An AI advisor will explain those numbers and draft budgets, goals and rules as suggestions. Nothing it drafts is saved until you approve it, and it never moves money.',
  },
  {
    g: 'Only what you ask about, only where you point it.',
    q: 'What data does the AI advisor see, and where does it go?',
    a: 'AI features are optional. When you ask a question, Arvo sends the question and the relevant computed figures and transactions to the provider you configured. With a private AI on your own computer, that stays on your machine. With a cloud AI such as Anthropic, OpenAI or Gemini, the data is handled under that company\'s terms, and Arvo tells you when a cloud AI is in use. Connected AI assistants only get what you allow.',
  },
  {
    g: 'No — information, not advice.',
    q: 'Does Arvo give financial advice?',
    a: 'No. Arvo gives you information and tools: tracked transactions, computed analytics and illustrative calculations with stated assumptions. It is not a registered investment adviser and does not give financial, investment, tax or legal advice. For decisions, consult a SEBI-registered investment adviser or another qualified professional.',
  },
  {
    g: 'Yes, both count toward net worth.',
    q: 'Can I track loans and investments?',
    a: 'Yes. Loans and credit cards are liability accounts, and SIPs, broker, EPF, PPF and deposit accounts are assets, so all of them count toward net worth. Moving money into an investment or paying down a loan principal is a transfer, not spending. Loan prepayment and what-if planning tools are on the roadmap.',
  },
  {
    g: 'Just email.',
    q: 'How do I get in touch?',
    a: `Email ${CONTACT_EMAIL} with questions, privacy or data requests, or security reports. If you use an instance someone else hosts, contact that instance's operator about your account and data.`,
  },
  {
    g: 'Free & open source.',
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
          <Drawer>
            {faqs.map((f, i) => (
              <IndexCard key={f.q} $tilt={i % 2 ? 0.6 : -0.6}>
                <summary>
                  <span className="tab" aria-hidden>
                    Q.{String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="q">{f.q}</span>
                  <span className="mark" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="body">
                  <span className="gist">{f.g}</span>
                  <p>{f.a}</p>
                </div>
              </IndexCard>
            ))}
          </Drawer>
        </Reveal>
      </Container>
    </SectionShell>
  );
}

/* ---------- Closing + footer ---------- */

const Closing = styled.section<{ $on: boolean }>`
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
    position: relative;
    display: inline-block;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & h2 em svg {
    position: absolute;
    left: -4%;
    bottom: -0.12em;
    width: 108%;
    height: 0.3em;
    overflow: visible;
  }
  & h2 em path {
    fill: none;
    stroke: ${({ theme }) => theme.colors.brand};
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 1;
    animation-name: ${drawStroke};
    ${({ $on }) => play($on, 600, '900ms')}
  }
  & .aside {
    display: inline-block;
    margin-top: 28px;
    font-family: ${fonts.hand};
    font-size: 24px;
    transform: rotate(-2deg);
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .aside a {
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

function ClosingCta() {
  const [ref, on] = useInView<HTMLElement>(0.3);
  return (
    <Closing ref={ref} $on={on} aria-labelledby="cta-title">
      <Container>
        <Reveal>
          <h2 id="cta-title">
            Take your finances{' '}
            <em>
              home.
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
                <path d="M2 7 C 25 2, 55 2, 98 5" pathLength={1} />
              </svg>
            </em>
          </h2>
          <div className="row">
            <OpenAppLink>Open Arvo →</OpenAppLink>
            <Body>See where your money goes, with numbers you can trace back to the statement line.</Body>
          </div>
          <span className="aside">
            questions? write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </span>
        </Reveal>
      </Container>
    </Closing>
  );
}

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
        <ClosingCta />
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
          <Brand as="span">
            <Tile aria-hidden>
              <PixelLogo size={20} animate={false} />
            </Tile>
            <strong>arvo</strong>
          </Brand>
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
