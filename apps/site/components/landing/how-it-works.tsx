'use client';

import styled, { css } from 'styled-components';
import { fadeIn, fadeUp, growX, growY, play, popIn, useInView } from './motion';
import { Container, fonts, SectionHeading, SectionShell } from './primitives';

/*
 * Five panels, each a tiny picture of what happens to your data at that step. A caption of two or
 * three words replaces paragraphs; the pictures do the explaining.
 */

const Strip = styled.ol`
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[4]}px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0;
    border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Progress = styled.span<{ $on: boolean }>`
  display: none;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    display: block;
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: ${({ theme }) => theme.colors.brand};
    transform-origin: left;
    animation-name: ${growX};
    ${({ $on }) => play($on, 150, '2400ms')}
  }
`;

const Step = styled.li<{ $on: boolean; $d: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[5]}px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    border-top: none;
    padding: ${({ theme }) => theme.space[6]}px ${({ theme }) => theme.space[4]}px;
    border-left: 1px solid ${({ theme }) => theme.colors.border};
    &:first-child {
      padding-left: 0;
      border-left: none;
    }
  }
`;

const Caption = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  b {
    font-family: ${fonts.mono};
    font-size: 12px;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.brandText};
  }
  h3 {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 22px;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Stage = styled.div`
  height: 168px;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  overflow: hidden;
  font-family: ${fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const appear = (on: boolean, delay: number, kind = fadeUp, duration = '500ms') => css`
  animation-name: ${kind};
  ${play(on, delay, duration)}
`;

/* ---------- 01 Import: files drop into a row counter ---------- */

const Files = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
`;
const File = styled.span<{ $on: boolean; $d: number; $c: string }>`
  position: relative;
  width: 44px;
  height: 56px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 3px 12px 3px 3px;
  background: ${({ theme }) => theme.colors.bgSurface};
  display: grid;
  place-items: end center;
  padding-bottom: 6px;
  font-weight: 600;
  color: ${({ $c }) => $c};
  ${({ $on, $d }) => appear($on, $d)}
`;
const Counter = styled.div<{ $on: boolean; $d: number }>`
  margin-top: 16px;
  text-align: center;
  ${({ $on, $d }) => appear($on, $d, fadeIn)}
  strong {
    display: block;
    font-family: ${fonts.serif};
    font-size: 24px;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

function ImportArt({ on, d }: { on: boolean; d: number }) {
  return (
    <>
      <Files>
        <File $on={on} $d={d + 100} $c="#1f9d55">CSV</File>
        <File $on={on} $d={d + 250} $c="#2f7de1">XLSX</File>
        <File $on={on} $d={d + 400} $c="#d64545">PDF</File>
      </Files>
      <Counter $on={on} $d={d + 650}>
        <strong>1,284</strong>rows read
      </Counter>
    </>
  );
}

/* ---------- 02 Review: a duplicate gets struck out ---------- */

const Rows = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
`;
const Row = styled.li<{ $on: boolean; $d: number; $dup?: boolean }>`
  position: relative;
  display: flex;
  justify-content: space-between;
  padding: 5px 8px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.bgSurface};
  ${({ $on, $d }) => appear($on, $d)}
  ${({ $dup, $on, $d, theme }) =>
    $dup &&
    css`
      color: ${theme.colors.textMuted};
      &::after {
        content: '';
        position: absolute;
        left: 6px;
        right: 6px;
        top: 50%;
        height: 1.5px;
        background: ${theme.colors.expense};
        transform-origin: left;
        animation-name: ${growX};
        ${play($on, $d + 500, '400ms')}
      }
    `}
  em {
    font-style: normal;
    color: ${({ theme }) => theme.colors.income};
  }
`;

function ReviewArt({ on, d }: { on: boolean; d: number }) {
  return (
    <Rows>
      <Row $on={on} $d={d + 100}>
        <span>SWIGGY 4411</span>
        <em>✓</em>
      </Row>
      <Row $on={on} $d={d + 200} $dup>
        <span>SWIGGY 4411</span>
        <span>dup</span>
      </Row>
      <Row $on={on} $d={d + 300}>
        <span>HP PETROL</span>
        <em>✓</em>
      </Row>
      <Row $on={on} $d={d + 400}>
        <span>SALARY SEP</span>
        <em>✓</em>
      </Row>
      <Row $on={on} $d={d + 500}>
        <span>NETFLIX</span>
        <em>✓</em>
      </Row>
    </Rows>
  );
}

/* ---------- 03 Categorize: tags pop onto rows ---------- */

const Tagged = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 0;
  border-bottom: 1px dashed ${({ theme }) => theme.colors.border};
`;
const Tag = styled.span<{ $on: boolean; $d: number; $c: string }>`
  padding: 1px 7px;
  border-radius: 3px;
  color: #fff;
  background: ${({ $c }) => $c};
  transform-origin: right;
  ${({ $on, $d }) => appear($on, $d, popIn, '350ms')}
`;

function CategorizeArt({ on, d }: { on: boolean; d: number }) {
  const items: [string, string, string][] = [
    ['ZOMATO', 'Food', '#e8793a'],
    ['HP PETROL', 'Fuel', '#2f7de1'],
    ['HDFC EMI', 'Loan', '#7b5bd6'],
    ['NETFLIX', 'Subs', '#d64545'],
    ['BIGBASKET', 'Grocery', '#1f9d55'],
  ];
  return (
    <Rows>
      {items.map(([name, tag, color], i) => (
        <Tagged key={name}>
          <span>{name}</span>
          <Tag $on={on} $d={d + 150 + i * 150} $c={color}>
            {tag}
          </Tag>
        </Tagged>
      ))}
    </Rows>
  );
}

/* ---------- 04 Understand: bars grow ---------- */

const Bars = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 118px;
  padding-bottom: 4px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;
const Bar = styled.span<{ $on: boolean; $d: number; $h: number; $hot?: boolean }>`
  flex: 1;
  height: ${({ $h }) => $h}%;
  border-radius: 3px 3px 0 0;
  background: ${({ theme, $hot }) => ($hot ? theme.colors.brand : theme.colors.textPrimary)};
  opacity: ${({ $hot }) => ($hot ? 1 : 0.2)};
  transform-origin: bottom;
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '700ms')}
`;
const Axis = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
`;

function UnderstandArt({ on, d }: { on: boolean; d: number }) {
  const heights = [52, 64, 48, 70, 58, 92];
  return (
    <>
      <Bars aria-hidden>
        {heights.map((h, i) => (
          <Bar key={i} $on={on} $d={d + 100 + i * 90} $h={h} $hot={i === heights.length - 1} />
        ))}
      </Bars>
      <Axis>
        <span>Apr</span>
        <span>Sep ↑ 32%</span>
      </Axis>
    </>
  );
}

/* ---------- 05 Ask: a question and a sourced answer ---------- */

const Bubble = styled.div<{ $on: boolean; $d: number; $me?: boolean }>`
  width: fit-content;
  max-width: 92%;
  margin: ${({ $me }) => ($me ? '0 0 10px auto' : '0')};
  padding: 7px 10px;
  border-radius: ${({ $me }) => ($me ? '10px 10px 2px 10px' : '10px 10px 10px 2px')};
  background: ${({ theme, $me }) => ($me ? theme.colors.textPrimary : theme.colors.bgSurface)};
  color: ${({ theme, $me }) => ($me ? theme.colors.bgSurface : theme.colors.textPrimary)};
  font-family: ${({ $me }) => ($me ? 'inherit' : fonts.serif)};
  font-size: ${({ $me }) => ($me ? '11px' : '15px')};
  ${({ $on, $d }) => appear($on, $d)}
  small {
    display: block;
    margin-top: 3px;
    font-family: ${fonts.mono};
    font-size: 10px;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

function AskArt({ on, d }: { on: boolean; d: number }) {
  return (
    <>
      <Bubble $on={on} $d={d + 100} $me>
        fuel vs last month?
      </Bubble>
      <Bubble $on={on} $d={d + 600}>
        ₹4,850 · up ₹620
        <small>from 7 transactions ↗</small>
      </Bubble>
    </>
  );
}

/* ---------- section ---------- */

const steps = [
  { title: 'Import', hint: 'Bank files, as they are', Art: ImportArt },
  { title: 'Review', hint: 'Duplicates caught', Art: ReviewArt },
  { title: 'Categorize', hint: 'Rules first, AI last', Art: CategorizeArt },
  { title: 'Understand', hint: 'Exact, every time', Art: UnderstandArt },
  { title: 'Ask', hint: 'Answers show their data', Art: AskArt },
];

export function HowItWorks() {
  const [ref, on] = useInView<HTMLOListElement>(0.2);
  return (
    <SectionShell id="how-it-works" aria-labelledby="how-title">
      <Container>
        <SectionHeading id="how-title" eyebrow="How it works" index="01" title="Statement in, answers out" />
        <Strip ref={ref}>
          <Progress $on={on} aria-hidden />
          {steps.map(({ title, hint, Art }, i) => {
            const d = 150 + i * 400;
            return (
              <Step key={title} $on={on} $d={d}>
                <Caption>
                  <b>{String(i + 1).padStart(2, '0')}</b>
                  <h3>{title}</h3>
                </Caption>
                <Stage aria-hidden>
                  <Art on={on} d={d} />
                </Stage>
                <Hint>{hint}</Hint>
              </Step>
            );
          })}
        </Strip>
      </Container>
    </SectionShell>
  );
}
