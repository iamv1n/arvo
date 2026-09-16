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
import styled, { css } from 'styled-components';
import { CodeBlock } from '../code-block';
import { dashFlow, fadeIn, fadeUp, growX, play, popIn, pulse, useInView } from './motion';
import { Body, Container, H3, Pill, Reveal, SectionHeading, SectionShell } from './primitives';

/* ================= MCP ================= */

const McpGrid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[10]}px;
  align-items: start;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 0.9fr 1.1fr;
    gap: ${({ theme }) => theme.space[16]}px;
  }
`;

const ToolList = styled.ul`
  list-style: none;
  margin: ${({ theme }) => theme.space[6]}px 0 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[3]}px;
  & li {
    display: grid;
    gap: 2px;
    padding: 12px 14px;
    border-radius: ${({ theme }) => theme.radii.md}px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  }
  & code {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 13px;
    color: ${({ theme }) => theme.colors.brand};
  }
  & span {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Clients = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: ${({ theme }) => theme.space[5]}px;
`;

const Terminal = styled.div`
  border-radius: ${({ theme }) => theme.radii.xl}px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: ${({ theme }) => theme.shadows.md};
  min-width: 0;
`;

const TermBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.bgMuted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.income};
    animation: ${pulse} 1.8s ease-in-out infinite;
  }
  & span:last-child {
    margin-left: auto;
  }
`;

const TermBody = styled.div`
  padding: ${({ theme }) => theme.space[5]}px;
  display: grid;
  gap: 14px;
  font-size: 14px;
  line-height: 1.55;
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

const ToolCall = styled.div<{ $on: boolean; $d: number }>`
  ${step}
  border-radius: ${({ theme }) => theme.radii.md}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurface};
  overflow: hidden;
  min-width: 0;
`;

const ToolHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & code {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    color: ${({ theme }) => theme.colors.brand};
    font-weight: 600;
  }
`;

const Json = styled.pre`
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 12px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textPrimary};
  & .k {
    color: ${({ theme }) => theme.colors.transfer};
  }
  & .n {
    color: ${({ theme }) => theme.colors.expense};
  }
  & .s {
    color: ${({ theme }) => theme.colors.income};
  }
  & .m {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const JsonLine = styled.span<{ $on: boolean; $d: number }>`
  display: block;
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '300ms')}
`;

const Answer = styled.div<{ $on: boolean; $d: number }>`
  ${step}
  max-width: 95%;
  padding: 10px 14px;
  border-radius: 14px 14px 14px 4px;
  background: ${({ theme }) => theme.colors.bgMuted};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

type Tok = [string, 'k' | 's' | 'n' | 'm' | 'p'];

/** JSON result lines, pre-tokenized so they can stream in one by one with syntax colors. */
const jsonLines: Tok[][] = [
  [['{', 'p']],
  [['  "period"', 'k'], [': ', 'p'], ['"2026-08"', 's'], [',', 'p']],
  [['  "currency"', 'k'], [': ', 'p'], ['"INR"', 's'], [',', 'p']],
  [['  "total_spent"', 'k'], [': ', 'p'], ['112000', 'n'], [',', 'p']],
  [['  "by_category"', 'k'], [': [', 'p']],
  [['    { ', 'p'], ['"name"', 'k'], [': ', 'p'], ['"Rent"', 's'], [', ', 'p'], ['"amount"', 'k'], [': ', 'p'], ['38000', 'n'], [' },', 'p']],
  [['    { ', 'p'], ['"name"', 'k'], [': ', 'p'], ['"Travel"', 's'], [', ', 'p'], ['"amount"', 'k'], [': ', 'p'], ['21400', 'n'], [' },', 'p']],
  [['    …', 'm']],
  [['  ],', 'p']],
  [['  "transactions_used"', 'k'], [': ', 'p'], ['127', 'n']],
  [['}', 'p']],
];

const tools: { name: string; desc: string; soon?: boolean }[] = [
  { name: 'finance_get_spending_summary', desc: 'Spending by category and merchant for a period, with the transactions used' },
  { name: 'finance_get_cashflow', desc: 'Income, expenses and net cash flow by month' },
  { name: 'finance_compare_periods', desc: 'What changed between two periods, and by how much' },
  { name: 'finance_get_recurring_expenses', desc: 'Subscriptions and other recurring charges' },
  { name: 'finance_get_net_worth', desc: 'Assets, liabilities and net worth over time' },
  { name: 'finance_get_financial_snapshot', desc: 'A one-call overview of balances, cash flow and top categories' },
  { name: 'finance_simulate_purchase', desc: '“Can I afford it?” projection', soon: true },
];

const mcpConfig = `{
  "mcpServers": {
    "arvo": {
      "url": "https://your-arvo-host/mcp",
      "headers": { "Authorization": "Bearer arvo_pat_…" }
    }
  }
}`;

export function McpSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.3);
  const answerDelay = 1100 + jsonLines.length * 120 + 300;
  return (
    <SectionShell id="mcp" aria-labelledby="mcp-title" $muted>
      <Container>
        <McpGrid>
          <div>
            <SectionHeading
              id="mcp-title"
              eyebrow="MCP server"
              title="Connect the AI assistant you already use"
              lead="Arvo speaks the Model Context Protocol. Connected assistants call finance tools that return computed, structured results for your account only, never raw database access."
            />
            <Reveal>
              <ToolList aria-label="Arvo MCP tools">
                {tools.map((t) => (
                  <li key={t.name}>
                    <code>{t.name}</code>
                    <span>
                      {t.desc}
                      {t.soon ? ' · coming soon' : ''}
                    </span>
                  </li>
                ))}
              </ToolList>
              <Clients>
                {['Claude', 'ChatGPT', 'Gemini'].map((c) => (
                  <Pill key={c} $tone="muted">
                    <RobotOutlined aria-hidden /> {c}
                  </Pill>
                ))}
                <Pill $tone="muted">
                  <ApiOutlined aria-hidden /> any MCP client
                </Pill>
              </Clients>
              <ConfigWrap>
                <p>
                  <Pill $tone="warning">Coming soon</Pill> Connect with a personal access token:
                </p>
                <CodeBlock code={mcpConfig} label="mcp config (json)" shell={false} />
              </ConfigWrap>
            </Reveal>
          </div>
          <Terminal
            ref={ref}
            role="group"
            aria-label="Example: an AI client calls the finance_get_spending_summary tool on Arvo's MCP server and answers using the JSON result"
          >
            <TermBar>
              <i aria-hidden />
              <span>AI client</span>
              <span>
                <ApiOutlined aria-hidden /> connected to arvo-mcp
              </span>
            </TermBar>
            <TermBody>
              <UserMsg $on={on} $d={0}>
                Where did my money go last month?
              </UserMsg>
              <ToolCall $on={on} $d={600}>
                <ToolHead>
                  <span>Calling tool</span>
                  <code>finance_get_spending_summary</code>
                  <span>{'{ "period": "2026-08" }'}</span>
                </ToolHead>
                <Json aria-label="Structured tool result">
                  {jsonLines.map((line, i) => (
                    <JsonLine key={i} $on={on} $d={1100 + i * 120}>
                      {line.map(([text, cls], j) =>
                        cls === 'p' ? (
                          <span key={j}>{text}</span>
                        ) : (
                          <span key={j} className={cls}>
                            {text}
                          </span>
                        ),
                      )}
                    </JsonLine>
                  ))}
                </Json>
              </ToolCall>
              <Answer $on={on} $d={answerDelay}>
                You spent <strong>₹1,12,000</strong> in August. Rent was the largest category at ₹38,000, followed by Travel at
                ₹21,400. That&apos;s based on 127 transactions Arvo computed.
              </Answer>
            </TermBody>
          </Terminal>
        </McpGrid>
      </Container>
    </SectionShell>
  );
}

const ConfigWrap = styled.div`
  margin-top: ${({ theme }) => theme.space[6]}px;
  & > p {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 10px;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

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
