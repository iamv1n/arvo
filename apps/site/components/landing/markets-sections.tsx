'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';
import { drawStroke, fadeUp, growX, play, popIn, useCountUp, useInView } from './motion';
import { AlertsEvidence, JournalEvidence, PortfolioEvidence, StrategyEvidence } from './markets-evidence';
import { Container, fonts, SectionHeading, SectionShell } from './primitives';

/*
 * The four halves of Markets, each with its own hand-built picture: an allocation sheet, a
 * contract note that peels charges off a gross figure, an option payoff sketch with an equity
 * curve and its drawdown band, and an alert rule card wired like a switchboard.
 *
 * Everything on this page is analysis and record-keeping. Nothing here recommends a trade.
 */

/* ---------- shared furniture ---------- */

const Split = styled.div<{ $flip?: boolean }>`
  display: grid;
  gap: ${({ theme }) => theme.space[8]}px;
  align-items: center;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: ${({ theme }) => theme.space[10]}px;
    & > :first-child {
      order: ${({ $flip }) => ($flip ? 2 : 1)};
    }
    & > :last-child {
      order: ${({ $flip }) => ($flip ? 1 : 2)};
    }
  }
`;

const Points = styled.div`
  min-width: 0;
  & ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: ${({ theme }) => theme.space[4]}px;
  }
  & li {
    padding-top: ${({ theme }) => theme.space[3]}px;
    border-top: 1px solid ${({ theme }) => theme.colors.border};
  }
  & h4 {
    margin: 0 0 4px;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 20px;
    letter-spacing: -0.015em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & p {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Sheet = styled.figure<{ $on: boolean }>`
  margin: 0;
  min-width: 0;
  padding: ${({ theme }) => theme.space[5]}px;
  border: 1px solid ${({ theme }) => theme.colors.textPrimary};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: 6px 6px 0 ${({ theme }) => theme.colors.brandSubtle};
  animation-name: ${fadeUp};
  ${({ $on }) => play($on, 100, '700ms')}
  & .top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.textPrimary};
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & figcaption {
    margin-top: 12px;
    font-family: ${fonts.hand};
    font-size: 19px;
    line-height: 1.15;
    transform: rotate(-1deg);
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const NotAdvice = styled.p`
  margin: ${({ theme }) => theme.space[6]}px 0 0;
  padding-top: ${({ theme }) => theme.space[3]}px;
  border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  font-family: ${fonts.mono};
  font-size: 12px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** The line that must sit beside anything describing trading features. */
export function EducationalNote({ children }: { children?: ReactNode }) {
  return (
    <NotAdvice>
      Educational, not investment advice.{' '}
      {children ??
        'Arvo records and analyses what you already did and shows the arithmetic behind it. It makes no recommendations, no forecasts and no promises about returns.'}
    </NotAdvice>
  );
}

function Feature({ items }: { items: [string, string][] }) {
  return (
    <Points>
      <ul>
        {items.map(([title, body]) => (
          <li key={title}>
            <h4>{title}</h4>
            <p>{body}</p>
          </li>
        ))}
      </ul>
    </Points>
  );
}

/* ---------- 01 Portfolio: an allocation sheet ---------- */

const Alloc = styled.div`
  margin-top: 14px;
  & .bar {
    display: flex;
    height: 16px;
    border-radius: 3px;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.bgMuted};
  }
  & .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 10px;
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.04em;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .legend span::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 2px;
    background: currentColor;
  }
`;

const Slice = styled.span<{ $on: boolean; $d: number; $w: number; $o: number }>`
  width: ${({ $w }) => $w}%;
  background: ${({ theme }) => theme.colors.brand};
  opacity: ${({ $o }) => $o};
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '700ms')}
`;

const Figures = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0 0;
  & dt {
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & dd {
    margin: 3px 0 0;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 22px;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & dd small {
    display: block;
    margin-top: 2px;
    font-family: ${fonts.mono};
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.03em;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Drift = styled.p<{ $on: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 16px 0 0;
  padding-top: 10px;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  font-family: ${fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  animation-name: ${fadeUp};
  ${({ $on }) => play($on, 1100, '600ms')}
  & b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const allocation: [string, number, number][] = [
  ['Equity 58%', 58, 1],
  ['Debt 22%', 22, 0.68],
  ['Gold 9%', 9, 0.44],
  ['Cash 11%', 11, 0.24],
];

function PortfolioSheet({ on }: { on: boolean }) {
  const xirr = useCountUp(142, on, 1200);
  return (
    <Sheet
      $on={on}
      aria-label="Illustration: a portfolio sheet. Allocation runs 58% equity, 22% debt, 9% gold and 11% cash. XIRR reads 14.2% after costs, realised gains split into ₹18,400 short-term and ₹1,04,200 long-term, and equity sits 3 percentage points above its 55% target, ₹55,300 to trim."
    >
      <div className="top" aria-hidden>
        <span>Folio · all accounts</span>
        <span>As of 30 Sep</span>
      </div>
      <Alloc aria-hidden>
        <div className="bar">
          {allocation.map(([label, w, o], i) => (
            <Slice key={label} $on={on} $d={200 + i * 140} $w={w} $o={o} />
          ))}
        </div>
        <div className="legend">
          {allocation.map(([label]) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </Alloc>
      <Figures aria-hidden>
        <div>
          <dt>XIRR</dt>
          <dd>
            {(xirr / 10).toFixed(1)}%<small>money-weighted, after costs</small>
          </dd>
        </div>
        <div>
          <dt>Realised gains</dt>
          <dd>
            ₹1,22,600<small>₹18,400 STCG · ₹1,04,200 LTCG</small>
          </dd>
        </div>
      </Figures>
      <Drift $on={on} aria-hidden>
        <span>Equity vs target band</span>
        <b>+3.0 pts · ₹55,300 to trim</b>
      </Drift>
      <figcaption>computed from your own imports</figcaption>
    </Sheet>
  );
}

export function PortfolioSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  return (
    <SectionShell id="portfolio" aria-labelledby="portfolio-title">
      <Container>
        <SectionHeading
          id="portfolio-title"
          eyebrow="Portfolio"
          index="01"
          split
          title="What you own, and what it actually returned"
          lead="Import a CAS or a broker file and Arvo rebuilds the holdings, the cost basis and the cash flows behind them. Returns are money-weighted, net of costs, and every figure opens onto the transactions that produced it."
        />
        <div ref={ref}>
          <Split>
            <Feature
              items={[
                ['CAS and broker imports', 'Consolidated account statements and broker files become holdings, units and cost basis, with the same review-before-commit step Money uses.'],
                ['XIRR that accounts for timing', 'Money-weighted returns across irregular SIPs, lumpsums and withdrawals, alongside absolute return, so a well-timed year cannot flatter the number.'],
                ['Allocation you can see drifting', 'Split by asset class, instrument and account, against the target bands you set, with the rupee amount it would take to come back inside them.'],
                ['Capital gains, computed not guessed', 'Realised and unrealised gains split into short and long term with Indian holding rules, ready for the return you file.'],
              ]}
            />
            <PortfolioSheet on={on} />
          </Split>
          <PortfolioEvidence />
          <EducationalNote>
            Allocation bands and rebalancing amounts are arithmetic on targets you set yourself, not
            a suggestion to buy or sell anything.
          </EducationalNote>
        </div>
      </Container>
    </SectionShell>
  );
}

/* ---------- 02 Journal: a contract note, gross to net ---------- */

const Note = styled.div`
  margin-top: 14px;
  display: grid;
  gap: 7px;
  font-family: ${fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const NoteRow = styled.div<{ $on: boolean; $d: number; $w: number; $head?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: baseline;
  padding-bottom: 5px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  color: ${({ theme, $head }) => ($head ? theme.colors.textPrimary : theme.colors.textSecondary)};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '420ms')}
  & .lbl {
    position: relative;
    padding-bottom: 5px;
  }
  & .lbl::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 4px;
    width: ${({ $w }) => $w}%;
    border-radius: 2px;
    background: ${({ theme }) => theme.colors.brand};
    opacity: ${({ $head }) => ($head ? 0.9 : 0.4)};
    transform-origin: left;
    animation-name: ${growX};
    ${({ $on, $d }) => play($on, $d + 120, '600ms')}
  }
  & .amt {
    font-variant-numeric: tabular-nums;
    color: ${({ theme, $head }) => ($head ? theme.colors.textPrimary : theme.colors.textSecondary)};
  }
`;

const NetLine = styled.div<{ $on: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.textPrimary};
  & span {
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & b {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 26px;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Flags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
`;

const Flag = styled.span<{ $on: boolean; $d: number; $tilt: number }>`
  padding: 3px 9px;
  border: 1px solid ${({ theme }) => theme.colors.brand};
  border-radius: 3px;
  font-family: ${fonts.mono};
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.brandText};
  transform: rotate(${({ $tilt }) => $tilt}deg);
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '400ms')}
`;

/* Gross 12,480 less 747 of charges leaves 11,733 — the bar width tracks what is left. */
const charges: [string, string, number][] = [
  ['Gross P&L', '12,480', 100],
  ['Brokerage', '− 40', 96],
  ['STT', '− 625', 92],
  ['Exchange transaction', '− 41', 89],
  ['SEBI turnover', '− 1', 88],
  ['Stamp duty', '− 18', 87],
  ['GST', '− 22', 86],
];

function ContractNote({ on }: { on: boolean }) {
  return (
    <Sheet
      $on={on}
      aria-label="Illustration: a contract-note style breakdown. A gross profit of ₹12,480 has brokerage ₹40, STT ₹625, exchange transaction ₹41, SEBI turnover ₹1, stamp duty ₹18 and GST ₹22 deducted, leaving ₹11,733 net. Three behaviour flags are stamped beside it."
    >
      <div className="top" aria-hidden>
        <span>Trade · BANKNIFTY intraday</span>
        <span>2 legs</span>
      </div>
      <Note aria-hidden>
        {charges.map(([label, amount, w], i) => (
          <NoteRow key={label} $on={on} $d={200 + i * 110} $w={w} $head={i === 0}>
            <span className="lbl">{label}</span>
            <span className="amt">{amount}</span>
          </NoteRow>
        ))}
      </Note>
      <NetLine $on={on} aria-hidden>
        <span>Net to you</span>
        <b>₹11,733</b>
      </NetLine>
      <Flags aria-hidden>
        {[
          ['Re-entered within 4 min', -1.5],
          ['3× your usual size', 1.2],
          ['Held past your own stop', -0.8],
        ].map(([label, tilt], i) => (
          <Flag key={label as string} $on={on} $d={1000 + i * 160} $tilt={tilt as number}>
            {label}
          </Flag>
        ))}
      </Flags>
      <figcaption>the costs, not a rounded guess</figcaption>
    </Sheet>
  );
}

export function JournalSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  return (
    <SectionShell id="journal" aria-labelledby="journal-title" $muted>
      <Container>
        <SectionHeading
          id="journal-title"
          eyebrow="Trading journal"
          index="02"
          split
          title="Every trade, net of every charge"
          lead="Most trading records stop at the price. Arvo carries the trade all the way to what reached your bank: brokerage, STT, exchange transaction, SEBI turnover, stamp duty and GST, each computed by the Indian rule that applies to that segment."
        />
        <div ref={ref}>
          <Split $flip>
            <Feature
              items={[
                ['The full charges engine', 'Equity delivery, intraday, futures and options each get their own brokerage, STT, transaction, stamp and GST treatment, so gross P&L and net P&L are never the same number by accident.'],
                ['Metrics that survive scrutiny', 'Win rate, average win against average loss, expectancy, R multiples, holding times and maximum drawdown, all recomputed from the journal rather than typed in.'],
                ['Behaviour flags', 'Patterns you would rather not notice — re-entering minutes after a loss, sizing far above your norm, holding past your own exit — get flagged as observations about your record, never as instructions.'],
                ['Tax, segment by segment', 'F&O, intraday and capital-gains treatment separated the way the Act separates them, with an ITR-3 export of the figures and schedules your filing needs.'],
              ]}
            />
            <ContractNote on={on} />
          </Split>
          <JournalEvidence />
          <EducationalNote>
            Charge and tax figures are computed for your own record-keeping. They are not tax advice
            or a filing service — check them with a qualified professional before you file.
          </EducationalNote>
        </div>
      </Container>
    </SectionShell>
  );
}

/* ---------- 03 Strategy lab: payoff sketch + equity curve with drawdown band ---------- */

const Plot = styled.svg<{ $on: boolean }>`
  display: block;
  width: 100%;
  height: auto;
  margin-top: 14px;
  overflow: visible;
  & .axis {
    stroke: ${({ theme }) => theme.colors.border};
    stroke-width: 1;
  }
  & .zero {
    stroke: ${({ theme }) => theme.colors.textMuted};
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  & .pay {
    fill: none;
    stroke: ${({ theme }) => theme.colors.brand};
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    animation-name: ${drawStroke};
    ${({ $on }) => play($on, 240, '1400ms')}
  }
  & .band {
    fill: ${({ theme }) => theme.colors.brandSubtle};
  }
  & .tick {
    font-family: ${fonts.mono};
    font-size: 7px;
    fill: ${({ theme }) => theme.colors.textMuted};
  }
  & .mark {
    font-family: ${fonts.hand};
    font-size: 13px;
    fill: ${({ theme }) => theme.colors.brandText};
  }
`;

const Greeks = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 16px 0 0;
  & dt {
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & dd {
    margin: 2px 0 0;
    font-family: ${fonts.mono};
    font-size: 14px;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

function StrategySheet({ on }: { on: boolean }) {
  return (
    <Sheet
      $on={on}
      aria-label="Illustration: an option payoff sketch for a defined-risk spread, flat at a capped loss below the lower strike, rising between the strikes and flat at a capped gain above the upper one, with break-even marked. Below it, delta 0.32, gamma 0.004, theta minus 18 and vega 9.6, and a backtest equity curve with its worst drawdown shaded."
    >
      <div className="top" aria-hidden>
        <span>Lab · call debit spread</span>
        <span>Hypothetical</span>
      </div>
      <Plot viewBox="0 0 300 130" $on={on} aria-hidden>
        <line className="axis" x1={0} y1={120} x2={300} y2={120} />
        <line className="zero" x1={0} y1={70} x2={300} y2={70} />
        <path className="pay" pathLength={1} d="M4 104 L96 104 L206 34 L296 34" />
        <circle cx={140} cy={70} r={3} className="mark" />
        <text className="mark" x={130} y={62}>
          break-even
        </text>
        <text className="tick" x={4} y={116}>
          max loss capped
        </text>
        <text className="tick" x={232} y={30}>
          max gain capped
        </text>
      </Plot>
      <Greeks aria-hidden>
        <div>
          <dt>Delta</dt>
          <dd>0.32</dd>
        </div>
        <div>
          <dt>Gamma</dt>
          <dd>0.004</dd>
        </div>
        <div>
          <dt>Theta</dt>
          <dd>−18</dd>
        </div>
        <div>
          <dt>Vega</dt>
          <dd>9.6</dd>
        </div>
      </Greeks>
      <Plot viewBox="0 0 300 90" $on={on} aria-hidden>
        <rect className="band" x={118} y={18} width={62} height={60} />
        <line className="axis" x1={0} y1={78} x2={300} y2={78} />
        <path
          className="pay"
          pathLength={1}
          d="M4 70 L44 58 L78 62 L118 34 L150 56 L180 44 L220 28 L258 22 L296 12"
        />
        <text className="tick" x={120} y={14}>
          worst drawdown −11.4%
        </text>
      </Plot>
      <figcaption>a hypothesis, priced with its costs</figcaption>
    </Sheet>
  );
}

export function StrategyLabSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  return (
    <SectionShell id="strategy-lab" aria-labelledby="lab-title">
      <Container>
        <SectionHeading
          id="lab-title"
          eyebrow="Strategy lab"
          index="03"
          split
          title="Work the idea out on paper first"
          lead="Build a position leg by leg and see its shape before any money is involved: what it can make, what it can lose, where it breaks even, and how it decays. Then test the rule on history, or run it on paper."
        />
        <div ref={ref}>
          <Split>
            <Feature
              items={[
                ['Payoff builder', 'Multi-leg option structures drawn as a payoff curve with break-evens, capped gain and capped loss, so the risk is a picture rather than a paragraph.'],
                ['Greeks in plain rows', 'Delta, gamma, theta and vega for the position and each leg, recomputed as you change strikes, quantity or expiry.'],
                ['Backtester with costs in', 'Run a rule over historical data with the same charges engine the journal uses, and read the equity curve, the drawdown band and the trade list behind it.'],
                ['Paper trading and a library', 'Run a strategy live without money, and keep the ones worth revisiting in a library with their assumptions written down.'],
              ]}
            />
            <StrategySheet on={on} />
          </Split>
          <StrategyEvidence />
          <EducationalNote>
            Payoffs, Greeks and backtests are illustrations built on stated assumptions, and past
            results say nothing about future ones. Nothing here is a recommendation to enter a
            position.
          </EducationalNote>
        </div>
      </Container>
    </SectionShell>
  );
}

/* ---------- 04 Markets & alerts: a switchboard rule card ---------- */

const Rule = styled.div`
  margin-top: 14px;
  display: grid;
  gap: 10px;
  font-family: ${fonts.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & .clause {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
  }
  & .kw {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & .val {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Channels = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
`;

const Switch = styled.div<{ $on: boolean; $d: number; $live: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-family: ${fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '420ms')}
  & i {
    position: relative;
    flex: none;
    width: 30px;
    height: 16px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    background: ${({ theme, $live }) => ($live ? theme.colors.brand : theme.colors.bgMuted)};
    transition: background 240ms;
  }
  & i::after {
    content: '';
    position: absolute;
    top: 2px;
    left: ${({ $live }) => ($live ? '16px' : '2px')};
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.bgSurfaceRaised};
    transition: left 240ms cubic-bezier(0.34, 1.4, 0.64, 1);
  }
`;

const Guard = styled.p<{ $on: boolean }>`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 14px 0 0;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.brand};
  border-radius: 3px;
  font-family: ${fonts.mono};
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.brandText};
  animation-name: ${popIn};
  ${({ $on }) => play($on, 1100, '420ms')}
`;

const Dates = styled.ul`
  display: grid;
  gap: 6px;
  margin: 14px 0 0;
  padding: 12px 0 0;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  list-style: none;
  font-family: ${fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  & b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

function AlertCard({ on }: { on: boolean }) {
  return (
    <Sheet
      $on={on}
      aria-label="Illustration: an alert rule card. When NIFTY BANK falls 2 percent in a session, notify by email and push but not SMS, with a thirty-minute cool-off before another alert, above a list of upcoming F&O expiry, corporate action and IPO dates."
    >
      <div className="top" aria-hidden>
        <span>Alert · your rule</span>
        <span>Watchlist: banks</span>
      </div>
      <Rule aria-hidden>
        <div className="clause">
          <span className="kw">WHEN</span>
          <span className="val">NIFTY BANK falls 2% in a session</span>
        </div>
        <div className="clause">
          <span className="kw">AND</span>
          <span className="val">it is a weekday between 09:15 and 15:30</span>
        </div>
        <div className="clause">
          <span className="kw">THEN</span>
          <span className="val">tell me, once</span>
        </div>
      </Rule>
      <Channels aria-hidden>
        {[
          ['Email', true],
          ['Push', true],
          ['SMS', false],
        ].map(([label, live], i) => (
          <Switch key={label as string} $on={on} $d={500 + i * 140} $live={live as boolean}>
            <span>{label}</span>
            <i />
          </Switch>
        ))}
      </Channels>
      <Guard $on={on} aria-hidden>
        <span>Cool-off</span>
        <span>30 min · no repeat pings</span>
      </Guard>
      <Dates aria-hidden>
        <li>
          <span>F&amp;O expiry</span>
          <b>Thu 24 Sep</b>
        </li>
        <li>
          <span>Dividend record date · ITC</span>
          <b>Mon 28 Sep</b>
        </li>
        <li>
          <span>IPO closes</span>
          <b>Wed 30 Sep</b>
        </li>
      </Dates>
      <figcaption>alerts you wrote, not a feed</figcaption>
    </Sheet>
  );
}

export function AlertsSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  return (
    <SectionShell id="alerts" aria-labelledby="alerts-title" $muted>
      <Container>
        <SectionHeading
          id="alerts-title"
          eyebrow="Markets & alerts"
          index="04"
          split
          title="Watchlists and rules you wrote yourself"
          lead="No tips, no signals, no feed designed to keep you scrolling. You describe the condition worth interrupting your day for, pick where the message lands, and Arvo holds itself to it."
        />
        <div ref={ref}>
          <Split $flip>
            <Feature
              items={[
                ['Watchlists and calendars', 'Instruments you actually follow, with F&O expiry, corporate action and IPO dates on one calendar so a date never surprises you.'],
                ['Alert rules in your own words', 'Conditions on price, move, level or date — written by you, evaluated by Arvo, and visible in full so you always know why a message arrived.'],
                ['Channels you choose', 'Email, push or in-app, per rule, so the quiet ones stay quiet and the loud ones reach you.'],
                ['Cool-off guardrails', 'Rate limits and quiet periods that stop a volatile hour turning into a stream of pings and an afternoon of reactive trades.'],
              ]}
            />
            <AlertCard on={on} />
          </Split>
          <AlertsEvidence />
          <EducationalNote>
            Alerts report conditions you defined. They are notifications about your own watchlist,
            not signals, tips or a recommendation to act.
          </EducationalNote>
        </div>
      </Container>
    </SectionShell>
  );
}
