'use client';

import {
  ArrowRightOutlined,
  CheckCircleFilled,
  DatabaseOutlined,
  FilePdfOutlined,
  SwapOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import { CategoryDonut, IncomeExpenseBars, NetWorthLine, categories } from './charts';
import { drawStroke, fadeIn, fadeUp, growX, play, popIn, useInView } from './motion';
import { Body, Card, Container, H3, Pill, Reveal, SectionHeading, SectionShell } from './primitives';

/* ---------- layout ---------- */

const Row = styled.div<{ $flip?: boolean }>`
  display: grid;
  gap: ${({ theme }) => theme.space[8]}px;
  align-items: center;
  & + & {
    margin-top: ${({ theme }) => theme.space[16]}px;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 1fr 1.15fr;
    gap: ${({ theme }) => theme.space[16]}px;
    & > :first-child {
      order: ${({ $flip }) => ($flip ? 2 : 1)};
    }
    & > :last-child {
      order: ${({ $flip }) => ($flip ? 1 : 2)};
    }
    & + & {
      margin-top: 96px;
    }
  }
`;

const Bullets = styled.ul`
  list-style: none;
  margin: ${({ theme }) => theme.space[5]}px 0 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[2]}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  & li {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  & .anticon {
    color: ${({ theme }) => theme.colors.brand};
  }
`;

function Copy({ kicker, title, body, bullets }: { kicker?: ReactNode; title: string; body: ReactNode; bullets?: string[] }) {
  return (
    <Reveal>
      {kicker ? <div style={{ marginBottom: 12 }}>{kicker}</div> : null}
      <H3 style={{ fontSize: 26, letterSpacing: '-0.01em' }}>{title}</H3>
      <Body>{body}</Body>
      {bullets ? (
        <Bullets>
          {bullets.map((b) => (
            <li key={b}>
              <CheckCircleFilled aria-hidden /> {b}
            </li>
          ))}
        </Bullets>
      ) : null}
    </Reveal>
  );
}

const Panel = styled(Card)`
  padding: ${({ theme }) => theme.space[5]}px;
  min-width: 0;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    padding: ${({ theme }) => theme.space[6]}px;
  }
`;

const PanelHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.space[4]}px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & strong {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
`;

const Anim = styled.div<{ $on: boolean; $d: number }>`
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;

const Mono = styled.code`
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 12px;
`;

/* ---------- Import ---------- */

const MapGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px 10px;
  align-items: center;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  & .anticon {
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: 11px;
  }
`;

const ReviewRow = styled(Anim)<{ $dup?: boolean }>`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 4px 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  border: 1px solid ${({ theme, $dup }) => ($dup ? theme.colors.warning : theme.colors.borderSubtle)};
  background: ${({ theme }) => theme.colors.bgSurface};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  & + & {
    margin-top: 8px;
  }
  & small {
    grid-column: 2 / -1;
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
  }
  & s {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Commit = styled(Anim)`
  margin-top: ${({ theme }) => theme.space[4]}px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: ${({ theme }) => theme.space[4]}px;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & > span:last-child {
    padding: 6px 14px;
    border-radius: ${({ theme }) => theme.radii.md}px;
    background: ${({ theme }) => theme.colors.brand};
    color: ${({ theme }) => theme.colors.bgSurface};
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
`;

function ImportIllustration() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  return (
    <Panel ref={ref} role="img" aria-label="Import review screen: an HDFC PDF statement with 42 rows, columns mapped, one duplicate flagged and skipped, and a button to commit 41 transactions">
      <div aria-hidden>
        <PanelHead>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <FilePdfOutlined style={{ color: theme.colors.expense, fontSize: 18 }} />
            <strong>hdfc_statement_aug.pdf</strong>
          </span>
          <Pill $tone="muted">42 rows parsed</Pill>
        </PanelHead>
        <Anim $on={on} $d={0}>
          <MapGrid>
            <span>Txn Date</span>
            <ArrowRightOutlined />
            <Pill>date</Pill>
            <span>Narration</span>
            <ArrowRightOutlined />
            <Pill>description</Pill>
            <span>Withdrawal Amt.</span>
            <ArrowRightOutlined />
            <Pill>amount</Pill>
          </MapGrid>
        </Anim>
        <div style={{ marginTop: 16 }}>
          <ReviewRow $on={on} $d={300}>
            <CheckCircleFilled style={{ color: theme.colors.income }} />
            <span>UPI/Zepto Groceries</span>
            <span style={{ color: theme.colors.expense, fontVariantNumeric: 'tabular-nums' }}>−₹1,284</span>
            <small>12 Aug · New</small>
          </ReviewRow>
          <ReviewRow $on={on} $d={450} $dup>
            <WarningFilled style={{ color: theme.colors.warning }} />
            <s>NEFT Rent — Landlord</s>
            <Pill $tone="warning">Duplicate · skipped</Pill>
            <small>01 Aug · already in ledger from July import</small>
          </ReviewRow>
          <ReviewRow $on={on} $d={600}>
            <CheckCircleFilled style={{ color: theme.colors.income }} />
            <span>Salary credit</span>
            <span style={{ color: theme.colors.income, fontVariantNumeric: 'tabular-nums' }}>+₹1,45,000</span>
            <small>31 Aug · New</small>
          </ReviewRow>
        </div>
        <Commit $on={on} $d={850}>
          <span>Ledger untouched until you commit</span>
          <span>Commit 41 transactions</span>
        </Commit>
      </div>
    </Panel>
  );
}

/* ---------- Categorization ---------- */

const Cascade = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
`;

const Stage = styled.li<{ $on: boolean; $d: number; $hit?: boolean; $skip?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  border: 1px solid ${({ theme, $hit }) => ($hit ? theme.colors.brand : theme.colors.borderSubtle)};
  background: ${({ theme, $hit }) => ($hit ? theme.colors.brandSubtle : theme.colors.bgSurface)};
  color: ${({ theme, $skip }) => ($skip ? theme.colors.textMuted : theme.colors.textPrimary)};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
  & > span:first-child {
    display: inline-flex;
    gap: 10px;
    align-items: center;
  }
  & b {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 11px;
    background: ${({ theme, $hit }) => ($hit ? theme.colors.brand : theme.colors.bgMuted)};
    color: ${({ theme, $hit }) => ($hit ? theme.colors.bgSurface : theme.colors.textSecondary)};
  }
`;

const TxChip = styled(Anim)`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Result = styled.div<{ $on: boolean }>`
  animation-name: ${popIn};
  ${({ $on }) => play($on, 1100, '500ms')}
`;

function RulesIllustration() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  return (
    <Panel ref={ref} role="img" aria-label="Categorization cascade: the transaction SWIGGY*ORDER 8812 for ₹486 skips user rules, matches a known merchant, and is categorized as Food and dining; history and AI are not needed">
      <div aria-hidden>
        <TxChip $on={on} $d={0}>
          <Mono>SWIGGY*ORDER 8812 BLR</Mono>
          <span style={{ color: theme.colors.expense, fontWeight: 600 }}>−₹486</span>
        </TxChip>
        <Cascade>
          <Stage $on={on} $d={200} $skip>
            <span>
              <b>1</b> Your rules
            </span>
            <span>no match</span>
          </Stage>
          <Stage $on={on} $d={400} $hit>
            <span>
              <b>2</b> Known merchants
            </span>
            <Result $on={on}>
              <Pill $tone="warning" style={{ background: theme.colors.bgSurface }}>
                Food &amp; dining
              </Pill>
            </Result>
          </Stage>
          <Stage $on={on} $d={600} $skip>
            <span>
              <b>3</b> Your history
            </span>
            <span>not needed</span>
          </Stage>
          <Stage $on={on} $d={800} $skip>
            <span>
              <b>4</b> AI suggestion
            </span>
            <span>optional · off</span>
          </Stage>
        </Cascade>
      </div>
    </Panel>
  );
}

/* ---------- Analytics ---------- */

const ChartGrid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[5]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  /* Equal-height cards with the chart in a fixed-height area and the legend pinned to the bottom. */
  align-items: stretch;
  & > * {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
`;

/** Fixed-height area so all analytics charts render at the same size. */
const ChartArea = styled.div<{ $h?: number }>`
  height: ${({ $h = 200 }) => $h}px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  & > svg {
    max-width: 100%;
  }
`;

const Spacer = styled.div`
  flex: 1;
`;

const LegendRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 12px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  & i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
`;

const BigNum = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']}px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-variant-numeric: tabular-nums;
  margin-bottom: 8px;
`;

function Analytics() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>(0.2);
  return (
    <ChartGrid ref={ref}>
      <Panel>
        <PanelHead>
          <strong>Income vs expenses</strong>
          <span>Last 6 months</span>
        </PanelHead>
        <ChartArea>
          <IncomeExpenseBars on={on} />
        </ChartArea>
        <Spacer />
        <LegendRow>
          <span>
            <i style={{ background: theme.colors.income }} /> Income
          </span>
          <span>
            <i style={{ background: theme.colors.expense }} /> Expenses
          </span>
        </LegendRow>
      </Panel>
      <Panel>
        <PanelHead>
          <strong>Spending by category</strong>
          <span>Sep</span>
        </PanelHead>
        <ChartArea>
          <CategoryDonut on={on} size={170} />
        </ChartArea>
        <Spacer />
        <LegendRow>
          {categories.map((c) => (
            <span key={c.name}>
              <i style={{ background: theme.colors[c.key] }} /> {c.name}
            </span>
          ))}
        </LegendRow>
      </Panel>
      <Panel>
        <PanelHead>
          <strong>Net worth</strong>
          <span>Assets − liabilities</span>
        </PanelHead>
        <BigNum>₹14,52,380</BigNum>
        <ChartArea $h={160}>
          <NetWorthLine on={on} />
        </ChartArea>
        <Spacer />
        <LegendRow>
          <span>
            <i style={{ background: theme.colors.brand }} /> Net worth, last 12 months
          </span>
        </LegendRow>
      </Panel>
    </ChartGrid>
  );
}

/* ---------- Transfers ---------- */

const flowDraw = styled.path<{ $on: boolean }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on }) => play($on, 300, '1000ms')}
`;
const FlowPath = flowDraw;

const FadeG = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;

const Totals = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: ${({ theme }) => theme.space[4]}px;
`;

const Total = styled(Anim)<{ $tone: 'income' | 'expense' | 'transfer' }>`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  font-size: ${({ theme }) => theme.typography.fontSize.xs}px;
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 0;
  & strong {
    display: block;
    margin-top: 2px;
    font-size: clamp(13px, 2.4vw, 16px);
    color: ${({ theme, $tone }) => theme.colors[$tone]};
    font-variant-numeric: tabular-nums;
  }
`;

function TransfersIllustration() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  const box = (x: number, label: string, sub: string) => (
    <g>
      <rect x={x} y={20} width={130} height={64} rx={10} fill={theme.colors.bgSurface} stroke={theme.colors.border} />
      <text x={x + 65} y={48} textAnchor="middle" fontSize={13} fontWeight={600} fill={theme.colors.textPrimary}>
        {label}
      </text>
      <text x={x + 65} y={67} textAnchor="middle" fontSize={11} fill={theme.colors.textSecondary}>
        {sub}
      </text>
    </g>
  );
  return (
    <Panel ref={ref}>
      <svg viewBox="0 0 400 96" width="100%" role="img" aria-label="A ₹32,400 transfer from HDFC Savings to ICICI Credit Card, marked as a transfer and excluded from income and expenses">
        {box(6, 'HDFC Savings', 'Bank account')}
        {box(264, 'ICICI Card', 'Credit card')}
        <FlowPath $on={on} d="M140 52 L258 52" pathLength={1} stroke={theme.colors.transfer} strokeWidth={2.5} fill="none" />
        <FadeG $on={on} $d={1100}>
          <path d="M250 46 L260 52 L250 58" stroke={theme.colors.transfer} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </FadeG>
        <FadeG $on={on} $d={700}>
          <rect x={160} y={28} width={80} height={18} rx={9} fill={theme.colors.bgMuted} />
          <text x={200} y={41} textAnchor="middle" fontSize={11} fontWeight={600} fill={theme.colors.transfer}>
            ₹32,400
          </text>
          <text x={200} y={74} textAnchor="middle" fontSize={11} fill={theme.colors.textSecondary}>
            Transfer
          </text>
        </FadeG>
      </svg>
      <Totals aria-label="August totals">
        <Total $on={on} $d={900} $tone="income">
          Income
          <strong>₹1,45,000</strong>
        </Total>
        <Total $on={on} $d={1000} $tone="expense">
          Expenses
          <strong>₹86,200</strong>
        </Total>
        <Total $on={on} $d={1100} $tone="transfer">
          Transfers
          <strong>
            <SwapOutlined aria-hidden /> excluded
          </strong>
        </Total>
      </Totals>
    </Panel>
  );
}

/* ---------- Scenarios ---------- */

const Buffer = styled.line<{ $on: boolean }>`
  animation-name: ${fadeIn};
  ${({ $on }) => play($on, 200, '600ms')}
`;

const BarFill = styled.div<{ $on: boolean; $w: number; $d: number }>`
  height: 8px;
  width: ${({ $w }) => $w}%;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.brand};
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '900ms')}
`;

function ScenarioIllustration() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  const w = 320;
  const h = 130;
  const base = [72, 78, 84, 90, 96, 102];
  const withBuy = [72, 38, 44, 50, 56, 62];
  const x = (i: number) => 10 + (i * (w - 20)) / 5;
  const y = (v: number) => h - 20 - (v / 110) * (h - 30);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <Panel ref={ref}>
      <PanelHead>
        <strong>“Can I afford a ₹70,000 purchase?”</strong>
        <Pill $tone="warning">Coming soon</Pill>
      </PanelHead>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Projected cash balance over six months with and without a ₹70,000 purchase; with the purchase the balance dips but stays above the safety buffer and recovers">
        <Buffer $on={on} x1={0} x2={w} y1={y(30)} y2={y(30)} stroke={theme.colors.warning} strokeDasharray="5 5" />
        <text x={w - 4} y={y(30) + 14} textAnchor="end" fontSize={10} fill={theme.colors.textSecondary}>
          Safety buffer
        </text>
        <FlowPath $on={on} d={path(base)} pathLength={1} fill="none" stroke={theme.colors.textMuted} strokeWidth={2} strokeLinecap="round" />
        <FlowPath $on={on} d={path(withBuy)} pathLength={1} fill="none" stroke={theme.colors.brand} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {['Now', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'].map((m, i) => (
          <text key={m} x={x(i)} y={h - 4} fontSize={10} textAnchor={i === 0 ? 'start' : i === 5 ? 'end' : 'middle'} fill={theme.colors.textMuted}>
            {m}
          </text>
        ))}
      </svg>
      <LegendRow>
        <span>
          <i style={{ background: theme.colors.textMuted }} /> Current path
        </span>
        <span>
          <i style={{ background: theme.colors.brand }} /> With purchase
        </span>
      </LegendRow>
      <div style={{ marginTop: 16, display: 'grid', gap: 10, fontSize: 13, color: theme.colors.textSecondary }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Buffer months after purchase</span>
            <strong style={{ color: theme.colors.textPrimary }}>4.1</strong>
          </div>
          <BarFill $on={on} $w={68} $d={600} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>What if rent goes up by ₹10,000?</span>
            <strong style={{ color: theme.colors.textPrimary }}>−₹1,20,000 / yr</strong>
          </div>
          <BarFill $on={on} $w={42} $d={800} />
        </div>
      </div>
    </Panel>
  );
}

/* ---------- AI with provenance ---------- */

const Chat = styled.div`
  display: grid;
  gap: 12px;
`;

const Bubble = styled(Anim)<{ $me?: boolean }>`
  justify-self: ${({ $me }) => ($me ? 'end' : 'start')};
  max-width: 92%;
  padding: 12px 14px;
  border-radius: 14px;
  border-bottom-right-radius: ${({ $me }) => ($me ? '4px' : '14px')};
  border-bottom-left-radius: ${({ $me }) => ($me ? '14px' : '4px')};
  font-size: 14px;
  line-height: 1.55;
  background: ${({ theme, $me }) => ($me ? theme.colors.brand : theme.colors.bgMuted)};
  color: ${({ theme, $me }) => ($me ? theme.colors.bgSurface : theme.colors.textPrimary)};
`;

const Provenance = styled(Anim)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & .anticon {
    color: ${({ theme }) => theme.colors.brand};
  }
`;

function AskIllustration() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  return (
    <Panel ref={ref}>
      <Chat aria-label="Example conversation with Arvo's assistant" role="group">
        <Bubble $on={on} $d={0} $me>
          Why was my spending higher in August?
        </Bubble>
        <Bubble $on={on} $d={600}>
          You spent <strong style={{ color: theme.colors.expense }}>₹1,12,000</strong> in August, ₹15,000 more than July. Most
          of the increase is <strong>Travel</strong> (+₹11,800, the Goa trip) and <strong>Shopping</strong> (+₹4,100). Rent and
          groceries were flat.
          <Provenance $on={on} $d={1000}>
            <DatabaseOutlined aria-hidden />
            <span>
              Data used: <strong style={{ color: theme.colors.textPrimary }}>127 transactions, 2 accounts</strong>
            </span>
            <Pill $tone="muted">Calculated by Arvo</Pill>
          </Provenance>
        </Bubble>
      </Chat>
    </Panel>
  );
}

/* ---------- section ---------- */

export function Features() {
  return (
    <SectionShell id="features" aria-labelledby="features-title">
      <Container>
        <SectionHeading
          id="features-title"
          eyebrow="Features"
          title="Everything you need to see your money clearly"
          lead="Every chart, total and answer comes from the same record of your transactions, calculated the same way every time."
        />

        <Row>
          <Copy
            title="Statement imports you can trust"
            body="Import bank and card statements as spreadsheets or PDFs. Match up the columns once, review every row, and Arvo catches transactions you already imported."
            bullets={["Map any bank's columns to date, description and amount", 'Review step before anything is saved', 'Nothing touches the ledger until you commit']}
          />
          <ImportIllustration />
        </Row>

        <Row $flip>
          <Copy
            title="Categorization that follows your rules"
            body="Arvo categorizes in a predictable order: your rules first, then known merchants, then your own history. An AI suggestion is an optional last step, never a black box."
            bullets={['Rules you write always win', 'Learns from how you categorized before', 'AI fallback is opt-in']}
          />
          <RulesIllustration />
        </Row>

        <Reveal>
          <div style={{ margin: '96px 0 32px' }}>
            <H3 style={{ fontSize: 26, letterSpacing: '-0.01em' }}>Analytics without the spreadsheet</H3>
            <Body style={{ maxWidth: 640 }}>
              Income, expenses and cash flow by month, spending by category, and net worth across bank, card, cash, broker and
              loan accounts.
            </Body>
          </div>
        </Reveal>
        <Analytics />

        <div style={{ height: 96 }} />

        <Row>
          <Copy
            title="Transfers aren't spending"
            body="Paying your credit card from your bank account moves money, it doesn't spend it. Arvo marks transfers between your accounts so they never inflate income or expenses."
          />
          <TransfersIllustration />
        </Row>

        <Row $flip>
          <Copy
            kicker={<Pill $tone="warning">In progress</Pill>}
            title="Scenarios before big decisions"
            body="Recurring expense detection and what-if scenarios are on the way: “Can I afford a ₹70,000 purchase?” or “What if rent goes up by ₹10,000?”, answered with the same math as your dashboard."
          />
          <ScenarioIllustration />
        </Row>

        <Row>
          <Copy
            title="Ask, with receipts"
            body="Ask about your finances in plain language. The AI only explains numbers Arvo calculated, never invents data, and shows exactly what it used."
            bullets={['Answers cite transactions and accounts used', 'Use a private AI on your own computer', 'Cloud AI is optional, and Arvo tells you when it is used']}
          />
          <AskIllustration />
        </Row>
      </Container>
    </SectionShell>
  );
}
