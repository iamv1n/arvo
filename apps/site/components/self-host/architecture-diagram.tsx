'use client';

import styled, { useTheme } from 'styled-components';

const Figure = styled.figure`
  margin: 8px 0 20px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radii.xl}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  overflow-x: auto;
  & figcaption {
    margin-top: 8px;
    font-size: 13px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

interface Box {
  x: number;
  y: number;
  w: number;
  title: string;
  sub: string;
  accent?: boolean;
  dashed?: boolean;
}

/** Static architecture overview: Web → API → Finance Core ← MCP, with storage, parsers and AI below. */
export function ArchitectureDiagram() {
  const theme = useTheme();
  const h = 52;
  const boxes: Box[] = [
    { x: 10, y: 20, w: 150, title: 'Web app', sub: 'Next.js · :3300' },
    { x: 215, y: 20, w: 150, title: 'REST API', sub: 'NestJS · :3301/docs' },
    { x: 420, y: 20, w: 150, title: 'Finance Core', sub: 'Deterministic analytics', accent: true },
    { x: 625, y: 20, w: 150, title: 'MCP server', sub: ':3302 · coming soon', dashed: true },
    { x: 215, y: 140, w: 150, title: 'PostgreSQL', sub: 'via TypeORM · :5433' },
    { x: 420, y: 140, w: 150, title: 'Import parsers', sub: 'CSV · XLSX · PDF' },
    { x: 625, y: 140, w: 150, title: 'AI providers', sub: 'OpenAI · Anthropic · Gemini · Ollama', dashed: true },
  ];
  const arrow = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={theme.colors.textMuted} strokeWidth={1.5} markerEnd="url(#arch-arrow)" />
  );
  return (
    <Figure>
      <svg viewBox="0 0 785 212" width="100%" style={{ minWidth: 600, display: 'block' }} role="img" aria-label="Architecture: the web app calls the REST API, which uses the Finance Core. The MCP server also uses the Finance Core. The API stores data in PostgreSQL through TypeORM, uses import parsers for statements, and calls the configured AI provider.">
        <defs>
          <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={theme.colors.textMuted} />
          </marker>
        </defs>
        {arrow(160, 46, 213, 46, 'web-api')}
        {arrow(365, 46, 418, 46, 'api-core')}
        {arrow(625, 46, 572, 46, 'mcp-core')}
        {arrow(290, 72, 290, 138, 'api-db')}
        {arrow(495, 72, 495, 138, 'core-parsers')}
        {arrow(540, 72, 660, 138, 'core-ai')}
        {boxes.map((b) => (
          <g key={b.title}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={h}
              rx={10}
              fill={b.accent ? theme.colors.brandSubtle : theme.colors.bgSurface}
              stroke={b.accent ? theme.colors.brand : theme.colors.border}
              strokeWidth={1.5}
              strokeDasharray={b.dashed ? '5 4' : undefined}
            />
            <text x={b.x + b.w / 2} y={b.y + 22} textAnchor="middle" fontSize={14} fontWeight={600} fill={theme.colors.textPrimary}>
              {b.title}
            </text>
            <text x={b.x + b.w / 2} y={b.y + 40} textAnchor="middle" fontSize={10.5} fill={theme.colors.textSecondary}>
              {b.sub}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>Dashed boxes are optional or not shipped yet.</figcaption>
    </Figure>
  );
}
