'use client';

import { useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { OPPORTUNITIES, OPPORTUNITY_TOTAL } from '../../lib/finance-examples';
import { fadeIn, fadeUp, formatINR, growX, play, useInView } from './motion';
import { Container, fonts, SectionHeading, SectionShell } from './primitives';

/*
 * The advisor as a printed weekly briefing: a receipt that feeds out of a slot, line items with
 * dotted leaders, and a rubber stamp you press to approve. The four principles are handwritten
 * notes in the margin instead of an icon grid.
 */

const Stage = styled.div`
  position: relative;
  display: grid;
  gap: ${({ theme }) => theme.space[8]}px;
  justify-items: center;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 1fr 440px 1fr;
    align-items: center;
    gap: ${({ theme }) => theme.space[6]}px;
  }
`;

const Margin = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  width: 100%;
  max-width: 440px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    gap: 72px;
    &:first-child {
      text-align: right;
    }
  }
`;

const Note = styled.li<{ $on: boolean; $d: number; $tilt: number; $side: 'left' | 'right' }>`
  position: relative;
  font-family: ${fonts.hand};
  font-size: 24px;
  line-height: 1.15;
  color: ${({ theme }) => theme.colors.textPrimary};
  transform: rotate(${({ $tilt }) => $tilt}deg);
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '700ms')}
  small {
    display: block;
    margin-top: 4px;
    font-family: ${fonts.mono};
    font-size: 11px;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.textMuted};
    transform: rotate(${({ $tilt }) => -$tilt}deg);
  }
  u {
    text-decoration: none;
    background: linear-gradient(transparent 62%, ${({ theme }) => theme.colors.brandSubtle} 62%);
  }
  /* A drawn arrow pointing at the receipt on wide screens. */
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    &::after {
      content: '';
      position: absolute;
      top: 14px;
      ${({ $side }) => ($side === 'left' ? 'right: -44px;' : 'left: -44px;')}
      width: 34px;
      border-top: 1.5px dashed ${({ theme }) => theme.colors.textMuted};
    }
  }
`;

/* ---------- the receipt ---------- */

const feed = keyframes`
  from { clip-path: inset(0 0 100% 0); transform: translateY(-24px); }
  to { clip-path: inset(0 0 -40px 0); transform: none; }
`;

const Slot = styled.div`
  position: relative;
  width: 100%;
  max-width: 440px;
  padding-top: 14px;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -12px;
    right: -12px;
    height: 14px;
    border-radius: 7px;
    background: ${({ theme }) => theme.colors.textPrimary};
    z-index: 2;
  }
`;

const zigzag = (color: string) =>
  `linear-gradient(135deg, ${color} 6px, transparent 0) 0 0 / 12px 12px repeat-x, linear-gradient(225deg, ${color} 6px, transparent 0) 0 0 / 12px 12px repeat-x`;

const Paper = styled.article<{ $on: boolean }>`
  position: relative;
  padding: 26px 26px 34px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${fonts.mono};
  font-size: 13px;
  box-shadow: 0 18px 40px rgba(16, 24, 40, 0.12);
  animation-name: ${feed};
  ${({ $on }) => play($on, 100, '1400ms')}
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -12px;
    height: 12px;
    background: ${({ theme }) => zigzag(theme.colors.bgSurfaceRaised)};
    transform: rotate(180deg);
  }
  @media (max-width: 420px) {
    padding: 22px 16px 30px;
  }
`;

const Masthead = styled.header`
  text-align: center;
  padding-bottom: 14px;
  border-bottom: 1.5px dashed ${({ theme }) => theme.colors.border};
  h3 {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 24px;
    letter-spacing: -0.02em;
  }
  p {
    margin: 4px 0 0;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Asked = styled.p`
  margin: 14px 0 6px;
  font-family: ${fonts.serif};
  font-style: italic;
  font-size: 17px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &::before {
    content: '“';
  }
  &::after {
    content: '”';
  }
`;

const Items = styled.ol`
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
`;

const Item = styled.li<{ $on: boolean; $d: number }>`
  padding: 9px 0;
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '450ms')}
  .line {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .line span:first-child {
    font-weight: 600;
    white-space: nowrap;
  }
  .dots {
    flex: 1;
    min-width: 12px;
    border-bottom: 1.5px dotted ${({ theme }) => theme.colors.textMuted};
    transform: translateY(-3px);
  }
  .amt {
    color: ${({ theme }) => theme.colors.income};
    white-space: nowrap;
  }
  .why {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Total = styled.div<{ $on: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 3px double ${({ theme }) => theme.colors.textPrimary};
  animation-name: ${fadeIn};
  ${({ $on }) => play($on, 1900, '500ms')}
  span {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  b {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 28px;
    letter-spacing: -0.03em;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Bar = styled.span<{ $on: boolean; $d: number; $pct: number }>`
  display: block;
  height: 3px;
  margin-top: 6px;
  width: ${({ $pct }) => $pct}%;
  background: ${({ theme }) => theme.colors.income};
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '700ms')}
`;

const Proposal = styled.div`
  margin-top: 20px;
  padding: 12px;
  border: 1.5px dashed ${({ theme }) => theme.colors.textMuted};
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  p {
    margin: 0;
    line-height: 1.5;
  }
  p small {
    display: block;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const thump = keyframes`
  0% { opacity: 0; transform: scale(2.2) rotate(-14deg); }
  60% { opacity: 1; transform: scale(0.94) rotate(-14deg); }
  100% { opacity: 1; transform: scale(1) rotate(-14deg); }
`;

const StampButton = styled.button<{ $state: 'pending' | 'approved' | 'dismissed' }>`
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  padding: 8px 12px;
  border: 2.5px solid currentColor;
  border-radius: 4px;
  font-family: ${fonts.mono};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: transform 150ms;
  ${({ $state, theme }) =>
    $state === 'pending'
      ? css`
          color: ${theme.colors.textPrimary};
          border-style: dashed;
          &:hover {
            transform: rotate(-4deg);
          }
        `
      : css`
          color: ${$state === 'approved' ? theme.colors.brandText : theme.colors.expense};
          animation: ${thump} 380ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        `}
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 3px;
  }
`;

const Small = styled.button`
  all: unset;
  cursor: pointer;
  grid-column: 1 / -1;
  justify-self: start;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-decoration: underline;
`;

const Footer = styled.footer`
  margin-top: 18px;
  text-align: center;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
  a {
    color: inherit;
  }
`;

function Briefing() {
  const [ref, on] = useInView<HTMLDivElement>(0.3);
  const [state, setState] = useState<'pending' | 'approved' | 'dismissed'>('pending');
  const max = Math.max(...OPPORTUNITIES.map((o) => o.saving));
  const food = OPPORTUNITIES[0];
  return (
    <Slot ref={ref}>
      <Paper $on={on} aria-label="Example weekly briefing from the planned Arvo advisor">
        <Masthead>
          <h3>Weekly briefing</h3>
          <p>Arvo advisor · preview · wk 36</p>
        </Masthead>
        <Asked>How can I spend {formatINR(5_000)} less a month?</Asked>
        <Items>
          {OPPORTUNITIES.map((o, i) => (
            <Item key={o.label} $on={on} $d={900 + i * 280}>
              <div className="line">
                <span>{o.label}</span>
                <span className="dots" aria-hidden />
                <span className="amt">−{formatINR(o.saving)}</span>
              </div>
              <span className="why">{o.detail}</span>
              <Bar $on={on} $d={1100 + i * 280} $pct={(o.saving / max) * 100} aria-hidden />
            </Item>
          ))}
        </Items>
        <Total $on={on}>
          <span>Back each month</span>
          <b>{formatINR(OPPORTUNITY_TOTAL)}</b>
        </Total>
        <Proposal>
          <p>
            Budget {food?.label.toLowerCase()} at {formatINR(food?.target ?? 0)}/mo
            <small>127 transactions · Aug vs May–Jul</small>
          </p>
          <StampButton
            type="button"
            $state={state}
            aria-live="polite"
            onClick={() => setState((s) => (s === 'pending' ? 'approved' : s))}
          >
            {state === 'pending' ? 'Approve?' : state === 'approved' ? 'Approved' : 'Dismissed'}
          </StampButton>
          {state === 'pending' ? (
            <Small type="button" onClick={() => setState('dismissed')}>
              not now
            </Small>
          ) : (
            <Small type="button" onClick={() => setState('pending')}>
              reset demo
            </Small>
          )}
        </Proposal>
        <Footer>
          Coming soon · not financial advice · <a href="/disclaimer">disclaimer</a>
        </Footer>
      </Paper>
    </Slot>
  );
}

export function AdvisorSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  return (
    <SectionShell id="advisor" aria-labelledby="advisor-title">
      <Container>
        <SectionHeading id="advisor-title" eyebrow="On the roadmap" index="04" title="Your personal finance manager" />
        <Stage ref={ref}>
          <Margin>
            <Note $on={on} $d={600} $tilt={-2} $side="left">
              <u>Real math</u>, not vibes
              <small>savings, pacing & goals from fixed rules</small>
            </Note>
            <Note $on={on} $d={900} $tilt={1.5} $side="left">
              AI just <u>explains</u>
              <small>and shows the data it used</small>
            </Note>
          </Margin>
          <Briefing />
          <Margin>
            <Note $on={on} $d={1200} $tilt={2} $side="right">
              Nothing saved till <u>you stamp it</u>
              <small>never moves money</small>
            </Note>
            <Note $on={on} $d={1500} $tilt={-1.5} $side="right">
              Every <u>Monday</u>
              <small>what changed, what needs a decision</small>
            </Note>
          </Margin>
        </Stage>
      </Container>
    </SectionShell>
  );
}
