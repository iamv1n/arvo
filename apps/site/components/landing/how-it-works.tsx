'use client';

import { AuditOutlined, FileExcelOutlined, LineChartOutlined, MessageOutlined, TagsOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { fadeUp, growX, growY, play, popIn, useInView } from './motion';
import { Container, SectionHeading, SectionShell } from './primitives';

const steps: { title: string; body: string; icon: ReactNode }[] = [
  { title: 'Import', body: 'Drop in the statement files your bank gives you, including spreadsheets and PDFs.', icon: <FileExcelOutlined /> },
  { title: 'Review', body: 'Check every row and skip duplicates. Nothing hits the ledger until you commit.', icon: <AuditOutlined /> },
  { title: 'Categorize', body: 'Your rules, known merchants and history fill in categories, with AI as an optional fallback.', icon: <TagsOutlined /> },
  { title: 'Understand', body: 'Cash flow, spending by category, net worth and monthly trends, calculated the same way every time.', icon: <LineChartOutlined /> },
  { title: 'Ask', body: 'Ask questions in plain language and get answers that cite the data they used.', icon: <MessageOutlined /> },
];

const List = styled.ol`
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[8]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(5, 1fr);
    gap: ${({ theme }) => theme.space[6]}px;
  }
`;

/* Connector rail: vertical on mobile, horizontal on desktop. */
const Rail = styled.div<{ $on: boolean }>`
  position: absolute;
  background: linear-gradient(
    ${({ theme }) => theme.colors.brand},
    ${({ theme }) => theme.colors.transfer}
  );
  opacity: 0.5;
  left: 27px;
  top: 28px;
  bottom: 28px;
  width: 2px;
  transform-origin: top;
  animation-name: ${growY};
  ${({ $on }) => play($on, 100, '1600ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    left: 10%;
    right: 10%;
    top: 27px;
    bottom: auto;
    width: auto;
    height: 2px;
    background: linear-gradient(90deg, ${({ theme }) => theme.colors.brand}, ${({ theme }) => theme.colors.transfer});
    transform-origin: left;
    animation-name: ${growX};
  }
`;

const Item = styled.li<{ $on: boolean; $d: number }>`
  position: relative;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: ${({ theme }) => theme.space[4]}px;
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '700ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 1fr;
    text-align: center;
    justify-items: center;
  }
`;

const Node = styled.div<{ $on: boolean; $d: number }>`
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  display: grid;
  place-items: center;
  font-size: 22px;
  color: ${({ theme }) => theme.colors.brand};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.md};
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
  & > span.step {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
    color: ${({ theme }) => theme.colors.bgSurface};
    background: ${({ theme }) => theme.colors.brand};
  }
`;

const StepTitle = styled.h3`
  margin: 0 0 6px;
  font-size: ${({ theme }) => theme.typography.fontSize.lg}px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StepBody = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSize.md}px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function HowItWorks() {
  const [ref, on] = useInView<HTMLOListElement>(0.25);
  return (
    <SectionShell id="how-it-works" aria-labelledby="how-title" $muted>
      <Container>
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="From raw statements to answers you can trust"
          lead="One pipeline, five steps. Each step is visible and reversible, so you always know where a number came from."
        />
        <List ref={ref}>
          <Rail $on={on} aria-hidden />
          {steps.map((step, i) => (
            <Item key={step.title} $on={on} $d={250 + i * 220}>
              <Node $on={on} $d={250 + i * 220} aria-hidden>
                {step.icon}
                <span className="step">{i + 1}</span>
              </Node>
              <div>
                <StepTitle>{step.title}</StepTitle>
                <StepBody>{step.body}</StepBody>
              </div>
            </Item>
          ))}
        </List>
      </Container>
    </SectionShell>
  );
}
