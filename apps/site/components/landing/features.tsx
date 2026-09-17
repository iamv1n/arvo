'use client';

import { useState, type ReactNode } from 'react';
import styled, { css, keyframes, useTheme } from 'styled-components';
import { AnalyticsShowcase } from './analytics-showcase';
import { drawStroke, fadeIn, fadeUp, formatINR, growX, play, popIn, useCountUp, useInView } from './motion';
import { Container, fonts, Pill, Reveal, SectionHeading, SectionShell } from './primitives';

/*
 * Five features, five different objects: a statement fed through a sorter, a sieve, a pair of
 * ledgers on a balance, a runway you can push around, and an answer pinned to its receipts.
 */

/* ---------- shared editorial bits ---------- */

const Block = styled.article`
  position: relative;
  padding-top: ${({ theme }) => theme.space[6]}px;
  border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  & + & {
    margin-top: ${({ theme }) => theme.space[16]}px;
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    & + & {
      margin-top: 112px;
    }
  }
`;

const HeadGrid = styled.header<{ $center?: boolean }>`
  display: grid;
  gap: ${({ theme }) => theme.space[3]}px;
  margin-bottom: ${({ theme }) => theme.space[8]}px;
  ${({ $center }) =>
    $center &&
    css`
      text-align: center;
      justify-items: center;
    `}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    ${({ $center }) =>
      !$center &&
      css`
        grid-template-columns: 90px 1fr auto;
        align-items: end;
        gap: 24px;
      `}
  }
`;

const Num = styled.span`
  font-family: ${fonts.mono};
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Title = styled.h3`
  margin: 0;
  font-family: ${fonts.serif};
  font-weight: 500;
  font-size: clamp(24px, 3.2vw, 34px);
  line-height: 1.02;
  letter-spacing: -0.025em;
  color: ${({ theme }) => theme.colors.textPrimary};
  & em {
    font-style: italic;
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const Hand = styled.p<{ $tilt?: number }>`
  margin: 0;
  max-width: 30ch;
  font-family: ${fonts.hand};
  font-size: 23px;
  line-height: 1.15;
  color: ${({ theme }) => theme.colors.textSecondary};
  transform: rotate(${({ $tilt = -2 }) => $tilt}deg);
`;

const Label = styled.span`
  font-family: ${fonts.mono};
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

function Head({ n, title, note, center, aside }: { n: string; title: ReactNode; note: string; center?: boolean; aside?: ReactNode }) {
  return (
    <Reveal>
      <HeadGrid $center={center}>
        <Num>{n}</Num>
        <div style={{ display: 'grid', gap: 10, justifyItems: center ? 'center' : 'start' }}>
          {aside}
          <Title>{title}</Title>
        </div>
        <Hand>{note}</Hand>
      </HeadGrid>
    </Reveal>
  );
}

const Fade = styled.div<{ $on: boolean; $d: number }>`
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;

/* ---------- 01 Import: the sorter ---------- */

const Sorter = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: center;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: minmax(0, 1.2fr) 40px minmax(0, 1fr);
  }
`;

const Paper = styled.div`
  position: relative;
  padding: 18px 18px 26px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  transform: rotate(-1deg);
  min-width: 0;
  /* torn bottom edge */
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 8px;
    border-bottom: 2px dashed ${({ theme }) => theme.colors.border};
  }
`;

const MapLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  padding-bottom: 10px;
  margin-bottom: 8px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.textPrimary};
  font-family: ${fonts.mono};
  font-size: 10.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  & b {
    color: ${({ theme }) => theme.colors.brandText};
    font-weight: 600;
  }
`;

const slideAway = keyframes`
  0% { opacity: 1; transform: none; }
  100% { opacity: 0.35; transform: translateX(10px); }
`;

const StRow = styled.div<{ $on: boolean; $d: number; $dup?: boolean }>`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  font-family: ${fonts.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-variant-numeric: tabular-nums;
  & span:nth-child(2) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${({ $dup, theme }) =>
    $dup &&
    css`
      text-decoration: line-through;
      text-decoration-color: ${theme.colors.warning};
      color: ${theme.colors.textMuted};
    `}
  animation-name: ${slideAway};
  ${({ $on, $d }) => play($on, $d, '500ms')}
  animation-fill-mode: forwards;
`;

const Slot = styled.div`
  display: grid;
  place-items: center;
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: ${fonts.mono};
  font-size: 20px;
  @media (max-width: ${({ theme }) => theme.breakpoints.md - 1}px) {
    transform: rotate(90deg);
  }
`;

const Trays = styled.div`
  display: grid;
  gap: 14px;
`;

const Tray = styled.div<{ $tone: 'brand' | 'warning' }>`
  padding: 14px 18px 12px;
  border: 2px solid ${({ theme, $tone }) => ($tone === 'brand' ? theme.colors.textPrimary : theme.colors.warning)};
  border-top-width: 0;
  border-radius: 0 0 6px 6px;
  background: ${({ theme }) => theme.colors.bgSurface};
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  & strong {
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: clamp(32px, 5vw, 44px);
    line-height: 1;
    letter-spacing: -0.03em;
    color: ${({ theme, $tone }) => ($tone === 'brand' ? theme.colors.brandText : theme.colors.warning)};
    font-variant-numeric: tabular-nums;
  }
`;

const STATEMENT = [
  ['12 Aug', 'UPI/ZEPTO GROCERIES', '−1,284'],
  ['14 Aug', 'POS AMAZON RETAIL', '−2,199'],
  ['01 Aug', 'NEFT RENT LANDLORD', '−28,000', 'dup'],
  ['22 Aug', 'UPI/UBER RIDES', '−342'],
  ['31 Aug', 'SALARY CREDIT', '+1,45,000'],
] as const;

function ImportFeature() {
  const [ref, on] = useInView<HTMLDivElement>();
  const accepted = useCountUp(41, on, 1600);
  const dups = useCountUp(1, on, 900);
  return (
    <Block>
      <Head n="Feature 01" title={<>Statement imports <em>you can trust</em></>} note="PDF or spreadsheet. Map columns once, review every row." />
      <Sorter ref={ref} role="img" aria-label="An HDFC PDF statement with 42 rows is sorted: 41 new transactions accepted, 1 duplicate rent payment skipped. Nothing touches the ledger until you commit.">
        <Paper aria-hidden>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <Label>hdfc_statement_aug.pdf</Label>
            <Label>42 rows</Label>
          </div>
          <MapLine>
            <span>Txn Date → <b>date</b></span>
            <span>Narration → <b>description</b></span>
            <span>Withdrawal → <b>amount</b></span>
          </MapLine>
          {STATEMENT.map(([d, desc, amt, dup], i) => (
            <StRow key={desc} $on={on} $d={500 + i * 220} $dup={dup === 'dup'}>
              <span>{d}</span>
              <span>{desc}</span>
              <span>{amt}</span>
            </StRow>
          ))}
        </Paper>
        <Slot aria-hidden>→</Slot>
        <Trays aria-hidden>
          <Tray $tone="brand">
            <div>
              <Label>Accepted</Label>
              <div style={{ marginTop: 4 }}>
                <Label>new rows</Label>
              </div>
            </div>
            <strong>{accepted}</strong>
          </Tray>
          <Tray $tone="warning">
            <div>
              <Label>Duplicate</Label>
              <div style={{ marginTop: 4 }}>
                <Label>rent, from July</Label>
              </div>
            </div>
            <strong>{dups}</strong>
          </Tray>
          <Hand $tilt={1.5} style={{ justifySelf: 'end', textAlign: 'right' }}>
            ledger untouched until you commit
          </Hand>
        </Trays>
      </Sorter>
    </Block>
  );
}

/* ---------- 02 Rules: the sieve ---------- */

const drop = keyframes`
  0% { opacity: 0; transform: translateY(-40px); }
  60% { opacity: 1; transform: translateY(0); }
  100% { opacity: 1; transform: none; }
`;

const stamp = keyframes`
  0% { opacity: 0; transform: rotate(-8deg) scale(1.8); }
  100% { opacity: 1; transform: rotate(-8deg) scale(1); }
`;

const Sieve = styled.div`
  display: grid;
  justify-items: center;
  gap: 10px;
  max-width: 620px;
  margin: 0 auto;
`;

const Coin = styled.div<{ $on: boolean }>`
  display: inline-flex;
  gap: 14px;
  align-items: baseline;
  padding: 10px 16px;
  border: 2px solid ${({ theme }) => theme.colors.textPrimary};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  font-family: ${fonts.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  animation-name: ${drop};
  ${({ $on }) => play($on, 0, '900ms')}
  & b {
    font-family: ${fonts.serif};
    font-size: 20px;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.expense};
  }
`;

const Filter = styled.div<{ $w: number; $state: 'pass' | 'hit' | 'idle'; $on: boolean; $d: number }>`
  position: relative;
  width: ${({ $w }) => $w}%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 3px;
  font-size: 14px;
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '500ms')}
  ${({ theme, $state }) =>
    $state === 'hit'
      ? css`
          border: 2px solid ${theme.colors.textPrimary};
          background: ${theme.colors.brandSubtle};
          color: ${theme.colors.textPrimary};
        `
      : css`
          border: 1px dashed ${theme.colors.border};
          background: ${theme.colors.bgSurface};
          color: ${$state === 'pass' ? theme.colors.textSecondary : theme.colors.textMuted};
          opacity: ${$state === 'idle' ? 0.55 : 1};
        `}
  & > span:first-child {
    display: inline-flex;
    gap: 10px;
    align-items: baseline;
  }
`;

const Stamp = styled.span<{ $on: boolean }>`
  display: inline-block;
  padding: 3px 10px;
  border: 2px solid ${({ theme }) => theme.colors.brandText};
  border-radius: 4px;
  font-family: ${fonts.mono};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.brandText};
  white-space: nowrap;
  animation-name: ${stamp};
  ${({ $on }) => play($on, 1500, '350ms')}
`;

const FILTERS = [
  { name: 'Your rules', w: 100, state: 'pass', side: 'no match' },
  { name: 'Known merchants', w: 88, state: 'hit', side: '' },
  { name: 'Your history', w: 76, state: 'idle', side: 'not reached' },
  { name: 'AI suggestion', w: 64, state: 'idle', side: 'opt-in' },
] as const;

function RulesFeature() {
  const [ref, on] = useInView<HTMLDivElement>();
  return (
    <Block>
      <Head center n="Feature 02" title={<>Categorization that <em>follows your rules</em></>} note="Same order every time. AI is the last, optional step." />
      <Sieve ref={ref} role="img" aria-label="A ₹486 Swiggy transaction drops through four filters: your rules (no match), known merchants (caught, tagged Food and dining), your history and AI suggestion are never reached.">
        <Coin $on={on} aria-hidden>
          SWIGGY*ORDER 8812 <b>−₹486</b>
        </Coin>
        <div aria-hidden style={{ height: 18, borderLeft: '2px dotted currentColor', opacity: 0.4 }} />
        {FILTERS.map((f, i) => (
          <Filter key={f.name} aria-hidden $w={f.w} $state={f.state} $on={on} $d={200 + i * 150}>
            <span>
              <Label>0{i + 1}</Label> {f.name}
            </span>
            {f.state === 'hit' ? <Stamp $on={on}>Food &amp; dining</Stamp> : <Label>{f.side}</Label>}
          </Filter>
        ))}
        <Hand $tilt={-1} style={{ marginTop: 8 }} aria-hidden>
          your rules always win ↑
        </Hand>
      </Sieve>
    </Block>
  );
}

/* ---------- 03 Transfers: two ledgers on a balance ---------- */

const Ledgers = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    align-items: center;
  }
`;

const Figures = styled.dl`
  margin: 0;
  display: grid;
  gap: 0;
  & > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
  & dt {
    margin: 0;
  }
  & dd {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: clamp(18px, 2.4vw, 24px);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
`;

const Strike = styled.span<{ $on: boolean }>`
  position: relative;
  color: ${({ theme }) => theme.colors.textMuted};
  &::after {
    content: '';
    position: absolute;
    left: -4px;
    right: -4px;
    top: 52%;
    height: 3px;
    background: ${({ theme }) => theme.colors.transfer};
    transform-origin: left;
    animation-name: ${growX};
    ${({ $on }) => play($on, 1300, '500ms')}
  }
`;

const DrawPath = styled.path<{ $on: boolean; $d?: number }>`
  stroke-dasharray: 1;
  animation-name: ${drawStroke};
  ${({ $on, $d = 300 }) => play($on, $d, '1000ms')}
`;

const FadeG = styled.g<{ $on: boolean; $d: number }>`
  animation-name: ${fadeIn};
  ${({ $on, $d }) => play($on, $d, '600ms')}
`;

function TransfersFeature() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  const ink = theme.colors.textPrimary;
  const pan = (cx: number, label: string, sub: string) => (
    <g>
      <line x1={cx} y1={60} x2={cx - 50} y2={120} stroke={theme.colors.textMuted} />
      <line x1={cx} y1={60} x2={cx + 50} y2={120} stroke={theme.colors.textMuted} />
      <rect x={cx - 62} y={120} width={124} height={62} rx={3} fill={theme.colors.bgSurfaceRaised} stroke={ink} strokeWidth={2} />
      <text x={cx} y={146} textAnchor="middle" fontSize={13} fontWeight={600} fill={ink}>
        {label}
      </text>
      <text x={cx} y={166} textAnchor="middle" fontSize={11} fontFamily={fonts.mono} fill={theme.colors.textSecondary}>
        {sub}
      </text>
    </g>
  );
  return (
    <Block>
      <Head n="Feature 03" title={<>Transfers <em>aren&rsquo;t spending</em></>} note="Paying your card moves money. It doesn't spend it." />
      <Ledgers ref={ref}>
        <svg viewBox="0 0 400 230" width="100%" style={{ maxWidth: 400, display: 'block', margin: '0 auto' }} role="img" aria-label="A balance with HDFC Savings on one pan and ICICI Card on the other; a ₹32,400 transfer moves between them and the beam stays level.">
          <path d="M200 30 L200 214 M160 214 L240 214" stroke={ink} strokeWidth={2} fill="none" />
          <line x1={80} y1={60} x2={320} y2={60} stroke={ink} strokeWidth={3} strokeLinecap="round" />
          <circle cx={200} cy={60} r={6} fill={theme.colors.bgCanvas} stroke={ink} strokeWidth={2} />
          {pan(80, 'HDFC Savings', '−₹32,400')}
          {pan(320, 'ICICI Card', '+₹32,400')}
          <DrawPath $on={on} d="M144 150 C 180 100, 220 100, 256 150" pathLength={1} fill="none" stroke={theme.colors.transfer} strokeWidth={2.5} strokeDasharray="1" />
          <FadeG $on={on} $d={1100}>
            <path d="M248 140 L257 151 L243 152" stroke={theme.colors.transfer} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <text x={200} y={100} textAnchor="middle" fontSize={16} fontFamily={fonts.serif} fill={theme.colors.transfer}>
              ₹32,400
            </text>
          </FadeG>
          <text x={200} y={20} textAnchor="middle" fontSize={10} fontFamily={fonts.mono} letterSpacing="0.1em" fill={theme.colors.textMuted}>
            STILL LEVEL
          </text>
        </svg>
        <div>
          <Label>August totals</Label>
          <Figures style={{ marginTop: 8 }}>
            <div>
              <dt><Label>Income</Label></dt>
              <dd style={{ color: theme.colors.income }}>₹1,45,000</dd>
            </div>
            <div>
              <dt><Label>Expenses</Label></dt>
              <dd style={{ color: theme.colors.expense }}>₹86,200</dd>
            </div>
            <div>
              <dt><Label>Card payment</Label></dt>
              <dd style={{ fontSize: 26 }}>
                <Strike $on={on}>₹32,400</Strike>
              </dd>
            </div>
          </Figures>
          <Hand $tilt={-1.5} style={{ marginTop: 14 }}>
            <span style={{ color: theme.colors.transfer }}>crossed out</span> of both totals
          </Hand>
        </div>
      </Ledgers>
    </Block>
  );
}

/* ---------- 04 Scenarios: a runway you can push ---------- */

const MONTHLY_SPEND = 86_200;
const BALANCE = 423_400;
const OPTIONS = [0, 35_000, 70_000, 140_000];

const Runway = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 280px minmax(0, 1fr);
    align-items: center;
    gap: ${({ theme }) => theme.space[10] ?? 40}px;
  }
`;

const Steps = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;

const Step = styled.button<{ $active: boolean }>`
  appearance: none;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 3px;
  font-family: ${fonts.mono};
  font-size: 12px;
  border: ${({ theme, $active }) => ($active ? `2px solid ${theme.colors.textPrimary}` : `1px solid ${theme.colors.border}`)};
  background: ${({ theme, $active }) => ($active ? theme.colors.brandSubtle : theme.colors.bgSurface)};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 2px;
  }
`;

const BigFig = styled.div`
  margin-top: 18px;
  font-family: ${fonts.serif};
  font-weight: 500;
  font-size: clamp(40px, 6vw, 56px);
  line-height: 0.95;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.textPrimary};
  & small {
    font-size: 0.32em;
    letter-spacing: 0;
    margin-left: 8px;
    font-style: italic;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Shift = styled.g<{ $dy: number }>`
  transform: translateY(${({ $dy }) => $dy}px);
  transition: transform 600ms cubic-bezier(0.2, 0, 0, 1);
`;

function ScenarioFeature() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  const [purchase, setPurchase] = useState(70_000);
  const months = (BALANCE - purchase) / MONTHLY_SPEND;
  const safe = months >= 3;
  const W = 520;
  const H = 180;
  const x = (i: number) => 20 + (i * (W - 40)) / 5;
  const y = (m: number) => H - 30 - (m / 7) * (H - 50);
  const baseMonths = BALANCE / MONTHLY_SPEND;
  const pts = [0, 1, 2, 3, 4, 5].map((i) => baseMonths + i * 0.25);
  const path = pts.map((m, i) => `${i ? 'L' : 'M'}${x(i)} ${y(m).toFixed(1)}`).join(' ');
  const dy = y(baseMonths - purchase / MONTHLY_SPEND) - y(baseMonths);
  const lineColor = safe ? theme.colors.brand : theme.colors.expense;
  return (
    <Block>
      <Head
        n="Feature 04"
        aside={<Pill $tone="warning">In progress</Pill>}
        title={<>Scenarios <em>before big decisions</em></>}
        note="What if rent goes up by ₹10,000? That's −₹1,20,000 a year."
      />
      <Runway ref={ref}>
        <div>
          <Label>Can I afford a purchase of</Label>
          <Steps role="group" aria-label="Purchase amount">
            {OPTIONS.map((o) => (
              <Step key={o} type="button" $active={o === purchase} aria-pressed={o === purchase} onClick={() => setPurchase(o)}>
                {o === 0 ? 'nothing' : formatINR(o)}
              </Step>
            ))}
          </Steps>
          <BigFig aria-live="polite">
            {months.toFixed(1)}
            <small>months of buffer</small>
          </BigFig>
          <Hand $tilt={-1.5} style={{ marginTop: 10, color: safe ? theme.colors.brandText : theme.colors.expense }}>
            {safe ? 'dips, stays above the line' : 'below your safety buffer'}
          </Hand>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Projected buffer over six months after a ${formatINR(purchase)} purchase: starts at ${months.toFixed(1)} months against a 3-month safety buffer.`}>
          <FadeG $on={on} $d={200}>
            <line x1={0} x2={W} y1={y(3)} y2={y(3)} stroke={theme.colors.warning} strokeDasharray="6 6" strokeWidth={1.5} />
            <text x={W - 4} y={y(3) + 16} textAnchor="end" fontSize={11} fontFamily={fonts.mono} fill={theme.colors.textSecondary}>
              SAFETY BUFFER · 3 MO
            </text>
          </FadeG>
          <path d={path} fill="none" stroke={theme.colors.textMuted} strokeWidth={1.5} strokeDasharray="3 4" />
          <Shift $dy={dy}>
            <DrawPath $on={on} d={path} pathLength={1} fill="none" stroke={lineColor} strokeWidth={3} strokeLinecap="round" />
            <circle cx={x(0)} cy={y(baseMonths)} r={5} fill={lineColor} />
          </Shift>
          <line x1={0} x2={W} y1={H - 30} y2={H - 30} stroke={theme.colors.textPrimary} strokeWidth={2} />
          {['Now', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'].map((m, i) => (
            <text key={m} x={x(i)} y={H - 10} fontSize={11} fontFamily={fonts.mono} textAnchor="middle" fill={theme.colors.textMuted}>
              {m.toUpperCase()}
            </text>
          ))}
        </svg>
      </Runway>
    </Block>
  );
}

/* ---------- 05 Ask: answer pinned to its receipts ---------- */

const AskGrid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    align-items: start;
  }
`;

const Answer = styled.div`
  font-family: ${fonts.serif};
  font-size: clamp(18px, 2.4vw, 24px);
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.colors.textPrimary};
  & q {
    display: block;
    margin-bottom: 14px;
    font-family: ${fonts.hand};
    font-size: 26px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Cite = styled.button<{ $active: boolean }>`
  appearance: none;
  border: 0;
  padding: 0 3px;
  margin-left: 1px;
  vertical-align: super;
  cursor: pointer;
  font-family: ${fonts.mono};
  font-size: 11px;
  line-height: 1;
  border-radius: 2px;
  background: ${({ theme, $active }) => ($active ? theme.colors.brand : theme.colors.brandSubtle)};
  color: ${({ theme, $active }) => ($active ? theme.colors.bgSurface : theme.colors.brandText)};
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 2px;
  }
`;

const Strip = styled.ol`
  list-style: none;
  margin: 0;
  padding: 18px 18px 8px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  border-radius: 0 0 4px 4px;
  transform: rotate(1deg);
  font-family: ${fonts.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Receipt = styled.li<{ $active: boolean; $on: boolean; $d: number }>`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 8px;
  padding: 9px 6px;
  border-bottom: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: 2px;
  background: ${({ theme, $active }) => ($active ? theme.colors.brandSubtle : 'transparent')};
  transition: background 200ms;
  font-variant-numeric: tabular-nums;
  animation-name: ${popIn};
  ${({ $on, $d }) => play($on, $d, '400ms')}
  & sup {
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

const RECEIPTS = [
  { id: 1, label: 'Travel · Goa trip', value: '+₹11,800' },
  { id: 2, label: 'Shopping', value: '+₹4,100' },
  { id: 3, label: 'Rent, groceries', value: 'flat' },
];

function AskFeature() {
  const theme = useTheme();
  const [ref, on] = useInView<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const cite = (id: number) => (
    <Cite
      type="button"
      $active={active === id}
      aria-label={`Source ${id}`}
      onMouseEnter={() => setActive(id)}
      onMouseLeave={() => setActive(null)}
      onFocus={() => setActive(id)}
      onBlur={() => setActive(null)}
    >
      {id}
    </Cite>
  );
  return (
    <Block>
      <Head n="Feature 05" title={<>Ask, <em>with receipts</em></>} note="The AI explains numbers Arvo calculated. It never invents them." />
      <AskGrid ref={ref}>
        <Fade $on={on} $d={0}>
          <Answer>
            <q>Why was my spending higher in August?</q>
            You spent <span style={{ color: theme.colors.expense }}>₹1,12,000</span>, ₹15,000 more than July. Mostly{' '}
            <i>Travel</i>
            {cite(1)} and <i>Shopping</i>
            {cite(2)}. Rent and groceries were flat{cite(3)}.
          </Answer>
          <Hand $tilt={-1} style={{ marginTop: 18 }}>
            private AI on your own computer; cloud is optional, and flagged
          </Hand>
        </Fade>
        <div>
          <Strip aria-label="Cited data">
            {RECEIPTS.map((r, i) => (
              <Receipt key={r.id} $active={active === r.id} $on={on} $d={700 + i * 200}>
                <sup>[{r.id}]</sup>
                <span>{r.label}</span>
                <span>{r.value}</span>
              </Receipt>
            ))}
            <li style={{ padding: '12px 6px 8px', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <Label>127 txns · 2 accounts</Label>
              <Label style={{ color: theme.colors.brandText }}>Calculated by Arvo</Label>
            </li>
          </Strip>
        </div>
      </AskGrid>
    </Block>
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
          index="02"
          split
          title="Everything you need to see your money clearly"
          lead="Every chart, total and answer comes from the same record of your transactions, calculated the same way every time."
        />

        <ImportFeature />
        <RulesFeature />

        <div style={{ height: 112 }} />
        <AnalyticsShowcase />
        <div style={{ height: 112 }} />

        <TransfersFeature />
        <ScenarioFeature />
        <AskFeature />
      </Container>
    </SectionShell>
  );
}
