'use client';

import { useEffect, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { OpenAppLink } from '../beta-access';
import { drawStroke, fadeUp, formatINR, growX, play, useCountUp, usePrefersReducedMotion } from './motion';
import { Container, fonts } from './primitives';

/*
 * One ledger sheet that splits, on load, into the two halves of Arvo: what you spend (Money) on the
 * left, what you own (Markets) on the right — and a single net-worth line that both columns feed.
 * Everything is drawn from theme tokens; reduced motion lands on the finished sheet.
 */

/* ---------- the numbers on the sheet ---------- */

const SPEND = [
  { name: 'Rent', amount: 29_300 },
  { name: 'Food & dining', amount: 18_960, up: true },
  { name: 'Travel', amount: 13_800 },
  { name: 'Everything else', amount: 24_140 },
];
const OUT = SPEND.reduce((s, r) => s + r.amount, 0); // 86,200

const HOLD = [
  { name: 'Equity funds', amount: 6_42_100 },
  { name: 'Stocks', amount: 3_88_600 },
  { name: 'Index ETFs', amount: 1_24_900 },
  { name: 'Gold ETF', amount: 78_380 },
];
const INVESTED = HOLD.reduce((s, r) => s + r.amount, 0); // 12,33,980
const CASH = 2_18_400;
const NET_WORTH = CASH + INVESTED; // 14,52,380

const BUDGET = 90_000;

const amt = (v: number) => v.toLocaleString('en-IN');

/* ---------- sequencing: the sheet builds itself once the page loads ---------- */

const STAGE = { sheet: 1, split: 2, rows: 3, charts: 4, converge: 5, tally: 6 } as const;
const LAST_STAGE = STAGE.tally;
const BEATS = [300, 480, 420, 620, 520, 420];

/** Runs once on mount — the user asked for a hero that plays on load, not on scroll. */
function useLoadStage() {
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (reduced || stage >= LAST_STAGE) return;
    const id = window.setTimeout(() => setStage((s) => s + 1), BEATS[stage] ?? 400);
    return () => window.clearTimeout(id);
  }, [stage, reduced]);
  return reduced ? LAST_STAGE : stage;
}

/* ---------- layout ---------- */

const HeroSection = styled.section`
  position: relative;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Stick = styled.div`
  padding: ${({ theme }) => theme.space[8]}px 0 ${({ theme }) => theme.space[10]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    /* One screen, not much more: the sheet and the copy under it share the viewport. */
    min-height: min(720px, calc(100svh - 56px));
    display: flex;
    align-items: center;
    padding: ${({ theme }) => theme.space[6]}px 0 ${({ theme }) => theme.space[8]}px;
  }
`;

const Center = styled(Container)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

const H1 = styled.h1`
  margin: 0 0 ${({ theme }) => theme.space[2]}px;
  max-width: 21ch;
  font-family: ${fonts.serif};
  font-weight: 450;
  font-size: clamp(28px, 2vw + 18px, 44px);
  line-height: 1.04;
  letter-spacing: -0.03em;
  font-variation-settings: 'opsz' 144, 'SOFT' 30;
  color: ${({ theme }) => theme.colors.textPrimary};
  & em {
    font-style: italic;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Kicker = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[5]}px;
  font-family: ${fonts.hand};
  font-size: 23px;
  line-height: 1.1;
  transform: rotate(-1.4deg);
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Below = styled.div`
  margin-top: ${({ theme }) => theme.space[6]}px;
  display: grid;
  justify-items: center;
  gap: 12px;
  & p {
    margin: 0;
    max-width: 58ch;
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

/* ---------- the sheet ---------- */

const Paper = styled.figure<{ $on: boolean }>`
  position: relative;
  width: 100%;
  max-width: 880px;
  margin: 0;
  padding: 22px 26px 18px;
  text-align: left;
  background-color: ${({ theme }) => (theme.mode === 'dark' ? theme.colors.bgSurfaceRaised : '#fcfbf6')};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 22px 44px -30px rgba(0, 0, 0, ${({ theme }) => (theme.mode === 'dark' ? 0.8 : 0.3)});
  color: ${({ theme }) => theme.colors.textPrimary};
  animation-name: ${fadeUp};
  ${({ $on }) => play($on, 0, '620ms')}
  @media (min-width: 701px) {
    transform: rotate(-0.6deg);
  }
  @media (max-width: 700px) {
    padding: 16px 14px 14px;
  }
`;

const Letterhead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px 16px;
  flex-wrap: wrap;
  padding-bottom: 9px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.textPrimary};
  & strong {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 19px;
    letter-spacing: -0.01em;
  }
  & strong b {
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  & > span {
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  @media (max-width: 480px) {
    & strong {
      font-size: 17px;
    }
    & strong .long {
      display: none;
    }
  }
`;

/** The split: two columns with a rule that draws down the middle once the sheet has landed. */
const Split = styled.div`
  position: relative;
  display: grid;
  gap: ${({ theme }) => theme.space[5]}px;
  @media (min-width: 701px) {
    grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
    gap: ${({ theme }) => theme.space[6]}px;
  }
`;

const Rule = styled.span<{ $on: boolean }>`
  display: block;
  background: ${({ theme }) => theme.colors.border};
  transform-origin: top;
  transform: scaleY(${({ $on }) => ($on ? 1 : 0)});
  transition: transform 520ms ${({ theme }) => theme.motion.easing};
  @media (max-width: 700px) {
    height: 1px;
    transform-origin: left;
    transform: scaleX(${({ $on }) => ($on ? 1 : 0)});
  }
`;

const Col = styled.div<{ $on: boolean; $d: number }>`
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding-top: 10px;
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '560ms')}
`;

const ColHead = styled.p<{ $side: 'spend' | 'own' }>`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 8px;
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
  & b {
    font-weight: 500;
    color: ${({ theme, $side }) => ($side === 'spend' ? theme.colors.brandText : theme.colors.info)};
  }
`;

const Lines = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: ${fonts.mono};
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
`;

const Line = styled.li<{ $on: boolean; $d: number }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dotted ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '420ms')}
  & span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  & i {
    font-style: normal;
    color: ${({ theme }) => theme.colors.expense};
  }
`;

const Total = styled.p`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 0 0;
  & small {
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & b {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: clamp(22px, 3vw, 28px);
    letter-spacing: -0.02em;
    font-variant-numeric: lining-nums tabular-nums;
  }
`;

const ChartSlot = styled.div`
  /* Bottom-aligns the two charts, so the shorter one does not leave a hole in its column. */
  margin-top: auto;
  padding-top: 12px;
  & .note {
    margin: 6px 0 0;
    font-family: ${fonts.hand};
    font-size: 19px;
    line-height: 1.1;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

/* ---------- left chart: budget pace with a "today" marker ---------- */

const PaceTrack = styled.div`
  position: relative;
  height: 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgMuted};
`;

const PaceFill = styled.span<{ $on: boolean; $pct: number }>`
  position: absolute;
  inset: 0 auto 0 0;
  width: ${({ $pct }) => $pct}%;
  background: ${({ theme }) => theme.colors.brand};
  opacity: 0.75;
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on }) => play($on, 120, '900ms')}
`;

const PaceLegend = styled.p`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 0;
  font-family: ${fonts.mono};
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/* ---------- right chart: the equity curve ---------- */

const Draw = styled.path<{ $on: boolean; $d: number }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d }) => play($on, $d, '1400ms')}
`;

function EquityCurve({ on }: { on: boolean }) {
  const theme = useTheme();
  const pts = [58, 61, 57, 66, 72, 69, 78, 84, 81, 92, 99, 108];
  const w = 300;
  const h = 62;
  const x = (i: number) => 2 + (i * (w - 4)) / (pts.length - 1);
  const y = (v: number) => h - 8 - ((v - 52) / 60) * (h - 14);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }} aria-hidden focusable="false">
      <line x1={0} x2={w} y1={h - 4} y2={h - 4} stroke={theme.colors.borderSubtle} />
      <Draw $on={on} $d={120} d={d} pathLength={1} fill="none" stroke={theme.colors.info} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- the join: two streams meeting one figure ---------- */

const Join = styled.svg<{ $on: boolean }>`
  display: block;
  width: 100%;
  height: 26px;
  margin-top: 2px;
  & path {
    fill: none;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: ${({ $on }) => ($on ? 0 : 1)};
    transition: stroke-dashoffset 700ms ${({ theme }) => theme.motion.easing};
  }
  @media (max-width: 700px) {
    display: none;
  }
`;

const Tally = styled.figcaption<{ $on: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px 16px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed ${({ theme }) => theme.colors.textMuted};
  opacity: ${({ $on }) => ($on ? 1 : 0)};
  transition: opacity 500ms;
  & small {
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & b {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: clamp(26px, 4vw, 38px);
    letter-spacing: -0.03em;
    font-variant-numeric: lining-nums tabular-nums;
    white-space: nowrap;
  }
  & em {
    font-family: ${fonts.serif};
    font-style: italic;
    font-size: 15px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

function Sheet({ stage }: { stage: number }) {
  const theme = useTheme();
  const at = (s: number) => stage >= s;
  const net = useCountUp(NET_WORTH, at(STAGE.tally), 1300);
  const spentPct = Math.round((OUT / BUDGET) * 100);
  return (
    <Paper
      $on={at(STAGE.sheet)}
      role="img"
      aria-label={`Illustration: one Arvo ledger sheet splitting into two columns. On the left, what you spend — September spending of ₹${amt(
        OUT,
      )} against a ₹${amt(BUDGET)} budget. On the right, what you own — ₹${amt(
        INVESTED,
      )} across funds, stocks, ETFs and gold, with a rising equity curve. Both feed one net worth of ₹${amt(NET_WORTH)}, up ₹5.1 lakh over twelve months.`}
    >
      <Letterhead aria-hidden>
        <strong>
          <b>ARVO</b> — One money life<span className="long">, one ledger</span>
        </strong>
        <span>September 2026</span>
      </Letterhead>
      <Split aria-hidden>
        <Col $on={at(STAGE.split)} $d={0}>
          <ColHead $side="spend">
            <span>
              <b>Money</b> · what you spend
            </span>
            <span>Sep</span>
          </ColHead>
          <Lines>
            {SPEND.map((r, i) => (
              <Line key={r.name} $on={at(STAGE.rows)} $d={i * 110}>
                <span>{r.name}</span>
                <span>
                  {amt(r.amount)}
                  {r.up ? <i> ↑ 40%</i> : null}
                </span>
              </Line>
            ))}
          </Lines>
          <Total>
            <small>Out this month</small>
            <b>{formatINR(OUT)}</b>
          </Total>
          <ChartSlot>
            <PaceTrack>
              <PaceFill $on={at(STAGE.charts)} $pct={spentPct} />
            </PaceTrack>
            <PaceLegend>
              <span>Budget {formatINR(BUDGET)}</span>
              <span>{formatINR(BUDGET - OUT)} left</span>
            </PaceLegend>
            <p className="note">closed the month under budget</p>
          </ChartSlot>
        </Col>

        <Rule $on={at(STAGE.split)} />

        <Col $on={at(STAGE.split)} $d={140}>
          <ColHead $side="own">
            <span>
              <b>Markets</b> · what you own
            </span>
            <span>Today</span>
          </ColHead>
          <Lines>
            {HOLD.map((r, i) => (
              <Line key={r.name} $on={at(STAGE.rows)} $d={70 + i * 110}>
                <span>{r.name}</span>
                <span>{amt(r.amount)}</span>
              </Line>
            ))}
          </Lines>
          <Total>
            <small>Invested</small>
            <b>{formatINR(INVESTED)}</b>
          </Total>
          <ChartSlot>
            <EquityCurve on={at(STAGE.charts)} />
            <PaceLegend>
              <span>12 months</span>
              <span>XIRR 14.2%</span>
            </PaceLegend>
            <p className="note">charges and taxes already counted</p>
          </ChartSlot>
        </Col>
      </Split>

      <Join $on={at(STAGE.converge)} viewBox="0 0 600 26" preserveAspectRatio="none" aria-hidden focusable="false">
        <path d="M150 0 C 150 18, 300 8, 300 25" pathLength={1} stroke={theme.colors.brand} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <path d="M450 0 C 450 18, 300 8, 300 25" pathLength={1} stroke={theme.colors.info} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </Join>

      <Tally $on={at(STAGE.tally)} aria-hidden>
        <small>
          Cash {formatINR(CASH)} + invested {formatINR(INVESTED)} = net worth
        </small>
        <b>
          {formatINR(net)} <em>+₹5.1L / yr</em>
        </b>
      </Tally>
    </Paper>
  );
}

export function Hero() {
  const stage = useLoadStage();
  return (
    <HeroSection aria-labelledby="hero-title">
      <Stick>
        <Center>
          <H1 id="hero-title">
            Everything you spend, everything you own — <em>one ledger.</em>
          </H1>
          <Kicker>two halves of the same money life</Kicker>
          <Sheet stage={stage} />
          <Below>
            <p>
              Arvo is one platform with two products on it. <strong>Money</strong> imports the statements your bank already
              sends and shows where the month went. <strong>Markets</strong> keeps your portfolio, trading journal and
              strategy lab. Same ledger, same net-worth line, on a computer you control.
            </p>
            <div className="actions">
              <OpenAppLink className="primary">Open Arvo →</OpenAppLink>
              <a className="secondary" href="#products">
                See both products
              </a>
            </div>
          </Below>
        </Center>
      </Stick>
    </HeroSection>
  );
}
