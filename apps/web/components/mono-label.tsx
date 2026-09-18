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

/*
 * Responsive form layout.
 *
 * antd's Row/Col split a form into fixed fractions, so a 560px modal on a 375px phone ends up
 * with a 90px "Amount" box next to a 60px "Direction" box. A grid of auto-fit tracks instead
 * keeps every control at a readable minimum and drops to one column when it can't.
 */
export const FieldGrid = styled.div<{ $min?: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(${({ $min = 150 }) => $min}px, 1fr));
  gap: ${({ theme }) => theme.space[2]}px ${({ theme }) => theme.space[3]}px;
  align-items: start;
`;

/** FieldGrid for antd Form.Items: mono uppercase labels above inputs, controls full width. */
export const FormGrid = styled(FieldGrid)`
  .ant-form-item {
    min-width: 0;
    margin-bottom: ${({ theme }) => theme.space[3]}px;
  }

  .ant-form-item-label {
    padding-bottom: 2px;

    > label {
      height: auto;
      font-family: ${({ theme }) => theme.typography.fontFamilyMono};
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${({ theme }) => theme.colors.textMuted};
    }
  }

  .ant-select,
  .ant-picker,
  .ant-input-number,
  .ant-tree-select {
    width: 100%;
  }
`;

/** A field that should take the full width of a FieldGrid row (description, notes). */
export const FullWidthField = styled.div`
  grid-column: 1 / -1;
  min-width: 0;
`;
