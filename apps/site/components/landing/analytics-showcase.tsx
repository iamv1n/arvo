'use client';

import styled, { useTheme } from 'styled-components';
import { monthly } from './charts';
import { drawStroke, fadeIn, fadeUp, growX, growY, play, useCountUp, useInView } from './motion';
import { fonts } from './primitives';

/*
 * "Analytics without the spreadsheet": an editorial spread, not a row of dashboard cards.
 * Serif figures carry the story, mono labels carry the axes, and each chart states one finding.
 */

const Head = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[3]}px;
  margin: 112px 0 ${({ theme }) => theme.space[8]}px;
  padding-top: ${({ theme }) => theme.space[5]}px;
  border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 1.3fr 1fr;
    align-items: end;
    gap: ${({ theme }) => theme.space[10]}px;
  }
  h3 {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 400;
    font-size: clamp(28px, 3.4vw, 40px);
    line-height: 1;
    letter-spacing: -0.035em;
    font-variation-settings: 'opsz' 144;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  h3 em {
    font-style: italic;
    color: ${({ theme }) => theme.colors.brandText};
  }
  p {
    margin: 0;
    font-family: ${fonts.mono};
    font-size: 13px;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Spread = styled.div`
  display: grid;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 1.35fr 1fr;
    grid-template-rows: auto auto;
  }
`;

const Cell = styled.figure<{ $on: boolean; $d: number }>`
  margin: 0;
  min-width: 0;
  padding: ${({ theme }) => theme.space[6]}px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '700ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    &:first-child {
      grid-row: span 2;
      padding-right: ${({ theme }) => theme.space[8]}px;
      border-right: 1px solid ${({ theme }) => theme.colors.border};
    }
    &:not(:first-child) {
      padding-left: ${({ theme }) => theme.space[8]}px;
    }
  }
`;

const Label = styled.figcaption`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Figure = styled.div`
  margin: 10px 0 2px;
  font-family: ${fonts.serif};
  font-weight: 400;
  font-size: clamp(30px, 3.4vw, 44px);
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: lining-nums tabular-nums;
  font-variation-settings: 'opsz' 144;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Finding = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[5]}px;
  font-family: ${fonts.serif};
  font-style: italic;
  font-size: 17px;
  color: ${({ theme }) => theme.colors.textSecondary};
  b {
    font-style: normal;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const inr = (lakhs: number) => `₹${lakhs.toLocaleString('en-IN')}`;

/* ---------- 1. Cash flow: income above the axis, spending below, savings as a stitched line ---------- */

const GrowUp = styled.rect<{ $on: boolean; $d: number; $down?: boolean }>`
  transform-box: fill-box;
  transform-origin: ${({ $down }) => ($down ? 'top' : 'bottom')};
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '800ms')}
`;
const Draw = styled.path<{ $on: boolean; $d: number }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d }) => play($on, $d, '1400ms')}
`;
const Show = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
`;

function CashflowMirror({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 520;
  const h = 320;
  const mid = 168;
  const scale = 0.85; // px per ₹1,000
  const col = (w - 40) / monthly.length;
  const x = (i: number) => 40 + col * i + col / 2;
  const saved = monthly.map((m) => m.income - m.expense);
  const savedLine = saved.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${(mid - s * scale).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Mirror chart: monthly income above the line, spending below, and what was saved each month drawn across the middle">
      <text x={0} y={mid - 118} fontSize={11} fontFamily={fonts.mono} fill={theme.colors.income}>
        IN
      </text>
      <text x={0} y={mid + 126} fontSize={11} fontFamily={fonts.mono} fill={theme.colors.expense}>
        OUT
      </text>
      {monthly.map((m, i) => {
        const ih = m.income * scale;
        const eh = m.expense * scale;
        return (
          <g key={m.m}>
            <GrowUp $on={on} $d={200 + i * 90} x={x(i) - 16} y={mid - ih} width={32} height={ih} fill={theme.colors.income} fillOpacity={0.22} />
            <GrowUp $on={on} $d={260 + i * 90} $down x={x(i) - 16} y={mid + 1} width={32} height={eh} fill={theme.colors.expense} fillOpacity={i === 4 ? 0.75 : 0.3} />
            <text x={x(i)} y={h - 8} textAnchor="middle" fontSize={12} fontFamily={fonts.mono} fill={theme.colors.textMuted}>
              {m.m.toUpperCase()}
            </text>
          </g>
        );
      })}
      <line x1={36} x2={w} y1={mid} y2={mid} stroke={theme.colors.textPrimary} />
      <Draw $on={on} $d={900} d={savedLine} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Show $on={on} $d={1800}>
        {saved.map((s, i) => (
          <g key={i}>
            <rect x={x(i) - 4} y={mid - s * scale - 4} width={8} height={8} fill={theme.colors.bgCanvas} stroke={theme.colors.brand} strokeWidth={2} />
            <text x={x(i)} y={mid - s * scale - 12} textAnchor="middle" fontSize={15} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
              {s}k
            </text>
          </g>
        ))}
        <text x={x(4) + 22} y={mid + 112 * scale + 20} fontSize={14} fontStyle="italic" fontFamily={fonts.serif} fill={theme.colors.expense}>
          ← Goa trip
        </text>
      </Show>
    </svg>
  );
}

/* ---------- 2. Categories: one ribbon, ranked like a league table ---------- */

const spend = [
  { name: 'Rent', amount: 29_300, key: 'brand' },
  { name: 'Food & dining', amount: 18_960, key: 'warning' },
  { name: 'Travel', amount: 13_800, key: 'transfer' },
  { name: 'Shopping', amount: 12_930, key: 'expense' },
  { name: 'Everything else', amount: 11_210, key: 'textMuted' },
] as const;
const spendTotal = spend.reduce((s, c) => s + c.amount, 0);

const Ribbon = styled.div`
  display: flex;
  height: 18px;
  gap: 2px;
  margin-bottom: ${({ theme }) => theme.space[4]}px;
`;
const Piece = styled.span<{ $on: boolean; $d: number }>`
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;
const League = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  li {
    display: grid;
    grid-template-columns: 22px 1fr auto 44px;
    align-items: baseline;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px dotted ${({ theme }) => theme.colors.border};
  }
  li:last-child {
    border-bottom: none;
  }
  small,
  i {
    font-family: ${fonts.mono};
    font-size: 11px;
    font-style: normal;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  i {
    text-align: right;
  }
  span {
    font-size: 14px;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  b {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
`;

function CategoryLeague({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <>
      <Ribbon aria-hidden>
        {spend.map((c, i) => (
          <Piece key={c.name} $on={on} $d={300 + i * 120} style={{ flex: c.amount, background: theme.colors[c.key] }} />
        ))}
      </Ribbon>
      <League>
        {spend.map((c, i) => (
          <li key={c.name}>
            <small>{String(i + 1).padStart(2, '0')}</small>
            <span>
              <i style={{ display: 'inline-block', width: 8, height: 8, marginRight: 8, background: theme.colors[c.key] }} />
              {c.name}
            </span>
            <b>{inr(c.amount)}</b>
            <i>{Math.round((c.amount / spendTotal) * 100)}%</i>
          </li>
        ))}
      </League>
    </>
  );
}

/* ---------- 3. Net worth: a stepped line with milestones pinned on it ---------- */

function NetWorthMilestones({ on }: { on: boolean }) {
  const theme = useTheme();
  const pts = [9.4, 9.9, 9.7, 10.6, 11.2, 11.0, 12.1, 12.8, 12.6, 13.5, 14.0, 14.5];
  const w = 360;
  const h = 150;
  const x = (i: number) => 8 + (i * (w - 16)) / (pts.length - 1);
  const y = (v: number) => h - 22 - ((v - 9) / 6) * (h - 44);
  const step = pts.map((v, i) => (i ? `H${x(i).toFixed(1)} V${y(v).toFixed(1)}` : `M${x(0)} ${y(v).toFixed(1)}`)).join(' ');
  const pins = [
    { i: 3, text: '₹10L' },
    { i: 9, text: '₹13.5L' },
  ];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Stepped line of net worth rising from ₹9.4 lakh to ₹14.5 lakh over twelve months, with ₹10 lakh crossed in January">
      {[10, 12, 14].map((v) => (
        <g key={v}>
          <line x1={0} x2={w} y1={y(v)} y2={y(v)} stroke={theme.colors.borderSubtle} strokeDasharray="2 4" />
          <text x={w} y={y(v) - 4} textAnchor="end" fontSize={10} fontFamily={fonts.mono} fill={theme.colors.textMuted}>
            {v}L
          </text>
        </g>
      ))}
      <Draw $on={on} $d={400} d={step} pathLength={1} fill="none" stroke={theme.colors.textPrimary} strokeWidth={2} />
      <Show $on={on} $d={1600}>
        {pins.map((p) => (
          <g key={p.i}>
            <line x1={x(p.i)} x2={x(p.i)} y1={y(pts[p.i])} y2={y(pts[p.i]) - 26} stroke={theme.colors.brand} />
            <rect x={x(p.i) - 3} y={y(pts[p.i]) - 3} width={6} height={6} fill={theme.colors.brand} />
            <text x={x(p.i) + 5} y={y(pts[p.i]) - 20} fontSize={13} fontFamily={fonts.serif} fontStyle="italic" fill={theme.colors.brandText}>
              {p.text}
            </text>
          </g>
        ))}
      </Show>
      {['OCT', 'JAN', 'APR', 'SEP'].map((m, i) => (
        <text key={m} x={x(i * 3 + (i === 3 ? 2 : 0))} y={h - 4} fontSize={11} fontFamily={fonts.mono} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'} fill={theme.colors.textMuted}>
          {m}
        </text>
      ))}
    </svg>
  );
}

/* ---------- spread ---------- */

export function AnalyticsShowcase() {
  const [ref, on] = useInView<HTMLDivElement>(0.15);
  const saved = useCountUp(293_000, on, 1600);
  const worth = useCountUp(1_452_380, on, 1800);
  return (
    <div ref={ref}>
      <Head>
        <h3>
          Analytics <em>without</em> the spreadsheet
        </h3>
        <p>Cash flow · categories · net worth across bank, card, cash, broker and loan accounts.</p>
      </Head>
      <Spread>
        <Cell $on={on} $d={0}>
          <Label>
            <span>Cash flow · 6 months</span>
            <span>₹ thousands</span>
          </Label>
          <Figure>{inr(saved)}</Figure>
          <Finding>
            saved since April — <b>August</b> was the only tight month.
          </Finding>
          <CashflowMirror on={on} />
        </Cell>
        <Cell $on={on} $d={200}>
          <Label>
            <span>Where September went</span>
            <span>{inr(spendTotal)}</span>
          </Label>
          <Finding style={{ marginTop: 10 }}>
            <b>Rent</b> is a third; <b>food</b> beats travel again.
          </Finding>
          <CategoryLeague on={on} />
        </Cell>
        <Cell $on={on} $d={400}>
          <Label>
            <span>Net worth</span>
            <span style={{ color: 'inherit' }}>+₹5.1L / yr</span>
          </Label>
          <Figure style={{ fontSize: 'clamp(26px, 3vw, 36px)' }}>{inr(worth)}</Figure>
          <NetWorthMilestones on={on} />
        </Cell>
      </Spread>
    </div>
  );
}
