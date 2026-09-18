'use client';

import { useEffect, useState, type ReactNode } from 'react';
import styled from 'styled-components';

/*
 * A standing disclaimer as a hairline strip, not a card.
 *
 * Several areas have to say the same kind of thing — this is information, not advice; this is
 * analysis, not advice; this was drafted by a model. Printed as a paragraph block each one costs
 * the page a hundred vertical pixels before the first number. So the notice collapses to a single
 * ruled line: "more" reads the full wording, "×" hides it for good in this browser.
 */

const Strip = styled.div<{ $open: boolean }>`
  display: flex;
  align-items: ${({ $open }) => ($open ? 'flex-start' : 'center')};
  gap: 8px;
  margin-bottom: ${({ theme }) => theme.space[4]}px;
  padding: ${({ $open }) => ($open ? '8px 10px' : '0 10px')};
  min-height: ${({ $open }) => ($open ? 'auto' : '22px')};
  border-left: 3px solid ${({ theme }) => theme.colors.brand};
  background: ${({ theme }) => theme.colors.brandSubtle};
  border-radius: 0 3px 3px 0;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};

  .text {
    flex: 1;
    min-width: 0;
  }
  b {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: 600;
  }
  button {
    all: unset;
    cursor: pointer;
    padding: 0 4px;
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: 11px;
  }
  button:hover,
  button:focus-visible {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

export function NoticeStrip({
  storageKey,
  icon,
  headline,
  detail,
  defaultState = 'collapsed',
}: {
  /** Remembers per area whether this notice is expanded or hidden. */
  storageKey: string;
  icon?: ReactNode;
  /** The one line that always shows. */
  headline: ReactNode;
  /** The full wording, revealed by "more". */
  detail?: ReactNode;
  defaultState?: 'open' | 'collapsed';
}) {
  const [state, setState] = useState<'open' | 'collapsed' | 'hidden'>(defaultState);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'hidden' || stored === 'collapsed' || stored === 'open') setState(stored);
    } catch {
      // Storage unavailable; the notice keeps its default for this view.
    }
  }, [storageKey]);

  const set = (next: 'open' | 'collapsed' | 'hidden') => {
    setState(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Storage unavailable; the choice lasts for this view only.
    }
  };

  if (state === 'hidden') return null;
  const open = state === 'open';
  return (
    <Strip $open={open} role="note">
      {icon}
      <span className="text">
        <b>{headline}</b>
        {open && detail ? <> {detail}</> : null}
      </span>
      {detail ? (
        <button type="button" onClick={() => set(open ? 'collapsed' : 'open')} aria-expanded={open}>
          {open ? 'less' : 'more'}
        </button>
      ) : null}
      <button type="button" onClick={() => set('hidden')} aria-label="Hide this notice">
        ×
      </button>
    </Strip>
  );
}
