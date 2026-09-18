'use client';

import { Typography } from 'antd';
import type { ReactNode } from 'react';
import styled from 'styled-components';

/*
 * One setting per row.
 *
 * A flex row with `justify: space-between` gives the label all the slack, so a Segmented or a
 * two-Select control ends up squeezed against the right edge. A two-track grid instead: the text
 * takes what is left, the control keeps its natural width, and below 520px the control drops to
 * its own line at full width rather than being crushed.
 */
const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[6]}px;
  padding: ${({ theme }) => theme.space[4]}px 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Control = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]}px;
  min-width: 0;
  max-width: 100%;

  @media (max-width: 520px) {
    justify-content: flex-start;
  }
`;

const Label = styled.div`
  min-width: 0;

  .hint {
    display: block;
    /* Explainers read as prose, not as a full-width banner across a wide settings panel. */
    max-width: 62ch;
    font-size: 13px;
    line-height: 1.45;
  }
`;

/** One labelled setting: title and optional description on the left, control on the right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Row>
      <Label>
        <Typography.Text strong>{label}</Typography.Text>
        {hint && (
          <Typography.Text type="secondary" className="hint">
            {hint}
          </Typography.Text>
        )}
      </Label>
      <Control>{children}</Control>
    </Row>
  );
}

export function SectionIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ marginBottom: 8, minWidth: 0, whiteSpace: 'normal' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      {children && (
        <Typography.Paragraph
          type="secondary"
          /* Card titles do not wrap by default, so a long explainer would clip its own card. */
          style={{ margin: '4px 0 0', maxWidth: '62ch', whiteSpace: 'normal', fontSize: 13, lineHeight: 1.45 }}
        >
          {children}
        </Typography.Paragraph>
      )}
    </div>
  );
}
