'use client';

import styled, { useTheme } from 'styled-components';
import { donutSeg, drawStroke, fadeIn, growY, play } from './motion';

export const monthly = [
  { m: 'Apr', income: 138, expense: 92 },
  { m: 'May', income: 142, expense: 104 },
  { m: 'Jun', income: 145, expense: 88 },
  { m: 'Jul', income: 145, expense: 97 },
  { m: 'Aug', income: 151, expense: 112 },
  { m: 'Sep', income: 151, expense: 86 },
];

const Bar = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: bottom;
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '800ms')}
`;

const Fade = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;

export function IncomeExpenseBars({ on, compact = false }: { on: boolean; compact?: boolean }) {
  const theme = useTheme();
  const w = 300;
  const h = compact ? 120 : 170;
  const base = h - 20;
  const max = 160;
  const group = w / monthly.length;
  const bw = compact ? 11 : 14;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="img"
      aria-label="Bar chart of monthly income versus expenses, April to September; income stays above expenses every month"
    >
      {[0.33, 0.66, 1].map((f) => (
        <line
          key={f}
          x1={0}
          x2={w}
          y1={base - (base - 8) * f}
          y2={base - (base - 8) * f}
          stroke={theme.colors.borderSubtle}
          strokeDasharray="3 4"
        />
      ))}
      <line x1={0} x2={w} y1={base} y2={base} stroke={theme.colors.border} />
      {monthly.map((d, i) => {
        const cx = group * i + group / 2;
        const ih = ((base - 8) * d.income) / max;
        const eh = ((base - 8) * d.expense) / max;
        return (
          <g key={d.m}>
            <Bar $on={on} $d={i * 90} x={cx - bw - 1} y={base - ih} width={bw} height={ih} rx={3} fill={theme.colors.income} />
            <Bar $on={on} $d={i * 90 + 60} x={cx + 1} y={base - eh} width={bw} height={eh} rx={3} fill={theme.colors.expense} />
            <text x={cx} y={h - 4} textAnchor="middle" fontSize={10} fill={theme.colors.textMuted}>
              {d.m}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const categories = [
  { name: 'Rent', pct: 34, key: 'brand' },
  { name: 'Food & dining', pct: 22, key: 'warning' },
  { name: 'Travel', pct: 16, key: 'transfer' },
  { name: 'Shopping', pct: 15, key: 'expense' },
  { name: 'Other', pct: 13, key: 'textMuted' },
] as const;

const Seg = styled.circle<{ $on: boolean; $d: number }>`
  animation-name: ${donutSeg};
  ${({ $on, $d }) => play($on, $d, '900ms')}
`;

export function CategoryDonut({ on, size = 140, label = '₹86,200' }: { on: boolean; size?: number; label?: string }) {
  const theme = useTheme();
  let acc = 0;
  return (
    <svg
      viewBox="0 0 42 42"
      width={size}
      height={size}
      role="img"
      aria-label={`Donut chart of spending by category: ${categories.map((c) => `${c.name} ${c.pct}%`).join(', ')}`}
    >
      <circle cx={21} cy={21} r={15.915} fill="none" stroke={theme.colors.bgMuted} strokeWidth={5} />
      <g transform="rotate(-90 21 21)">
        {categories.map((c, i) => {
          const offset = -acc;
          acc += c.pct;
          return (
            <Seg
              key={c.name}
              $on={on}
              $d={i * 160}
              cx={21}
              cy={21}
              r={15.915}
              fill="none"
              stroke={theme.colors[c.key]}
              strokeWidth={5}
              pathLength={100}
              style={{ strokeDasharray: `${Math.max(0, c.pct - 0.8)} ${100 - c.pct + 0.8}`, strokeDashoffset: offset }}
            />
          );
        })}
      </g>
      <text x={21} y={20} textAnchor="middle" fontSize={3} fill={theme.colors.textMuted}>
        Spent
      </text>
      <text x={21} y={25} textAnchor="middle" fontSize={4.4} fontWeight={600} fill={theme.colors.textPrimary}>
        {label}
      </text>
    </svg>
  );
}

const Line = styled.path<{ $on: boolean; $d: number }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d }) => play($on, $d, '1600ms')}
`;

export function NetWorthLine({ on }: { on: boolean }) {
  const theme = useTheme();
  const pts = [38, 44, 42, 55, 61, 58, 70, 78, 76, 88, 96, 104];
  const w = 300;
  const h = 150;
  const x = (i: number) => 6 + (i * (w - 12)) / (pts.length - 1);
  const y = (v: number) => h - 18 - ((v - 30) / 80) * (h - 36);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts.length - 1)} ${h - 18} L${x(0)} ${h - 18} Z`;
  const gid = `nw-${theme.mode}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Line chart of net worth rising steadily over twelve months">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={theme.colors.brand} stopOpacity={0.28} />
          <stop offset="100%" stopColor={theme.colors.brand} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={0} x2={w} y1={h - 18} y2={h - 18} stroke={theme.colors.border} />
      <Fade $on={on} $d={900}>
        <path d={area} fill={`url(#${gid})`} />
      </Fade>
      <Line $on={on} $d={0} d={d} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Fade $on={on} $d={1500}>
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1] ?? 0)} r={4.5} fill={theme.colors.bgSurface} stroke={theme.colors.brand} strokeWidth={2.5} />
      </Fade>
      {['Oct', 'Jan', 'Apr', 'Sep'].map((m, i) => (
        <text key={m} x={x(Math.round((i * (pts.length - 1)) / 3))} y={h - 4} fontSize={10} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'} fill={theme.colors.textMuted}>
          {m}
        </text>
      ))}
    </svg>
  );
}
