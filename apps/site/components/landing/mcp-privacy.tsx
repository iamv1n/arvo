'use client';

import { useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { drawStroke, fadeIn, fadeUp, play, popIn, useInView } from './motion';
import { Container, fonts, SectionHeading, SectionShell } from './primitives';

/*
 * Privacy as an architect's floor plan. Your machine is a walled house drawn in ink; your data
 * lives in its rooms. The only opening in the outer wall is a labelled door to a cloud AI, and it
 * stays shut until you open it yourself.
 */

const Plan = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr) 260px;
    align-items: center;
    gap: 0;
  }
`;

const House = styled.div<{ $on: boolean }>`
  position: relative;
  border: 4px solid ${({ theme }) => theme.colors.textPrimary};
  border-radius: 2px;
  background:
    repeating-linear-gradient(0deg, transparent 0 23px, ${({ theme }) => theme.colors.borderSubtle} 23px 24px),
    repeating-linear-gradient(90deg, transparent 0 23px, ${({ theme }) => theme.colors.borderSubtle} 23px 24px),
    ${({ theme }) => theme.colors.bgSurface};
  animation-name: ${fadeIn};
  ${({ $on }) => play($on, 0, '600ms')}
`;

const Title = styled.span`
  position: absolute;
  top: -13px;
  left: 18px;
  padding: 2px 10px;
  background: ${({ theme }) => theme.colors.bgCanvas};
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Rooms = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  & > li:nth-child(odd) {
    border-right: 2px solid ${({ theme }) => theme.colors.textPrimary};
  }
  & > li:nth-child(-n + 2) {
    border-bottom: 2px solid ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Room = styled.li<{ $on: boolean; $d: number; $lit?: boolean }>`
  position: relative;
  min-height: 110px;
  padding: 14px 14px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
  background: ${({ $lit, theme }) => ($lit ? theme.colors.brandSubtle : 'transparent')};
  transition: background 400ms;
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
  & .no {
    position: absolute;
    top: 12px;
    left: 16px;
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.08em;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & strong {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: clamp(18px, 2vw, 22px);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & span.hand {
    font-family: ${fonts.hand};
    font-size: 20px;
    line-height: 1.1;
    color: ${({ theme }) => theme.colors.brandText};
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    min-height: 130px;
    padding: 18px;
  }
`;

/* The door cut into the right wall (bottom wall on narrow screens). */
const Doorway = styled.div<{ $open: boolean }>`
  position: absolute;
  right: -4px;
  bottom: 38px;
  width: 4px;
  height: 64px;
  background: ${({ theme }) => theme.colors.bgSurface};
  & svg {
    position: absolute;
    left: 0;
    top: 0;
    width: 64px;
    height: 64px;
    overflow: visible;
  }
  & .leaf {
    stroke: ${({ theme }) => theme.colors.textPrimary};
    stroke-width: 4;
    transform-origin: 2px 64px;
    transform: rotate(${({ $open }) => ($open ? -70 : 0)}deg);
    transition: transform 500ms cubic-bezier(0.34, 1.3, 0.64, 1);
  }
  & .swing {
    fill: none;
    stroke: ${({ theme }) => theme.colors.textMuted};
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    transition: opacity 300ms;
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.lg - 1}px) {
    display: none;
  }
`;

const Outside = styled.div<{ $on: boolean }>`
  display: grid;
  gap: 14px;
  justify-items: start;
  animation-name: ${fadeIn};
  ${({ $on }) => play($on, 900, '600ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding-left: 28px;
    align-self: end;
    margin-bottom: 8px;
  }
`;

const march = keyframes`
  to { background-position: 24px 0; }
`;

const Path = styled.span<{ $open: boolean }>`
  display: none;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    display: block;
    width: 100%;
    height: 2px;
    background: repeating-linear-gradient(
      90deg,
      ${({ theme }) => theme.colors.warning} 0 8px,
      transparent 8px 12px
    );
    transform-origin: left;
    transform: scaleX(${({ $open }) => ($open ? 1 : 0)});
    transition: transform 500ms;
    ${({ $open }) =>
      $open &&
      css`
        animation: ${march} 800ms linear infinite;
      `}
  }
`;

const Cloud = styled.div<{ $open: boolean }>`
  width: 100%;
  padding: 16px;
  border: 2px dashed ${({ $open, theme }) => ($open ? theme.colors.warning : theme.colors.border)};
  border-radius: 6px;
  color: ${({ $open, theme }) => ($open ? theme.colors.textPrimary : theme.colors.textMuted)};
  transition:
    border-color 300ms,
    color 300ms;
  & b {
    display: block;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 22px;
    letter-spacing: -0.01em;
  }
  & small {
    display: block;
    margin-top: 4px;
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
`;

const Toggle = styled.button<{ $open: boolean }>`
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;
  font-family: ${fonts.mono};
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textPrimary};
  & i {
    position: relative;
    width: 40px;
    height: 22px;
    border: 2px solid ${({ theme }) => theme.colors.textPrimary};
    border-radius: 4px;
    background: ${({ $open, theme }) => ($open ? theme.colors.warning : 'transparent')};
    transition: background 200ms;
  }
  & i::after {
    content: '';
    position: absolute;
    top: 2px;
    left: ${({ $open }) => ($open ? 20 : 2)}px;
    width: 14px;
    height: 14px;
    border-radius: 2px;
    background: ${({ theme }) => theme.colors.textPrimary};
    transition: left 200ms cubic-bezier(0.34, 1.4, 0.64, 1);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 4px;
  }
`;

const Scribble = styled.p<{ $open: boolean }>`
  margin: 0;
  font-family: ${fonts.hand};
  font-size: 22px;
  line-height: 1.15;
  transform: rotate(-2deg);
  color: ${({ $open, theme }) => ($open ? theme.colors.warning : theme.colors.brandText)};
`;

/* Legend: three short claims printed like the key on a drawing. */
const Key = styled.ol`
  list-style: none;
  margin: ${({ theme }) => theme.space[10]}px 0 0;
  padding: 0;
  display: grid;
  border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const KeyItem = styled.li<{ $on: boolean; $d: number }>`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  padding: 18px 16px 18px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
  & svg {
    grid-row: span 2;
    width: 28px;
    height: 28px;
    color: ${({ theme }) => theme.colors.brand};
  }
  & svg path {
    stroke-dasharray: 1;
    animation-name: ${drawStroke};
    ${({ $on, $d }) => play($on, $d + 200, '900ms')}
  }
  & b {
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & span {
    font-size: 15px;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Badge = styled.span<{ $on: boolean }>`
  display: inline-block;
  animation-name: ${popIn};
  ${({ $on }) => play($on, 700, '400ms')}
`;

const rooms = [
  { name: 'Browser', note: 'you, or your AI assistant' },
  { name: 'Arvo', note: 'does every calculation' },
  { name: 'Your database', note: 'your ledger, your disk' },
  { name: 'Private AI', note: 'optional, on your hardware' },
];

const keys = [
  { title: 'No bank logins', body: 'Import the statements you already download. Nothing to link.', d: 'M4 14h20M8 10l-4 4 4 4M20 10l4 4-4 4' },
  { title: 'You own the database', body: 'Back it up, export it, or delete it.', d: 'M6 7c0-2 16-2 16 0v14c0 2-16 2-16 0zM6 7c0 2 16 2 16 0M6 14c0 2 16 2 16 0' },
  { title: 'Cloud AI is opt-in', body: 'Off by default, and Arvo says when one is in use.', d: 'M8 13V9a6 6 0 0 1 12 0v4M6 13h16v10H6z' },
];

export function PrivacySection() {
  const [ref, on] = useInView<HTMLDivElement>(0.3);
  const [open, setOpen] = useState(false);
  return (
    <SectionShell id="privacy" aria-labelledby="privacy-title">
      <Container>
        <SectionHeading
          id="privacy-title"
          eyebrow="Local-first"
          index="06"
          title="Your finances never leave your machine unless you say so"
        />
        <div ref={ref}>
          <Plan>
            <figure
              style={{ margin: 0 }}
              aria-label="Floor plan of your machine. Browser, Arvo, your database and an optional private AI all sit inside its walls. The only way out is an optional cloud AI door."
            >
              <House $on={on}>
                <Title>Plan · your machine</Title>
                <Rooms>
                  {rooms.map((r, i) => (
                    <Room key={r.name} $on={on} $d={200 + i * 150} $lit={on && !open}>
                      <span className="no" aria-hidden>
                        RM {String(i + 1).padStart(2, '0')}
                      </span>
                      <strong>{r.name}</strong>
                      <span className="hand">{r.note}</span>
                    </Room>
                  ))}
                </Rooms>
                <Doorway $open={open} aria-hidden>
                  <svg viewBox="0 0 64 64">
                    <path className="swing" d="M2 0 A64 64 0 0 1 62 42" />
                    <line className="leaf" x1="2" y1="64" x2="2" y2="0" />
                  </svg>
                </Doorway>
              </House>
            </figure>
            <Outside $on={on}>
              <Path $open={open} aria-hidden />
              <Cloud $open={open}>
                <b>Cloud AI</b>
                <small>{open ? 'Door open · disclosed in the app' : 'Door shut · nothing leaves'}</small>
              </Cloud>
              <Toggle type="button" $open={open} aria-pressed={open} onClick={() => setOpen((v) => !v)}>
                <i aria-hidden />
                {open ? 'Close the door' : 'Open the door'}
              </Toggle>
              <Scribble $open={open} aria-live="polite">
                {open ? 'your choice, and Arvo tells you' : <Badge $on={on}>stays shut unless you open it</Badge>}
              </Scribble>
            </Outside>
          </Plan>
          <Key>
            {keys.map((k, i) => (
              <KeyItem key={k.title} $on={on} $d={1100 + i * 140}>
                <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d={k.d} pathLength={1} />
                </svg>
                <b>{k.title}</b>
                <span>{k.body}</span>
              </KeyItem>
            ))}
          </Key>
        </div>
      </Container>
    </SectionShell>
  );
}
