'use client';

import { useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { OpenAppLink } from '../beta-access';
import { formatINR, useCountUp, usePrefersReducedMotion } from './motion';
import { Container, fonts } from './primitives';

/* ---------- statement data ---------- */

interface Row {
  date: string;
  narration: string;
  debit?: number;
  credit?: number;
  /** Short note shown under the row on small screens, where the margin art is hidden. */
  mobileNote?: string;
}

const OPENING = 37_340;

const rows: Row[] = [
  { date: '01 AUG', narration: 'NEFT-SALARY-ACME PVT LTD', credit: 1_45_000, mobileNote: 'income' },
  { date: '02 AUG', narration: 'UPI-SWIGGY-8812', debit: 486, mobileNote: 'food delivery' },
  { date: '03 AUG', narration: 'ACH-SIP-HDFC MF-0921', debit: 15_000, mobileNote: 'transfer, not spending' },
  { date: '05 AUG', narration: 'POS-NETFLIX.COM', debit: 649, mobileNote: 'recurring' },
  { date: '06 AUG', narration: 'NEFT-ICICI CC BILL PAY', debit: 32_400, mobileNote: 'transfer, not spending' },
  { date: '09 AUG', narration: 'UPI-SWIGGY-8812', debit: 734, mobileNote: 'food delivery ↑ 40%' },
];

const statement = rows.reduce<(Row & { balance: number })[]>((acc, r) => {
  const prev = acc[acc.length - 1]?.balance ?? OPENING;
  acc.push({ ...r, balance: prev + (r.credit ?? 0) - (r.debit ?? 0) });
  return acc;
}, []);

const FOOD_DELIVERY_AUGUST = 6_800;
const amount = (v?: number) => (v ? v.toLocaleString('en-IN') : '');

/** Stages: 1–6 print the rows, then 7 circle, 8 margin note, 9 transfer arrow, 10 stamp, 11 tally. */
const STAGES = { rows: rows.length, circle: 7, note: 8, arrow: 9, stamp: 10, tally: 11 } as const;
const LAST_STAGE = STAGES.tally;
const ROW_H = 40;
const HEAD_H = 30;

/* ---------- sequencing ---------- */

/** Rows print and annotations appear on a timer once the page loads. Reduced motion shows the finished statement. */
function useStatementStage() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduced || stage >= LAST_STAGE) return;
    // The full sequence takes about 4s (400 + 5×280 + 5×450 ms).
    const delay = stage === 0 ? 400 : stage < STAGES.rows ? 280 : 450;
    const id = window.setTimeout(() => setStage((s) => s + 1), delay);
    return () => window.clearTimeout(id);
  }, [stage, reduced]);

  return [sectionRef, reduced ? LAST_STAGE : stage] as const;
}

/* ---------- layout ---------- */

const HeroSection = styled.section`
  position: relative;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Stick = styled.div`
  padding: ${({ theme }) => theme.space[10]}px 0 ${({ theme }) => theme.space[12]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    min-height: max(660px, calc(100vh - 56px));
    display: flex;
    align-items: center;
    padding: 24px 0;
  }
`;

const Center = styled(Container)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

const H1 = styled.h1`
  margin: 0 0 ${({ theme }) => theme.space[8]}px;
  max-width: 22ch;
  font-family: ${fonts.serif};
  font-weight: 450;
  font-size: clamp(28px, 2vw + 18px, 44px);
  line-height: 1.04;
  letter-spacing: -0.03em;
  font-variation-settings: 'opsz' 144, 'SOFT' 30;
  color: ${({ theme }) => theme.colors.textPrimary};
  & em {
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Below = styled.div`
  margin-top: ${({ theme }) => theme.space[8]}px;
  display: grid;
  justify-items: center;
  gap: 14px;
  & p {
    margin: 0;
    max-width: 52ch;
    font-size: 17px;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 32px;
  }
  @media (max-width: 480px) {
    width: 100%;
    & p {
      font-size: 16px;
    }
    & .actions {
      flex-direction: column;
      align-items: stretch;
    }
    & .actions a {
      justify-content: center;
      font-size: 17px;
    }
    & .actions a.primary {
      border: 1px solid currentColor;
      border-radius: ${({ theme }) => theme.radii.sm}px;
      text-decoration: none;
    }
  }
  & .actions a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-size: 16px;
    font-weight: 600;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 6px;
  }
  & .actions a.primary {
    color: ${({ theme }) => theme.colors.brandText};
    text-decoration-color: currentColor;
  }
  & .actions a.secondary {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: 500;
    text-decoration-color: ${({ theme }) => theme.colors.border};
  }
  & .actions a:hover {
    text-decoration-thickness: 2px;
  }
`;

/* ---------- paper ---------- */

const thump = keyframes`
  0% { opacity: 0; transform: rotate(-14deg) scale(1.7); }
  55% { opacity: 1; transform: rotate(-9deg) scale(0.92); }
  75% { transform: rotate(-11deg) scale(1.04); }
  100% { opacity: 0.9; transform: rotate(-10deg) scale(1); }
`;

const blink = keyframes`
  50% { opacity: 0; }
`;

const Paper = styled.figure`
  position: relative;
  width: 100%;
  max-width: 860px;
  margin: 0;
  padding: 26px 28px 20px;
  text-align: left;
  transform: rotate(-0.8deg);
  background-color: ${({ theme }) => (theme.mode === 'dark' ? theme.colors.bgSurfaceRaised : '#fcfbf6')};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 22px 44px -30px rgba(0, 0, 0, ${({ theme }) => (theme.mode === 'dark' ? 0.8 : 0.3)});
  color: ${({ theme }) => theme.colors.textPrimary};
  @media (max-width: 700px) {
    transform: none;
    padding: 18px 14px 16px;
  }
`;

const Letterhead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px 16px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.textPrimary};
  & strong {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 20px;
    letter-spacing: -0.01em;
  }
  & strong b {
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  & > span {
    font-family: ${fonts.mono};
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  @media (max-width: 480px) {
    & strong {
      font-size: 17px;
    }
    & strong .long,
    & > span {
      display: none;
    }
  }
`;

const Table = styled.div`
  position: relative;
  font-family: ${fonts.mono};
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  /* Ruled lines behind the rows only. */
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0 ${ROW_H - 1}px,
    ${({ theme }) => (theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(20,40,60,0.08)')} ${ROW_H - 1}px ${ROW_H}px
  );
  background-position: 0 ${HEAD_H}px;
  background-repeat: repeat-y;
  @media (max-width: 700px) {
    background-image: none;
  }
`;

const cols = css`
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 84px 92px 190px;
  column-gap: 12px;
  align-items: center;
  & .num {
    text-align: right;
  }
  & .muted {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .margin {
    padding-left: 34px;
    white-space: nowrap;
  }
  @media (max-width: 860px) {
    grid-template-columns: 52px minmax(0, 1fr) 76px 176px;
    & .bal {
      display: none;
    }
  }
  @media (max-width: 700px) {
    grid-template-columns: 46px minmax(0, 1fr) 70px;
    column-gap: 8px;
    & .margin {
      display: none;
    }
  }
`;

const HeadRow = styled.div`
  ${cols}
  height: ${HEAD_H}px;
  font-size: 11px;
  @media (max-width: 700px) {
    font-size: 12px;
  }
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* Receipt-printer reveal: the row's height opens in steps while its content slides up. */
const RowWrap = styled.div<{ $shown: boolean }>`
  display: grid;
  grid-template-rows: ${({ $shown }) => ($shown ? '1fr' : '0fr')};
  transition: grid-template-rows 300ms steps(5, end);
  & > div {
    min-height: 0;
    overflow: ${({ $shown }) => ($shown ? 'visible' : 'hidden')};
  }
`;

const RowLine = styled.div<{ $shown: boolean; $printing: boolean }>`
  ${cols}
  height: ${ROW_H}px;
  opacity: ${({ $shown }) => ($shown ? 1 : 0)};
  transition: opacity 120ms;
  & .narr {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  & .narr::after {
    content: '';
    display: ${({ $printing }) => ($printing ? 'inline-block' : 'none')};
    width: 7px;
    height: 13px;
    margin-left: 4px;
    vertical-align: -2px;
    background: ${({ theme }) => theme.colors.textPrimary};
    animation: ${blink} 0.9s steps(1) infinite;
  }
  & .cr {
    color: ${({ theme }) => theme.colors.income};
  }
  & .note {
    display: none;
  }
  @media (max-width: 700px) {
    height: auto;
    min-height: ${ROW_H}px;
    padding: 6px 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
    & .note {
      display: block;
      grid-column: 2 / -1;
      font-family: ${fonts.hand};
      font-size: 17px;
      line-height: 1.1;
      color: ${({ theme }) => theme.colors.brandText};
    }
  }
`;

const Hand = styled.span<{ $shown: boolean; $tone: 'expense' | 'transfer' }>`
  display: inline-block;
  font-family: ${fonts.hand};
  font-size: 21px;
  line-height: 1;
  color: ${({ theme, $tone }) => theme.colors[$tone]};
  opacity: ${({ $shown }) => ($shown ? 1 : 0)};
  transform: ${({ $shown }) => ($shown ? 'rotate(-3deg)' : 'translateX(-8px) rotate(-3deg)')};
  transition:
    opacity 400ms ${({ theme }) => theme.motion.easing},
    transform 400ms ${({ theme }) => theme.motion.easing};
`;

const Stamp = styled.span<{ $shown: boolean }>`
  display: inline-block;
  padding: 2px 10px;
  border: 2.5px solid ${({ theme }) => theme.colors.brand};
  border-radius: 4px;
  font-family: ${fonts.mono};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: ${({ theme }) => theme.colors.brand};
  opacity: 0;
  ${({ $shown }) =>
    $shown
      ? css`
          animation: ${thump} 520ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
        `
      : ''}
`;

/** SVG layer over the table for the hand-drawn loop and the transfer arrow. */
const Art = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  & path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    transition: stroke-dashoffset 700ms cubic-bezier(0.6, 0, 0.3, 1);
  }
  @media (max-width: 860px) {
    display: none;
  }
`;

const Tally = styled.figcaption<{ $shown: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px 16px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px dashed ${({ theme }) => theme.colors.textMuted};
  opacity: ${({ $shown }) => ($shown ? 1 : 0)};
  transition: opacity 400ms;
  & span {
    font-family: ${fonts.hand};
    font-size: 24px;
  }
  & b {
    font-family: ${fonts.serif};
    font-weight: 600;
    font-size: 24px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.expense};
    white-space: nowrap;
  }
`;

const Inks = styled.div`
  display: contents;
  --ink-expense: ${({ theme }) => theme.colors.expense};
  --ink-transfer: ${({ theme }) => theme.colors.transfer};
`;

function Statement({ stage }: { stage: number }) {
  const shown = (s: number) => stage >= s;
  const tally = useCountUp(FOOD_DELIVERY_AUGUST, shown(STAGES.tally), 1100);
  const rowTop = (i: number) => HEAD_H + i * ROW_H;
  const arrowSpan = 2 * ROW_H;
  return (
    <Paper
      role="img"
      aria-label="Illustration: an August bank statement annotated by Arvo. Swiggy is circled as food delivery, up 40%. A mutual fund SIP and a credit card bill payment are linked as transfers, not spending. Netflix is stamped recurring. Food delivery totals ₹6,800 for the month."
    >
      <Letterhead aria-hidden>
        <strong>
          <b>ARVO</b> — Statement<span className="long"> of understanding</span>
        </strong>
        <span>SAVINGS ··· 4417 · AUGUST 2026</span>
      </Letterhead>
      <Inks>
        <Table aria-hidden>
          <HeadRow>
            <span>Date</span>
            <span>Narration</span>
            <span className="num">Amount</span>
            <span className="num bal">Balance</span>
            <span className="margin" />
          </HeadRow>
          {statement.map((r, i) => {
            const printed = shown(i + 1);
            return (
              <RowWrap key={`${r.date}-${r.narration}`} $shown={printed}>
                <div>
                  <RowLine $shown={printed} $printing={printed && stage === i + 1}>
                    <span className="muted">{r.date}</span>
                    <span className="narr">{r.narration}</span>
                    <span className={`num ${r.credit ? 'cr' : ''}`}>{r.credit ? `+${amount(r.credit)}` : amount(r.debit)}</span>
                    <span className="num bal muted">{amount(r.balance)}</span>
                    <span className="margin">
                      {i === 3 ? <Stamp $shown={shown(STAGES.stamp)}>RECURRING</Stamp> : null}
                      {i === 4 ? (
                        <Hand $shown={shown(STAGES.arrow)} $tone="transfer">
                          not spending: transfer
                        </Hand>
                      ) : null}
                      {i === 5 ? (
                        <Hand $shown={shown(STAGES.note)} $tone="expense">
                          food delivery ↑ 40%
                        </Hand>
                      ) : null}
                    </span>
                    {r.mobileNote ? <span className="note">{r.mobileNote}</span> : null}
                  </RowLine>
                </div>
              </RowWrap>
            );
          })}
          <Art aria-hidden>
            {/* Hand-drawn loop around the second Swiggy row's narration. */}
            <svg x={60} y={rowTop(5) - 2} width={160} height={ROW_H + 4} viewBox="0 0 160 44" preserveAspectRatio="none" overflow="visible">
              <path
                d="M16 9 C 50 -1, 138 0, 154 13 C 166 27, 136 43, 80 42 C 32 41, 2 35, 5 21 C 8 11, 26 6, 44 5"
                pathLength={1}
                stroke="var(--ink-expense)"
                strokeWidth={2}
                style={{ strokeDashoffset: shown(STAGES.circle) ? 0 : 1 }}
              />
            </svg>
            {/* Curved arrow at the start of the margin column, from the SIP row to the card bill payment. */}
            <svg x="100%" y={rowTop(2) + ROW_H / 2} width={1} height={arrowSpan} overflow="visible">
              <g transform="translate(-186 0)">
                <path
                  d={`M2 0 C 26 6, 26 ${arrowSpan - 6}, 4 ${arrowSpan}`}
                  pathLength={1}
                  stroke="var(--ink-transfer)"
                  strokeWidth={1.8}
                  style={{ strokeDashoffset: shown(STAGES.arrow) ? 0 : 1 }}
                />
                <path
                  d={`M4 ${arrowSpan} l 9 -1 M4 ${arrowSpan} l 3 -8`}
                  pathLength={1}
                  stroke="var(--ink-transfer)"
                  strokeWidth={1.8}
                  style={{ strokeDashoffset: shown(STAGES.arrow) ? 0 : 1, transitionDelay: shown(STAGES.arrow) ? '600ms' : '0ms' }}
                />
              </g>
            </svg>
          </Art>
        </Table>
      </Inks>
      <Tally $shown={shown(STAGES.tally)} aria-hidden>
        <span>Food delivery in August</span>
        <b>{formatINR(tally)} · ↑ 40%</b>
      </Tally>
    </Paper>
  );
}

export function Hero() {
  const [ref, stage] = useStatementStage();
  return (
    <HeroSection ref={ref} aria-labelledby="hero-title">
      <Stick>
        <Center>
          <H1 id="hero-title">
            Your bank statement, <em>finally explained.</em>
          </H1>
          <Statement stage={stage} />
          <Below>
            <p>Drop in the statements your bank already sends. Arvo sorts every line and shows where the month went, on a computer you control.</p>
            <div className="actions">
              <OpenAppLink className="primary">Open Arvo →</OpenAppLink>
              <a className="secondary" href="#how-it-works">
                See how it works
              </a>
            </div>
          </Below>
        </Center>
      </Stick>
    </HeroSection>
  );
}
