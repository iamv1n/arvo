'use client';

import styled, { css, keyframes } from 'styled-components';

/*
 * Arvo pixel mark: an 8×8 "A" built from ink pixels, with the crossbar drawn in brand teal like
 * a ruled ledger line. Pixels fall into place on first render and re-assemble on hover.
 */
const GRID = [
  '..####..',
  '.##..##.',
  '##....##',
  '##....##',
  '========',
  '##....##',
  '##....##',
  '##....##',
];

const drop = keyframes`
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: none; }
`;

const Svg = styled.svg<{ $animate: boolean }>`
  display: block;
  shape-rendering: crispEdges;
  flex-shrink: 0;

  rect {
    transform-box: fill-box;
    ${({ $animate }) =>
      $animate &&
      css`
        animation: ${drop} 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      `}
  }
  &:hover rect {
    animation: ${drop} 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @media (prefers-reduced-motion: reduce) {
    rect,
    &:hover rect {
      animation: none !important;
    }
  }
`;

export function PixelLogo({ size = 32, animate = true, title = 'Arvo' }: { size?: number; animate?: boolean; title?: string }) {
  const pixels: { x: number; y: number; accent: boolean }[] = [];
  GRID.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      if (cell !== '.') pixels.push({ x, y, accent: cell === '=' });
    }),
  );
  return (
    <Svg $animate={animate} width={size} height={size} viewBox="0 0 8 8" role="img" aria-label={title}>
      <title>{title}</title>
      {pixels.map((p, i) => (
        <rect
          key={`${p.x}-${p.y}`}
          x={p.x}
          y={p.y}
          width={1}
          height={1}
          fill={p.accent ? 'var(--arvo-logo-accent, #0b8f74)' : 'currentColor'}
          style={{ animationDelay: `${(p.y * 8 + p.x) * 12 + (i % 3) * 6}ms` }}
        />
      ))}
    </Svg>
  );
}
