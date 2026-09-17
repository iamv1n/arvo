'use client';

import {
  ApiOutlined,
  CloudOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  LaptopOutlined,
  LockOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { dashFlow, fadeIn, fadeUp, growX, play, popIn, useInView } from './motion';
import { Body, Container, H3, Pill, SectionHeading, SectionShell } from './primitives';

/* ================= Privacy ================= */

const Machine = styled.div<{ $on: boolean }>`
  position: relative;
  padding: ${({ theme }) => theme.space[8]}px ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[6]}px;
  border: 2px dashed ${({ theme }) => theme.colors.brand};
  border-radius: ${({ theme }) => theme.radii.xl}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  animation-name: ${fadeIn};
  ${({ $on }) => play($on, 0, '600ms')}
`;

const MachineLabel = styled.span`
  position: absolute;
  top: -14px;
  left: 20px;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 3px 12px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.brand};
  color: ${({ theme }) => theme.colors.bgSurface};
  font-size: 13px;
  font-weight: 600;
`;

const Flow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    flex-direction: row;
    align-items: center;
  }
`;

const NodeBox = styled.div<{ $on: boolean; $d: number; $dashed?: boolean }>`
  flex: 1;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  align-items: center;
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  border: 1px ${({ $dashed }) => ($dashed ? 'dashed' : 'solid')} ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: ${({ theme, $dashed }) => ($dashed ? 'none' : theme.shadows.sm)};
  min-width: 0;
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
  & > .anticon {
    grid-row: span 2;
    font-size: 22px;
    color: ${({ theme }) => theme.colors.brand};
  }
  & strong {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: 15px;
  }
  & small {
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: 12px;
  }
`;

const Connector = styled.div<{ $on: boolean; $d: number; $optional?: boolean }>`
  flex: none;
  position: relative;
  align-self: center;
  width: 2px;
  height: 28px;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    width: 48px;
    height: 2px;
  }
  & svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  & line {
    stroke: ${({ theme, $optional }) => ($optional ? theme.colors.textMuted : theme.colors.brand)};
    stroke-width: 2;
    stroke-dasharray: 6 6;
    animation: ${dashFlow} 1.2s linear infinite;
  }
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '400ms')}
`;

function Wire({ on, d, optional }: { on: boolean; d: number; optional?: boolean }) {
  return (
    <Connector $on={on} $d={d} $optional={optional} aria-hidden>
      <svg preserveAspectRatio="none">
        <line className="h" x1="0" y1="50%" x2="100%" y2="50%" />
        <line className="v" x1="50%" y1="0" x2="50%" y2="100%" />
      </svg>
    </Connector>
  );
}

const LinkStyles = styled.div`
  & .h {
    display: none;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    & .h {
      display: inline;
    }
    & .v {
      display: none;
    }
  }
`;

const Local = styled.div`
  margin-top: ${({ theme }) => theme.space[5]}px;
  display: grid;
  gap: ${({ theme }) => theme.space[3]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const Outside = styled.div`
  margin-top: ${({ theme }) => theme.space[6]}px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    & > :last-child {
      flex: 0 1 360px;
    }
  }
`;

const PrivacyPoint = styled.div<{ $on: boolean; $d: number }>`
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;

const Points = styled.div`
  margin-top: ${({ theme }) => theme.space[10]}px;
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: repeat(3, 1fr);
  }
  & h3 {
    font-size: ${({ theme }) => theme.typography.fontSize.lg}px;
  }
`;

const Underline = styled.div<{ $on: boolean }>`
  height: 3px;
  width: 40px;
  margin-bottom: 12px;
  border-radius: 2px;
  background: ${({ theme }) => theme.colors.brand};
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on }) => play($on, 300, '600ms')}
`;

export function PrivacySection() {
  const [ref, on] = useInView<HTMLDivElement>(0.3);
  return (
    <SectionShell id="privacy" aria-labelledby="privacy-title">
      <Container>
        <SectionHeading
          id="privacy-title"
          eyebrow="Local-first"
          index="06"
          title="Your finances never leave your machine unless you say so"
          lead="Arvo runs next to your data. No bank credentials, no third-party aggregators, no hosted database."
        />
        <LinkStyles ref={ref}>
          <figure style={{ margin: 0 }} aria-label="Diagram: your browser talks to Arvo, which keeps your data in your own database and can use a private AI model, all on your machine. A cloud AI outside your machine is optional.">
            <Machine $on={on}>
              <MachineLabel>
                <LaptopOutlined aria-hidden /> Your machine
              </MachineLabel>
              <Flow>
                <NodeBox $on={on} $d={200}>
                  <DesktopOutlined aria-hidden />
                  <strong>Browser</strong>
                  <small>You, or your AI assistant</small>
                </NodeBox>
                <Wire on={on} d={450} />
                <NodeBox $on={on} $d={500}>
                  <ApiOutlined aria-hidden />
                  <strong>Arvo</strong>
                  <small>The app and its calculations</small>
                </NodeBox>
                <Wire on={on} d={750} />
                <NodeBox $on={on} $d={800}>
                  <DatabaseOutlined aria-hidden />
                  <strong>Your database</strong>
                  <small>Your ledger, your disk</small>
                </NodeBox>
              </Flow>
              <Local>
                <NodeBox $on={on} $d={1000}>
                  <RobotOutlined aria-hidden />
                  <strong>Private AI</strong>
                  <small>Private AI, runs on your hardware</small>
                </NodeBox>
                <NodeBox $on={on} $d={1100}>
                  <LockOutlined aria-hidden />
                  <strong>Easy to run</strong>
                  <small>Start everything in a few steps</small>
                </NodeBox>
              </Local>
            </Machine>
            <Outside>
              <Wire on={on} d={1300} optional />
              <NodeBox $on={on} $d={1350} $dashed>
                <CloudOutlined aria-hidden />
                <strong>
                  Cloud AI <Pill $tone="muted">optional · opt-in</Pill>
                </strong>
                <small>Only if you enable it, with a clear disclosure</small>
              </NodeBox>
            </Outside>
          </figure>
        </LinkStyles>
        <Points>
          {[
            ['No bank APIs', 'Import the statements your bank already gives you. Nothing to link, nothing to leak.'],
            ['Your database', 'Every transaction lives in a database you own. Back it up, export it, or delete it.'],
            ['AI on your terms', 'Use a private AI on your own computer, or choose a cloud AI knowing exactly what is sent.'],
          ].map(([title, body], i) => (
            <PrivacyPoint key={title} $on={on} $d={1400 + i * 120}>
              <Underline $on={on} />
              <H3 as="h3">{title}</H3>
              <Body>{body}</Body>
            </PrivacyPoint>
          ))}
        </Points>
      </Container>
    </SectionShell>
  );
}
