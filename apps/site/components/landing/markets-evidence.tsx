'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { drawStroke, fadeIn, fadeUp, growX, growY, play, popIn, useCountUp, useInView, usePrefersReducedMotion } from './motion';
import { fonts, rhythm } from './primitives';

/*
 * The evidence spreads on the Markets page. Each cell is one small piece of evidence rather than
 * decoration: a mono label, one big serif figure, one italic finding, a hand-built chart and a
 * margin note in the hand font. Everything here is illustrative but internally consistent — the
 * charges waterfall sums to its net, the payoff diagram's break-evens follow from its legs, and
 * the rebalance amounts follow from the allocation shown next to them.
 *
 * Nothing in this file recommends a trade. It describes arithmetic on records you already have.
 */

/* ---------- shared editorial furniture ---------- */

const Spread = styled.div`
  display: grid;
  gap: 0;
  margin-top: ${rhythm.block.sm}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    margin-top: ${rhythm.block.lg}px;
  }
  border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const Cell = styled.figure<{ $on: boolean; $d: number }>`
  margin: 0;
  min-width: 0;
  /* A column, so the note and caveat sink to the bottom of a cell the grid has stretched
     — the taller neighbour no longer leaves a hole under the shorter chart. */
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.space[6]}px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '700ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding: ${({ theme }) => theme.space[6]}px ${({ theme }) => theme.space[8]}px;
    &:nth-child(odd) {
      padding-left: 0;
      border-right: 1px solid ${({ theme }) => theme.colors.border};
    }
    &:nth-child(even) {
      padding-right: 0;
    }
    /* An odd number of cells would leave the last row half empty. That cell runs the full
       width instead, with its words beside its chart rather than stacked above it. */
    &:last-child:nth-child(odd) {
      grid-column: 1 / -1;
      padding-left: 0;
      padding-right: 0;
      border-right: none;
      display: grid;
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      column-gap: ${({ theme }) => theme.space[12]}px;
      align-content: start;
      & > *:not(.art) {
        grid-column: 1;
      }
      & > .art {
        grid-column: 2;
        grid-row: 1 / -1;
        align-self: center;
      }
    }
  }
`;

const CellLabel = styled.figcaption`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const BigFigure = styled.div`
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
  margin: 0 0 ${({ theme }) => theme.space[4]}px;
  max-width: 44ch;
  font-family: ${fonts.serif};
  font-style: italic;
  font-size: 17px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.textSecondary};
  b {
    font-style: normal;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const MarginNote = styled.p`
  margin: auto 0 0;
  padding-top: ${({ theme }) => theme.space[3]}px;
  font-family: ${fonts.hand};
  font-size: 19px;
  line-height: 1.2;
  transform: rotate(-0.8deg);
  transform-origin: left;
  color: ${({ theme }) => theme.colors.brandText};
`;

const Caveat = styled.p`
  margin: auto 0 0;
  padding-top: ${({ theme }) => theme.space[3]}px;
  font-family: ${fonts.mono};
  font-size: 10.5px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.textMuted};
`;

function Evidence({
  label,
  aside,
  figure,
  finding,
  note,
  caveat,
  on,
  delay = 0,
  children,
}: {
  label: string;
  aside?: string;
  figure: ReactNode;
  finding: ReactNode;
  note?: string;
  caveat?: string;
  on: boolean;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <Cell $on={on} $d={delay}>
      <CellLabel>
        <span>{label}</span>
        {aside ? <span>{aside}</span> : null}
      </CellLabel>
      <BigFigure>{figure}</BigFigure>
      <Finding>{finding}</Finding>
      <div className="art">{children}</div>
      {note ? <MarginNote>{note}</MarginNote> : null}
      {caveat ? <Caveat style={note ? { marginTop: 0 } : undefined}>{caveat}</Caveat> : null}
    </Cell>
  );
}

/* ---------- animated SVG primitives ---------- */

const Draw = styled.path<{ $on: boolean; $d: number; $dur?: string }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d, $dur }) => play($on, $d, $dur ?? '1400ms')}
`;
const Show = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;
const Pop = styled.g<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: center;
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
`;
const Wipe = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '800ms')}
`;
const Rise = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: bottom;
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '800ms')}
`;

const Plot = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
`;

const mono = fonts.mono;

/* =======================================================================================
 * 01 PORTFOLIO
 * Folio value ₹18,42,600. Allocation 58 / 22 / 11 / 9, targets 55 / 25 / 10 / 10.
 * ===================================================================================== */

const FOLIO = 1_842_600;

type Tile = { name: string; pct: number; x: number; y: number; w: number; h: number; o: number };

/* Left column holds equity (58%), right column debt + cash + gold (42%). Heights are the
   share of their own column, so every tile's area is exactly its share of the folio. */
const TREEMAP: Tile[] = [
  { name: 'Index funds', pct: 26, x: 0, y: 0, w: 185.6, h: 89.7, o: 1 },
  { name: 'Large cap', pct: 18, x: 0, y: 90.7, w: 185.6, h: 61.1, o: 0.78 },
  { name: 'Mid & small', pct: 14, x: 0, y: 152.8, w: 185.6, h: 47.2, o: 0.58 },
  { name: 'Debt funds', pct: 22, x: 186.6, y: 0, w: 133.4, h: 103.8, o: 0.44 },
  { name: 'Cash', pct: 11, x: 186.6, y: 104.8, w: 133.4, h: 51.4, o: 0.3 },
  { name: 'Gold', pct: 9, x: 186.6, y: 157.2, w: 133.4, h: 42.8, o: 0.2 },
];

function AllocationTreemap({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <Plot
      viewBox="0 0 320 200"
      style={{ maxWidth: 540 }}
      role="img"
      aria-label="Treemap of the folio: index funds 26 percent, large cap 18 percent and mid and small cap 14 percent make up the 58 percent equity block; debt funds 22 percent, cash 11 percent and gold 9 percent fill the rest."
    >
      {TREEMAP.map((t, i) => (
        <Pop key={t.name} $on={on} $d={160 + i * 110}>
          <rect x={t.x} y={t.y} width={t.w} height={t.h} fill={theme.colors.brand} fillOpacity={t.o} />
          <rect x={t.x} y={t.y} width={t.w} height={t.h} fill="none" stroke={theme.colors.bgSurface} strokeWidth={1.5} />
          <text x={t.x + 8} y={t.y + 16} fontSize={9} fontFamily={mono} letterSpacing="0.04em" fill={t.o > 0.55 ? theme.colors.onBrand : theme.colors.textPrimary}>
            {t.name.toUpperCase()}
          </text>
          <text x={t.x + 8} y={t.y + 32} fontSize={15} fontFamily={fonts.serif} fill={t.o > 0.55 ? theme.colors.onBrand : theme.colors.textPrimary}>
            {t.pct}%
          </text>
        </Pop>
      ))}
    </Plot>
  );
}

/* Twelve months of ₹75,000 a month. Your folio ends at ₹10.62L; the same dates into a
   broad index ends at ₹9.50L — a gap of ₹1,12,400. */
const MINE = [3.0, 3.62, 4.14, 4.93, 5.38, 6.21, 6.88, 7.42, 8.31, 9.04, 9.86, 10.62];
const BENCH = [3.0, 3.54, 4.02, 4.71, 5.19, 5.92, 6.5, 7.03, 7.81, 8.42, 9.02, 9.5];

function XirrVsBenchmark({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 340;
  const h = 180;
  const x = (i: number) => 12 + (i * (w - 56)) / (MINE.length - 1);
  const y = (v: number) => h - 26 - ((v - 2.6) / 8.6) * (h - 52);
  const line = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <Plot
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: 540 }}
      role="img"
      aria-label="Two lines over twelve months of the same monthly investment: your folio reaching ₹10.62 lakh against ₹9.50 lakh for the same dates into a broad index, a gap of ₹1,12,400."
    >
      {[4, 6, 8, 10].map((v) => (
        <g key={v}>
          <line x1={10} x2={w - 44} y1={y(v)} y2={y(v)} stroke={theme.colors.borderSubtle} strokeDasharray="2 4" />
          <text x={w - 40} y={y(v) + 3} fontSize={9} fontFamily={mono} fill={theme.colors.textMuted}>
            {v}L
          </text>
        </g>
      ))}
      <Draw $on={on} $d={300} d={line(BENCH)} pathLength={1} fill="none" stroke={theme.colors.textMuted} strokeWidth={1.6} strokeDasharray="1" />
      <Draw $on={on} $d={420} d={line(MINE)} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <Show $on={on} $d={1700}>
        <line x1={x(11)} x2={x(11)} y1={y(MINE[11])} y2={y(BENCH[11])} stroke={theme.colors.brandText} strokeWidth={1.4} />
        <line x1={x(11) - 4} x2={x(11) + 4} y1={y(MINE[11])} y2={y(MINE[11])} stroke={theme.colors.brandText} strokeWidth={1.4} />
        <line x1={x(11) - 4} x2={x(11) + 4} y1={y(BENCH[11])} y2={y(BENCH[11])} stroke={theme.colors.brandText} strokeWidth={1.4} />
        <text x={x(11) - 8} y={(y(MINE[11]) + y(BENCH[11])) / 2 + 4} textAnchor="end" fontSize={13} fontFamily={fonts.hand} fill={theme.colors.brandText}>
          +₹1,12,400
        </text>
        <text x={12} y={y(MINE[0]) - 8} fontSize={9} fontFamily={mono} fill={theme.colors.brandText}>
          YOUR FOLIO · 14.2% XIRR
        </text>
        <text x={12} y={h - 8} fontSize={9} fontFamily={mono} fill={theme.colors.textMuted}>
          SAME SIPs INTO THE INDEX · 12.6%
        </text>
      </Show>
    </Plot>
  );
}

/* LTCG: ₹1,04,200 of the ₹1,25,000 exemption is already used this year. */
function HarvestDial({ on }: { on: boolean }) {
  const theme = useTheme();
  const used = 104_200;
  const cap = 125_000;
  const frac = used / cap;
  const r = 76;
  const cx = 100;
  const cy = 100;
  const arc = (f: number) => {
    const a = Math.PI * (1 - f);
    return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;
  };
  return (
    <Plot
      viewBox="0 0 200 124"
      style={{ maxWidth: 340 }}
      role="img"
      aria-label="A half dial: ₹1,04,200 of the ₹1,25,000 long-term capital gains exemption is used, leaving ₹20,800 of headroom this financial year."
    >
      <path d={`M${arc(0)} A${r} ${r} 0 0 1 ${arc(1)}`} fill="none" stroke={theme.colors.bgMuted} strokeWidth={16} strokeLinecap="butt" />
      <Draw
        $on={on}
        $d={300}
        $dur="1200ms"
        d={`M${arc(0)} A${r} ${r} 0 0 1 ${arc(frac)}`}
        pathLength={1}
        fill="none"
        stroke={theme.colors.brand}
        strokeWidth={16}
      />
      <Show $on={on} $d={1400}>
        <line x1={cx + r * Math.cos(Math.PI * (1 - frac)) * 0.72} y1={cy - r * Math.sin(Math.PI * (1 - frac)) * 0.72} x2={cx + r * Math.cos(Math.PI * (1 - frac)) * 1.16} y2={cy - r * Math.sin(Math.PI * (1 - frac)) * 1.16} stroke={theme.colors.textPrimary} strokeWidth={1.4} />
      </Show>
      <text x={cx} y={cy - 26} textAnchor="middle" fontSize={22} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
        ₹20,800
      </text>
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={8.5} fontFamily={mono} letterSpacing="0.08em" fill={theme.colors.textMuted}>
        HEADROOM LEFT
      </text>
      <text x={cx - r} y={cy + 16} textAnchor="middle" fontSize={8.5} fontFamily={mono} fill={theme.colors.textMuted}>
        ₹0
      </text>
      <text x={cx + r} y={cy + 16} textAnchor="middle" fontSize={8.5} fontFamily={mono} fill={theme.colors.textMuted}>
        ₹1.25L
      </text>
    </Plot>
  );
}

/* Targets you set: 55 / 25 / 10 / 10. Actual: 58 / 22 / 11 / 9. */
const DRIFT: [string, number, number][] = [
  ['Equity', 55, 58],
  ['Debt', 25, 22],
  ['Cash', 10, 11],
  ['Gold', 10, 9],
];

function RebalanceSketch({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 320;
  const rowH = 38;
  const h = DRIFT.length * rowH + 30;
  const x0 = 62;
  const scale = (w - x0 - 56) / 60;
  return (
    <Plot
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: 520 }}
      role="img"
      aria-label="Target against actual allocation: equity 55 target versus 58 actual, debt 25 versus 22, cash 10 versus 11, gold 10 versus 9. One trade of ₹55,300 from equity into debt brings all four back inside their bands."
    >
      {DRIFT.map(([name, target, actual], i) => {
        const y = 10 + i * rowH;
        const off = actual - target;
        return (
          <g key={name}>
            <text x={0} y={y + 14} fontSize={9.5} fontFamily={mono} letterSpacing="0.05em" fill={theme.colors.textSecondary}>
              {name.toUpperCase()}
            </text>
            <rect x={x0} y={y} width={target * scale} height={7} fill="none" stroke={theme.colors.textMuted} strokeDasharray="2 2" />
            <Wipe $on={on} $d={200 + i * 130} x={x0} y={y + 10} width={actual * scale} height={10} fill={theme.colors.brand} fillOpacity={0.85} />
            <Show $on={on} $d={1100 + i * 90}>
              <text x={x0 + actual * scale + 6} y={y + 18} fontSize={9.5} fontFamily={mono} fill={off > 0 ? theme.colors.expense : theme.colors.income}>
                {off > 0 ? '+' : ''}
                {off}
              </text>
            </Show>
          </g>
        );
      })}
      <Show $on={on} $d={1500}>
        <text x={0} y={h - 6} fontSize={9.5} fontFamily={mono} fill={theme.colors.brandText}>
          MINIMUM TRADES: 1 — MOVE ₹55,300 EQUITY → DEBT
        </text>
      </Show>
    </Plot>
  );
}

export function PortfolioEvidence() {
  const [ref, on] = useInView<HTMLDivElement>(0.12);
  const folio = useCountUp(FOLIO, on, 1700);
  return (
    <div ref={ref}>
      <Spread>
        <Evidence
          on={on}
          label="Allocation · 6 sleeves"
          aside="as of 30 Sep"
          figure={`₹${folio.toLocaleString('en-IN')}`}
          finding={
            <>
              one <b>index fund</b> is 26 points of the folio — a quarter of everything, in a single line.
            </>
          }
          note="areas are the real weights"
        >
          <AllocationTreemap on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={140}
          label="Your money vs the same SIPs"
          aside="12 months"
          figure="14.2%"
          finding={
            <>
              money-weighted, after costs — <b>1.6 points</b> above the same dates into a broad index.
            </>
          }
          caveat="Illustrative figures. Past periods describe what happened, not what will."
        >
          <XirrVsBenchmark on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={80}
          label="Capital gains · headroom"
          aside="FY to date"
          figure="₹1,04,200"
          finding={
            <>
              of long-term gains already realised — <b>₹20,800</b> of the exemption is still unused.
            </>
          }
          caveat="Arithmetic for your own records, not tax advice. Check it with a professional before you file."
        >
          <HarvestDial on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={220}
          label="Drift vs your targets"
          aside="target 55/25/10/10"
          figure="+3 pts"
          finding={
            <>
              equity is three points heavy; <b>one trade of ₹55,300</b> puts all four sleeves back inside their bands.
            </>
          }
          note="your bands, your arithmetic"
        >
          <RebalanceSketch on={on} />
        </Evidence>
      </Spread>
    </div>
  );
}

/* =======================================================================================
 * 02 TRADING JOURNAL
 * ===================================================================================== */

/* Thirteen month-ends of account equity in ₹ lakh. Peak 5.66 (month 6), trough 4.82
   (month 9) — a drawdown of 14.8% that took four months to recover. */
const EQUITY = [5.0, 5.18, 5.34, 5.29, 5.51, 5.66, 5.42, 5.11, 4.82, 5.05, 5.38, 5.62, 5.81];

function EquityCurve({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 340;
  const h = 170;
  const x = (i: number) => 10 + (i * (w - 52)) / (EQUITY.length - 1);
  const y = (v: number) => h - 26 - ((v - 4.6) / 1.4) * (h - 52);
  const line = EQUITY.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <Plot
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: 540 }}
      role="img"
      aria-label="Account equity over thirteen month-ends, peaking at ₹5.66 lakh, falling to ₹4.82 lakh — a 14.8 percent drawdown shaded on the chart — and recovering four months later."
    >
      <Show $on={on} $d={900}>
        <rect x={x(5)} y={y(5.66)} width={x(12) - x(5)} height={y(4.82) - y(5.66)} fill={theme.colors.expense} fillOpacity={0.12} />
        <line x1={x(5)} x2={x(12)} y1={y(5.66)} y2={y(5.66)} stroke={theme.colors.expense} strokeDasharray="3 3" strokeWidth={1.2} />
        <line x1={x(5)} x2={x(12)} y1={y(4.82)} y2={y(4.82)} stroke={theme.colors.expense} strokeDasharray="3 3" strokeWidth={1.2} />
      </Show>
      {[5.0, 5.5].map((v) => (
        <text key={v} x={w - 38} y={y(v) + 3} fontSize={9} fontFamily={mono} fill={theme.colors.textMuted}>
          {v.toFixed(1)}L
        </text>
      ))}
      <Draw $on={on} $d={280} d={line} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      <Show $on={on} $d={1700}>
        <circle cx={x(5)} cy={y(5.66)} r={3} fill={theme.colors.bgSurface} stroke={theme.colors.textPrimary} strokeWidth={1.6} />
        <circle cx={x(8)} cy={y(4.82)} r={3} fill={theme.colors.expense} />
        <text x={x(8) + 6} y={y(4.82) + 14} fontSize={13} fontFamily={fonts.hand} fill={theme.colors.expense}>
          −14.8%, four months to get back
        </text>
      </Show>
      <text x={10} y={h - 6} fontSize={9} fontFamily={mono} fill={theme.colors.textMuted}>
        APR
      </text>
      <text x={x(12)} y={h - 6} textAnchor="end" fontSize={9} fontFamily={mono} fill={theme.colors.textMuted}>
        APR
      </text>
    </Plot>
  );
}

/* Gross 12,480 less 40 + 625 + 41 + 1 + 18 + 22 = 747, leaving 11,733. The axis is
   cropped to ₹11,600–₹12,560 so the deductions are legible; that crop is labelled. */
const WATERFALL: [string, number][] = [
  ['Gross', 0],
  ['Brokerage', -40],
  ['STT', -625],
  ['Exchange', -41],
  ['SEBI', -1],
  ['Stamp', -18],
  ['GST', -22],
  ['Net', 0],
];

function ChargesWaterfall({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 340;
  const h = 180;
  const lo = 11_600;
  const hi = 12_560;
  const y = (v: number) => 16 + ((hi - v) / (hi - lo)) * (h - 52);
  const col = (w - 12) / WATERFALL.length;
  let running = 12_480;
  const bars = WATERFALL.map(([name, delta], i) => {
    const from = running;
    running += delta;
    return { name, delta, from, to: running, i };
  });
  return (
    <Plot
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: 560 }}
      role="img"
      aria-label="A stepped waterfall: gross ₹12,480 less brokerage ₹40, STT ₹625, exchange ₹41, SEBI ₹1, stamp duty ₹18 and GST ₹22 — ₹747 in all — leaving ₹11,733 net."
    >
      {bars.map((b) => {
        const x = 6 + b.i * col;
        const isEnd = b.i === 0 || b.i === bars.length - 1;
        const top = isEnd ? y(b.to) : y(b.from);
        const height = isEnd ? h - 36 - y(b.to) : Math.max(1.5, y(b.to) - y(b.from));
        return (
          <g key={b.name}>
            <Pop $on={on} $d={200 + b.i * 120}>
              <rect
                x={x}
                y={top}
                width={col - 8}
                height={height}
                fill={isEnd ? theme.colors.brand : theme.colors.expense}
                fillOpacity={isEnd ? 0.85 : 0.75}
              />
            </Pop>
            {b.i > 0 && b.i < bars.length - 1 ? (
              <Show $on={on} $d={320 + b.i * 120}>
                <text x={x + (col - 8) / 2} y={y(b.to) + 12} textAnchor="middle" fontSize={8.5} fontFamily={mono} fill={theme.colors.textSecondary}>
                  {b.delta}
                </text>
              </Show>
            ) : null}
            <text x={x + (col - 8) / 2} y={h - 22} textAnchor="middle" fontSize={8} fontFamily={mono} letterSpacing="0.03em" fill={theme.colors.textMuted}>
              {b.name.toUpperCase()}
            </text>
          </g>
        );
      })}
      <Show $on={on} $d={200}>
        <text x={6} y={y(12_480) - 6} fontSize={11} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
          ₹12,480
        </text>
        <text x={w - 6} y={y(11_733) - 6} textAnchor="end" fontSize={11} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
          ₹11,733
        </text>
      </Show>
      <line x1={0} x2={w} y1={h - 36} y2={h - 36} stroke={theme.colors.border} />
      <text x={0} y={h - 4} fontSize={8} fontFamily={mono} fill={theme.colors.textMuted}>
        AXIS CROPPED AT ₹11,600 SO THE SMALL CHARGES ARE VISIBLE
      </text>
    </Plot>
  );
}

/* 100 trades: 46 wins averaging ₹4,120, 54 losses averaging ₹2,870.
   Expectancy = 0.46 × 4,120 − 0.54 × 2,870 = ₹345 a trade. */
const WinRibbon = styled.div`
  display: flex;
  height: 20px;
  gap: 2px;
  margin: 4px 0 14px;
`;
const RibbonPart = styled.span<{ $on: boolean; $d: number }>`
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '700ms')}
`;
const ExpectancyRows = styled.dl`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  & dt {
    font-family: ${mono};
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & dd {
    margin: 3px 0 0;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 20px;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

function ExpectancyRibbon({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <div>
      <WinRibbon aria-hidden>
        <RibbonPart $on={on} $d={200} style={{ flex: 46, background: theme.colors.income }} />
        <RibbonPart $on={on} $d={320} style={{ flex: 54, background: theme.colors.expense, opacity: 0.8 }} />
      </WinRibbon>
      <ExpectancyRows>
        <div>
          <dt>Win rate</dt>
          <dd>46%</dd>
        </div>
        <div>
          <dt>Avg win / loss</dt>
          <dd>1.44×</dd>
        </div>
        <div>
          <dt>Expectancy</dt>
          <dd>₹345</dd>
        </div>
      </ExpectancyRows>
      <Caveat>46 wins at ₹4,120 against 54 losses at ₹2,870 — ₹345 a trade, over 100 trades.</Caveat>
    </div>
  );
}

const TICKETS: [string, string, string][] = [
  ['12 Jun', 'Revenge trade', 're-entered 4 min after a loss'],
  ['26 Jun', 'Expiry day', '3 of 4 losses land on Thursdays'],
  ['09 Jul', 'Size creep', '3× your usual lot'],
  ['31 Jul', 'Past your stop', 'held 40 min beyond the exit you wrote'],
];

const Timeline = styled.ol`
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0 0 0 ${({ theme }) => theme.space[5]}px;
  &::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 6px;
    bottom: 6px;
    width: 1px;
    background: ${({ theme }) => theme.colors.border};
  }
`;
const Ticket = styled.li<{ $on: boolean; $d: number; $tilt: number }>`
  position: relative;
  margin-bottom: 8px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.brand};
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  transform: rotate(${({ $tilt }) => $tilt}deg);
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '420ms')}
  &::before {
    content: '';
    position: absolute;
    left: -${({ theme }) => theme.space[5]}px;
    top: 14px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.brand};
  }
  & time {
    font-family: ${mono};
    font-size: 9.5px;
    letter-spacing: 0.06em;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & strong {
    display: block;
    font-family: ${mono};
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & span {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.45;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

function BehaviourStrip({ on }: { on: boolean }) {
  return (
    <Timeline>
      {TICKETS.map(([date, flag, body], i) => (
        <Ticket key={flag} $on={on} $d={260 + i * 170} $tilt={i % 2 ? 0.5 : -0.6}>
          <time>{date.toUpperCase()}</time>
          <strong>{flag}</strong>
          <span>{body}</span>
        </Ticket>
      ))}
    </Timeline>
  );
}

function RealityCheck({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 320;
  const h = 150;
  const base = h - 34;
  const scale = (base - 20) / 12;
  const bars: [string, number, string][] = [
    ['Your F&O book, net of charges', 2.1, theme.colors.brand],
    ['A broad index, same 12 months', 11.4, theme.colors.textMuted],
  ];
  return (
    <Plot
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: 500 }}
      role="img"
      aria-label="Two bars for the same twelve months: the F&O book returned 2.1 percent after charges, a broad index 11.4 percent."
    >
      <line x1={0} x2={w} y1={base} y2={base} stroke={theme.colors.border} />
      {bars.map(([label, v, fill], i) => {
        const bw = 84;
        const x = 34 + i * 150;
        return (
          <g key={label}>
            <Rise $on={on} $d={240 + i * 220} x={x} y={base - v * scale} width={bw} height={v * scale} fill={fill} fillOpacity={i ? 0.45 : 0.9} />
            <text x={x + bw / 2} y={base - v * scale - 8} textAnchor="middle" fontSize={17} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
              +{v}%
            </text>
            <text x={x + bw / 2} y={base + 14} textAnchor="middle" fontSize={8} fontFamily={mono} fill={theme.colors.textMuted}>
              {i ? 'INDEX' : 'YOUR F&O'}
            </text>
          </g>
        );
      })}
      <Show $on={on} $d={1300}>
        <text x={0} y={h - 6} fontSize={13} fontFamily={fonts.hand} fill={theme.colors.brandText}>
          the effort is not showing up in the number
        </text>
      </Show>
    </Plot>
  );
}

export function JournalEvidence() {
  const [ref, on] = useInView<HTMLDivElement>(0.12);
  return (
    <div ref={ref}>
      <Spread>
        <Evidence
          on={on}
          label="Equity curve · 13 month-ends"
          aside="drawdown shaded"
          figure="−14.8%"
          finding={
            <>
              the worst stretch ran from <b>September</b> to <b>December</b> — and took four more months to get back.
            </>
          }
          note="the dip you stopped logging"
        >
          <EquityCurve on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={140}
          label="One trade, gross to net"
          aside="BANKNIFTY intraday"
          figure="₹747"
          finding={
            <>
              of charges on a ₹12,480 gross — <b>STT alone is ₹625</b> of it.
            </>
          }
          caveat="Every step is computed by the rule for that segment, and the steps sum to the net."
        >
          <ChargesWaterfall on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={80}
          label="Win rate & expectancy"
          aside="100 trades"
          figure="₹345"
          finding={
            <>
              expected per trade — you lose more often than you win, and <b>still come out ahead</b>, because the wins are bigger.
            </>
          }
        >
          <ExpectancyRibbon on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={220}
          label="Behaviour flags"
          aside="4 this quarter"
          figure="3 of 4"
          finding={
            <>
              of your worst losses landed on an <b>expiry Thursday</b>. An observation about your record — not an instruction.
            </>
          }
        >
          <BehaviourStrip on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={300}
          label="Reality check"
          aside="same 12 months"
          figure="+2.1%"
          finding={
            <>
              from the F&amp;O book after charges, against <b>+11.4%</b> sitting still in a broad index.
            </>
          }
          caveat="One person's past twelve months. It is not a forecast, a benchmark you must beat, or a reason to trade more or less."
        >
          <RealityCheck on={on} />
        </Evidence>
      </Spread>
    </div>
  );
}

/* =======================================================================================
 * 03 STRATEGY LAB
 * Iron condor on a 25,000 index: sell 24,800 PE / buy 24,600 PE, sell 25,200 CE /
 * buy 25,400 CE for a net credit of ₹78. Max gain ₹78, max loss 200 − 78 = ₹122,
 * break-evens 24,800 − 78 = 24,722 and 25,200 + 78 = 25,278.
 * ===================================================================================== */

function PayoffDiagram({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 340;
  const h = 196;
  const px = (p: number) => 10 + ((p - 24_400) / 1200) * (w - 24);
  const py = (v: number) => 34 + (100 - v) * 0.5;
  const zero = py(0);
  const lo = px(24_600);
  const be1 = px(24_722);
  const hiStrikeLo = px(24_800);
  const hiStrikeHi = px(25_200);
  const be2 = px(25_278);
  const hi = px(25_400);
  const yMax = py(78);
  const yMin = py(-122);
  const expiry = `M${px(24_400)} ${yMin} L${lo} ${yMin} L${hiStrikeLo} ${yMax} L${hiStrikeHi} ${yMax} L${hi} ${yMin} L${px(25_600)} ${yMin}`;
  const today = `M${px(24_400)} ${py(-96)} C ${px(24_650)} ${py(-78)}, ${px(24_800)} ${py(-6)}, ${px(24_950)} ${py(34)} C ${px(25_000)} ${py(42)}, ${px(25_050)} ${py(42)}, ${px(25_120)} ${py(30)} C ${px(25_300)} ${py(-16)}, ${px(25_420)} ${py(-82)}, ${px(25_600)} ${py(-96)}`;
  return (
    <Plot
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: 560 }}
      role="img"
      aria-label="Payoff diagram for an iron condor: short 24,800 put and 25,200 call, long 24,600 put and 25,400 call, for a ₹78 credit. The profit zone is shaded between break-evens at 24,722 and 25,278, with the loss capped at ₹122 beyond the long strikes. A dashed curve shows the position today against the solid line at expiry."
    >
      <Show $on={on} $d={700}>
        <polygon points={`${be1},${zero} ${hiStrikeLo},${yMax} ${hiStrikeHi},${yMax} ${be2},${zero}`} fill={theme.colors.income} fillOpacity={0.16} />
        <polygon points={`${px(24_400)},${zero} ${px(24_400)},${yMin} ${lo},${yMin} ${be1},${zero}`} fill={theme.colors.expense} fillOpacity={0.14} />
        <polygon points={`${be2},${zero} ${hi},${yMin} ${px(25_600)},${yMin} ${px(25_600)},${zero}`} fill={theme.colors.expense} fillOpacity={0.14} />
      </Show>
      <line x1={0} x2={w} y1={zero} y2={zero} stroke={theme.colors.textMuted} strokeDasharray="3 3" />
      {[
        [24_600, '24,600'],
        [24_800, '24,800'],
        [25_200, '25,200'],
        [25_400, '25,400'],
      ].map(([p, label]) => (
        <g key={label as string}>
          <line x1={px(p as number)} x2={px(p as number)} y1={28} y2={h - 26} stroke={theme.colors.borderSubtle} />
          <text x={px(p as number)} y={h - 14} textAnchor="middle" fontSize={8} fontFamily={mono} fill={theme.colors.textMuted}>
            {label}
          </text>
        </g>
      ))}
      <Draw $on={on} $d={900} $dur="1200ms" d={today} pathLength={1} fill="none" stroke={theme.colors.textMuted} strokeWidth={1.6} strokeDasharray="1" />
      <Draw $on={on} $d={300} d={expiry} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
      <Show $on={on} $d={1800}>
        {[
          [be1, '24,722'],
          [be2, '25,278'],
        ].map(([x, label]) => (
          <g key={label as string}>
            <circle cx={x as number} cy={zero} r={3.2} fill={theme.colors.bgSurface} stroke={theme.colors.textPrimary} strokeWidth={1.6} />
            <text x={x as number} y={zero - 8} textAnchor="middle" fontSize={11} fontFamily={fonts.hand} fill={theme.colors.textPrimary}>
              {label}
            </text>
          </g>
        ))}
        <text x={px(25_000)} y={yMax - 8} textAnchor="middle" fontSize={8.5} fontFamily={mono} fill={theme.colors.income}>
          MAX +₹78
        </text>
        <text x={px(24_450)} y={yMin - 6} fontSize={8.5} fontFamily={mono} fill={theme.colors.expense}>
          MAX −₹122
        </text>
        <text x={w - 4} y={20} textAnchor="end" fontSize={8} fontFamily={mono} fill={theme.colors.textMuted}>
          — AT EXPIRY · - - TODAY
        </text>
      </Show>
    </Plot>
  );
}

const GreekGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  & dt {
    font-family: ${mono};
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & dd {
    margin: 3px 0 0;
    font-family: ${mono};
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & dd small {
    display: block;
    margin-top: 2px;
    font-size: 9px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

function GreeksTable({ on }: { on: boolean }) {
  const delta = useCountUp(2, on, 900);
  const gamma = useCountUp(8, on, 1000);
  const theta = useCountUp(42, on, 1200);
  const vega = useCountUp(86, on, 1400);
  return (
    <GreekGrid>
      <div>
        <dt>Delta</dt>
        <dd>
          +{(delta / 100).toFixed(2)}
          <small>near flat</small>
        </dd>
      </div>
      <div>
        <dt>Gamma</dt>
        <dd>
          −0.{String(gamma).padStart(4, '0')}
          <small>short convexity</small>
        </dd>
      </div>
      <div>
        <dt>Theta</dt>
        <dd>
          +{theta}
          <small>per day, if nothing moves</small>
        </dd>
      </div>
      <div>
        <dt>Vega</dt>
        <dd>
          −{vega}
          <small>hurt by a vol spike</small>
        </dd>
      </div>
    </GreekGrid>
  );
}

/* A walk-forward split: the first eight months tuned the rule, the last four only ran it. */
const IS = [1.0, 1.06, 1.11, 1.09, 1.17, 1.24, 1.3, 1.38, 1.44];
const OOS = [1.44, 1.47, 1.43, 1.5, 1.54];
const DD = [0, -2, -3, -7, -2, 0, -1, 0, 0, -1, -5, -2, 0];

function BacktestPanel({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 340;
  const h = 196;
  const all = [...IS, ...OOS.slice(1)];
  const x = (i: number) => 10 + (i * (w - 20)) / (all.length - 1);
  const y = (v: number) => 24 + (1.62 - v) * 110;
  const split = x(IS.length - 1);
  const line = (a: number[], off: number) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i + off).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ddBase = h - 36;
  const ddY = (v: number) => ddBase - v * 2.6;
  const ddPath = `M${x(0)} ${ddBase} ` + DD.map((v, i) => `L${x(i).toFixed(1)} ${ddY(v).toFixed(1)}`).join(' ') + ` L${x(DD.length - 1)} ${ddBase} Z`;
  return (
    <Plot
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: 560 }}
      role="img"
      aria-label="A walk-forward backtest: the in-sample half, where the rule was tuned, compounds at 21.4 percent a year; the out-of-sample half, where it only ran, compounds at 9.8 percent. A drawdown band sits beneath the equity line."
    >
      <Show $on={on} $d={200}>
        <rect x={0} y={16} width={split} height={h - 56} fill={theme.colors.brandSubtle} />
        <text x={6} y={26} fontSize={8} fontFamily={mono} letterSpacing="0.06em" fill={theme.colors.brandText}>
          IN-SAMPLE · TUNED HERE
        </text>
        <text x={split + 6} y={26} fontSize={8} fontFamily={mono} letterSpacing="0.06em" fill={theme.colors.textMuted}>
          OUT-OF-SAMPLE · ONLY RAN
        </text>
      </Show>
      <line x1={split} x2={split} y1={16} y2={h - 20} stroke={theme.colors.textPrimary} strokeDasharray="4 3" />
      <Draw $on={on} $d={400} d={line(IS, 0)} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={2.4} strokeLinejoin="round" />
      <Draw $on={on} $d={1200} $dur="900ms" d={line(OOS, IS.length - 1)} pathLength={1} fill="none" stroke={theme.colors.textMuted} strokeWidth={2.4} strokeLinejoin="round" />
      <Show $on={on} $d={1700}>
        <path d={ddPath} fill={theme.colors.expense} fillOpacity={0.22} />
        <text x={6} y={h - 4} fontSize={8} fontFamily={mono} fill={theme.colors.textMuted}>
          DRAWDOWN
        </text>
        <text x={6} y={y(1.3)} fontSize={11} fontFamily={fonts.hand} fill={theme.colors.brandText}>
          21.4% a year
        </text>
        <text x={split + 6} y={y(1.36)} fontSize={11} fontFamily={fonts.hand} fill={theme.colors.textSecondary}>
          9.8% a year
        </text>
      </Show>
    </Plot>
  );
}

const SizeSketch = styled.div`
  display: grid;
  gap: 10px;
  & .rows {
    display: grid;
    gap: 6px;
    font-family: ${mono};
    font-size: 11px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .rows div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 5px;
    border-bottom: 1px dotted ${({ theme }) => theme.colors.border};
  }
  & .rows b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .out {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid ${({ theme }) => theme.colors.textPrimary};
  }
  & .out span {
    font-family: ${mono};
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .out b {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 26px;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

function StopLadder({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <SizeSketch>
      <Plot viewBox="0 0 320 96" style={{ maxWidth: 500 }} role="img" aria-label="Entry at ₹1,240, stop at ₹1,196: a stop distance of ₹44. A risk budget of ₹5,000 divides into it for 113 shares.">
        <Show $on={on} $d={200}>
          <line x1={10} x2={230} y1={22} y2={22} stroke={theme.colors.textPrimary} strokeWidth={1.6} />
          <text x={236} y={26} fontSize={9.5} fontFamily={mono} fill={theme.colors.textPrimary}>
            ENTRY 1,240
          </text>
          <line x1={10} x2={230} y1={74} y2={74} stroke={theme.colors.expense} strokeWidth={1.6} strokeDasharray="4 3" />
          <text x={236} y={78} fontSize={9.5} fontFamily={mono} fill={theme.colors.expense}>
            STOP 1,196
          </text>
        </Show>
        <Show $on={on} $d={700}>
          <line x1={56} x2={56} y1={22} y2={74} stroke={theme.colors.brand} strokeWidth={1.4} />
          <path d="M52 28 L56 22 L60 28" fill="none" stroke={theme.colors.brand} strokeWidth={1.4} />
          <path d="M52 68 L56 74 L60 68" fill="none" stroke={theme.colors.brand} strokeWidth={1.4} />
          <text x={66} y={52} fontSize={14} fontFamily={fonts.hand} fill={theme.colors.brandText}>
            ₹44 of risk per share
          </text>
        </Show>
      </Plot>
      <div className="rows">
        <div>
          <span>Account</span>
          <b>₹5,00,000</b>
        </div>
        <div>
          <span>Risk per trade — your rule, 1%</span>
          <b>₹5,000</b>
        </div>
        <div>
          <span>₹5,000 ÷ ₹44</span>
          <b>113.6</b>
        </div>
      </div>
      <div className="out">
        <span>Size that respects the stop</span>
        <b>113 shares</b>
      </div>
    </SizeSketch>
  );
}

export function StrategyEvidence() {
  const [ref, on] = useInView<HTMLDivElement>(0.12);
  return (
    <div ref={ref}>
      <Spread>
        <Evidence
          on={on}
          label="Payoff · iron condor"
          aside="hypothetical"
          figure="₹78 / ₹122"
          finding={
            <>
              you can make ₹78 and lose ₹122 — the shaded zone between <b>24,722</b> and <b>25,278</b> is the whole of the upside.
            </>
          }
          note="risk before reward, on one page"
          caveat="A worked example of a structure, not a position to take. Break-evens follow from the legs shown."
        >
          <PayoffDiagram on={on} />
          <GreeksTable on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={160}
          label="Walk-forward backtest"
          aside="costs included"
          figure="9.8%"
          finding={
            <>
              out of sample, against <b>21.4%</b> in the half where the rule was tuned. Less than half the edge survived the split.
            </>
          }
          caveat="Backtests are fitted to the past. A rule that only looks good on the data it was built from is the most common way to fool yourself."
        >
          <BacktestPanel on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={80}
          label="Position sizing"
          aside="stop distance → quantity"
          figure="113"
          finding={
            <>
              shares — the size at which <b>your own stop</b> costs exactly the 1% you said you would risk.
            </>
          }
          note="the stop decides the size"
        >
          <StopLadder on={on} />
        </Evidence>
      </Spread>
    </div>
  );
}

/* =======================================================================================
 * 04 MARKETS & ALERTS
 * ===================================================================================== */

/** Types a sentence out once `on` is true; shows it whole under reduced motion. */
function useTypewriter(text: string, on: boolean, msPerChar = 26) {
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (reduced) {
      setN(text.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, msPerChar);
    return () => clearInterval(id);
  }, [on, text, msPerChar, reduced]);
  return { typed: text.slice(0, n), done: n >= text.length };
}

const RuleCard = styled.div`
  padding: ${({ theme }) => theme.space[4]}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  & .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  & .sentence {
    min-height: 3.2em;
    font-family: ${fonts.serif};
    font-size: 19px;
    line-height: 1.45;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .caret {
    display: inline-block;
    width: 8px;
    border-bottom: 2px solid ${({ theme }) => theme.colors.brand};
    vertical-align: baseline;
  }
`;

const Chip = styled.span<{ $on: boolean; $d: number }>`
  padding: 2px 8px;
  border: 1px solid ${({ theme }) => theme.colors.brand};
  border-radius: 3px;
  font-family: ${mono};
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.brandText};
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '380ms')}
`;

const Hidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

const RULE_FIELDS = ['NIFTY 50', 'close', 'above', '25,000', 'once'];

function TypedRule({ on }: { on: boolean }) {
  const { typed, done } = useTypewriter('Notify me once if NIFTY 50 closes above 25,000.', on);
  return (
    <RuleCard>
      <div className="fields" aria-hidden>
        {RULE_FIELDS.map((f, i) => (
          <Chip key={f} $on={on} $d={160 + i * 110}>
            {f}
          </Chip>
        ))}
      </div>
      <p className="sentence">
        <span aria-hidden>{typed}</span>
        <Hidden>Notify me once if NIFTY 50 closes above 25,000.</Hidden>
        {done ? null : <i className="caret" aria-hidden />}
      </p>
    </RuleCard>
  );
}

const CAL: [string, string, 'expiry' | 'action' | 'ipo'][] = [
  ['Tue 23 Sep', 'Bonus record date', 'action'],
  ['Thu 25 Sep', 'Monthly F&O expiry', 'expiry'],
  ['Mon 29 Sep', 'Dividend ex-date · ITC', 'action'],
  ['Tue 30 Sep', 'IPO closes', 'ipo'],
  ['Thu 02 Oct', 'Weekly expiry · holiday shift', 'expiry'],
];

const CalStrip = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
`;
const CalRow = styled.li<{ $on: boolean; $d: number; $kind: 'expiry' | 'action' | 'ipo' }>`
  display: grid;
  grid-template-columns: 8px 92px minmax(0, 1fr);
  align-items: baseline;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dotted ${({ theme }) => theme.colors.border};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '440ms')}
  & i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: ${({ theme, $kind }) =>
      $kind === 'expiry' ? theme.colors.brand : $kind === 'ipo' ? theme.colors.warning : theme.colors.transfer};
  }
  & time {
    font-family: ${mono};
    font-size: 10.5px;
    letter-spacing: 0.04em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

function CalendarStrip({ on }: { on: boolean }) {
  return (
    <CalStrip>
      {CAL.map(([date, what, kind], i) => (
        <CalRow key={date} $on={on} $d={200 + i * 120} $kind={kind}>
          <i aria-hidden />
          <time>{date.toUpperCase()}</time>
          <span>{what}</span>
        </CalRow>
      ))}
    </CalStrip>
  );
}

function FanOut({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 320;
  const h = 150;
  const targets: [string, string, number][] = [
    ['In-app', 'instant', 28],
    ['Email', 'digest at 18:00', 75],
    ['Telegram', 'instant', 122],
  ];
  return (
    <Plot viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: 500 }} role="img" aria-label="One rule branching to three destinations: in-app instantly, email as a six o'clock digest, and Telegram instantly.">
      <Show $on={on} $d={150}>
        <rect x={0} y={62} width={92} height={26} rx={3} fill="none" stroke={theme.colors.textPrimary} />
        <text x={46} y={79} textAnchor="middle" fontSize={9.5} fontFamily={mono} letterSpacing="0.05em" fill={theme.colors.textPrimary}>
          RULE FIRES
        </text>
      </Show>
      {targets.map(([name, when, y], i) => (
        <g key={name}>
          <Draw
            $on={on}
            $d={400 + i * 200}
            $dur="700ms"
            d={`M92 75 C 140 75, 150 ${y}, 196 ${y}`}
            pathLength={1}
            fill="none"
            stroke={theme.colors.brand}
            strokeWidth={1.6}
          />
          <Show $on={on} $d={1000 + i * 200}>
            <circle cx={196} cy={y} r={3} fill={theme.colors.brand} />
            <text x={206} y={y - 1} fontSize={11} fontFamily={mono} fill={theme.colors.textPrimary}>
              {name}
            </text>
            <text x={206} y={y + 11} fontSize={8.5} fontFamily={mono} fill={theme.colors.textMuted}>
              {when.toUpperCase()}
            </text>
          </Show>
        </g>
      ))}
    </Plot>
  );
}

const Meter = styled.div`
  & .track {
    position: relative;
    height: 26px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 3px;
    background: ${({ theme }) => theme.colors.bgMuted};
    overflow: hidden;
  }
  & .scale {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-family: ${mono};
    font-size: 9.5px;
    letter-spacing: 0.05em;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;
const Fill = styled.span<{ $on: boolean; $pct: number }>`
  position: absolute;
  inset: 0 auto 0 0;
  width: ${({ $pct }) => $pct}%;
  background: ${({ theme }) => theme.colors.expense};
  opacity: 0.75;
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on }) => play($on, 300, '1100ms')}
`;
const Stamp = styled.span<{ $on: boolean }>`
  display: inline-block;
  margin-top: 12px;
  padding: 4px 12px;
  border: 2px solid ${({ theme }) => theme.colors.expense};
  border-radius: 3px;
  font-family: ${mono};
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.expense};
  transform: rotate(-2.5deg);
  animation-name: ${popIn};
  ${({ $on }) => play($on, 1500, '420ms')}
`;

function CoolOffMeter({ on }: { on: boolean }) {
  const used = useCountUp(8200, on, 1400);
  return (
    <Meter>
      <div className="track" role="img" aria-label="A meter 82 percent full: ₹8,200 of today's ₹10,000 self-imposed loss limit is used, and the cool-off stamp has been applied.">
        <Fill $on={on} $pct={82} />
      </div>
      <div className="scale" aria-hidden>
        <span>₹0</span>
        <span>−₹{used.toLocaleString('en-IN')} TODAY</span>
        <span>−₹10,000 LIMIT</span>
      </div>
      <Stamp $on={on}>Cool off · new alerts muted till 15:30</Stamp>
    </Meter>
  );
}

export function AlertsEvidence() {
  const [ref, on] = useInView<HTMLDivElement>(0.12);
  return (
    <div ref={ref}>
      <Spread>
        <Evidence
          on={on}
          label="Alert rule · builder"
          aside="plain sentence"
          figure="One rule"
          finding={
            <>
              you pick the fields, Arvo reads it back as a sentence — so you always know <b>exactly</b> why a message arrived.
            </>
          }
          note="no feed, no tips"
        >
          <TypedRule on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={140}
          label="Calendar · next 10 days"
          aside="5 dates"
          figure="2"
          finding={
            <>
              expiries in ten days, and one of them <b>moves for a holiday</b>. Dates, not predictions.
            </>
          }
        >
          <CalendarStrip on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={80}
          label="Delivery · fan-out"
          aside="per rule"
          figure="3 ways"
          finding={
            <>
              in-app, email or Telegram, chosen per rule — the quiet rules <b>stay quiet</b>.
            </>
          }
        >
          <FanOut on={on} />
        </Evidence>
        <Evidence
          on={on}
          delay={220}
          label="Guardrail · daily loss limit"
          aside="your own number"
          figure="82%"
          finding={
            <>
              of the limit <b>you set yourself</b> is used. Arvo stops pinging rather than feeding a bad afternoon.
            </>
          }
          caveat="A limit you wrote, enforced on notifications only. Arvo never places, blocks or suggests a trade."
        >
          <CoolOffMeter on={on} />
        </Evidence>
      </Spread>
    </div>
  );
}
