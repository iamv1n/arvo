'use client';

import { ArrowRightOutlined, CloudServerOutlined, DisconnectOutlined, LockOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import styled, { useTheme } from 'styled-components';
import { CategoryDonut, IncomeExpenseBars, categories } from './charts';
import { fadeUp, float, formatINR, play, pulse, useCountUp, useInView } from './motion';
import { OpenAppButton } from '../beta-access';
import { Container } from './primitives';

const HeroSection = styled.section`
  position: relative;
  overflow: hidden;
  padding: ${({ theme }) => theme.space[12]}px 0 ${({ theme }) => theme.space[16]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding: 88px 0 112px;
  }
`;

const Glow = styled.div`
  position: absolute;
  inset: -20% -10% auto auto;
  width: 720px;
  height: 720px;
  border-radius: 50%;
  background: radial-gradient(closest-side, ${({ theme }) => theme.colors.brandSubtle}, transparent);
  opacity: ${({ theme }) => (theme.mode === 'dark' ? 0.9 : 1)};
  pointer-events: none;
`;

const Grid = styled.div`
  position: relative;
  display: grid;
  gap: ${({ theme }) => theme.space[12]}px;
  align-items: center;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 1.05fr 1fr;
    gap: ${({ theme }) => theme.space[16]}px;
  }
`;

const Anim = styled.div<{ $d: number }>`
  animation-name: ${fadeUp};
  ${({ $d }) => play(true, $d, '800ms')}
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 6px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurface};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  & > b {
    padding: 1px 8px;
    border-radius: ${({ theme }) => theme.radii.pill}px;
    background: ${({ theme }) => theme.colors.brandSubtle};
    color: ${({ theme }) => theme.colors.brand};
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
`;

const H1 = styled.h1`
  margin: ${({ theme }) => theme.space[6]}px 0 0;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: clamp(36px, 6vw, 60px);
  line-height: 1.05;
  letter-spacing: -0.035em;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  & > em {
    font-style: normal;
    color: ${({ theme }) => theme.colors.brand};
  }
`;

const Sub = styled.p`
  margin: ${({ theme }) => theme.space[6]}px 0 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 18px;
  line-height: 1.6;
  max-width: 560px;
`;

const Ctas = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]}px;
  margin-top: ${({ theme }) => theme.space[8]}px;
`;

const Facts = styled.ul`
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[6]}px;
  margin: ${({ theme }) => theme.space[8]}px 0 0;
  padding: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  & li {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  & .anticon {
    color: ${({ theme }) => theme.colors.brand};
  }
`;

/* ---------- Mini dashboard ---------- */

const Stage = styled.div`
  position: relative;
  min-width: 0;
`;

const Window = styled.div`
  position: relative;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xl}px;
  box-shadow:
    ${({ theme }) => theme.shadows.md},
    0 30px 80px -30px ${({ theme }) => (theme.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(18,138,117,0.25)')};
  overflow: hidden;
`;

const Chrome = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  background: ${({ theme }) => theme.colors.bgMuted};
  & > i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.border};
  }
  & > span {
    margin-left: 10px;
    font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
    color: ${({ theme }) => theme.colors.textMuted};
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  }
`;

const Pane = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => theme.space[5]}px;
  grid-template-columns: 1fr;
  @media (min-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-template-columns: 1.4fr 1fr;
  }
`;

const Tile = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-radius: ${({ theme }) => theme.radii.lg}px;
  padding: ${({ theme }) => theme.space[4]}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  min-width: 0;
`;

const TileLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
`;

const Big = styled.div`
  margin-top: 4px;
  font-size: clamp(26px, 3.4vw, 34px);
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Delta = styled.span`
  color: ${({ theme }) => theme.colors.income};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const Span2 = styled(Tile)`
  @media (min-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-column: 1 / -1;
  }
`;

const Legend = styled.ul`
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  & i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex: none;
  }
  & b {
    margin-left: auto;
    font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const TxRow = styled.div<{ $d: number }>`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  padding: 8px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  animation-name: ${fadeUp};
  ${({ $d }) => play(true, $d, '600ms')}
  &:first-of-type {
    border-top: 0;
  }
  & small {
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
  }
`;

const Amt = styled.span<{ $kind: 'income' | 'expense' | 'transfer' }>`
  font-variant-numeric: tabular-nums;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme, $kind }) => theme.colors[$kind]};
  text-align: right;
`;

const Floating = styled.div`
  position: absolute;
  right: -12px;
  bottom: -22px;
  display: none;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  animation: ${float} 5s ease-in-out infinite;
  & i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.income};
    animation: ${pulse} 1.8s ease-in-out infinite;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    display: inline-flex;
  }
`;

function HeroDashboard() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  const netWorth = useCountUp(1452380, on, 1600);
  return (
    <Stage ref={ref}>
      <Window role="img" aria-label="Preview of the Arvo dashboard: net worth ₹14,52,380, income versus expense bars for six months, and a spending-by-category donut">
        <Chrome aria-hidden>
          <i />
          <i />
          <i />
          <span>arvo · dashboard</span>
        </Chrome>
        <Pane aria-hidden>
          <Tile>
            <TileLabel>
              <span>Net worth</span>
              <Delta>▲ 6.2%</Delta>
            </TileLabel>
            <Big>{formatINR(netWorth)}</Big>
            <TileLabel style={{ marginTop: 4 }}>
              <span>Assets − liabilities · 5 accounts</span>
            </TileLabel>
            <div style={{ marginTop: 12 }}>
              <IncomeExpenseBars on={on} compact />
            </div>
          </Tile>
          <Tile>
            <TileLabel>
              <span>September spending</span>
            </TileLabel>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
              <CategoryDonut on={on} size={112} />
            </div>
            <Legend>
              {categories.slice(0, 3).map((c) => (
                <li key={c.name}>
                  <i style={{ background: theme.colors[c.key] }} />
                  {c.name}
                  <b>{c.pct}%</b>
                </li>
              ))}
            </Legend>
          </Tile>
          <Span2>
            <TileLabel>
              <span>Recent activity</span>
              <span>Imported · reviewed</span>
            </TileLabel>
            <div style={{ marginTop: 6 }}>
              <TxRow $d={900}>
                <span>Salary — Acme Pvt Ltd</span>
                <Amt $kind="income">+₹1,45,000</Amt>
                <small>HDFC Savings · Income</small>
              </TxRow>
              <TxRow $d={1050}>
                <span>Swiggy</span>
                <Amt $kind="expense">−₹486</Amt>
                <small>ICICI Credit Card · Food &amp; dining</small>
              </TxRow>
              <TxRow $d={1200}>
                <span>Credit card bill payment</span>
                <Amt $kind="transfer">₹32,400</Amt>
                <small>HDFC Savings → ICICI Credit Card · Transfer</small>
              </TxRow>
            </div>
          </Span2>
        </Pane>
      </Window>
      <Floating aria-hidden>
        <i />
        Running on your machine
      </Floating>
    </Stage>
  );
}

export function Hero() {
  return (
    <HeroSection aria-labelledby="hero-title">
      <Glow aria-hidden />
      <Container>
        <Grid>
          <div>
            <Anim $d={0}>
              <Badge>
                <b>Open source</b> Private · runs on your machine
              </Badge>
            </Anim>
            <Anim $d={80}>
              <H1 id="hero-title">
                Your money, understood. <em>On your own machine.</em>
              </H1>
            </Anim>
            <Anim $d={160}>
              <Sub>
                Arvo is a personal finance OS you run yourself. Import bank and card statements, let rules categorize them,
                and see cash flow, spending and net worth clearly — then ask an AI that only explains numbers Arvo actually
                computed.
              </Sub>
            </Anim>
            <Anim $d={240}>
              <Ctas>
                <OpenAppButton type="primary" size="large" icon={<ArrowRightOutlined />} iconPlacement="end" />
                <Button size="large" href="#how-it-works">
                  See how it works
                </Button>
              </Ctas>
            </Anim>
            <Anim $d={320}>
              <Facts>
                <li>
                  <LockOutlined /> Your data stays with you
                </li>
                <li>
                  <CloudServerOutlined /> Runs on your own computer
                </li>
                <li>
                  <DisconnectOutlined /> No bank APIs required
                </li>
              </Facts>
            </Anim>
          </div>
          <HeroDashboard />
        </Grid>
      </Container>
    </HeroSection>
  );
}
