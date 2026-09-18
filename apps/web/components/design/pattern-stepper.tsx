'use client';

import { Button, Card, Flex, Steps, Tabs, Typography } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';
import { AREAS, Eyebrow, MockChart, MockForm, MockNotes, MockResults, MockTable } from './mock';

/*
 * Pattern 5 — progressive disclosure.
 *
 * Configure → Run → Read → Drill down. Only the current step is open; the steps behind it
 * collapse into one-line summary bars you can click to reopen. Very calm, and it teaches the
 * order of the work — but it hides everything else, which fights the analyst who wants the form
 * and the numbers side by side.
 */

const STEPS = [
  { key: 'configure', title: 'Configure', summary: 'Momentum 20/50 · NIFTY 50 · ₹5,00,000 · 1.5% risk' },
  { key: 'run', title: 'Run', summary: '24 months replayed · 12 fills · finished in 1.4s' },
  { key: 'read', title: 'Read', summary: '+18.4% net · -11.2% drawdown · Sharpe 1.08' },
  { key: 'drill', title: 'Drill down', summary: '12 trades · 3 caveats recorded' },
];

const SummaryBar = styled.button`
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.colors.brand};
  }

  .title {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
    flex: none;
  }

  .summary {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

function StepBody({ step }: { step: string }) {
  if (step === 'configure') return <MockForm />;
  if (step === 'run') {
    return (
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">Replaying 24 months of daily bars against the rule. Nothing is sent to a market.</Typography.Text>
        <MockChart height={220} />
      </Flex>
    );
  }
  if (step === 'read') {
    return (
      <Flex vertical gap={16}>
        <MockResults />
        <MockChart height={240} />
      </Flex>
    );
  }
  return (
    <Flex vertical gap={16}>
      <MockTable compact />
      <MockNotes />
    </Flex>
  );
}

export function PatternStepper() {
  const [current, setCurrent] = useState(0);

  return (
    <Tabs
      items={AREAS[0].tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        children: (
          <Flex vertical gap={16}>
            <Steps
              responsive
              size="small"
              current={current}
              onChange={setCurrent}
              items={STEPS.map((s) => ({ title: s.title }))}
            />
            {STEPS.map((step, i) =>
              i === current ? (
                <Card key={step.key} title={<Eyebrow>{step.title}</Eyebrow>}>
                  <StepBody step={step.key} />
                  {current < STEPS.length - 1 && (
                    <Flex justify="flex-end" style={{ marginTop: 16 }}>
                      <Button type="primary" onClick={() => setCurrent(current + 1)}>
                        Continue to {STEPS[current + 1].title}
                      </Button>
                    </Flex>
                  )}
                </Card>
              ) : (
                <SummaryBar key={step.key} onClick={() => setCurrent(i)}>
                  <span className="title">{step.title}</span>
                  <span className="summary">{step.summary}</span>
                </SummaryBar>
              ),
            )}
          </Flex>
        ),
      }))}
    />
  );
}
