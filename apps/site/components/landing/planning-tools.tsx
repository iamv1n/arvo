'use client';

import { BankOutlined, CheckCircleFilled, FallOutlined, LaptopOutlined, RiseOutlined, WalletOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
import { drawStroke, fadeIn, formatINR, growX, growY, play, useInView } from './motion';
import { Card, Container, fonts, Pill, Reveal, SectionHeading, SectionShell } from './primitives';

/* ---------- formatting ---------- */

/** Short Indian-unit label: ₹40L, ₹1.2Cr, ₹8K. */
function short(v: number) {
  if (v >= 1_00_00_000) return `₹${+(v / 1_00_00_000).toFixed(2)}Cr`;
  if (v >= 1_00_000) return `₹${+(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${+(v / 1_000).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
}

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 × a power of ten. */
function niceMax(v: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/* ---------- layout ---------- */

/* Horizontally scrolling strip of tools; snaps on touch devices. */
const TabList = styled.div`
  display: flex;
  gap: 0;
  margin: 0 0 ${({ theme }) => theme.space[8]}px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &::-webkit-scrollbar {
    display: none;
  }
  & > button {
    scroll-snap-align: start;
    flex: 0 0 auto;
  }
  /* On narrow screens the last visible tab fades out, hinting there is more to scroll. */
  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding-right: 48px;
    mask-image: linear-gradient(to right, #000 calc(100% - 56px), transparent);
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 56px), transparent);
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px 12px 0;
  margin-right: 20px;
  border-bottom: 2px solid ${({ theme, $active }) => ($active ? theme.colors.textPrimary : 'transparent')};
  margin-bottom: -1px;
  color: ${({ theme, $active }) => ($active ? theme.colors.textPrimary : theme.colors.textSecondary)};
  font-family: ${fonts.serif};
  font-size: 19px;
  font-weight: ${({ $active }) => ($active ? 500 : 400)};
  letter-spacing: -0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color ${({ theme }) => theme.motion.fast},
    border-color ${({ theme }) => theme.motion.fast};
  & .anticon {
    font-size: 14px;
    color: ${({ theme, $active }) => ($active ? theme.colors.brandText : theme.colors.textMuted)};
  }
  & .short {
    display: none;
  }
  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 2px;
  }
`;

const Pane = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[8]}px;
  min-width: 0;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: ${({ theme }) => theme.space[12]}px;
    align-items: stretch;
    min-height: 420px;
  }
`;

const Text = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]}px;
  min-width: 0;
  & h3 {
    margin: 0;
    font-size: 26px;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .desc {
    margin: -8px 0 0;
    font-size: 16px;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Figures = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[4]}px;
  & dd {
    margin: 0;
    font-size: clamp(18px, 1.7vw, 23px);
    font-weight: 700;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textPrimary};
    white-space: nowrap;
  }
  & dd.good {
    color: ${({ theme }) => theme.colors.income};
  }
  & dd.bad {
    color: ${({ theme }) => theme.colors.expense};
  }
  & dt {
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.35;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & > div {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
    padding-left: 12px;
    border-left: 2px solid ${({ theme }) => theme.colors.border};
    min-width: 0;
  }
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: ${({ theme }) => theme.space[3]}px;
  }
`;

const Bullets = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  font-size: 15px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};
  & li {
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 8px;
  }
  & .anticon {
    color: ${({ theme }) => theme.colors.brand};
    margin-top: 5px;
  }
`;

const Footnote = styled.p`
  margin: auto 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ChartCard = styled(Card)`
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.space[6]}px;
  min-width: 0;
  @media (max-width: 480px) {
    padding: ${({ theme }) => theme.space[4]}px;
  }
`;

const ChartHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.space[4]}px;
  & h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & span {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const ChartBox = styled.div`
  flex: 1;
  min-height: 300px;
  position: relative;
`;

const Legend = styled.ul`
  list-style: none;
  margin: ${({ theme }) => theme.space[4]}px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 13px;
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
    border-radius: 2px;
  }
`;

interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
  opacity?: number;
}

function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <Legend aria-hidden>
      {items.map((it) => (
        <li key={it.label}>
          <i
            style={
              it.dashed
                ? { background: `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)` }
                : { background: it.color, opacity: it.opacity ?? 1 }
            }
          />
          {it.label}
        </li>
      ))}
    </Legend>
  );
}

/** Measures the chart box so SVG text renders at real pixel sizes instead of being scaled. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const H = 300;
const PAD = { top: 12, right: 12, bottom: 30, left: 56 };

/* ---------- charts ---------- */

const Stroke = styled.path<{ $on: boolean; $d: number }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d }) => play($on, $d, '1500ms')}
`;

const FadeG = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
`;

const VBar = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: bottom;
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '800ms')}
`;

const HBar = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '800ms')}
`;

interface LineSeries {
  label: string;
  color: string;
  /** [x, y] points in data units. */
  points: [number, number][];
  dashed?: boolean;
}

function YGrid({ w, max, ticks = 4 }: { w: number; max: number; ticks?: number }) {
  const theme = useTheme();
  const y = (v: number) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom);
  return (
    <g>
      {Array.from({ length: ticks + 1 }, (_, i) => (max * i) / ticks).map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={w - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke={v === 0 ? theme.colors.border : theme.colors.borderSubtle}
            strokeDasharray={v === 0 ? undefined : '3 4'}
          />
          <text x={PAD.left - 10} y={y(v) + 4} fontSize={12} textAnchor="end" fill={theme.colors.textMuted}>
            {short(v)}
          </text>
        </g>
      ))}
    </g>
  );
}

function LineChart({
  series,
  xMax,
  xTicks,
  xLabel,
  ariaLabel,
  refLine,
}: {
  series: LineSeries[];
  xMax: number;
  xTicks: number[];
  xLabel: (x: number) => string;
  ariaLabel: string;
  refLine?: { value: number; label: string };
}) {
  const theme = useTheme();
  const [box, width] = useWidth<HTMLDivElement>();
  const [ioRef, on] = useInView<HTMLDivElement>(0.3);
  const max = niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p[1])), refLine?.value ?? 0));
  const x = (v: number) => PAD.left + (v / xMax) * (width - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom);
  return (
    <ChartBox ref={box}>
      <div ref={ioRef} style={{ height: H }}>
        {width > 0 ? (
          <svg width={width} height={H} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
            <YGrid w={width} max={max} />
            {xTicks.map((t, i) => (
              <text
                key={t}
                x={x(t)}
                y={H - 8}
                fontSize={12}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                fill={theme.colors.textMuted}
              >
                {xLabel(t)}
              </text>
            ))}
            {refLine ? (
              <g>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(refLine.value)} y2={y(refLine.value)} stroke={theme.colors.expense} strokeWidth={1.5} />
                <text x={PAD.left + 6} y={y(refLine.value) - 8} fontSize={12} fontWeight={600} textAnchor="start" fill={theme.colors.expense}>
                  {refLine.label}
                </text>
              </g>
            ) : null}
            {series.map((s, si) => {
              const d = s.points.map(([px, py], i) => `${i ? 'L' : 'M'}${x(px).toFixed(1)} ${y(py).toFixed(1)}`).join(' ');
              const last = s.points[s.points.length - 1] ?? [0, 0];
              return (
                <g key={s.label}>
                  {s.dashed ? (
                    <FadeG $on={on} $d={900 + si * 300}>
                      <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" />
                    </FadeG>
                  ) : (
                    <Stroke $on={on} $d={si * 300} d={d} pathLength={1} fill="none" stroke={s.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  <FadeG $on={on} $d={1300 + si * 300}>
                    <circle cx={x(last[0])} cy={y(last[1])} r={4.5} fill={theme.colors.bgSurfaceRaised} stroke={s.color} strokeWidth={2.5} />
                  </FadeG>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </ChartBox>
  );
}

function BeforeAfterChart({ rows }: { rows: { name: string; before: number; after: number }[] }) {
  const theme = useTheme();
  const [box, width] = useWidth<HTMLDivElement>();
  const [ioRef, on] = useInView<HTMLDivElement>(0.3);
  const max = Math.max(...rows.map((r) => r.before));
  const rowH = H / rows.length;
  const valueW = 64;
  const barMax = Math.max(40, width - valueW - 8);
  return (
    <ChartBox ref={box}>
      <div ref={ioRef} style={{ height: H }}>
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`Monthly spending before and after the plan: ${rows.map((r) => `${r.name} ${formatINR(r.before)} to ${formatINR(r.after)}`).join('; ')}`}
            style={{ display: 'block' }}
          >
            {rows.map((r, i) => {
              const y0 = i * rowH + 4;
              return (
                <g key={r.name}>
                  <text x={0} y={y0 + 12} fontSize={13} fill={theme.colors.textPrimary}>
                    {r.name}
                  </text>
                  <HBar $on={on} $d={i * 120} x={0} y={y0 + 20} height={10} rx={3} width={Math.max(3, (r.before / max) * barMax)} fill={theme.colors.expense} opacity={0.35} />
                  <HBar $on={on} $d={i * 120 + 250} x={0} y={y0 + 34} height={10} rx={3} width={Math.max(3, (r.after / max) * barMax)} fill={theme.colors.brand} />
                  <text x={width} y={y0 + 29} fontSize={12} textAnchor="end" fill={theme.colors.textMuted}>
                    {formatINR(r.before)}
                  </text>
                  <text x={width} y={y0 + 43} fontSize={12} textAnchor="end" fontWeight={600} fill={theme.colors.textPrimary}>
                    {formatINR(r.after)}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </ChartBox>
  );
}

function ColumnChart({
  bars,
  refLine,
  ariaLabel,
}: {
  bars: { label: string; value: number; color: string }[];
  refLine: { value: number; label: string };
  ariaLabel: string;
}) {
  const theme = useTheme();
  const [box, width] = useWidth<HTMLDivElement>();
  const [ioRef, on] = useInView<HTMLDivElement>(0.3);
  const max = niceMax(Math.max(...bars.map((b) => b.value), refLine.value) * 1.1);
  const plotW = width - PAD.left - PAD.right;
  const slot = plotW / bars.length;
  const bw = Math.min(72, slot * 0.5);
  const y = (v: number) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom);
  return (
    <ChartBox ref={box}>
      <div ref={ioRef} style={{ height: H }}>
        {width > 0 ? (
          <svg width={width} height={H} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
            <YGrid w={width} max={max} />
            {bars.map((b, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              return (
                <g key={b.label}>
                  <VBar $on={on} $d={i * 150} x={cx - bw / 2} y={y(b.value)} width={bw} height={y(0) - y(b.value)} rx={5} fill={b.color} />
                  <FadeG $on={on} $d={600 + i * 150}>
                    <text x={cx} y={y(b.value) + 20} fontSize={12} fontWeight={600} textAnchor="middle" fill={theme.colors.onBrand}>
                      {bw >= 64 ? formatINR(b.value) : short(b.value)}
                    </text>
                  </FadeG>
                  <text x={cx} y={H - 8} fontSize={12} textAnchor="middle" fill={theme.colors.textMuted}>
                    {b.label}
                  </text>
                </g>
              );
            })}
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              stroke={theme.colors.textPrimary}
              strokeWidth={1.5}
              strokeDasharray="6 5"
            />
          </svg>
        ) : null}
      </div>
    </ChartBox>
  );
}

/* ---------- tool panes ---------- */

interface Figure {
  value: string;
  label: string;
  tone?: 'good' | 'bad';
}

function ToolPane({
  status,
  title,
  description,
  figures,
  bullets,
  footnote,
  chartTitle,
  chartNote,
  chart,
  legend,
}: {
  status: ReactNode;
  title: string;
  description: string;
  figures: Figure[];
  bullets: ReactNode[];
  footnote: string;
  chartTitle: string;
  chartNote?: string;
  chart: ReactNode;
  legend: LegendItem[];
}) {
  return (
    <Pane>
      <Text>
        <div>{status}</div>
        <h3>{title}</h3>
        <p className="desc">{description}</p>
        <Figures>
          {figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className={f.tone}>{f.value}</dd>
            </div>
          ))}
        </Figures>
        <Bullets>
          {bullets.map((b, i) => (
            <li key={i}>
              <CheckCircleFilled aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </Bullets>
        <Footnote>{footnote}</Footnote>
      </Text>
      <ChartCard>
        <ChartHead>
          <h4>{chartTitle}</h4>
          {chartNote ? <span>{chartNote}</span> : null}
        </ChartHead>
        {chart}
        <ChartLegend items={legend} />
      </ChartCard>
    </Pane>
  );
}

const roadmap = <Pill $tone="warning">On the roadmap</Pill>;
const soon = <Pill $tone="warning">Coming soon</Pill>;

function LoanPlanner() {
  const theme = useTheme();
  const loan = useMemo(homeLoanExample, []);
  const debt = useMemo(debtExample, []);
  const toPoints = (b: number[]) => b.map((v, i) => [i, v] as [number, number]);
  return (
    <ToolPane
      status={roadmap}
      title="Loan planner"
      description={`See what prepaying ${short(HOME_LOAN.prepayPerYear)} a year does to a ${short(HOME_LOAN.principal)} home loan before you commit.`}
      figures={[
        { value: formatINR(loan.base.emi), label: 'Monthly EMI' },
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
        </>,
      ]}
      footnote={`Illustrative: ${formatINR(HOME_LOAN.principal)} at ${HOME_LOAN.ratePct}% p.a., ${HOME_LOAN.years} years, prepaid yearly; ${HOME_LOAN.assumedReturnPct}% return assumed, taxes ignored. Not financial advice.`}
      chartTitle="Outstanding balance"
      chartNote={`${HOME_LOAN.years}-year loan`}
      chart={
        <LineChart
          ariaLabel={`Outstanding home loan balance by year. With EMI only it reaches zero after ${HOME_LOAN.years} years; with ${formatINR(HOME_LOAN.prepayPerYear)} prepaid each year it closes after ${loan.prepay.months / 12} years.`}
          xMax={HOME_LOAN.years}
          xTicks={[0, 5, 10, 15, 20]}
          xLabel={(v) => (v === 0 ? 'Today' : `Year ${v}`)}
          series={[
            { label: 'EMI only', color: theme.colors.textMuted, points: toPoints(loan.base.yearlyBalances) },
            { label: 'With prepayment', color: theme.colors.brand, points: toPoints(loan.prepay.yearlyBalances) },
          ]}
        />
      }
      legend={[
        { label: 'EMI only', color: theme.colors.textMuted },
        { label: `+ ${short(HOME_LOAN.prepayPerYear)} prepaid every year`, color: theme.colors.brand },
      ]}
    />
  );
}

function BudgetTool() {
  const theme = useTheme();
  const pf = useMemo(personalFinanceExample, []);
  const days = 30;
  const today = Math.round(pf.pacing.elapsedPct * days);
  const budget = 8_000;
  // Cumulative spend so far follows an uneven but deterministic path that lands on the actual total.
  const weights = Array.from({ length: today }, (_, i) => 1 + 0.6 * Math.sin(i * 1.7) + (i % 5 === 4 ? 1.2 : 0));
  const wSum = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  const actual: [number, number][] = [[0, 0], ...weights.map((w, i) => [i + 1, (acc += (w / wSum) * 6_200)] as [number, number])];
  const projected: [number, number][] = [
    [today, 6_200],
    [days, pf.pacing.projected],
  ];
  const gym = pf.subscriptions.find((s) => s.name.startsWith('Gym'));
  return (
    <ToolPane
      status={soon}
      title="Budget & subscriptions"
      description="Know mid-month whether a budget will hold, and catch recurring charges you no longer use."
      figures={[
        { value: `${formatINR(6_200)}`, label: `of ${formatINR(budget)} used, day ${today}` },
        { value: formatINR(pf.pacing.overspend), label: 'Projected overspend', tone: 'bad' },
        { value: formatINR(pf.emergency.monthly), label: `/month to a ${short(pf.emergency.target)} emergency fund` },
      ]}
      bullets={[
        <>
          Found {pf.subscriptions.length} subscriptions worth {formatINR(pf.subscriptionTotal)}/month, including a gym
          membership unused for 2 months.
        </>,
        <>Cancelling it saves {formatINR((gym?.amount ?? 0) * 12)} a year.</>,
      ]}
      footnote={`Illustrative: linear projection from spend to date; goal of ${formatINR(pf.emergency.target)} over ${pf.emergency.months} months. Not financial advice.`}
      chartTitle="Food & dining this month"
      chartNote={`${Math.round(pf.pacing.elapsedPct * 100)}% of the month gone`}
      chart={
        <LineChart
          ariaLabel={`Cumulative food and dining spend: ${formatINR(6_200)} by day ${today}, projected to ${formatINR(pf.pacing.projected)} by day ${days}, above the ${formatINR(budget)} budget.`}
          xMax={days}
          xTicks={[0, 10, 20, 30]}
          xLabel={(v) => (v === 0 ? 'Day 1' : `Day ${v}`)}
          refLine={{ value: budget, label: `Budget ${short(budget)}` }}
          series={[
            { label: 'Spent', color: theme.colors.brand, points: actual },
            { label: 'Projected', color: theme.colors.warning, points: projected, dashed: true },
          ]}
        />
      }
      legend={[
        { label: 'Spent so far', color: theme.colors.brand },
        { label: 'Projected at this pace', color: theme.colors.warning, dashed: true },
        { label: 'Budget', color: theme.colors.expense },
      ]}
    />
  );
}

function InvestmentTracker() {
  const theme = useTheme();
  const inv = useMemo(investmentExample, []);
  return (
    <ToolPane
      status={<Pill $tone="warning">Projections on the roadmap</Pill>}
      title="Investment tracker"
      description="Track SIPs and broker accounts as assets in your net worth, and project where a SIP could go."
      figures={[
        { value: short(inv.invested), label: `Invested over ${SIP.years} years` },
        { value: short(inv.fv), label: `Est. value at ${SIP.assumedReturnPct}% p.a.`, tone: 'good' },
        { value: short(inv.gains), label: 'Est. gains', tone: 'good' },
      ]}
      bullets={[
        'SIP debits are transfers to an asset account, not spending.',
        'Mutual funds, stocks, EPF, PPF and deposits all count toward net worth.',
      ]}
      footnote={`Illustrative: ${formatINR(SIP.monthly)}/month for ${SIP.years} years at an assumed ${SIP.assumedReturnPct}% p.a., compounded monthly. Returns are not guaranteed. Not financial advice.`}
      chartTitle={`SIP of ${formatINR(SIP.monthly)}/month`}
      chartNote={`Value ${formatINR(inv.fv)} after ${SIP.years} years`}
      chart={
        <LineChart
          ariaLabel={`SIP over ${SIP.years} years: amount invested reaches ${formatINR(inv.invested)} and estimated value reaches ${formatINR(inv.fv)} at an assumed ${SIP.assumedReturnPct}% return.`}
          xMax={SIP.years}
          xTicks={[0, 2, 4, 6, 8, 10]}
          xLabel={(v) => (v === 0 ? 'Start' : `Year ${v}`)}
          series={[
            { label: 'Invested', color: theme.colors.textMuted, points: inv.yearly.map((p) => [p.year, p.invested]) },
            { label: 'Estimated value', color: theme.colors.income, points: inv.yearly.map((p) => [p.year, p.value]) },
          ]}
        />
      }
      legend={[
        { label: 'Amount invested', color: theme.colors.textMuted },
        { label: `Estimated value at ${SIP.assumedReturnPct}%`, color: theme.colors.income },
      ]}
    />
  );
}

function SpendReducer() {
  const theme = useTheme();
  const before = SPENDING_BEFORE_AFTER.reduce((s, r) => s + r.before, 0);
  const after = SPENDING_BEFORE_AFTER.reduce((s, r) => s + r.after, 0);
  return (
    <ToolPane
      status={soon}
      title="Spend reducer"
      description="Find where spending crept up against your 3-month average and what cutting back would save."
      figures={[
        { value: formatINR(before), label: 'Last month' },
        { value: formatINR(after), label: 'With the plan' },
        { value: formatINR(before - after), label: 'Saved per month', tone: 'good' },
      ]}
      bullets={['Flags merchant creep, spikes, unused subscriptions and avoidable fees.', 'You choose which cuts to make.']}
      footnote="Illustrative: estimated savings assume each cut is kept for the whole month. Not financial advice."
      chartTitle="Monthly spend by category"
      chartNote="Before and after"
      chart={<BeforeAfterChart rows={SPENDING_BEFORE_AFTER} />}
      legend={[
        { label: 'Last month', color: theme.colors.expense, opacity: 0.35 },
        { label: 'With the plan', color: theme.colors.brand },
      ]}
    />
  );
}

function PurchasePlanner() {
  const theme = useTheme();
  const a = purchaseExample();
  const bars = [0, 1, 2].map((m) => {
    const left = PURCHASE.cash + m * PURCHASE.monthlySurplus - PURCHASE.price;
    return {
      label: m === 0 ? 'Buy now' : `In ${m} month${m > 1 ? 's' : ''}`,
      value: left,
      color: left >= PURCHASE.buffer ? theme.colors.income : theme.colors.expense,
    };
  });
  return (
    <ToolPane
      status={soon}
      title="Purchase planner"
      description={`Ask "Can I afford a ${formatINR(PURCHASE.price)} laptop?" and see the impact on your buffer and goals.`}
      figures={[
        { value: formatINR(a.afterPurchase), label: 'Cash left if bought today' },
        { value: formatINR(a.shortfall), label: 'Below emergency buffer', tone: 'bad' },
        { value: `${a.waitMonths} months`, label: 'Wait to stay above it', tone: 'good' },
      ]}
      bullets={[
        `Waiting ${a.waitMonths} months leaves ${formatINR(a.afterWaiting)}, above the ${formatINR(PURCHASE.buffer)} buffer.`,
        'Your emergency-fund contribution continues as planned.',
      ]}
      footnote={`Illustrative: ${formatINR(PURCHASE.cash)} in savings, ${formatINR(PURCHASE.monthlySurplus)}/month surplus after goals. Not financial advice.`}
      chartTitle="Cash left after buying"
      chartNote={`Buffer ${formatINR(PURCHASE.buffer)}`}
      chart={
        <ColumnChart
          ariaLabel={`Cash left after buying: ${bars.map((b) => `${b.label} ${formatINR(b.value)}`).join(', ')}; emergency buffer ${formatINR(PURCHASE.buffer)}.`}
          bars={bars}
          refLine={{ value: PURCHASE.buffer, label: 'Buffer' }}
        />
      }
      legend={[
        { label: 'Below buffer', color: theme.colors.expense },
        { label: 'Above buffer', color: theme.colors.income },
        { label: 'Emergency buffer', color: theme.colors.textPrimary, dashed: true },
      ]}
    />
  );
}

/* ---------- section ---------- */

const tools: { key: string; label: string; shortLabel?: string; icon: ReactNode; pane: () => ReactNode }[] = [
  { key: 'loans', label: 'Loan planner', icon: <BankOutlined />, pane: () => <LoanPlanner /> },
  { key: 'budget', label: 'Budget & subscriptions', shortLabel: 'Budgets', icon: <WalletOutlined />, pane: () => <BudgetTool /> },
  { key: 'invest', label: 'Investment tracker', icon: <RiseOutlined />, pane: () => <InvestmentTracker /> },
  { key: 'reduce', label: 'Spend reducer', icon: <FallOutlined />, pane: () => <SpendReducer /> },
  { key: 'purchase', label: 'Purchase planner', icon: <LaptopOutlined />, pane: () => <PurchasePlanner /> },
];

function ToolTabs() {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = tools.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? active === last ? 0 : active + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? active === 0 ? last : active - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  };
  const tool = tools[active] ?? tools[0];
  return (
    <>
      <TabList role="tablist" aria-label="Planning tools" onKeyDown={onKeyDown}>
        {tools.map((t, i) => (
          <TabButton
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
            <span aria-hidden>{t.icon}</span>
            <span>
              {t.shortLabel ? (
                <>
                  <span className="full">{t.label}</span>
                  <span className="short">{t.shortLabel}</span>
                </>
              ) : (
                t.label
              )}
            </span>
          </TabButton>
        ))}
      </TabList>
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
