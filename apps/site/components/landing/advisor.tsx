'use client';

import { CalculatorOutlined, CheckCircleFilled, CheckOutlined, DatabaseOutlined, RobotOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { OPPORTUNITIES, OPPORTUNITY_TOTAL } from '../../lib/finance-examples';
import { fadeUp, formatINR, growX, play, popIn, pulse, useInView } from './motion';
import { Body, Container, Pill, Reveal, SectionHeading, SectionShell } from './primitives';

const Grid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[10]}px;
  align-items: center;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 0.9fr 1.1fr;
    gap: ${({ theme }) => theme.space[16]}px;
  }
`;

const Points = styled.ul`
  list-style: none;
  margin: ${({ theme }) => theme.space[5]}px 0 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  & li {
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 12px;
    align-items: start;
  }
  & p {
    font-size: 14px;
    line-height: 1.55;
  }
  & .icon {
    width: 36px;
    height: 36px;
    border-radius: ${({ theme }) => theme.radii.md}px;
    display: grid;
    place-items: center;
    color: ${({ theme }) => theme.colors.brandText};
    background: ${({ theme }) => theme.colors.brandSubtle};
    font-size: 16px;
  }
  & strong {
    display: block;
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: 15px;
    margin-bottom: 2px;
  }
`;

const Chat = styled.div`
  border-radius: ${({ theme }) => theme.radii.xl}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: ${({ theme }) => theme.shadows.md};
  overflow: hidden;
  min-width: 0;
`;

const ChatBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.bgMuted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.brand};
    animation: ${pulse} 1.8s ease-in-out infinite;
  }
  & > :last-child {
    margin-left: auto;
  }
`;

const ChatBody = styled.div`
  padding: ${({ theme }) => theme.space[5]}px;
  display: grid;
  gap: 14px;
  font-size: 14px;
  line-height: 1.55;
  @media (max-width: 420px) {
    padding: ${({ theme }) => theme.space[3]}px;
  }
`;

const step = css<{ $on: boolean; $d: number }>`
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '550ms')}
`;

const UserMsg = styled.div<{ $on: boolean; $d: number }>`
  ${step}
  justify-self: end;
  max-width: 90%;
  padding: 10px 14px;
  border-radius: 14px 14px 4px 14px;
  background: ${({ theme }) => theme.colors.brand};
  color: ${({ theme }) => theme.colors.onBrand};
`;

const Reply = styled.div<{ $on: boolean; $d: number }>`
  ${step}
  padding: 12px 14px;
  border-radius: 14px 14px 14px 4px;
  background: ${({ theme }) => theme.colors.bgMuted};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 0;
`;

const Opps = styled.ol`
  list-style: none;
  margin: 10px 0;
  padding: 0;
  display: grid;
  gap: 8px;
`;

const Opp = styled.li<{ $on: boolean; $d: number }>`
  ${step}
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  & b {
    font-weight: 600;
  }
  & .amt {
    color: ${({ theme }) => theme.colors.income};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  & .detail {
    grid-column: 1 / -1;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Meter = styled.span<{ $on: boolean; $d: number; $pct: number }>`
  grid-column: 1 / -1;
  display: block;
  height: 4px;
  margin-top: 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.bgMuted};
  position: relative;
  overflow: hidden;
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    width: ${({ $pct }) => $pct}%;
    background: ${({ theme }) => theme.colors.income};
    transform-origin: left;
    animation-name: ${growX};
    ${({ $on, $d }) => play($on, $d, '900ms')}
  }
`;

const Provenance = styled.p`
  margin: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const Suggestion = styled.div<{ $on: boolean; $d: number }>`
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
  border-radius: ${({ theme }) => theme.radii.lg}px;
  border: 1px dashed ${({ theme }) => theme.colors.warning};
  background: ${({ theme }) => theme.colors.bgSurface};
  padding: 12px 14px;
  display: grid;
  gap: 10px;
  & .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  & .title {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
`;

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li>
      <span className="icon" aria-hidden>
        {icon}
      </span>
      <div>
        <strong>{title}</strong>
        <Body>{children}</Body>
      </div>
    </li>
  );
}

function AdvisorChat() {
  const [ref, on] = useInView<HTMLDivElement>(0.3);
  const [decision, setDecision] = useState<'pending' | 'approved' | 'dismissed'>('pending');
  const maxSaving = Math.max(...OPPORTUNITIES.map((o) => o.saving));
  const food = OPPORTUNITIES[0];
  return (
    <Chat ref={ref} role="figure" aria-label="Illustration: the advisor answering a question about spending less">
      <ChatBar>
        <i aria-hidden />
        <span>Arvo advisor · preview</span>
        <Pill $tone="warning">Coming soon</Pill>
      </ChatBar>
      <ChatBody>
        <UserMsg $on={on} $d={150}>
          How can I spend {formatINR(5_000)} less per month?
        </UserMsg>
        <Reply $on={on} $d={700}>
          I found three opportunities worth about <b>{formatINR(OPPORTUNITY_TOTAL)}/month</b>:
          <Opps>
            {OPPORTUNITIES.map((o, i) => (
              <Opp key={o.label} $on={on} $d={1100 + i * 250}>
                <b>{o.label}</b>
                <span className="amt">−{formatINR(o.saving)}/mo</span>
                <span className="detail">{o.detail}</span>
                <Meter $on={on} $d={1300 + i * 250} $pct={(o.saving / maxSaving) * 100} aria-hidden />
              </Opp>
            ))}
          </Opps>
          <Provenance>
            <DatabaseOutlined aria-hidden /> Data used: 127 transactions, Aug 1–31 · compared with May–Jul
          </Provenance>
        </Reply>
        <Suggestion $on={on} $d={2200} aria-live="polite">
          <div className="row">
            <span className="title">
              Suggested budget: {food?.label} {formatINR(food?.target ?? 0)}/month
            </span>
            <Pill $tone={decision === 'approved' ? 'income' : decision === 'dismissed' ? 'muted' : 'warning'}>
              {decision === 'approved' ? 'Approved (demo)' : decision === 'dismissed' ? 'Dismissed' : 'Pending your approval'}
            </Pill>
          </div>
          <Body style={{ fontSize: 13 }}>Nothing is saved until you approve it.</Body>
          {decision === 'pending' ? (
            <div className="actions">
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => setDecision('approved')}>
                Approve
              </Button>
              <Button size="small" onClick={() => setDecision('dismissed')}>
                Dismiss
              </Button>
            </div>
          ) : (
            <div className="actions">
              <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => setDecision('pending')}>
                Reset demo
              </Button>
            </div>
          )}
        </Suggestion>
      </ChatBody>
    </Chat>
  );
}

export function AdvisorSection() {
  return (
    <SectionShell id="advisor" aria-labelledby="advisor-title">
      <Container>
        <Grid>
          <div>
            <SectionHeading
              id="advisor-title"
              compact
              eyebrow="On the roadmap"
              title="Your personal finance manager"
              lead="A planned advisor that finds savings and helps you plan. Arvo calculates the numbers; the AI only explains them."
            />
            <Reveal>
              <Pill $tone="warning">Coming soon · not available yet</Pill>
              <Points>
                <Point icon={<CalculatorOutlined />} title="Numbers you can check">
                  Savings, subscriptions, budget pacing and goals, calculated from your transactions with fixed rules.
                </Point>
                <Point icon={<RobotOutlined />} title="AI explains, never calculates">
                  It explains the results and drafts plans, and shows the data it used.
                </Point>
                <Point icon={<SafetyCertificateOutlined />} title="You approve first">
                  Drafted budgets, goals and rules are saved only when you approve. It never moves money.
                </Point>
                <Point icon={<CheckCircleFilled />} title="Weekly briefing">
                  What changed, what is pacing over, and what needs a decision.
                </Point>
              </Points>
              <Body style={{ marginTop: 20, fontSize: 13 }}>
                Information and tools, not financial advice. <a href="/disclaimer">Read the disclaimer</a>.
              </Body>
            </Reveal>
          </div>
          <Reveal delay={150}>
            <AdvisorChat />
          </Reveal>
        </Grid>
      </Container>
    </SectionShell>
  );
}
