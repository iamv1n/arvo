'use client';

import styled from 'styled-components';
import { fadeUp, growX, play, useInView } from './motion';
import { Container, fonts, SectionHeading, SectionShell } from './primitives';

const steps: { title: string; body: string }[] = [
  { title: 'Import', body: 'Drop in the statement files your bank gives you, including spreadsheets and PDFs.' },
  { title: 'Review', body: 'Check every row and skip duplicates. Nothing is saved until you say so.' },
  { title: 'Categorize', body: 'Your rules, known merchants and history fill in categories, with AI as an optional last step.' },
  { title: 'Understand', body: 'Cash flow, spending by category, net worth and trends, calculated the same way every time.' },
  { title: 'Ask', body: 'Ask questions in plain language and get answers that show the data they used.' },
];

/* Numbered ledger of steps: a heavy rule on top, hairline columns, big serif numerals. */
const List = styled.ol`
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
`;

const Progress = styled.span<{ $on: boolean }>`
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: ${({ theme }) => theme.colors.brand};
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on }) => play($on, 150, '1800ms')}
`;

const Item = styled.li<{ $on: boolean; $d: number }>`
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 4px 16px;
  padding: ${({ theme }) => theme.space[6]}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '700ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: 1fr;
    padding: ${({ theme }) => theme.space[6]}px ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[8]}px 0;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    border-bottom: none;
    padding-left: ${({ theme }) => theme.space[5]}px;
    border-left: 1px solid ${({ theme }) => theme.colors.border};
    &:first-child {
      padding-left: 0;
      border-left: none;
    }
  }
`;

const Numeral = styled.span`
  font-family: ${fonts.serif};
  font-weight: 400;
  font-size: 56px;
  line-height: 0.9;
  letter-spacing: -0.04em;
  font-variation-settings: 'opsz' 144;
  color: ${({ theme }) => theme.colors.textMuted};
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    margin-bottom: ${({ theme }) => theme.space[5]}px;
  }
`;

const StepTitle = styled.h3`
  margin: 0 0 6px;
  font-family: ${fonts.serif};
  font-weight: 500;
  font-size: 24px;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StepBody = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function HowItWorks() {
  const [ref, on] = useInView<HTMLOListElement>(0.25);
  return (
    <SectionShell id="how-it-works" aria-labelledby="how-title">
      <Container>
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          index="01"
          title="From raw statements to answers you can trust"
          lead="One pipeline, five steps. Each is visible and reversible, so you always know where a number came from."
        />
        <List ref={ref}>
          <Progress $on={on} aria-hidden />
          {steps.map((step, i) => (
            <Item key={step.title} $on={on} $d={200 + i * 180}>
              <Numeral aria-hidden>{String(i + 1).padStart(2, '0')}</Numeral>
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
