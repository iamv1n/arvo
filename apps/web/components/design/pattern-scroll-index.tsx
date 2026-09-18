'use client';

import { Card, Select, Tabs } from 'antd';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { SECTIONS, SectionBody, SectionHeading, StatusDot, AREAS } from './mock';

/*
 * Pattern 3 — one scroll with a sticky index.
 *
 * Nothing is hidden: every section is on the page in order, and a sticky table of contents
 * highlights whichever one is in view. An IntersectionObserver does the highlighting, so the
 * index needs no scroll maths.
 */

const Layout = styled.div`
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: start;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Index = styled.nav`
  position: sticky;
  top: 88px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    display: none;
  }
`;

const IndexItem = styled.a<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  text-decoration: none;
  border-left: 2px solid ${({ theme, $active }) => ($active ? theme.colors.brand : 'transparent')};
  margin-left: -1px;
  color: ${({ theme, $active }) => ($active ? theme.colors.brandText : theme.colors.textSecondary)};

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const MobilePicker = styled.div`
  display: none;
  position: sticky;
  top: 72px;
  z-index: 2;
  padding: ${({ theme }) => theme.space[2]}px 0;
  background: ${({ theme }) => theme.colors.bgCanvas};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    display: block;
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]}px;

  section {
    scroll-margin-top: 96px;
  }
`;

export function PatternScrollIndex() {
  const [active, setActive] = useState(SECTIONS[0].key);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(`studio-${s.key}`)).filter((n): n is HTMLElement => Boolean(n));
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace('studio-', ''));
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  return (
    <Tabs
      items={AREAS[0].tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        children: (
          <Layout ref={root}>
            <Index aria-label="On this page">
              {SECTIONS.map((s) => (
                <IndexItem key={s.key} href={`#studio-${s.key}`} $active={s.key === active}>
                  <StatusDot $status={s.status} />
                  {s.label}
                </IndexItem>
              ))}
            </Index>
            <div>
              <MobilePicker>
                <Select
                  style={{ width: '100%' }}
                  value={active}
                  onChange={(key) => document.getElementById(`studio-${key}`)?.scrollIntoView({ behavior: 'smooth' })}
                  options={SECTIONS.map((s) => ({ value: s.key, label: s.label }))}
                />
              </MobilePicker>
              <Column>
                {SECTIONS.map((s) => (
                  <section key={s.key} id={`studio-${s.key}`}>
                    <Card>
                      <SectionHeading section={s} />
                      <SectionBody section={s.key} />
                    </Card>
                  </section>
                ))}
              </Column>
            </div>
          </Layout>
        ),
      }))}
    />
  );
}
