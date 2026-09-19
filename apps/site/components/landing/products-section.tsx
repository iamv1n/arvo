'use client';

import styled from 'styled-components';
import { PRODUCTS, type Product } from '../../lib/products';
import { ProductTheme } from './product-theme';
import { drawStroke, fadeUp, growY, play, useInView } from './motion';
import { Container, fonts, SectionHeading, SectionShell } from './primitives';

/*
 * The front door. One panel per product in lib/products.ts, each with its own small hand-built
 * picture and its own accent — copper for Money, steel indigo for Markets, exactly as the app
 * tints them. The grid takes any number of products; adding one is a data change.
 */

const Grid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[6]}px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 0;
    border-top: 2px solid ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Panel = styled.div<{ $on: boolean; $d: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
  min-width: 0;
  padding: ${({ theme }) => theme.space[5]}px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '700ms')}
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    border-top: none;
    padding: ${({ theme }) => theme.space[8]}px ${({ theme }) => theme.space[8]}px
      ${({ theme }) => theme.space[6]}px;
    border-left: 1px solid ${({ theme }) => theme.colors.border};
    &:first-child {
      padding-left: 0;
      border-left: none;
    }
    &:last-child {
      padding-right: 0;
    }
  }
  & .tag {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & .tag b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & h3 {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: clamp(24px, 3vw, 32px);
    line-height: 1.08;
    letter-spacing: -0.025em;
    font-variation-settings: 'opsz' 96;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & .note {
    display: inline-block;
    align-self: flex-start;
    font-family: ${fonts.hand};
    font-size: 23px;
    line-height: 1.1;
    transform: rotate(-1.6deg);
    color: ${({ theme }) => theme.colors.brandText};
  }
  & p {
    margin: 0;
    font-size: 15px;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
    font-size: 14px;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & li {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 8px;
  }
  & li::before {
    content: '—';
    font-family: ${fonts.mono};
    color: ${({ theme }) => theme.colors.brandText};
  }
  & .go {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    min-height: 44px;
    font-size: 17px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.brandText};
    text-decoration: none;
    border-bottom: 1px solid currentColor;
  }
  & .go:hover {
    gap: 14px;
  }
`;

const Stage = styled.div`
  height: 150px;
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  overflow: hidden;
`;

/* ---------- Money: a ledger column sorting itself into category bars ---------- */

const Ledger = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px;
  gap: 14px;
  height: 100%;
  font-family: ${fonts.mono};
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Line = styled.div<{ $on: boolean; $d: number }>`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '420ms')}
  & b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Bars = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 7px;
  height: 100%;
  padding-bottom: 2px;
`;

const Bar = styled.span<{ $on: boolean; $d: number; $h: number }>`
  flex: 1;
  height: ${({ $h }) => $h}%;
  border-radius: 2px 2px 0 0;
  background: ${({ theme }) => theme.colors.brand};
  transform-origin: bottom;
  animation-name: ${growY};
  ${({ $on, $d }) => play($on, $d, '620ms')}
  &:nth-child(even) {
    opacity: 0.55;
  }
`;

const moneyLines: [string, string][] = [
  ['UPI-SWIGGY', 'food'],
  ['POS-NETFLIX', 'recurring'],
  ['ACH-SIP-HDFC', 'transfer'],
  ['NEFT-SALARY', 'income'],
];

function MoneyArt({ on }: { on: boolean }) {
  return (
    <Ledger aria-hidden>
      <div>
        {moneyLines.map(([narration, tag], i) => (
          <Line key={narration} $on={on} $d={220 + i * 130}>
            <span>{narration}</span>
            <b>{tag}</b>
          </Line>
        ))}
      </div>
      <Bars>
        {[52, 78, 34, 96, 60].map((h, i) => (
          <Bar key={h} $on={on} $d={700 + i * 90} $h={h} />
        ))}
      </Bars>
    </Ledger>
  );
}

/* ---------- Markets: an equity curve drawing itself ---------- */

const Curve = styled.svg<{ $on: boolean }>`
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  & .grid {
    stroke: ${({ theme }) => theme.colors.borderSubtle};
    stroke-width: 1;
  }
  & .line {
    fill: none;
    stroke: ${({ theme }) => theme.colors.brand};
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    animation-name: ${drawStroke};
    ${({ $on }) => play($on, 260, '1500ms')}
  }
  & .band {
    fill: ${({ theme }) => theme.colors.brandSubtle};
    stroke: none;
  }
  & text {
    font-family: ${fonts.mono};
    font-size: 7px;
    fill: ${({ theme }) => theme.colors.textMuted};
  }
`;

function MarketsArt({ on }: { on: boolean }) {
  return (
    <Curve viewBox="0 0 220 110" preserveAspectRatio="none" $on={on} aria-hidden>
      <rect className="band" x={104} y={30} width={44} height={54} />
      {[22, 48, 74].map((y) => (
        <line key={y} className="grid" x1={0} y1={y} x2={220} y2={y} />
      ))}
      <path
        className="line"
        pathLength={1}
        d="M2 92 L28 80 L52 84 L78 62 L104 48 L126 68 L148 58 L172 36 L196 28 L218 18"
      />
      <text x={106} y={26}>
        drawdown
      </text>
    </Curve>
  );
}

/* ---------- section ---------- */

/** Home-page illustrations, keyed by `Product.art`. Add a key here for a new product. */
const art: Record<string, (props: { on: boolean }) => React.JSX.Element> = {
  ledger: MoneyArt,
  curve: MarketsArt,
};

function ProductCard({ product, on, delay, index }: { product: Product; on: boolean; delay: number; index: string }) {
  const Art = art[product.art];
  return (
    <Panel $on={on} $d={delay}>
      <p className="tag">
        <b>{index}</b>
        {product.name}
      </p>
      <h3>{product.title}</h3>
      <span className="note">{product.tagline}</span>
      <Stage>{Art ? <Art on={on} /> : null}</Stage>
      <p>{product.blurb}</p>
      <ul>
        {product.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <a className="go" href={product.href}>
        Explore {product.name} →
      </a>
    </Panel>
  );
}

export function ProductsSection() {
  const [ref, on] = useInView<HTMLDivElement>(0.15);
  return (
    <SectionShell id="products" aria-labelledby="products-title">
      <Container>
        <SectionHeading
          id="products-title"
          eyebrow="Two products, one platform"
          index="01"
          split
          title={
            <>
              Money and Markets, <em>under one roof</em>
            </>
          }
          lead="One account, one database, one privacy model. Money handles the cash that moves through your bank. Markets handles the money you have put to work. Switch between them inside the app; each carries its own accent so you always know where you are."
        />
        <Grid ref={ref}>
          {PRODUCTS.map((product, i) => (
            <ProductTheme key={product.id} accent={product.accent}>
              <ProductCard
                product={product}
                on={on}
                delay={120 + i * 160}
                index={String(i + 1).padStart(2, '0')}
              />
            </ProductTheme>
          ))}
        </Grid>
      </Container>
    </SectionShell>
  );
}
