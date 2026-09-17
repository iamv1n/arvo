'use client';

import styled from 'styled-components';

/** Small uppercase monospace label used above editorial headings. */
export const MonoLabel = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;
