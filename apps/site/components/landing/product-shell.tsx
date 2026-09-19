'use client';

import type { ReactNode } from 'react';
import styled from 'styled-components';
import { PRODUCTS, type Product } from '../../lib/products';
import {
  ClosingCta,
  LandingGlobals,
  Nav,
  Root,
  SiteFooter,
  SkipLink,
} from './landing-page';
import { fadeUp, play, useInView } from './motion';
import { Container, fonts, rhythm } from './primitives';
import { ProductTheme } from './product-theme';

/*
 * Shared chrome for every product page: masthead, the product's accent, a ruled rail of its
 * sections, a hand-off to the other products and the closing call to action. Each page supplies
 * its own hero and its own sections, so the pages stay distinctive while the frame stays one file.
 */

/* ---------- section rail ---------- */

const Rail = styled.nav`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurface};
  & ol {
    display: flex;
    gap: ${({ theme }) => theme.space[5]}px;
    list-style: none;
    margin: 0;
    padding: 10px 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  & ol::-webkit-scrollbar {
    display: none;
  }
  & li {
    flex: none;
  }
  & a {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
    text-decoration: none;
    white-space: nowrap;
  }
  & a b {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.brandText};
  }
  & a:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

function SectionRail({ product }: { product: Product }) {
  return (
    <Rail aria-label={`${product.name} sections`}>
      <Container>
        <ol>
          {product.sections.map((section, i) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                {section.label}
              </a>
            </li>
          ))}
        </ol>
      </Container>
    </Rail>
  );
}

/* ---------- hand-off to the other products ---------- */

const Handoff = styled.section`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  padding: ${rhythm.section.sm}px 0 0;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    padding-top: ${rhythm.section.lg}px;
  }
  & .label {
    margin: 0 0 ${rhythm.head.sm}px;
    font-family: ${fonts.mono};
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & ul {
    display: grid;
    gap: ${({ theme }) => theme.space[4]}px;
    list-style: none;
    margin: 0;
    padding: 0;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
`;

const HandoffCard = styled.a<{ $on: boolean; $d: number }>`
  display: block;
  padding: ${({ theme }) => theme.space[5]}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  text-decoration: none;
  animation-name: ${fadeUp};
  ${({ $on, $d }) => play($on, $d, '600ms')}
  transition: transform 200ms, box-shadow 200ms;
  &:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 ${({ theme }) => theme.colors.brand};
  }
  & strong {
    display: block;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 24px;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & span {
    display: block;
    margin-top: 6px;
    font-size: 14px;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  & em {
    display: inline-block;
    margin-top: 12px;
    font-style: normal;
    font-weight: 600;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.brandText};
  }
  @media (prefers-reduced-motion: reduce) {
    &:hover {
      transform: none;
    }
  }
`;

function OtherProducts({ current }: { current: Product }) {
  const [ref, on] = useInView<HTMLElement>(0.2);
  const others = PRODUCTS.filter((p) => p.id !== current.id);
  if (others.length === 0) return null;
  return (
    <Handoff ref={ref} aria-labelledby="other-products">
      <Container>
        <p className="label" id="other-products">
          Also in Arvo
        </p>
        <ul>
          {others.map((product, i) => (
            <li key={product.id}>
              <ProductTheme accent={product.accent}>
                <HandoffCard href={product.href} $on={on} $d={120 + i * 140}>
                  <strong>{product.name}</strong>
                  <span>{product.purpose}</span>
                  <em>Explore {product.name} →</em>
                </HandoffCard>
              </ProductTheme>
            </li>
          ))}
        </ul>
      </Container>
    </Handoff>
  );
}

/* ---------- page ---------- */

export function ProductPage({
  product,
  hero,
  children,
}: {
  product: Product;
  /** The product's own hero — each page draws its own, no shared template. */
  hero: ReactNode;
  /** The product's sections. */
  children: ReactNode;
}) {
  return (
    <ProductTheme accent={product.accent}>
      <Root data-landing id="top">
        <LandingGlobals />
        <SkipLink href="#main">Skip to content</SkipLink>
        <Nav base="/" />
        <main id="main">
          {hero}
          <SectionRail product={product} />
          {children}
          <OtherProducts current={product} />
          <ClosingCta />
        </main>
        <SiteFooter base="/" />
      </Root>
    </ProductTheme>
  );
}
