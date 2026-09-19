'use client';

import styled from 'styled-components';
import { OpenAppLink } from '../beta-access';
import { IncomeExpenseBars } from './charts';
import { fadeUp, formatINR, play, useCountUp, useInView } from './motion';
import { Container, fonts } from './primitives';

/*
 * Money's own opening: a month-end summary slip, ruled like a passbook, with the three figures
 * counting up beside the masthead. Hand-drawn, no assets, reduced motion lands on the final state.
 */

const Section = styled.section`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  padding: ${({ theme }) => theme.space[8]}px 0 ${({ theme }) => theme.space[10]}px;
`;

const Grid = styled(Container)`
  display: grid;
  gap: ${({ theme }) => theme.space[8]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: ${({ theme }) => theme.space[12]}px;
    align-items: center;
  }
`;

const Copy = styled.div`
  min-width: 0;
  & .eyebrow {
    margin: 0 0 ${({ theme }) => theme.space[4]}px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .eyebrow b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & h1 {
    margin: 0;
    max-width: 17ch;
    font-family: ${fonts.serif};
    font-weight: 450;
    font-size: clamp(32px, 5vw, 56px);
    line-height: 1.02;
    letter-spacing: -0.035em;
    font-variation-settings: 'opsz' 144, 'SOFT' 30;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & h1 em {
    font-style: italic;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & .hand {
    display: inline-block;
    margin-top: ${({ theme }) => theme.space[4]}px;
    font-family: ${fonts.hand};
    font-size: 25px;
    line-height: 1.1;
    transform: rotate(-1.8deg);
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & p {
    margin: ${({ theme }) => theme.space[5]}px 0 0;
    max-width: 52ch;
    font-size: 17px;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 28px;
    margin-top: ${({ theme }) => theme.space[6]}px;
  }
  & .actions a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.brandText};
    text-decoration: none;
    border-bottom: 1px solid currentColor;
  }
`;

const Slip = styled.figure<{ $on: boolean }>`
  margin: 0;
  min-width: 0;
  padding: ${({ theme }) => theme.space[5]}px;
  border: 1px solid ${({ theme }) => theme.colors.textPrimary};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: 6px 6px 0 ${({ theme }) => theme.colors.brandSubtle};
  animation-name: ${fadeUp};
  ${({ $on }) => play($on, 120, '700ms')}
  & figcaption {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.textPrimary};
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: ${({ theme }) => theme.space[5]}px 0 0;
  }
  & dt {
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & dd {
    margin: 4px 0 0;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: clamp(19px, 2.4vw, 26px);
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .chart {
    margin-top: ${({ theme }) => theme.space[5]}px;
    padding-top: ${({ theme }) => theme.space[4]}px;
    border-top: 1px dashed ${({ theme }) => theme.colors.border};
  }
  & .foot {
    margin: 10px 0 0;
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.05em;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

function SummarySlip({ on }: { on: boolean }) {
  const income = useCountUp(1_51_000, on, 1200);
  const spent = useCountUp(86_200, on, 1300);
  const saved = useCountUp(64_800, on, 1400);
  return (
    <Slip $on={on} aria-label="Illustration: a month-end summary slip for September showing income ₹1,51,000, spending ₹86,200 and ₹64,800 left over, above a six-month income and spending chart.">
      <figcaption aria-hidden>
        <span>Arvo · month in review</span>
        <span>September</span>
      </figcaption>
      <dl aria-hidden>
        <div>
          <dt>In</dt>
          <dd>{formatINR(income)}</dd>
        </div>
        <div>
          <dt>Out</dt>
          <dd>{formatINR(spent)}</dd>
        </div>
        <div>
          <dt>Left</dt>
          <dd>{formatINR(saved)}</dd>
        </div>
      </dl>
      <div className="chart" aria-hidden>
        <IncomeExpenseBars on={on} compact />
      </div>
      <p className="foot" aria-hidden>
        Every figure traces back to a statement line.
      </p>
    </Slip>
  );
}

export function MoneyHero() {
  const [ref, on] = useInView<HTMLElement>(0.2);
  return (
    <Section ref={ref} aria-labelledby="money-title">
      <Grid>
        <Copy>
          <p className="eyebrow">
            <b>Product 01</b> Money
          </p>
          <h1 id="money-title">
            Everyday banking, <em>finally legible</em>
          </h1>
          <span className="hand">statements in, month explained</span>
          <p>
            Money is the half of Arvo that watches the cash moving through your accounts: imports,
            categorisation, insights, budgets, goals and planning. Rules do the work first, AI only
            fills the gaps, and every number can be traced back to the row it came from.
          </p>
          <div className="actions">
            <OpenAppLink>Open Arvo →</OpenAppLink>
            <a href="#how-it-works">See how it works</a>
          </div>
        </Copy>
        <SummarySlip on={on} />
      </Grid>
    </Section>
  );
}
