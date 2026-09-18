'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { Button, Card, Input, Modal, Select, Tabs, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { AREAS, SECTIONS, SectionBody, SectionHeading, StatusDot } from './mock';

/*
 * Pattern 1 — section rail + command palette.
 *
 * Area tabs stay where they are. Inside a tab a slim sticky rail lists that tab's sections and
 * shows one at a time, so the page never grows past a screen. ⌘K jumps anywhere, including
 * sections of areas you are not currently in.
 */

const Layout = styled.div`
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: start;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Rail = styled.nav`
  position: sticky;
  top: 88px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${({ theme }) => theme.space[2]}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgSurface};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    display: none;
  }
`;

const RailItem = styled.button<{ $active: boolean }>`
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radii.sm}px;
  font-size: 13px;
  color: ${({ theme, $active }) => ($active ? theme.colors.brandText : theme.colors.textSecondary)};
  background: ${({ theme, $active }) => ($active ? theme.colors.brandSubtle : 'transparent')};

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.colors.bgMuted};
  }

  .count {
    margin-left: auto;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 11px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const MobilePicker = styled.div`
  display: none;
  margin-bottom: ${({ theme }) => theme.space[4]}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    display: block;
  }
`;

const PaletteRow = styled.button<{ $active: boolean }>`
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radii.sm}px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme, $active }) => ($active ? theme.colors.brandSubtle : 'transparent')};

  .area {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

interface Target {
  id: string;
  area: string;
  tab: string;
  section: string;
  label: string;
}

const TARGETS: Target[] = AREAS.flatMap((area) =>
  area.tabs.flatMap((tab) =>
    SECTIONS.map((section) => ({
      id: `${area.key}.${tab.key}.${section.key}`,
      area: area.label,
      tab: tab.key,
      section: section.key,
      label: `${tab.label} · ${section.label}`,
    })),
  ),
);

export function PatternRail() {
  const [tab, setTab] = useState(AREAS[0].tabs[0].key);
  const [section, setSection] = useState(SECTIONS[0].key);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? TARGETS.filter((t) => `${t.area} ${t.label}`.toLowerCase().includes(q)) : TARGETS;
    return rows.slice(0, 40);
  }, [query]);

  const jump = useCallback((target: Target) => {
    setTab(target.tab);
    setSection(target.section);
    setOpen(false);
    setQuery('');
    setCursor(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const active = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];

  return (
    <>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        tabBarExtraContent={
          <Button size="small" icon={<MagnifyingGlass size={14} />} onClick={() => setOpen(true)}>
            Jump to… ⌘K
          </Button>
        }
        items={AREAS[0].tabs.map((t) => ({
          key: t.key,
          label: t.label,
          children: (
            <Layout>
              <Rail aria-label="Sections">
                {SECTIONS.map((s) => (
                  <RailItem key={s.key} $active={s.key === section} onClick={() => setSection(s.key)}>
                    <StatusDot $status={s.status} />
                    {s.label}
                    {s.count ? <span className="count">{s.count}</span> : null}
                  </RailItem>
                ))}
              </Rail>
              <div>
                <MobilePicker>
                  <Select
                    style={{ width: '100%' }}
                    value={section}
                    onChange={setSection}
                    options={SECTIONS.map((s) => ({ value: s.key, label: `${s.label}${s.count ? ` (${s.count})` : ''}` }))}
                  />
                </MobilePicker>
                <Card>
                  <SectionHeading section={active} />
                  <SectionBody section={section} />
                </Card>
              </div>
            </Layout>
          ),
        }))}
      />

      <Modal open={open} onCancel={() => setOpen(false)} footer={null} closable={false} title={null} width={520} destroyOnHidden>
        <Input
          autoFocus
          size="large"
          variant="borderless"
          placeholder="Jump to a section…"
          prefix={<MagnifyingGlass size={16} />}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter' && matches[cursor]) {
              jump(matches[cursor]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 8 }}>
          {matches.map((target, i) => (
            <PaletteRow key={target.id} $active={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => jump(target)}>
              <span className="area">{target.area}</span>
              <span>{target.label}</span>
            </PaletteRow>
          ))}
          {matches.length === 0 && (
            <Typography.Text type="secondary" style={{ display: 'block', padding: 12 }}>
              Nothing matches that.
            </Typography.Text>
          )}
        </div>
      </Modal>
    </>
  );
}
