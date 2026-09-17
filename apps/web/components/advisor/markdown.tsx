'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styled from 'styled-components';

const Prose = styled.div`
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
  overflow-wrap: anywhere;

  > :first-child {
    margin-top: 0;
  }
  > :last-child {
    margin-bottom: 0;
  }
  p,
  ul,
  ol {
    margin: 0 0 ${({ theme }) => theme.space[3]}px;
  }
  ul,
  ol {
    padding-left: 20px;
  }
  li + li {
    margin-top: 2px;
  }
  h1,
  h2,
  h3,
  h4 {
    margin: ${({ theme }) => theme.space[4]}px 0 ${({ theme }) => theme.space[2]}px;
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
    font-size: 18px;
  }
  strong {
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
  code {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 0.9em;
    padding: 1px 4px;
    border-radius: ${({ theme }) => theme.radii.sm}px;
    background: ${({ theme }) => theme.colors.bgMuted};
  }
  table {
    width: 100%;
    margin: 0 0 ${({ theme }) => theme.space[3]}px;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 4px 8px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
    text-align: left;
  }
  th {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  a {
    color: ${({ theme }) => theme.colors.brandText};
  }
`;

/** Renders advisor answers. Raw HTML is not rendered, so model output can't inject markup. */
export function Markdown({ children }: { children: string }) {
  return (
    <Prose>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </Prose>
  );
}
