'use client';

import type { ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import { drawStroke, fadeIn, fadeUp, growX, growY, play, useCountUp, useInView } from './motion';
import { fonts } from './primitives';

/*
 * Evidence spreads for the Money page. Each one is a single piece of proof: a mono label, one big
 * serif figure, one italic finding, a hand-built chart and a Caveat note in the margin. They mount
 * inside the existing Money sections, so the page keeps its four-part rail.
 */

/* ---------- the shared frame ---------- */

const Block = styled.div<{ $on: boolean }>`
  margin-top: 96px;
  padding-top: ${({ theme }) => theme.space[5]}px;
  border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  animation-name: ${fadeUp};
  ${({ $on }) => play($on, 0, '700ms')}
`;

const Meta = styled.p`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin: 0 0 ${({ theme }) => theme.space[5]}px;
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
  & b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Layout = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: start;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
    gap: ${({ theme }) => theme.space[10]}px;
  }
`;

const Say = styled.div`
  min-width: 0;
  & h4 {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 450;
    font-size: clamp(22px, 2.4vw, 28px);
    line-height: 1.1;
    letter-spacing: -0.025em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & h4 em {
    font-style: italic;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & .figure {
    margin: ${({ theme }) => theme.space[4]}px 0 2px;
    font-family: ${fonts.serif};
    font-weight: 400;
    font-size: clamp(34px, 4.6vw, 52px);
    line-height: 1;
    letter-spacing: -0.045em;
    font-variant-numeric: lining-nums tabular-nums;
    font-variation-settings: 'opsz' 144;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .finding {
    margin: 0;
    max-width: 34ch;
    font-family: ${fonts.serif};
    font-style: italic;
    font-size: 17px;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .finding b {
    font-style: normal;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .note {
    display: inline-block;
    margin: ${({ theme }) => theme.space[5]}px 0 0;
    max-width: 24ch;
    font-family: ${fonts.hand};
    font-size: 21px;
    line-height: 1.15;
    transform: rotate(-1.6deg);
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Art = styled.div`
  min-width: 0;
`;

function Piece({
  eyebrow,
  unit,
  title,
  figure,
  finding,
  note,
  children,
}: {
  eyebrow: string;
  unit: string;
  title: ReactNode;
  figure: ReactNode;
  finding: ReactNode;
  note: string;
  children: (on: boolean) => ReactNode;
}) {
  const [ref, on] = useInView<HTMLDivElement>(0.15);
  return (
    <Block ref={ref} $on={on}>
      <Meta>
        <b>{eyebrow}</b>
        <span>{unit}</span>
      </Meta>
      <Layout>
        <Say>
          <h4>{title}</h4>
          <p className="figure">{figure}</p>
          <p className="finding">{finding}</p>
          <span className="note">{note}</span>
        </Say>
        <Art>{children(on)}</Art>
      </Layout>
    </Block>
  );
}

/* ---------- small animated building blocks ---------- */

const GrowRight = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '720ms')}
`;
const GrowLeft = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: right;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '720ms')}
`;
const GrowUp = styled.rect<{ $on: boolean; $d: number }>`
  transform-box: fill-box;
  transform-origin: bottom;
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '720ms')}
`;
const Draw = styled.path<{ $on: boolean; $d: number; $ms?: string }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d, $ms }) => play($on, $d, $ms ?? '1400ms')}
`;
const Show = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
`;

const Frame = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  max-width: 560px;
`;

const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`;

/* =====================================================================================
 * 01 · Import → review → ledger
 * ===================================================================================*/

const FUNNEL = [
  { label: 'Rows read from 4 files', value: 1_284 },
  { label: 'Duplicates caught in review', value: 37, drop: true },
  { label: 'Committed to the ledger', value: 1_247 },
  { label: 'Matched by a rule you wrote', value: 1_198 },
  { label: 'Sent to AI for a guess', value: 49, drop: true },
];

function ImportFunnel({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 560;
  const rowH = 46;
  const h = FUNNEL.length * rowH + 14;
  const barX = 236;
  const max = 1_284;
  return (
    <Frame viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Funnel: 1,284 rows read from four files, 37 duplicates caught in review, 1,247 committed to the ledger, 1,198 matched by a rule you wrote and 49 sent to AI for a guess.">
      {FUNNEL.map((f, i) => {
        const y = i * rowH + 6;
        const bw = ((w - barX - 62) * f.value) / max;
        const color = f.drop ? theme.colors.textMuted : i === 3 ? theme.colors.brand : theme.colors.textPrimary;
        return (
          <g key={f.label}>
            <text x={0} y={y + 20} fontSize={12.5} fontFamily={fonts.mono} fill={theme.colors.textSecondary}>
              {f.label}
            </text>
            <GrowRight $on={on} $d={120 + i * 130} x={barX} y={y + 8} width={Math.max(bw, 2)} height={16} fill={color} fillOpacity={f.drop ? 0.35 : 0.85} />
            <Show $on={on} $d={500 + i * 130}>
              <text x={barX + Math.max(bw, 2) + 8} y={y + 21} fontSize={14} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
                {f.value.toLocaleString('en-IN')}
              </text>
            </Show>
            <line x1={0} x2={w} y1={y + 36} y2={y + 36} stroke={theme.colors.borderSubtle} />
          </g>
        );
      })}
    </Frame>
  );
}

export function ImportEvidence() {
  return (
    <Piece
      eyebrow="Import · review · ledger"
      unit="September upload"
      title={
        <>
          Nothing lands until <em>you commit it</em>
        </>
      }
      figure="1,247"
      finding={
        <>
          rows in the ledger. The <b>37 duplicates</b> never made it in, and 96% were categorised by a rule you can read.
        </>
      }
      note="four files, one review screen"
    >
      {(on) => <ImportFunnel on={on} />}
    </Piece>
  );
}

/* =====================================================================================
 * 02 · Category creep against your own three-month average
 * ===================================================================================*/

const CREEP = [
  { name: 'Rent', now: 29_300, avg: 29_300 },
  { name: 'Food & dining', now: 18_960, avg: 13_540 },
  { name: 'Travel', now: 13_800, avg: 9_900 },
  { name: 'Shopping', now: 12_930, avg: 14_600 },
  { name: 'Everything else', now: 11_210, avg: 12_060 },
];
const CREEP_NET = CREEP.reduce((s, c) => s + (c.now - c.avg), 0); // +6,800

function CreepChart({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 560;
  const rowH = 44;
  const h = CREEP.length * rowH + 22;
  const mid = 250;
  const scale = 0.032; // px per rupee
  return (
    <Frame viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Diverging bars comparing September spending with the three-month average: food and dining is ₹5,420 higher, travel ₹3,900 higher, shopping ₹1,670 lower, everything else ₹850 lower and rent unchanged.">
      <text x={mid - 8} y={12} fontSize={10.5} fontFamily={fonts.mono} textAnchor="end" fill={theme.colors.textMuted}>
        UNDER AVERAGE
      </text>
      <text x={mid + 8} y={12} fontSize={10.5} fontFamily={fonts.mono} fill={theme.colors.textMuted}>
        OVER
      </text>
      {CREEP.map((c, i) => {
        const y = 22 + i * rowH;
        const diff = c.now - c.avg;
        const bw = Math.abs(diff) * scale;
        const over = diff > 0;
        return (
          <g key={c.name}>
            <text x={0} y={y + 20} fontSize={12.5} fontFamily={fonts.mono} fill={theme.colors.textSecondary}>
              {c.name}
            </text>
            {diff === 0 ? (
              <Show $on={on} $d={200 + i * 120}>
                <text x={mid + 8} y={y + 20} fontSize={12.5} fontFamily={fonts.mono} fill={theme.colors.textMuted}>
                  steady
                </text>
              </Show>
            ) : over ? (
              <GrowRight $on={on} $d={200 + i * 120} x={mid} y={y + 7} width={bw} height={17} fill={theme.colors.expense} fillOpacity={0.8} />
            ) : (
              <GrowLeft $on={on} $d={200 + i * 120} x={mid - bw} y={y + 7} width={bw} height={17} fill={theme.colors.income} fillOpacity={0.55} />
            )}
            {diff !== 0 ? (
              <Show $on={on} $d={600 + i * 120}>
                <text
                  x={over ? mid + bw + 8 : mid - bw - 8}
                  y={y + 21}
                  fontSize={14}
                  fontFamily={fonts.serif}
                  textAnchor={over ? 'start' : 'end'}
                  fill={over ? theme.colors.expense : theme.colors.income}
                >
                  {over ? '+' : '−'}
                  {inr(Math.abs(diff))}
                </text>
              </Show>
            ) : null}
          </g>
        );
      })}
      <line x1={mid} x2={mid} y1={16} y2={h - 6} stroke={theme.colors.textPrimary} />
      <text x={mid} y={h - 0} fontSize={10.5} fontFamily={fonts.mono} textAnchor="middle" fill={theme.colors.textMuted}>
        3-MONTH AVERAGE
      </text>
    </Frame>
  );
}

export function CreepEvidence() {
  return (
    <Piece
      eyebrow="Category creep"
      unit="September vs 3-month average"
      title={
        <>
          Compared against <em>your own habits</em>
        </>
      }
      figure={`+${inr(CREEP_NET)}`}
      finding={
        <>
          over your three-month average — and <b>₹9,320</b> of it is food and travel. Shopping quietly went the other way.
        </>
      }
      note="no benchmarks, no strangers' budgets"
    >
      {(on) => <CreepChart on={on} />}
    </Piece>
  );
}

/* =====================================================================================
 * 03 · Subscriptions and the prices that crept up
 * ===================================================================================*/

const SUBS = [
  { name: 'Netflix', amount: 749, was: 649, when: 'Aug' },
  { name: 'Gym', amount: 1_500 },
  { name: 'News app', amount: 449 },
  { name: 'iCloud', amount: 219 },
  { name: 'Spotify', amount: 149, was: 119, when: 'Jun' },
  { name: 'Audible', amount: 199, idle: 'unused 4 months' },
  { name: '5 smaller charges', amount: 863 },
];
const SUBS_TOTAL = SUBS.reduce((s, x) => s + x.amount, 0); // 4,128

const Shelf = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 560px;
`;

const ShelfRow = styled.li<{ $on: boolean; $d: number }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 6px 12px;
  padding: 9px 0;
  border-bottom: 1px dotted ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '520ms')}
  & .name {
    font-size: 15px;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .amt {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 19px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .rise,
  & .idle {
    grid-column: 1 / -1;
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  & .rise {
    color: ${({ theme }) => theme.colors.expense};
  }
  & .idle {
    color: ${({ theme }) => theme.colors.warning};
  }
`;

const ShelfFoot = styled.p`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0 0;
  max-width: 560px;
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

function SubscriptionShelf({ on }: { on: boolean }) {
  return (
    <>
      <Shelf>
        {SUBS.map((s, i) => (
          <ShelfRow key={s.name} $on={on} $d={120 + i * 90}>
            <span className="name">{s.name}</span>
            <span className="amt">{inr(s.amount)}</span>
            {s.was ? (
              <span className="rise">
                ↑ {inr(s.was)} → {inr(s.amount)} in {s.when} · +{inr((s.amount - s.was) * 12)} a year
              </span>
            ) : null}
            {s.idle ? <span className="idle">no matching activity · {s.idle}</span> : null}
          </ShelfRow>
        ))}
      </Shelf>
      <ShelfFoot>
        <span>11 recurring charges</span>
        <span>{inr(SUBS_TOTAL * 12)} a year</span>
      </ShelfFoot>
    </>
  );
}

export function SubscriptionEvidence() {
  return (
    <Piece
      eyebrow="Recurring charges"
      unit="Detected from the ledger"
      title={
        <>
          The charges that <em>renew themselves</em>
        </>
      }
      figure={`${inr(SUBS_TOTAL)}/mo`}
      finding={
        <>
          on eleven subscriptions. <b>Two raised their price</b> this year without asking, and one hasn&rsquo;t been used
          since May.
        </>
      }
      note="found by pattern, not by a list you keep"
    >
      {(on) => <SubscriptionShelf on={on} />}
    </Piece>
  );
}

/* =====================================================================================
 * 04 · Budget pacing with a "today" marker
 * ===================================================================================*/

const DAY = 19;
const DAYS = 31;
const ELAPSED = DAY / DAYS;

const PACE = [
  { name: 'Rent', budget: 29_300, spent: 29_300 },
  { name: 'Food & dining', budget: 16_000, spent: 12_900 },
  { name: 'Shopping', budget: 12_000, spent: 9_400 },
  { name: 'Travel', budget: 10_000, spent: 3_200 },
  { name: 'Everything else', budget: 22_700, spent: 6_600 },
];
const PACE_BUDGET = PACE.reduce((s, p) => s + p.budget, 0); // 90,000
const PACE_SPENT = PACE.reduce((s, p) => s + p.spent, 0); // 61,400
const PROJECTED = Math.round(PACE_SPENT / ELAPSED / 100) * 100; // ~1,00,200

function PaceChart({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 560;
  const rowH = 46;
  const h = PACE.length * rowH + 30;
  const barX = 150;
  const barW = w - barX - 66;
  return (
    <Frame viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Budget pacing on day ${DAY} of ${DAYS}: ₹${PACE_SPENT.toLocaleString('en-IN')} of a ₹${PACE_BUDGET.toLocaleString('en-IN')} budget is spent. Rent is fully paid, food and dining is 81 per cent spent, and travel and everything else are well inside the pace.`}>
      <line x1={barX + barW * ELAPSED} x2={barX + barW * ELAPSED} y1={16} y2={h - 22} stroke={theme.colors.textPrimary} strokeDasharray="3 3" />
      <text x={barX + barW * ELAPSED} y={11} fontSize={10.5} fontFamily={fonts.mono} textAnchor="middle" fill={theme.colors.textPrimary}>
        TODAY · DAY {DAY}
      </text>
      {PACE.map((p, i) => {
        const y = 22 + i * rowH;
        const pct = p.spent / p.budget;
        const hot = pct > ELAPSED + 0.12 && p.name !== 'Rent';
        return (
          <g key={p.name}>
            <text x={0} y={y + 16} fontSize={12.5} fontFamily={fonts.mono} fill={theme.colors.textSecondary}>
              {p.name}
            </text>
            <rect x={barX} y={y + 3} width={barW} height={18} fill={theme.colors.bgMuted} stroke={theme.colors.borderSubtle} />
            <GrowRight
              $on={on}
              $d={160 + i * 120}
              x={barX}
              y={y + 3}
              width={barW * pct}
              height={18}
              fill={hot ? theme.colors.expense : theme.colors.brand}
              fillOpacity={0.75}
            />
            <Show $on={on} $d={620 + i * 120}>
              <text x={w} y={y + 17} fontSize={13} fontFamily={fonts.serif} textAnchor="end" fill={theme.colors.textPrimary}>
                {Math.round(pct * 100)}%
              </text>
            </Show>
            <text x={barX} y={y + 36} fontSize={10.5} fontFamily={fonts.mono} fill={theme.colors.textMuted}>
              {inr(p.spent)} of {inr(p.budget)}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

export function PacingEvidence() {
  return (
    <Piece
      eyebrow="Budget pacing"
      unit={`October · day ${DAY} of ${DAYS}`}
      title={
        <>
          Where the month is, <em>not just where it ended</em>
        </>
      }
      figure={inr(PROJECTED)}
      finding={
        <>
          projected for October at today&rsquo;s pace — <b>{inr(PROJECTED - PACE_BUDGET)} over</b> the {inr(PACE_BUDGET)}{' '}
          budget, and food &amp; dining is the reason.
        </>
      }
      note="rent is already paid — the bar knows"
    >
      {(on) => <PaceChart on={on} />}
    </Piece>
  );
}

/* =====================================================================================
 * 05 · Goals and what each one needs every month
 * ===================================================================================*/

const GOALS = [
  { name: 'Emergency fund', target: 6_00_000, saved: 4_35_000, months: 6, by: 'Mar 2027' },
  { name: 'New laptop', target: 1_80_000, saved: 60_000, months: 4, by: 'Jan 2027' },
  { name: 'Japan, two weeks', target: 3_20_000, saved: 92_000, months: 7, by: 'Apr 2027' },
];
const need = (g: (typeof GOALS)[number]) => Math.round((g.target - g.saved) / g.months / 100) * 100;
const AFFORDABLE = need(GOALS[0]) + need(GOALS[1]); // 57,500
const SAVED_LAST_MONTH = 64_800;

function GoalsChart({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 560;
  const rowH = 74;
  const h = GOALS.length * rowH + 8;
  const barW = w - 4;
  return (
    <Frame viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Three goals with progress and the monthly contribution each needs: emergency fund ₹4,35,000 of ₹6,00,000 needs ₹27,500 a month, new laptop ₹60,000 of ₹1,80,000 needs ₹30,000 a month, and a two-week Japan trip ₹92,000 of ₹3,20,000 needs ₹32,600 a month.">
      {GOALS.map((g, i) => {
        const y = i * rowH + 8;
        const pct = g.saved / g.target;
        return (
          <g key={g.name}>
            <text x={0} y={y + 12} fontSize={13.5} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
              {g.name}
            </text>
            <text x={w} y={y + 12} fontSize={11} fontFamily={fonts.mono} textAnchor="end" fill={theme.colors.textMuted}>
              BY {g.by.toUpperCase()}
            </text>
            <rect x={2} y={y + 22} width={barW} height={14} fill={theme.colors.bgMuted} stroke={theme.colors.borderSubtle} />
            <GrowRight $on={on} $d={180 + i * 160} x={2} y={y + 22} width={barW * pct} height={14} fill={theme.colors.brand} fillOpacity={0.8} />
            <Show $on={on} $d={700 + i * 160}>
              <text x={2} y={y + 52} fontSize={11.5} fontFamily={fonts.mono} fill={theme.colors.textSecondary}>
                {inr(g.saved)} of {inr(g.target)} · {Math.round(pct * 100)}%
              </text>
              <text x={w} y={y + 52} fontSize={13.5} fontFamily={fonts.serif} textAnchor="end" fill={theme.colors.brandText}>
                needs {inr(need(g))}/mo
              </text>
            </Show>
          </g>
        );
      })}
    </Frame>
  );
}

export function GoalsEvidence() {
  return (
    <Piece
      eyebrow="Goals"
      unit="Contribution required, not hoped for"
      title={
        <>
          What each goal <em>costs you a month</em>
        </>
      }
      figure={`${inr(AFFORDABLE)}/mo`}
      finding={
        <>
          covers the emergency fund and the laptop — inside the <b>{inr(SAVED_LAST_MONTH)}</b> you actually saved in
          September. Japan needs {inr(need(GOALS[2]))} more, or a later date.
        </>
      }
      note="arithmetic, not encouragement"
    >
      {(on) => <GoalsChart on={on} />}
    </Piece>
  );
}

/* =====================================================================================
 * 06 · Savings opportunities, added up
 * ===================================================================================*/

const KEEP = [
  { name: 'Two subscriptions nothing touches', amount: 648, from: 'Audible + news app' },
  { name: 'Food delivery back to your average', amount: 1_805, from: '18 orders in September' },
  { name: 'Idle ₹1.2L moved to a sweep deposit', amount: 427, from: 'balance never dipped below it' },
  { name: 'Card paid before the due date', amount: 300, from: 'interest charged twice this year' },
];
const KEEP_TOTAL = KEEP.reduce((s, k) => s + k.amount, 0); // 3,180

function KeepChart({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 560;
  const h = 300;
  const base = h - 34;
  const colW = 96;
  const gap = 22;
  const scale = (base - 40) / KEEP_TOTAL;
  let acc = 0;
  return (
    <Frame viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Stacked columns adding four savings opportunities to ₹${KEEP_TOTAL.toLocaleString('en-IN')} a month: ₹648 from two unused subscriptions, ₹1,805 from food delivery returning to average, ₹427 from idle cash in a sweep deposit and ₹300 of avoided card interest.`}>
      <line x1={0} x2={w} y1={base} y2={base} stroke={theme.colors.textPrimary} />
      {KEEP.map((k, i) => {
        const bh = k.amount * scale;
        const x = i * (colW + gap);
        const y = base - bh;
        acc += k.amount;
        return (
          <g key={k.name}>
            <GrowUp $on={on} $d={180 + i * 150} x={x} y={y} width={colW} height={bh} fill={theme.colors.brand} fillOpacity={0.3 + i * 0.16} />
            <Show $on={on} $d={640 + i * 150}>
              <text x={x} y={y - 8} fontSize={15} fontFamily={fonts.serif} fill={theme.colors.textPrimary}>
                {inr(k.amount)}
              </text>
            </Show>
            <text x={x} y={base + 16} fontSize={10.5} fontFamily={fonts.mono} fill={theme.colors.textSecondary}>
              {String(i + 1).padStart(2, '0')}
            </text>
            <text x={x + 20} y={base + 16} fontSize={10.5} fontFamily={fonts.mono} fill={theme.colors.textMuted}>
              {inr(acc)}
            </text>
          </g>
        );
      })}
      <Show $on={on} $d={1200}>
        <line x1={4 * (colW + gap) - gap + 8} x2={w} y1={base - KEEP_TOTAL * scale} y2={base - KEEP_TOTAL * scale} stroke={theme.colors.brandText} strokeDasharray="4 4" />
        <text x={w} y={base - KEEP_TOTAL * scale - 8} fontSize={16} fontFamily={fonts.serif} textAnchor="end" fill={theme.colors.brandText}>
          {inr(KEEP_TOTAL)} a month
        </text>
      </Show>
    </Frame>
  );
}

const KeepList = styled.ol`
  list-style: none;
  margin: ${({ theme }) => theme.space[4]}px 0 0;
  padding: 0;
  max-width: 560px;
  & li {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
    padding: 6px 0;
    font-family: ${fonts.mono};
    font-size: 11.5px;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & small {
    display: block;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

export function SavingsEvidence() {
  return (
    <Piece
      eyebrow="Savings opportunities"
      unit="Each one traced to rows"
      title={
        <>
          Four small leaks, <em>added up honestly</em>
        </>
      }
      figure={`${inr(KEEP_TOTAL)}/mo`}
      finding={
        <>
          you could keep — <b>{inr(KEEP_TOTAL * 12)} a year</b> — without giving up anything you&rsquo;d miss.
        </>
      }
      note="suggested, never done for you"
    >
      {(on) => (
        <>
          <KeepChart on={on} />
          <KeepList>
            {KEEP.map((k, i) => (
              <li key={k.name}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <b>{k.name}</b>
                  <small>{k.from}</small>
                </span>
              </li>
            ))}
          </KeepList>
        </>
      )}
    </Piece>
  );
}

/* =====================================================================================
 * 07 · The what-if planner as a cash runway against a safety buffer
 * ===================================================================================*/

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const BUFFER = 1_50_000;
/** ₹2,18,400 in cash today, ₹30,000 staying in cash each month after SIPs and goal transfers. */
const OUTRIGHT = [2_48_400, 98_400, 1_28_400, 1_58_400, 1_88_400, 2_18_400, 2_48_400, 2_78_400];
const ON_EMI = [2_48_400, 2_48_400, 2_48_400, 2_48_400, 2_48_400, 2_48_400, 2_78_400, 3_08_400];
const LOW = Math.min(...OUTRIGHT);

function RunwayChart({ on }: { on: boolean }) {
  const theme = useTheme();
  const w = 560;
  const h = 260;
  const padL = 8;
  const padR = 52;
  const base = h - 26;
  const top = 18;
  const maxV = 3_20_000;
  const x = (i: number) => padL + (i * (w - padL - padR)) / (MONTHS.length - 1);
  const y = (v: number) => base - (v / maxV) * (base - top);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <Frame viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Cash runway over eight months against a ₹1,50,000 safety buffer. Paying ₹1,80,000 in cash in November drops the balance to ₹98,400 and keeps it under the buffer for three months; a six-month no-cost EMI holds the balance flat at ₹2,48,400 and never touches the buffer.">
      <rect x={0} y={y(BUFFER)} width={w - padR + 4} height={base - y(BUFFER)} fill={theme.colors.expense} fillOpacity={0.07} />
      <line x1={0} x2={w - padR + 4} y1={y(BUFFER)} y2={y(BUFFER)} stroke={theme.colors.expense} strokeDasharray="5 4" />
      <text x={w} y={y(BUFFER) + 4} fontSize={10.5} fontFamily={fonts.mono} textAnchor="end" fill={theme.colors.expense}>
        BUFFER
      </text>
      <line x1={0} x2={w - padR + 4} y1={base} y2={base} stroke={theme.colors.border} />
      <Draw $on={on} $d={200} d={line(ON_EMI)} pathLength={1} fill="none" stroke={theme.colors.income} strokeWidth={2.2} strokeDasharray="1" />
      <Draw $on={on} $d={500} d={line(OUTRIGHT)} pathLength={1} fill="none" stroke={theme.colors.textPrimary} strokeWidth={2.4} />
      <Show $on={on} $d={1700}>
        <circle cx={x(1)} cy={y(LOW)} r={4} fill={theme.colors.bgSurface} stroke={theme.colors.expense} strokeWidth={2.2} />
        <text x={x(1) + 10} y={y(LOW) + 5} fontSize={14} fontFamily={fonts.serif} fill={theme.colors.expense}>
          {inr(LOW)}
        </text>
        <text x={x(5)} y={y(2_48_400) - 10} fontSize={13} fontFamily={fonts.serif} fontStyle="italic" fill={theme.colors.income}>
          6-month no-cost EMI
        </text>
        <text x={x(3)} y={y(1_58_400) + 20} fontSize={13} fontFamily={fonts.serif} fontStyle="italic" fill={theme.colors.textSecondary}>
          paid in cash
        </text>
      </Show>
      {MONTHS.map((m, i) => (
        <text key={m} x={x(i)} y={h - 8} fontSize={10.5} fontFamily={fonts.mono} textAnchor={i === 0 ? 'start' : 'middle'} fill={theme.colors.textMuted}>
          {m.toUpperCase()}
        </text>
      ))}
    </Frame>
  );
}

export function RunwayEvidence() {
  return (
    <Piece
      eyebrow="Can I afford it?"
      unit="₹1,80,000 laptop · November"
      title={
        <>
          The answer is <em>a line, not a yes</em>
        </>
      }
      figure={inr(LOW)}
      finding={
        <>
          is the low point if you pay cash — <b>three months</b> under your {inr(BUFFER)} buffer. The no-cost EMI never
          touches it.
        </>
      }
      note="the buffer is yours to set"
    >
      {(on) => <RunwayChart on={on} />}
    </Piece>
  );
}

/* ---------- a count-up strip used to close the Money planning section ---------- */

const Strip = styled.dl<{ $on: boolean }>`
  display: grid;
  gap: ${({ theme }) => theme.space[5]}px;
  margin-top: 72px;
  padding-top: ${({ theme }) => theme.space[5]}px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on }) => play($on, 0, '700ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  & dt {
    font-family: ${fonts.mono};
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & dd {
    margin: 6px 0 0;
    font-family: ${fonts.serif};
    font-weight: 450;
    font-size: clamp(26px, 3.2vw, 34px);
    letter-spacing: -0.03em;
    font-variant-numeric: lining-nums tabular-nums;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & dd small {
    display: block;
    margin-top: 4px;
    font-family: ${fonts.serif};
    font-style: italic;
    font-size: 15px;
    letter-spacing: 0;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

export function MoneyTally() {
  const [ref, on] = useInView<HTMLDListElement>(0.2);
  const keep = useCountUp(KEEP_TOTAL * 12, on, 1500);
  const rows = useCountUp(1_247, on, 1300);
  const goals = useCountUp(AFFORDABLE, on, 1400);
  return (
    <Strip ref={ref} $on={on}>
      <div>
        <dt>Committed this month</dt>
        <dd>
          {rows.toLocaleString('en-IN')}
          <small>rows, each one reviewable</small>
        </dd>
      </div>
      <div>
        <dt>Found for you to keep</dt>
        <dd>
          {inr(keep)}
          <small>a year, itemised</small>
        </dd>
      </div>
      <div>
        <dt>Goals you can fund today</dt>
        <dd>
          {inr(goals)}
          <small>a month, two of three</small>
        </dd>
      </div>
    </Strip>
  );
}
