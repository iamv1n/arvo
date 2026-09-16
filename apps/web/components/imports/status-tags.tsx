'use client';

import { Tag } from 'antd';
import type { ImportRowDecision, ImportRowStatus, ImportStatus } from '../../lib/types';

const BATCH: Record<ImportStatus, { color: string; label: string }> = {
  PENDING: { color: 'blue', label: 'Needs mapping' },
  PROCESSING: { color: 'processing', label: 'Processing' },
  REVIEW: { color: 'gold', label: 'In review' },
  COMPLETED: { color: 'green', label: 'Committed' },
  FAILED: { color: 'red', label: 'Failed' },
  CANCELLED: { color: 'default', label: 'Cancelled' },
};

export const ROW_STATUS: Record<ImportRowStatus, { color: string; label: string }> = {
  VALID: { color: 'green', label: 'Valid' },
  POSSIBLE_DUPLICATE: { color: 'orange', label: 'Possible duplicate' },
  AMBIGUOUS: { color: 'purple', label: 'Ambiguous' },
  INVALID: { color: 'red', label: 'Invalid' },
};

export const DECISION_LABEL: Record<ImportRowDecision, string> = {
  PENDING: 'Needs decision',
  ACCEPT: 'Import',
  REJECT: 'Skip',
};

export const BatchStatusTag = ({ status }: { status: ImportStatus }) => (
  <Tag color={BATCH[status].color} variant="filled">
    {BATCH[status].label}
  </Tag>
);

export const RowStatusTag = ({ status }: { status: ImportRowStatus }) => (
  <Tag color={ROW_STATUS[status].color} variant="filled">
    {ROW_STATUS[status].label}
  </Tag>
);
