'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import styled, { useTheme } from 'styled-components';
import {
  HOME_LOAN,
  PURCHASE,
  SIP,
  SPENDING_BEFORE_AFTER,
  debtExample,
  homeLoanExample,
  investmentExample,
  personalFinanceExample,
  purchaseExample,
} from '../../lib/finance-examples';
import { drawStroke, fadeIn, fadeUp, formatINR, growX, growY, play, useInView } from './motion';
import { Container, fonts, Pill, Reveal, SectionHeading, SectionShell } from './primitives';

/*
 * "Plan loans, investments and spending": a planning notebook. Each tool is a numbered chapter;
 * every page leads with one serif answer and an italic finding, then one chart drawn for that
 * question, annotated by hand, and closes with a ledger of the supporting figures.
 */

/* ---------- formatting ---------- */

/** Short Indian-unit label: ₹40L, ₹1.2Cr, ₹8K. */
function short(v: number) {
  if (v >= 1_00_00_000) return `₹${+(v / 1_00_00_000).toFixed(2)}Cr`;
  if (v >= 1_00_000) return `₹${+(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${+(v / 1_000).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
}

/* ---------- chapter index (tabs) ---------- */

const Index = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(150px, 1fr);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  border-bottom: 2px solid ${({ theme }) => theme.colors.textPrimary};
  &::-webkit-scrollbar {
    display: none;
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-auto-columns: minmax(148px, 42%);
  }
`;

const Chapter = styled.button<{ $active: boolean }>`
  all: unset;
  box-sizing: border-box;
  scroll-snap-align: start;
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 14px 16px 16px;
  cursor: pointer;
  border-left: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  background: ${({ theme, $active }) => ($active ? theme.colors.textPrimary : 'transparent')};
  color: ${({ theme, $active }) => ($active ? theme.colors.bgSurface : theme.colors.textSecondary)};
  transition:
    background ${({ theme }) => theme.motion.fast},
    color ${({ theme }) => theme.motion.fast};
  &:first-child {
    border-left: 0;
  }
  & .num {
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: ${({ $active }) => ($active ? 0.75 : 0.9)};
  }
  & .name {
    font-family: ${fonts.serif};
    font-size: 18px;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  &:hover {
    color: ${({ theme, $active }) => ($active ? theme.colors.bgSurface : theme.colors.textPrimary)};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: -2px;
  }
`;

/* ---------- page ---------- */

const Page = styled.article`
  padding-top: ${({ theme }) => theme.space[6]}px;
  animation-name: ${fadeUp};
  ${play(true, 0, '500ms')}
`;

const Kicker = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  flex-wrap: wrap;
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Lede = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[4]}px;
  margin: ${({ theme }) => theme.space[5]}px 0 ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: end;
    gap: ${({ theme }) => theme.space[10]}px;
  }
`;

const Answer = styled.div`
  min-width: 0;
  & .label {
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & .value {
    margin-top: 6px;
    font-family: ${fonts.serif};
    font-weight: 400;
    font-size: clamp(32px, 4.5vw, 52px);
    line-height: 0.95;
    letter-spacing: -0.045em;
    font-variant-numeric: lining-nums tabular-nums;
    font-variation-settings: 'opsz' 144;
    color: ${({ theme }) => theme.colors.textPrimary};
    white-space: nowrap;
  }
  & .value.bad {
    color: ${({ theme }) => theme.colors.expense};
  }
  & .value.good {
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Finding = styled.div`
  min-width: 0;
  padding-left: 0;
  & h3 {
    margin: 0 0 6px;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 24px;
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & p {
    margin: 0;
    max-width: 52ch;
    font-family: ${fonts.serif};
    font-style: italic;
    font-size: 18px;
    line-height: 1.45;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding-left: ${({ theme }) => theme.space[6]}px;
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

const Plate = styled.figure`
  margin: 0;
  padding: ${({ theme }) => theme.space[5]}px 0 ${({ theme }) => theme.space[4]}px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  min-width: 0;
  & figcaption {
    display: flex;
    justify-content: space-between;
    gap: 4px 12px;
    flex-wrap: wrap;
    margin-bottom: ${({ theme }) => theme.space[3]}px;
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & figcaption b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Key = styled.ul`
  list-style: none;
  margin: ${({ theme }) => theme.space[3]}px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
  & li {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  & i {
    display: inline-block;
    width: 14px;
    height: 4px;
    border-radius: 1px;
  }
`;

const Back = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  padding-top: ${({ theme }) => theme.space[5]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: ${({ theme }) => theme.space[12]}px;
  }
`;

const Ledger = styled.dl`
  margin: 0;
  display: grid;
  gap: 10px;
  & > div {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  & > div::after {
    content: '';
    grid-column: 2;
    grid-row: 1;
    border-bottom: 1px dotted ${({ theme }) => theme.colors.textMuted};
    transform: translateY(-4px);
  }
  & dt {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & dd {
    grid-column: 3;
    grid-row: 1;
    margin: 0;
    font-family: ${fonts.serif};
    font-size: 22px;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & dd.good {
    color: ${({ theme }) => theme.colors.income};
  }
  & dd.bad {
    color: ${({ theme }) => theme.colors.expense};
  }
  @media (max-width: 420px) {
    & dt {
      font-size: 13px;
    }
    & dd {
      font-size: 19px;
    }
  }
`;

const Notes = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  counter-reset: note;
  & li {
    counter-increment: note;
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 6px;
    font-size: 15px;
    line-height: 1.55;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & li::before {
    content: counter(note, lower-roman) '.';
    font-family: ${fonts.serif};
    font-style: italic;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Footnote = styled.p`
  margin: ${({ theme }) => theme.space[6]}px 0 0;
  font-family: ${fonts.mono};
  font-size: 11px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textMuted};
`;

interface Figure {
  value: string;
  label: string;
  tone?: 'good' | 'bad';
}

interface KeyItem {
  label: string;
  color: string;
  dashed?: boolean;
  opacity?: number;
}

function ToolPage({
  n,
  status,
  title,
  description,
  answer,
  figures,
  bullets,
  footnote,
  chartTitle,
  chartNote,
  chart,
  keys,
}: {
  n: string;
  status: ReactNode;
  title: string;
  description: string;
  answer: Figure;
  figures: Figure[];
  bullets: ReactNode[];
  footnote: string;
  chartTitle: string;
  chartNote?: string;
  chart: ReactNode;
  keys: KeyItem[];
}) {
  return (
    <Page>
      <Kicker>
        <span>
          Chapter {n} · {title}
        </span>
        {status}
      </Kicker>
      <Lede>
        <Answer>
          <div className="label">{answer.label}</div>
          <div className={`value ${answer.tone ?? ''}`}>{answer.value}</div>
        </Answer>
        <Finding>
          <h3>{title}</h3>
          <p>{description}</p>
        </Finding>
      </Lede>
      <Plate>
        <figcaption>
          <b>{chartTitle}</b>
          {chartNote ? <span>{chartNote}</span> : null}
        </figcaption>
        {chart}
        <Key aria-hidden>
          {keys.map((k) => (
            <li key={k.label}>
              <i
                style={
                  k.dashed
                    ? { background: `repeating-linear-gradient(90deg, ${k.color} 0 4px, transparent 4px 7px)` }
                    : { background: k.color, opacity: k.opacity ?? 1 }
                }
              />
              {k.label}
            </li>
          ))}
        </Key>
      </Plate>
      <Back>
        <Ledger>
          {figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className={f.tone}>{f.value}</dd>
            </div>
          ))}
        </Ledger>
        <Notes>
          {bullets.map((b, i) => (
            <li key={i}>
              <div>{b}</div>
            </li>
          ))}
        </Notes>
      </Back>
      <Footnote>{footnote}</Footnote>
    </Page>
  );
}

/* ---------- chart plumbing ---------- */

/** Measures the plate so SVG text renders at real pixel sizes; the viewBox tracks the width. */
function useChart(height: number) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [io, on] = useInView<HTMLDivElement>(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { width, on, frame: { box, io, width, height } };
}

function Frame({
  frame,
  label,
  children,
}: {
  frame: { box: RefObject<HTMLDivElement | null>; io: RefObject<HTMLDivElement | null>; width: number; height: number };
  label: string;
  children: ReactNode;
}) {
  return (
    <div ref={frame.box} style={{ width: '100%', minWidth: 0 }}>
      <div ref={frame.io} style={{ height: frame.height }}>
        {frame.width > 0 ? (
          <svg
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            width="100%"
            height={frame.height}
            role="img"
            aria-label={label}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {children}
          </svg>
        ) : null}
      </div>
    </div>
  );
}

const Draw = styled.path<{ $on: boolean; $d: number }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d }) => play($on, $d, '1400ms')}
`;
const Show = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;
const RiseRect = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: bottom;
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '700ms')}
`;
const WideRect = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '800ms')}
`;

const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

function Hand({ x, y, children, color, anchor = 'start', size = 20 }: { x: number; y: number; children: ReactNode; color: string; anchor?: 'start' | 'middle' | 'end'; size?: number }) {
  return (
    <text x={x} y={y} fontFamily={fonts.hand} fontSize={size} fill={color} textAnchor={anchor}>
      {children}
    </text>
  );
}

function Mono({ x, y, children, color, anchor = 'start', weight }: { x: number; y: number; children: ReactNode; color: string; anchor?: 'start' | 'middle' | 'end'; weight?: number }) {
  return (
    <text x={x} y={y} fontFamily={fonts.mono} fontSize={11} fill={color} textAnchor={anchor} fontWeight={weight}>
      {children}
    </text>
  );
}

/* ---------- 01 Loan: balance ribbon, the gap between the two runs is what prepaying buys ---------- */

function LoanRibbon() {
  const theme = useTheme();
  const loan = useMemo(homeLoanExample, []);
  const H = 280;
  const { width: w, on, frame } = useChart(H);
  const pad = { t: 16, r: 12, b: 26, l: 44 };
  const x = (yr: number) => pad.l + (yr / HOME_LOAN.years) * (w - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / HOME_LOAN.principal) * (H - pad.t - pad.b);
  const base = loan.base.yearlyBalances.map((v, i) => [x(i), y(v)] as [number, number]);
  const pre = loan.prepay.yearlyBalances.map((v, i) => [x(i), y(v)] as [number, number]);
  const floor = y(0);
  const baseArea = `${path(base)} L${x(loan.base.yearlyBalances.length - 1)} ${floor} L${pad.l} ${floor} Z`;
  const preArea = `${path(pre)} L${x(loan.prepay.yearlyBalances.length - 1)} ${floor} L${pad.l} ${floor} Z`;
  const closeYr = loan.prepay.yearlyBalances.length - 1;
  const hatch = useId().replace(/:/g, '');
  const gapYr = Math.min(closeYr + 1, HOME_LOAN.years - 3);
  return (
    <Frame
      frame={frame}
      label={`Outstanding home loan balance by year. With EMI only it reaches zero after ${HOME_LOAN.years} years; with ${formatINR(HOME_LOAN.prepayPerYear)} prepaid each year it closes after ${loan.prepay.months / 12} years.`}
    >
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={theme.colors.textMuted} strokeWidth="1" opacity="0.45" />
        </pattern>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={w - pad.r} y1={y(HOME_LOAN.principal * f)} y2={y(HOME_LOAN.principal * f)} stroke={f === 0 ? theme.colors.textPrimary : theme.colors.borderSubtle} strokeDasharray={f === 0 ? undefined : '2 4'} />
          <Mono x={pad.l - 8} y={y(HOME_LOAN.principal * f) + 4} anchor="end" color={theme.colors.textMuted}>
            {short(HOME_LOAN.principal * f)}
          </Mono>
        </g>
      ))}
      {[0, 5, 10, 15, 20].map((t, i, a) => (
        <Mono key={t} x={x(t)} y={H - 6} anchor={i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'} color={theme.colors.textMuted}>
          {t === 0 ? 'TODAY' : `YR ${t}`}
        </Mono>
      ))}
      <Show $on={on} $d={200}>
        <path d={baseArea} fill={`url(#${hatch})`} />
      </Show>
      <Show $on={on} $d={500}>
        <path d={preArea} fill={theme.colors.brand} opacity={0.22} />
      </Show>
      <Draw $on={on} $d={0} d={path(base)} pathLength={1} fill="none" stroke={theme.colors.textMuted} strokeWidth={2} />
      <Draw $on={on} $d={300} d={path(pre)} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={3} strokeLinejoin="round" />
      <Show $on={on} $d={1500}>
        <circle cx={x(closeYr)} cy={floor} r={5} fill={theme.colors.bgSurface} stroke={theme.colors.brand} strokeWidth={2.5} />
        <Hand x={x(closeYr)} y={floor - 14} anchor="middle" color={theme.colors.brandText}>
          debt-free in {loan.prepay.months / 12} yrs
        </Hand>
        <Hand x={x(gapYr)} y={y(loan.base.yearlyBalances[gapYr] ?? 0) - 12} anchor="middle" color={theme.colors.textSecondary} size={w < 480 ? 17 : 20}>
          {short(loan.interestSaved)} less interest
        </Hand>
      </Show>
    </Frame>
  );
}

function DebtOrder() {
  const theme = useTheme();
  const debt = useMemo(debtExample, []);
  const H = 96;
  const { width: w, on, frame } = useChart(H);
  const rows = [
    { label: 'SMALLEST BALANCE FIRST', v: debt.snowball.totalInterest, color: theme.colors.textMuted },
    { label: 'HIGHEST RATE FIRST', v: debt.avalanche.totalInterest, color: theme.colors.brand },
  ];
  const max = Math.max(...rows.map((r) => r.v));
  const valW = 84;
  return (
    <Frame frame={frame} label={`Debt payoff interest: smallest balance first ${formatINR(debt.snowball.totalInterest)}, highest rate first ${formatINR(debt.avalanche.totalInterest)}.`}>
      {rows.map((r, i) => (
        <g key={r.label}>
          <Mono x={0} y={i * 46 + 12} color={theme.colors.textMuted}>
            {r.label}
          </Mono>
          <WideRect $on={on} $d={i * 200} x={0} y={i * 46 + 20} height={12} rx={1} width={Math.max(4, ((w - valW) * r.v) / max)} fill={r.color} opacity={i ? 1 : 0.5} />
          <text x={w} y={i * 46 + 31} textAnchor="end" fontFamily={fonts.serif} fontSize={17} fill={theme.colors.textPrimary}>
            {formatINR(r.v)}
          </text>
        </g>
      ))}
    </Frame>
  );
}

function LoanPlanner() {
  const theme = useTheme();
  const loan = useMemo(homeLoanExample, []);
  const debt = useMemo(debtExample, []);
  return (
    <ToolPage
      n="01"
      status={<Pill $tone="warning">On the roadmap</Pill>}
      title="Loan planner"
      description={`See what prepaying ${short(HOME_LOAN.prepayPerYear)} a year does to a ${short(HOME_LOAN.principal)} home loan before you commit.`}
      answer={{ value: formatINR(loan.base.emi), label: 'Monthly EMI' }}
      figures={[
        { value: formatINR(loan.interestSaved), label: 'Interest saved', tone: 'good' },
        { value: `${loan.monthsSaved / 12 === Math.floor(loan.monthsSaved / 12) ? `${loan.monthsSaved / 12} yrs` : `${loan.monthsSaved} mo`}`, label: 'Paid off sooner', tone: 'good' },
      ]}
      bullets={[
        <>
          Prepay vs invest: at an assumed {HOME_LOAN.assumedReturnPct}% return, investing instead ends{' '}
          {short(loan.compare.investCorpus - loan.compare.prepayCorpus)} ahead; prepaying is a certain {HOME_LOAN.ratePct}%.
        </>,
        <>
          Debt avalanche: clearing a 36% card first saves {formatINR(debt.snowball.totalInterest - debt.avalanche.totalInterest)} over
          smallest-balance-first.
          <div style={{ marginTop: 10 }}>
            <DebtOrder />
          </div>
        </>,
      ]}
      footnote={`Illustrative: ${formatINR(HOME_LOAN.principal)} at ${HOME_LOAN.ratePct}% p.a., ${HOME_LOAN.years} years, prepaid yearly; ${HOME_LOAN.assumedReturnPct}% return assumed, taxes ignored. Not financial advice.`}
      chartTitle="Outstanding balance"
      chartNote={`${HOME_LOAN.years}-year loan`}
      chart={<LoanRibbon />}
      keys={[
        { label: 'EMI only', color: theme.colors.textMuted },
        { label: `+ ${short(HOME_LOAN.prepayPerYear)} prepaid every year`, color: theme.colors.brand },
      ]}
    />
  );
}

/* ---------- 02 Budget: pacing line against the budget, with the projected overshoot marked ---------- */

function PacingChart() {
  const theme = useTheme();
  const pf = useMemo(personalFinanceExample, []);
  const H = 260;
  const { width: w, on, frame } = useChart(H);
  const days = 30;
  const today = Math.round(pf.pacing.elapsedPct * days);
  const budget = 8_000;
  const weights = Array.from({ length: today }, (_, i) => 1 + 0.6 * Math.sin(i * 1.7) + (i % 5 === 4 ? 1.2 : 0));
  const wSum = weights.reduce((s, v) => s + v, 0);
  let acc = 0;
  const actual: [number, number][] = [[0, 0], ...weights.map((v, i) => [i + 1, (acc += (v / wSum) * 6_200)] as [number, number])];
  const max = 12_000;
  const pad = { t: 14, r: 12, b: 26, l: 44 };
  const x = (d: number) => pad.l + (d / days) * (w - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const px = (pts: [number, number][]) => pts.map(([d, v]) => [x(d), y(v)] as [number, number]);
  const over = `M${x(days)} ${y(budget)} L${x(days)} ${y(pf.pacing.projected)}`;
  return (
    <Frame
      frame={frame}
      label={`Cumulative food and dining spend: ${formatINR(6_200)} by day ${today}, projected to ${formatINR(pf.pacing.projected)} by day ${days}, above the ${formatINR(budget)} budget.`}
    >
      <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke={theme.colors.textPrimary} />
      {[0, 10, 20, 30].map((t, i, a) => (
        <Mono key={t} x={x(t)} y={H - 6} anchor={i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'} color={theme.colors.textMuted}>
          {t === 0 ? 'DAY 1' : `DAY ${t}`}
        </Mono>
      ))}
      <line x1={pad.l} x2={w - pad.r} y1={y(budget)} y2={y(budget)} stroke={theme.colors.expense} strokeWidth={1.5} />
      <Mono x={pad.l - 8} y={y(budget) + 4} anchor="end" color={theme.colors.expense} weight={600}>
        {short(budget)}
      </Mono>
      <Mono x={pad.l - 8} y={y(0) + 4} anchor="end" color={theme.colors.textMuted}>
        ₹0
      </Mono>
      <line x1={x(today)} x2={x(today)} y1={pad.t} y2={y(0)} stroke={theme.colors.border} strokeDasharray="2 4" />
      <Draw $on={on} $d={0} d={path(px(actual))} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Show $on={on} $d={1200}>
        <path d={path(px([[today, 6_200], [days, pf.pacing.projected]]))} fill="none" stroke={theme.colors.warning} strokeWidth={2.5} strokeDasharray="6 5" />
        <path d={over} stroke={theme.colors.expense} strokeWidth={6} opacity={0.35} />
        <circle cx={x(today)} cy={y(6_200)} r={5} fill={theme.colors.bgSurface} stroke={theme.colors.brand} strokeWidth={2.5} />
        <Hand x={x(today) - 8} y={y(6_200) - 14} anchor="end" color={theme.colors.brandText}>
          today, day {today}
        </Hand>
        <Hand x={x(days) - 10} y={y(pf.pacing.projected) + 4} anchor="end" color={theme.colors.expense}>
          +{formatINR(pf.pacing.overspend)} over
        </Hand>
      </Show>
    </Frame>
  );
}

function BudgetTool() {
  const theme = useTheme();
  const pf = useMemo(personalFinanceExample, []);
  const today = Math.round(pf.pacing.elapsedPct * 30);
  const budget = 8_000;
  const gym = pf.subscriptions.find((s) => s.name.startsWith('Gym'));
  return (
    <ToolPage
      n="02"
      status={<Pill $tone="warning">Coming soon</Pill>}
      title="Budget & subscriptions"
      description="Know mid-month whether a budget will hold, and catch recurring charges you no longer use."
      answer={{ value: formatINR(pf.pacing.overspend), label: 'Projected overspend', tone: 'bad' }}
      figures={[
        { value: `${formatINR(6_200)}`, label: `of ${formatINR(budget)} used, day ${today}` },
        { value: formatINR(pf.emergency.monthly), label: `/month to a ${short(pf.emergency.target)} emergency fund` },
      ]}
      bullets={[
        <>
          Found {pf.subscriptions.length} subscriptions worth {formatINR(pf.subscriptionTotal)}/month, including a gym membership unused for 2
          months.
        </>,
        <>Cancelling it saves {formatINR((gym?.amount ?? 0) * 12)} a year.</>,
      ]}
      footnote={`Illustrative: linear projection from spend to date; goal of ${formatINR(pf.emergency.target)} over ${pf.emergency.months} months. Not financial advice.`}
      chartTitle="Food & dining this month"
      chartNote={`${Math.round(pf.pacing.elapsedPct * 100)}% of the month gone`}
      chart={<PacingChart />}
      keys={[
        { label: 'Spent so far', color: theme.colors.brand },
        { label: 'Projected at this pace', color: theme.colors.warning, dashed: true },
        { label: 'Budget', color: theme.colors.expense },
      ]}
    />
  );
}

/* ---------- 03 Invest: yearly columns, contributions stacked under growth ---------- */

function CorpusSteps() {
  const theme = useTheme();
  const inv = useMemo(investmentExample, []);
  const H = 280;
  const { width: w, on, frame } = useChart(H);
  const pad = { t: 34, r: 8, b: 26, l: 44 };
  const max = Math.ceil(inv.fv / 5_00_000) * 5_00_000;
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const cols = inv.yearly.slice(1);
  const slot = (w - pad.l - pad.r) / cols.length;
  const bw = Math.max(10, Math.min(44, slot * 0.62));
  const narrow = w < 480;
  const last = cols[cols.length - 1];
  const lastX = pad.l + slot * (cols.length - 1) + slot / 2;
  return (
    <Frame
      frame={frame}
      label={`SIP over ${SIP.years} years: amount invested reaches ${formatINR(inv.invested)} and estimated value reaches ${formatINR(inv.fv)} at an assumed ${SIP.assumedReturnPct}% return.`}
    >
      {[0, max / 2, max].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? theme.colors.textPrimary : theme.colors.borderSubtle} strokeDasharray={v === 0 ? undefined : '2 4'} />
          <Mono x={pad.l - 8} y={y(v) + 4} anchor="end" color={theme.colors.textMuted}>
            {short(v)}
          </Mono>
        </g>
      ))}
      {cols.map((c, i) => {
        const cx = pad.l + slot * i + slot / 2;
        return (
          <g key={c.year}>
            <RiseRect $on={on} $d={i * 70} x={cx - bw / 2} y={y(c.value)} width={bw} height={y(0) - y(c.value)} fill={theme.colors.income} rx={1} />
            <RiseRect $on={on} $d={i * 70} x={cx - bw / 2} y={y(c.invested)} width={bw} height={y(0) - y(c.invested)} fill={theme.colors.bgMuted} stroke={theme.colors.border} rx={1} />
            {!narrow || c.year % 2 === 0 ? (
              <Mono x={cx} y={H - 6} anchor="middle" color={theme.colors.textMuted}>
                {`Y${c.year}`}
              </Mono>
            ) : null}
          </g>
        );
      })}
      {last ? (
        <Show $on={on} $d={1100}>
          <path d={`M${lastX - bw / 2 - 6} ${y(last.value)} L${lastX - bw / 2 - 6} ${y(last.invested)}`} stroke={theme.colors.income} strokeWidth={1.5} />
          <Hand x={lastX - bw / 2 - 12} y={(y(last.value) + y(last.invested)) / 2 + 6} anchor="end" color={theme.colors.income}>
            {short(inv.gains)} of growth
          </Hand>
          <Hand x={lastX + bw / 2} y={y(last.value) - 10} anchor="end" color={theme.colors.textPrimary} size={narrow ? 18 : 20}>
            {short(inv.fv)}
          </Hand>
        </Show>
      ) : null}
    </Frame>
  );
}

function InvestmentTracker() {
  const theme = useTheme();
  const inv = useMemo(investmentExample, []);
  return (
    <ToolPage
      n="03"
      status={<Pill $tone="warning">Projections on the roadmap</Pill>}
      title="Investment tracker"
      description="Track SIPs and broker accounts as assets in your net worth, and project where a SIP could go."
      answer={{ value: short(inv.fv), label: `Est. value at ${SIP.assumedReturnPct}% p.a.`, tone: 'good' }}
      figures={[
        { value: short(inv.invested), label: `Invested over ${SIP.years} years` },
        { value: short(inv.gains), label: 'Est. gains', tone: 'good' },
      ]}
      bullets={['SIP debits are transfers to an asset account, not spending.', 'Mutual funds, stocks, EPF, PPF and deposits all count toward net worth.']}
      footnote={`Illustrative: ${formatINR(SIP.monthly)}/month for ${SIP.years} years at an assumed ${SIP.assumedReturnPct}% p.a., compounded monthly. Returns are not guaranteed. Not financial advice.`}
      chartTitle={`SIP of ${formatINR(SIP.monthly)}/month`}
      chartNote={`Value ${formatINR(inv.fv)} after ${SIP.years} years`}
      chart={<CorpusSteps />}
      keys={[
        { label: 'Amount invested', color: theme.colors.textMuted, opacity: 0.4 },
        { label: `Estimated value at ${SIP.assumedReturnPct}%`, color: theme.colors.income },
      ]}
    />
  );
}

/* ---------- 04 Reduce: slope chart, last month on the left, the plan on the right ---------- */

function SlopeChart() {
  const theme = useTheme();
  const rows = SPENDING_BEFORE_AFTER;
  const H = 290;
  const { width: w, on, frame } = useChart(H);
  const narrow = w < 480;
  const pad = { t: 34, b: 14 };
  const lx = narrow ? 62 : 110;
  const rx = w - (narrow ? 150 : 220);
  const max = Math.max(...rows.map((r) => r.before));
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  return (
    <Frame frame={frame} label={`Monthly spending before and after the plan: ${rows.map((r) => `${r.name} ${formatINR(r.before)} to ${formatINR(r.after)}`).join('; ')}`}>
      <Mono x={lx} y={12} anchor="middle" color={theme.colors.textMuted}>
        LAST MONTH
      </Mono>
      <Mono x={rx} y={12} anchor="middle" color={theme.colors.textMuted}>
        WITH THE PLAN
      </Mono>
      <line x1={lx} x2={lx} y1={pad.t - 10} y2={H - pad.b} stroke={theme.colors.textPrimary} strokeWidth={1} />
      <line x1={rx} x2={rx} y1={pad.t - 10} y2={H - pad.b} stroke={theme.colors.textPrimary} strokeWidth={1} />
      {rows.map((r, i) => (
        <g key={r.name}>
          <Draw $on={on} $d={i * 150} d={`M${lx} ${y(r.before)} L${rx} ${y(r.after)}`} pathLength={1} stroke={theme.colors.brand} strokeWidth={2} opacity={0.75} />
          <circle cx={lx} cy={y(r.before)} r={4} fill={theme.colors.expense} opacity={0.7} />
          <Show $on={on} $d={600 + i * 150}>
            <circle cx={rx} cy={y(r.after)} r={4.5} fill={theme.colors.brand} />
          </Show>
          <text x={lx - 10} y={y(r.before) + 4} textAnchor="end" fontFamily={fonts.mono} fontSize={11} fill={theme.colors.textMuted}>
            {narrow ? short(r.before) : formatINR(r.before)}
          </text>
          <Show $on={on} $d={600 + i * 150}>
            <text x={rx + 10} y={y(r.after) + 4} fontSize={narrow ? 12 : 13} fill={theme.colors.textPrimary}>
              <tspan fontFamily={fonts.serif} fontWeight={500}>
                {narrow ? short(r.after) : formatINR(r.after)}
              </tspan>
              <tspan fill={theme.colors.textSecondary} dx={6}>
                {r.name}
              </tspan>
            </text>
          </Show>
        </g>
      ))}
    </Frame>
  );
}

function SpendReducer() {
  const theme = useTheme();
  const before = SPENDING_BEFORE_AFTER.reduce((s, r) => s + r.before, 0);
  const after = SPENDING_BEFORE_AFTER.reduce((s, r) => s + r.after, 0);
  return (
    <ToolPage
      n="04"
      status={<Pill $tone="warning">Coming soon</Pill>}
      title="Spend reducer"
      description="Find where spending crept up against your 3-month average and what cutting back would save."
      answer={{ value: formatINR(before - after), label: 'Saved per month', tone: 'good' }}
      figures={[
        { value: formatINR(before), label: 'Last month' },
        { value: formatINR(after), label: 'With the plan' },
      ]}
      bullets={['Flags merchant creep, spikes, unused subscriptions and avoidable fees.', 'You choose which cuts to make.']}
      footnote="Illustrative: estimated savings assume each cut is kept for the whole month. Not financial advice."
      chartTitle="Monthly spend by category"
      chartNote="Before and after"
      chart={<SlopeChart />}
      keys={[
        { label: 'Last month', color: theme.colors.expense, opacity: 0.7 },
        { label: 'With the plan', color: theme.colors.brand },
      ]}
    />
  );
}

/* ---------- 05 Purchase: cash runway climbing back over the buffer ---------- */

function RunwayChart() {
  const theme = useTheme();
  const a = useMemo(purchaseExample, []);
  const H = 260;
  const { width: w, on, frame } = useChart(H);
  const clip = `runway-${useId().replace(/:/g, '')}`;
  const months = [0, 1, 2];
  const pts = months.map((m) => ({ m, v: PURCHASE.cash + m * PURCHASE.monthlySurplus - PURCHASE.price }));
  const lo = 1_00_000;
  const hi = 1_60_000;
  const pad = { t: 30, r: 28, b: 26, l: 28 };
  const x = (m: number) => pad.l + (m / 2) * (w - pad.l - pad.r);
  const y = (v: number) => H - pad.b - ((v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = pts.map((p) => [x(p.m), y(p.v)] as [number, number]);
  const gap = `${path(line)} L${x(2)} ${y(PURCHASE.buffer)} L${x(0)} ${y(PURCHASE.buffer)} Z`;
  return (
    <Frame
      frame={frame}
      label={`Cash left after buying: ${pts.map((p) => `${p.m === 0 ? 'Buy now' : `In ${p.m} month${p.m > 1 ? 's' : ''}`} ${formatINR(p.v)}`).join(', ')}; emergency buffer ${formatINR(PURCHASE.buffer)}.`}
    >
      <clipPath id={clip}>
        <rect x={0} y={y(PURCHASE.buffer)} width={w} height={H} />
      </clipPath>
      <line x1={0} x2={w} y1={H - pad.b} y2={H - pad.b} stroke={theme.colors.textPrimary} />
      <Show $on={on} $d={700}>
        <path d={gap} fill={theme.colors.expense} opacity={0.14} clipPath={`url(#${clip})`} />
      </Show>
      <line x1={0} x2={w} y1={y(PURCHASE.buffer)} y2={y(PURCHASE.buffer)} stroke={theme.colors.textPrimary} strokeWidth={1.5} strokeDasharray="6 5" />
      <Mono x={w} y={y(PURCHASE.buffer) - 8} anchor="end" color={theme.colors.textPrimary}>
        {`BUFFER ${short(PURCHASE.buffer)}`}
      </Mono>
      <Draw $on={on} $d={0} d={path(line)} pathLength={1} fill="none" stroke={theme.colors.textSecondary} strokeWidth={2} />
      {pts.map((p, i) => {
        const ok = p.v >= PURCHASE.buffer;
        const c = ok ? theme.colors.income : theme.colors.expense;
        return (
          <g key={p.m}>
            <Show $on={on} $d={400 + i * 250}>
              <circle cx={x(p.m)} cy={y(p.v)} r={7} fill={c} stroke={theme.colors.bgSurface} strokeWidth={3} />
              <text x={x(p.m)} y={y(p.v) + (ok ? -16 : 26)} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontFamily={fonts.serif} fontSize={17} fill={c}>
                {formatINR(p.v)}
              </text>
            </Show>
            <Mono x={x(p.m)} y={H - 6} anchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} color={theme.colors.textMuted}>
              {p.m === 0 ? 'BUY NOW' : `IN ${p.m} MONTH${p.m > 1 ? 'S' : ''}`}
            </Mono>
          </g>
        );
      })}
      <Show $on={on} $d={1300}>
        <Hand x={x(0.5)} y={y(PURCHASE.buffer) + 34} anchor="middle" color={theme.colors.expense} size={w < 480 ? 17 : 20}>
          {short(a.shortfall)} short
        </Hand>
      </Show>
    </Frame>
  );
}

function PurchasePlanner() {
  const theme = useTheme();
  const a = purchaseExample();
  return (
    <ToolPage
      n="05"
      status={<Pill $tone="warning">Coming soon</Pill>}
      title="Purchase planner"
      description={`Ask "Can I afford a ${formatINR(PURCHASE.price)} laptop?" and see the impact on your buffer and goals.`}
      answer={{ value: `${a.waitMonths} months`, label: 'Wait to stay above it', tone: 'good' }}
      figures={[
        { value: formatINR(a.afterPurchase), label: 'Cash left if bought today' },
        { value: formatINR(a.shortfall), label: 'Below emergency buffer', tone: 'bad' },
      ]}
      bullets={[
        `Waiting ${a.waitMonths} months leaves ${formatINR(a.afterWaiting)}, above the ${formatINR(PURCHASE.buffer)} buffer.`,
        'Your emergency-fund contribution continues as planned.',
      ]}
      footnote={`Illustrative: ${formatINR(PURCHASE.cash)} in savings, ${formatINR(PURCHASE.monthlySurplus)}/month surplus after goals. Not financial advice.`}
      chartTitle="Cash left after buying"
      chartNote={`Buffer ${formatINR(PURCHASE.buffer)}`}
      chart={<RunwayChart />}
      keys={[
        { label: 'Below buffer', color: theme.colors.expense },
        { label: 'Above buffer', color: theme.colors.income },
        { label: 'Emergency buffer', color: theme.colors.textPrimary, dashed: true },
      ]}
    />
  );
}

/* ---------- section ---------- */

const tools: { key: string; label: string; pane: () => ReactNode }[] = [
  { key: 'loans', label: 'Loan planner', pane: () => <LoanPlanner /> },
  { key: 'budget', label: 'Budget & subscriptions', pane: () => <BudgetTool /> },
  { key: 'invest', label: 'Investment tracker', pane: () => <InvestmentTracker /> },
  { key: 'reduce', label: 'Spend reducer', pane: () => <SpendReducer /> },
  { key: 'purchase', label: 'Purchase planner', pane: () => <PurchasePlanner /> },
];

function ToolTabs() {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = tools.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? active === last
          ? 0
          : active + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? active === 0
            ? last
            : active - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
    buttons.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const tool = tools[active] ?? tools[0];
  return (
    <>
      <Index role="tablist" aria-label="Planning tools" onKeyDown={onKeyDown}>
        {tools.map((t, i) => (
          <Chapter
            key={t.key}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tool-tab-${t.key}`}
            aria-selected={i === active}
            aria-controls={`tool-panel-${t.key}`}
            tabIndex={i === active ? 0 : -1}
            $active={i === active}
            onClick={() => setActive(i)}
          >
            <span className="num" aria-hidden>
              Ch. {String(i + 1).padStart(2, '0')}
            </span>
            <span className="name">{t.label}</span>
          </Chapter>
        ))}
      </Index>
      {tool ? (
        <div role="tabpanel" id={`tool-panel-${tool.key}`} aria-labelledby={`tool-tab-${tool.key}`} key={tool.key}>
          {tool.pane()}
        </div>
      ) : null}
    </>
  );
}

export function PlanningToolsSection() {
  return (
    <SectionShell id="planning-tools" aria-labelledby="planning-tools-title" $muted>
      <Container>
        <SectionHeading
          id="planning-tools-title"
          eyebrow="Planning tools"
          index="03"
          title="Plan loans, investments and spending inside Arvo"
          lead="Tools that work on your own ledger, with every figure computed by formulas, not guessed."
        />
        <Reveal>
          <ToolTabs />
        </Reveal>
      </Container>
    </SectionShell>
  );
}
