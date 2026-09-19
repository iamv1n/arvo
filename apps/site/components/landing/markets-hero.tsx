'use client';

import styled from 'styled-components';
import { OpenAppLink } from '../beta-access';
import { drawStroke, fadeUp, growX, play, useInView } from './motion';
import { Container, fonts } from './primitives';

/*
 * Markets opens on a desk blotter: one ruled sheet, four quadrants, each with a small hand-drawn
 * glyph for the four halves of the product. Nothing is a screenshot; every mark is an SVG or a
 * border, and reduced motion simply shows the finished sheet.
 */

const Section = styled.section`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  padding: ${({ theme }) => theme.space[10]}px 0 ${({ theme }) => theme.space[12]}px;
`;

const Head = styled(Container)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  & .eyebrow {
    margin: 0 0 ${({ theme }) => theme.space[4]}px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .eyebrow b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & h1 {
    margin: 0;
    max-width: 20ch;
    font-family: ${fonts.serif};
    font-weight: 450;
    font-size: clamp(32px, 2.4vw + 22px, 56px);
    line-height: 1.02;
    letter-spacing: -0.035em;
    font-variation-settings: 'opsz' 144, 'SOFT' 30;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & h1 em {
    font-style: italic;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & .hand {
    display: inline-block;
    margin-top: ${({ theme }) => theme.space[4]}px;
    font-family: ${fonts.hand};
    font-size: 25px;
    line-height: 1.1;
    transform: rotate(-1.4deg);
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & p {
    margin: ${({ theme }) => theme.space[5]}px 0 0;
    max-width: 58ch;
    font-size: 17px;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 12px 28px;
    margin-top: ${({ theme }) => theme.space[6]}px;
  }
  & .actions a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.brandText};
    text-decoration: none;
    border-bottom: 1px solid currentColor;
  }
`;

/* ---------- the blotter ---------- */

const Blotter = styled.figure<{ $on: boolean }>`
  margin: ${({ theme }) => theme.space[10]}px auto 0;
  width: 100%;
  max-width: 980px;
  border: 1px solid ${({ theme }) => theme.colors.textPrimary};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: 8px 8px 0 ${({ theme }) => theme.colors.brandSubtle};
  overflow: hidden;
  animation-name: ${fadeUp};
  ${({ $on }) => play($on, 100, '700ms')}
  & .top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.textPrimary};
    font-family: ${fonts.mono};
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .quads {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    & .quads {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
`;

const Quad = styled.div<{ $on: boolean; $d: number }>`
  min-width: 0;
  padding: 14px;
  border-right: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
  &:nth-child(2n) {
    border-right: none;
  }
  & .k {
    font-family: ${fonts.mono};
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & .v {
    display: block;
    margin-top: 2px;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 17px;
    letter-spacing: -0.015em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .art {
    height: 72px;
    margin-top: 10px;
  }
  & .note {
    display: block;
    margin-top: 8px;
    font-family: ${fonts.hand};
    font-size: 17px;
    line-height: 1.05;
    color: ${({ theme }) => theme.colors.brandText};
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.md}px) {
    border-bottom: none;
    &:nth-child(2n) {
      border-right: 1px solid ${({ theme }) => theme.colors.borderSubtle};
    }
    &:last-child {
      border-right: none;
    }
  }
`;

const Glyph = styled.svg<{ $on: boolean; $d: number }>`
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  & .stroke {
    fill: none;
    stroke: ${({ theme }) => theme.colors.brand};
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    animation-name: ${drawStroke};
    ${({ $on, $d }) => play($on, $d, '1200ms')}
  }
  & .thin {
    stroke: ${({ theme }) => theme.colors.border};
    stroke-width: 1;
    fill: none;
  }
  & .fill {
    fill: ${({ theme }) => theme.colors.brandSubtle};
  }
  & text {
    font-family: ${fonts.mono};
    font-size: 7px;
    fill: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  height: 100%;
`;

const Row = styled.span<{ $on: boolean; $d: number; $w: number; $muted?: boolean }>`
  display: block;
  height: 9px;
  width: ${({ $w }) => $w}%;
  border-radius: 2px;
  background: ${({ theme, $muted }) => ($muted ? theme.colors.border : theme.colors.brand)};
  transform-origin: left;
  animation-name: ${growX};
  ${({ $on, $d }) => play($on, $d, '700ms')}
`;

function DonutGlyph({ on, d }: { on: boolean; d: number }) {
  return (
    <Glyph viewBox="0 0 60 60" $on={on} $d={d} aria-hidden>
      <circle className="thin" cx={30} cy={30} r={20} />
      <circle
        className="stroke"
        cx={30}
        cy={30}
        r={20}
        pathLength={1}
        strokeDasharray={1}
        transform="rotate(-90 30 30)"
        style={{ strokeDashoffset: 0.38 }}
      />
    </Glyph>
  );
}

function ChargesGlyph({ on, d }: { on: boolean; d: number }) {
  return (
    <Stack aria-hidden>
      {[92, 74, 62, 55, 50].map((w, i) => (
        <Row key={w} $on={on} $d={d + i * 110} $w={w} $muted={i > 0 && i < 4} />
      ))}
    </Stack>
  );
}

function PayoffGlyph({ on, d }: { on: boolean; d: number }) {
  return (
    <Glyph viewBox="0 0 80 50" $on={on} $d={d} aria-hidden>
      <line className="thin" x1={0} y1={34} x2={80} y2={34} />
      <path className="stroke" pathLength={1} d="M2 34 L26 34 L46 12 L78 12" />
      <path className="stroke" pathLength={1} d="M2 44 L30 44 L52 44" strokeDasharray="1" opacity={0.4} />
    </Glyph>
  );
}

function AlertGlyph({ on, d }: { on: boolean; d: number }) {
  return (
    <Glyph viewBox="0 0 70 50" $on={on} $d={d} aria-hidden>
      <rect className="fill" x={2} y={8} width={30} height={14} rx={7} />
      <circle className="stroke" cx={25} cy={15} r={5} pathLength={1} />
      <rect className="fill" x={2} y={30} width={30} height={14} rx={7} />
      <circle className="stroke" cx={9} cy={37} r={5} pathLength={1} />
      <path className="stroke" pathLength={1} d="M40 16 h26 M40 26 h18 M40 36 h24" />
    </Glyph>
  );
}

const quads = [
  { k: 'Portfolio', v: 'XIRR 14.2%', note: 'after costs', Art: DonutGlyph },
  { k: 'Journal', v: 'Net of charges', note: 'to the paisa', Art: ChargesGlyph },
  { k: 'Strategy lab', v: 'Payoff & Greeks', note: 'before you act', Art: PayoffGlyph },
  { k: 'Alerts', v: 'Your own rules', note: 'with a cool-off', Art: AlertGlyph },
];

function Desk({ on }: { on: boolean }) {
  return (
    <Blotter
      $on={on}
      aria-label="Illustration: a desk blotter split into four panels — a portfolio allocation ring marked XIRR 14.2% after costs, a stack of bars shrinking as charges are deducted, an option payoff sketch, and an alert rule with its switches."
    >
      <div className="top" aria-hidden>
        <span>Arvo · Markets desk</span>
        <span>Analysis &amp; record-keeping</span>
      </div>
      <div className="quads" aria-hidden>
        {quads.map(({ k, v, note, Art }, i) => (
          <Quad key={k} $on={on} $d={300 + i * 160}>
            <span className="k">{k}</span>
            <span className="v">{v}</span>
            <div className="art">
              <Art on={on} d={500 + i * 160} />
            </div>
            <span className="note">{note}</span>
          </Quad>
        ))}
      </div>
    </Blotter>
  );
}

export function MarketsHero() {
  const [ref, on] = useInView<HTMLElement>(0.15);
  return (
    <Section ref={ref} aria-labelledby="markets-title">
      <Head>
        <p className="eyebrow">
          <b>Product 02</b> Markets
        </p>
        <h1 id="markets-title">
          Investing and trading, <em>kept honest by arithmetic</em>
        </h1>
        <span className="hand">your own records, your own numbers</span>
        <p>
          Markets is the investing half of Arvo: a portfolio built from your CAS and broker files, a
          trading journal that computes every Indian charge and tax, a lab for testing an idea
          before you act, and alerts you write yourself. It measures what you did. It never tells
          you what to buy.
        </p>
        <div className="actions">
          <OpenAppLink>Open Arvo →</OpenAppLink>
          <a href="#portfolio">See what is inside</a>
        </div>
        <Desk on={on} />
      </Head>
    </Section>
  );
}
