'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { CodeBlock } from '../code-block';
import { drawStroke, fadeIn, fadeUp, play, popIn, useInView } from './motion';
import { Container, fonts, SectionHeading, SectionShell } from './primitives';

/*
 * MCP as an old telephone switchboard: assistants are jacks on the left, Arvo's tools are ports on
 * the right, and a patch cable swings across to connect them. Below, the call is logged as three
 * ticket stubs — question, tool call, answer — instead of a chat mockup.
 */

const clients = ['Claude', 'ChatGPT', 'Cursor', 'VS Code', 'Gemini'];
const tools = [
  { name: 'spending_summary', q: 'Where did my money go last month?', a: '₹1,12,000 in August. Rent ₹38,000, then Travel ₹21,400.' },
  { name: 'cashflow', q: 'Did I save anything this quarter?', a: '₹1,64,000 saved across Jul–Sep, 36% of income.' },
  { name: 'compare_periods', q: 'Why was August more expensive?', a: '+₹15,000 vs July — mostly Travel (+₹11,800).' },
  { name: 'recurring_expenses', q: 'What am I subscribed to?', a: '6 charges, ₹4,317/mo. Gym price went up.' },
  { name: 'net_worth', q: "What's my net worth now?", a: '₹14,52,380, up ₹5.1L this year.' },
  { name: 'get_highlights', q: 'Anything I should know?', a: 'Food delivery is 40% above your average.' },
];

const mcpConfig = `{
  "mcpServers": {
    "arvo": { "url": "https://your-arvo-host/mcp" }
  }
}`;

/* ---------- board ---------- */

const Board = styled.div`
  position: relative;
  border: 2px solid ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
`;

const BoardBar = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background: ${({ theme }) => theme.colors.textPrimary};
  color: ${({ theme }) => theme.colors.bgCanvas};
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const Panel = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 0 clamp(48px, 14vw, 180px);
  padding: 22px clamp(12px, 3vw, 28px);
`;

const Column = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  align-content: center;
  h4 {
    margin: 0 0 4px;
    font-family: ${fonts.mono};
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Jack = styled.li<{ $live: boolean; $side: 'left' | 'right' }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: ${({ $side }) => ($side === 'left' ? 'flex-start' : 'flex-end')};
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid ${({ theme, $live }) => ($live ? theme.colors.brand : theme.colors.border)};
  background: ${({ theme, $live }) => ($live ? theme.colors.brandSubtle : theme.colors.bgSurface)};
  color: ${({ theme, $live }) => ($live ? theme.colors.textPrimary : theme.colors.textSecondary)};
  font-family: ${({ $side }) => ($side === 'left' ? fonts.serif : fonts.mono)};
  font-size: ${({ $side }) => ($side === 'left' ? '16px' : '12px')};
  white-space: nowrap;
  transition:
    background 250ms,
    border-color 250ms,
    color 250ms;
  cursor: ${({ $side }) => ($side === 'right' ? 'pointer' : 'default')};
  /* The socket hole on the inner edge. */
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    ${({ $side }) => ($side === 'left' ? 'right: -6px;' : 'left: -6px;')}
    width: 10px;
    height: 10px;
    margin-top: -5px;
    border-radius: 50%;
    border: 2px solid ${({ theme }) => theme.colors.textPrimary};
    background: ${({ theme, $live }) => ($live ? theme.colors.brand : theme.colors.bgCanvas)};
  }
  ${({ $side }) =>
    $side === 'right' &&
    css`
      &:hover,
      &:focus-visible {
        color: ${({ theme }) => theme.colors.textPrimary};
        outline: none;
      }
    `}
`;

const Cable = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
`;

const CablePath = styled.path`
  stroke-dasharray: 1;
  animation: ${drawStroke} 650ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
`;

const Clients = styled.p`
  margin: 0;
  padding: 10px 14px;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  font-family: ${fonts.hand};
  font-size: 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/* ---------- ticket stubs ---------- */

const Stubs = styled.div`
  display: grid;
  gap: 12px;
  margin-top: ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: 1fr 1fr 1.3fr;
    gap: 0;
  }
`;

const Stub = styled.div<{ $d: number; $tone?: 'ink' | 'brand' }>`
  position: relative;
  min-height: 118px;
  padding: 14px 18px;
  background: ${({ theme, $tone }) => ($tone === 'ink' ? theme.colors.textPrimary : theme.colors.bgSurfaceRaised)};
  color: ${({ theme, $tone }) => ($tone === 'ink' ? theme.colors.bgCanvas : theme.colors.textPrimary)};
  border: 1px solid ${({ theme }) => theme.colors.border};
  animation: ${fadeUp} 450ms ${({ $d }) => $d}ms both;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    & + & {
      border-left: 2px dashed ${({ theme }) => theme.colors.bgCanvas};
      margin-left: -1px;
    }
  }
  small {
    display: block;
    margin-bottom: 8px;
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.6;
  }
  p {
    margin: 0;
  }
`;

const Question = styled.p`
  font-family: ${fonts.serif};
  font-style: italic;
  font-size: 20px;
  line-height: 1.25;
`;

const Call = styled.pre`
  margin: 0;
  font-family: ${fonts.mono};
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  b {
    color: #2fc4a0;
    font-weight: 500;
  }
`;

const AnswerText = styled.p`
  font-family: ${fonts.serif};
  font-size: 19px;
  line-height: 1.3;
`;

const Stamp = styled.span`
  position: absolute;
  right: 12px;
  bottom: 10px;
  padding: 2px 6px;
  border: 1.5px solid ${({ theme }) => theme.colors.brandText};
  color: ${({ theme }) => theme.colors.brandText};
  font-family: ${fonts.mono};
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transform: rotate(-6deg);
  animation: ${popIn} 300ms 700ms both;
`;

const Blink = keyframes`
  50% { opacity: 0; }
`;
const Cursor = styled.i`
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  background: currentColor;
  animation: ${Blink} 1s steps(1) infinite;
`;

const Setup = styled.details`
  margin-top: ${({ theme }) => theme.space[5]}px;
  summary {
    cursor: pointer;
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.brandText};
  }
  &[open] summary {
    margin-bottom: 10px;
  }
`;

const Fade = styled.div<{ $on: boolean }>`
  animation-name: ${fadeIn};
  ${({ $on }) => play($on, 200, '600ms')}
`;

/* ---------- section ---------- */

export function McpSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.3);
  const [tool, setTool] = useState(0);
  const [client, setClient] = useState(0);
  const [manual, setManual] = useState(false);

  // Auto-patch a new call every few seconds until the visitor picks a tool themselves.
  useEffect(() => {
    if (!on || manual) return;
    const id = window.setInterval(() => {
      setTool((t) => (t + 1) % tools.length);
      setClient((c) => (c + 1) % clients.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [on, manual]);

  const pick = (i: number) => {
    setManual(true);
    setTool(i);
  };

  // Measure the two live sockets so the cable lands exactly on them at any width.
  const panelRef = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState<{ x1: number; y1: number; x2: number; y2: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const box = panel.getBoundingClientRect();
      const a = panel.querySelector<HTMLElement>(`[data-jack="c${client}"]`)?.getBoundingClientRect();
      const b = panel.querySelector<HTMLElement>(`[data-jack="t${tool}"]`)?.getBoundingClientRect();
      if (!a || !b) return;
      setEnds({ x1: a.right - box.left + 1, y1: a.top + a.height / 2 - box.top, x2: b.left - box.left - 1, y2: b.top + b.height / 2 - box.top, w: box.width, h: box.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [client, tool]);
  const current = tools[tool];

  return (
    <SectionShell id="mcp" aria-labelledby="mcp-title" $muted>
      <Container>
        <SectionHeading id="mcp-title" eyebrow="MCP server" index="02" title="Connect the AI assistant you already use" />
        <Fade $on={on} ref={ref}>
          <Board>
            <BoardBar>
              <span>arvo · mcp switchboard</span>
              <span>read-only · your account only</span>
            </BoardBar>
            <Panel ref={panelRef}>
              <Column aria-label="AI assistants">
                <h4>Assistant</h4>
                {clients.map((c, i) => (
                  <Jack key={c} data-jack={`c${i}`} $side="left" $live={i === client}>
                    {c}
                  </Jack>
                ))}
              </Column>
              <Column aria-label="Arvo finance tools">
                <h4 style={{ textAlign: 'right' }}>finance_ tool</h4>
                {tools.map((t, i) => (
                  <Jack
                    key={t.name}
                    data-jack={`t${i}`}
                    $side="right"
                    $live={i === tool}
                    tabIndex={0}
                    role="button"
                    aria-pressed={i === tool}
                    onClick={() => pick(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick(i);
                      }
                    }}
                  >
                    {t.name}
                  </Jack>
                ))}
              </Column>
              {ends && (
                <Cable viewBox={`0 0 ${ends.w} ${ends.h}`} aria-hidden>
                  <CablePath
                    key={`${client}-${tool}`}
                    d={`M ${ends.x1} ${ends.y1} C ${ends.x1 + (ends.x2 - ends.x1) * 0.45} ${Math.max(ends.y1, ends.y2) + 60}, ${ends.x2 - (ends.x2 - ends.x1) * 0.45} ${Math.max(ends.y1, ends.y2) + 60}, ${ends.x2} ${ends.y2}`}
                    pathLength={1}
                    fill="none"
                    stroke="#2fc4a0"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                </Cable>
              )}
            </Panel>
            <Clients>…or any client that speaks MCP — sign in once with OAuth, no keys to paste.</Clients>
          </Board>

          <Stubs key={tool} aria-live="polite">
            <Stub $d={0}>
              <small>{clients[client]} asks</small>
              <Question>{current.q}</Question>
            </Stub>
            <Stub $d={250} $tone="ink">
              <small>calls arvo</small>
              <Call>
                <b>finance_{current.name}</b>
                {'\n'}→ computed from your ledger
                <Cursor aria-hidden />
              </Call>
            </Stub>
            <Stub $d={500}>
              <small>answers</small>
              <AnswerText>{current.a}</AnswerText>
              <Stamp>exact · cited</Stamp>
            </Stub>
          </Stubs>

          <Setup>
            <summary>Show config</summary>
            <CodeBlock code={mcpConfig} label="mcp config (json)" shell={false} />
          </Setup>
        </Fade>
      </Container>
    </SectionShell>
  );
}
