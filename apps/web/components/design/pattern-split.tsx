'use client';

import { Card, Flex, Tabs } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';
import { AREAS, Eyebrow, MockForm, MockNotes, ResultViewBody, ResultViewSwitcher, type ResultView } from './mock';

/*
 * Pattern 4 — split workbench.
 *
 * Controls live in a pinned left pane with its own scroll; the right pane swaps between Summary,
 * Chart and Trades. The form never moves, so tweak-and-look is one click with no scrolling — at
 * the cost of roughly a third of the width, permanently, on every screen.
 */

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[5]}px;
  align-items: start;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Controls = styled.div`
  position: sticky;
  top: 88px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}px) {
    position: static;
    max-height: none;
    overflow: visible;
  }
`;

export function PatternSplit() {
  const [view, setView] = useState<ResultView>('Summary');

  return (
    <Tabs
      items={AREAS[0].tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        children: (
          <Layout>
            <Controls>
              <Card>
                <Eyebrow style={{ marginBottom: 12 }}>Setup</Eyebrow>
                <MockForm />
              </Card>
            </Controls>
            <Flex vertical gap={20}>
              <Card
                title={<Eyebrow>Results</Eyebrow>}
                extra={<ResultViewSwitcher value={view} onChange={setView} />}
                styles={{ body: { minHeight: 320 } }}
              >
                <ResultViewBody view={view} />
              </Card>
              <Card title={<Eyebrow>Notes</Eyebrow>}>
                <MockNotes />
              </Card>
            </Flex>
          </Layout>
        ),
      }))}
    />
  );
}
