'use client';

import { Alert, Segmented, Typography } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';
import { PageHeader } from '../../../components/page-header';
import { PatternNestedTabs } from '../../../components/design/pattern-nested-tabs';
import { PatternRail } from '../../../components/design/pattern-rail';
import { PatternScrollIndex } from '../../../components/design/pattern-scroll-index';
import { PatternSplit } from '../../../components/design/pattern-split';
import { PatternStepper } from '../../../components/design/pattern-stepper';

/*
 * The layout studio: five navigation patterns for dense areas, side by side in time.
 *
 * Not linked from the sidebar and not part of the product — it exists so we can flip between
 * shells with identical content and pick one for /lab, /trading and /portfolio. Every number,
 * row and series on this page is a local fixture; nothing calls the API.
 */

const PATTERNS = [
  {
    key: 'rail',
    label: 'Section rail + palette',
    good: 'One section on screen at a time, so a tab never becomes a mile of scroll — and ⌘K reaches any section of any area without navigating first.',
    cost: 'Four sections out of five are hidden; the rail costs ~200px of width, and the palette is a keystroke people have to learn.',
    render: () => <PatternRail />,
  },
  {
    key: 'nested',
    label: 'Nested tabs',
    good: 'Nothing new to learn, cheapest to build, and every section is exactly one click away.',
    cost: 'Two near-identical tab rows stacked at the top: a band of vertical space before content starts, and it is easy to lose track of which row you clicked.',
    render: () => <PatternNestedTabs />,
  },
  {
    key: 'scroll',
    label: 'One scroll + sticky index',
    good: 'Nothing is hidden — you can read, print or Cmd-F the whole tab, and the index tracks where you are.',
    cost: 'Long pages: reaching Trades from Setup is a real scroll, and heavy tabs render everything whether you look at it or not.',
    render: () => <PatternScrollIndex />,
  },
  {
    key: 'split',
    label: 'Split workbench',
    good: 'The controls never move, so tweak-and-look is one click; ideal where the form is the point (backtests, sizing, payoff).',
    cost: 'A third of the width is spent on the form forever, and it collapses to stacked panes below ~1000px, which loses the whole idea.',
    render: () => <PatternSplit />,
  },
  {
    key: 'stepper',
    label: 'Progressive disclosure',
    good: 'Teaches the order of the work and keeps one thing on screen; collapsed steps stay readable as one-line summaries.',
    cost: 'Hides the most: you cannot see the form and the results together, and it feels like a wizard on a screen people revisit daily.',
    render: () => <PatternStepper />,
  },
] as const;

const Caption = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: ${({ theme }) => theme.space[4]}px 0 ${({ theme }) => theme.space[6]}px;
  padding-left: ${({ theme }) => theme.space[4]}px;
  border-left: 3px solid ${({ theme }) => theme.colors.brand};
  max-width: 76ch;

  .tag {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Switcher = styled.div`
  overflow-x: auto;

  .ant-segmented {
    min-width: max-content;
  }
`;

export default function LayoutStudioPage() {
  const [pattern, setPattern] = useState<string>(PATTERNS[0].key);
  const active = PATTERNS.find((p) => p.key === pattern) ?? PATTERNS[0];

  return (
    <>
      <PageHeader
        title="Layout studio"
        subtitle="Five ways to navigate a dense area, each rendering the same mock backtest — a form, a results ribbon, a chart, twelve trades and a set of notes. Pick one for the lab, trading and portfolio. Nothing here is wired to the API."
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="Prototype only"
        description="This page has no nav entry and no data of its own. Every figure below is a fixture in components/design/mock.tsx."
      />

      <Switcher>
        <Segmented value={pattern} onChange={(v) => setPattern(v as string)} options={PATTERNS.map((p) => ({ value: p.key, label: p.label }))} />
      </Switcher>

      <Caption>
        <Typography.Text>
          <span className="tag">Good at</span> {active.good}
        </Typography.Text>
        <Typography.Text type="secondary">
          <span className="tag">Cost</span> {active.cost}
        </Typography.Text>
      </Caption>

      <div key={active.key}>{active.render()}</div>
    </>
  );
}
