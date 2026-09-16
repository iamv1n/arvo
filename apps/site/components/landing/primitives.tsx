'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';
import { fadeUp, play, useInView } from './motion';

export const Container = styled.div`
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 ${({ theme }) => theme.space[4]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    padding: 0 ${({ theme }) => theme.space[8]}px;
  }
`;

export const SectionShell = styled.section<{ $muted?: boolean }>`
  padding: ${({ theme }) => theme.space[16]}px 0;
  background: ${({ theme, $muted }) => ($muted ? theme.colors.bgSurface : 'transparent')};
  border-top: 1px solid ${({ theme, $muted }) => ($muted ? theme.colors.borderSubtle : 'transparent')};
  border-bottom: 1px solid ${({ theme, $muted }) => ($muted ? theme.colors.borderSubtle : 'transparent')};
  scroll-margin-top: 64px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding: 96px 0;
  }
`;

export const Eyebrow = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[3]}px;
  color: ${({ theme }) => theme.colors.brand};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

export const H2 = styled.h2`
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: clamp(26px, 4vw, ${({ theme }) => theme.typography.fontSize['4xl']}px);
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
  letter-spacing: -0.02em;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
`;

export const H3 = styled.h3`
  margin: 0 0 ${({ theme }) => theme.space[2]}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.xl}px;
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

export const Lead = styled.p`
  margin: ${({ theme }) => theme.space[4]}px 0 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.lg}px;
  line-height: 1.65;
  max-width: 60ch;
`;

export const Body = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  line-height: 1.65;
`;

export const Card = styled.div`
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xl}px;
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

export const Pill = styled.span<{ $tone?: 'brand' | 'warning' | 'income' | 'expense' | 'transfer' | 'muted' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  white-space: nowrap;
  color: ${({ theme, $tone = 'brand' }) => ($tone === 'muted' ? theme.colors.textSecondary : theme.colors[$tone])};
  background: ${({ theme }) => theme.colors.bgMuted};
  border: 1px solid ${({ theme }) => theme.colors.borderSubtle};
`;

const RevealBox = styled.div<{ $on: boolean; $d: number }>`
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '700ms')}
`;

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>(0.15);
  return (
    <RevealBox ref={ref} $on={on} $d={delay} className={className}>
      {children}
    </RevealBox>
  );
}

const HeadWrap = styled.div<{ $center?: boolean; $compact?: boolean }>`
  margin-bottom: ${({ theme, $compact }) => ($compact ? theme.space[6] : theme.space[12])}px;
  & > :last-child {
    margin-bottom: 0;
  }
  text-align: ${({ $center }) => ($center ? 'center' : 'left')};
  ${({ $center }) => ($center ? '& > p:last-child { margin-left: auto; margin-right: auto; }' : '')}
`;

export function SectionHeading({
  eyebrow,
  title,
  lead,
  id,
  center,
  compact,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  id: string;
  center?: boolean;
  /** Smaller bottom gap, for headings that sit in a column above their own content. */
  compact?: boolean;
}) {
  return (
    <Reveal>
      <HeadWrap $center={center} $compact={compact}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <H2 id={id}>{title}</H2>
        {lead ? <Lead>{lead}</Lead> : null}
      </HeadWrap>
    </Reveal>
  );
}
