'use client';

import { BookOpen } from '@phosphor-icons/react';
import { Card, Col, Empty, Input, Row, Skeleton, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useLibrary, useLibraryEntry } from '../../lib/lab';
import { Markdown } from '../advisor/markdown';
import { Eyebrow } from '../planning';
import { LabNote, Muted } from './shared';

/*
 * The strategy library.
 *
 * An index on the left, the article on the right. Each entry has the same four parts — how it
 * works, when it fails, what it costs, and a worked example with real numbers — and "when it
 * fails" is the section that earns the page.
 */

const CATEGORY_LABELS: Record<string, string> = {
  OPTION_STRUCTURE: 'Option structures',
  RISK: 'Risk',
  METHOD: 'Method',
};

export function StrategyLibrary({ initialSlug }: { initialSlug?: string }) {
  const index = useLibrary();
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  const [search, setSearch] = useState('');
  const entry = useLibraryEntry(slug ?? index.data?.entries[0]?.slug ?? null);

  const grouped = useMemo(() => {
    const entries = (index.data?.entries ?? []).filter(
      (item) => search.trim() === '' || `${item.title} ${item.summary}`.toLowerCase().includes(search.trim().toLowerCase()),
    );
    const groups = new Map<string, typeof entries>();
    for (const item of entries) {
      const list = groups.get(item.category);
      if (list) list.push(item);
      else groups.set(item.category, [item]);
    }
    return [...groups.entries()];
  }, [index.data, search]);

  if (index.isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <Card size="small" title="Explainers" extra={<BookOpen size={17} weight="duotone" />}>
          <Input.Search placeholder="Search" allowClear value={search} onChange={(event) => setSearch(event.target.value)} style={{ marginBottom: 12 }} />
          {grouped.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing matches" />}
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {grouped.map(([category, entries]) => (
              <div key={category}>
                <Eyebrow>{CATEGORY_LABELS[category] ?? category}</Eyebrow>
                <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 6 }}>
                  {entries.map((item) => {
                    const active = (slug ?? index.data?.entries[0]?.slug) === item.slug;
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => setSlug(item.slug)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: 'transparent',
                          border: 'none',
                          borderLeft: `2px solid ${active ? 'currentColor' : 'transparent'}`,
                          paddingLeft: 10,
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                      >
                        <div style={{ fontWeight: active ? 600 : 400 }}>{item.title}</div>
                        <Muted>{item.summary}</Muted>
                      </button>
                    );
                  })}
                </Space>
              </div>
            ))}
          </Space>
        </Card>
      </Col>

      <Col xs={24} lg={16}>
        <Card>
          {entry.isPending && <Skeleton active paragraph={{ rows: 12 }} />}
          {entry.data && (
            <>
              <Typography.Title level={3} style={{ marginTop: 0 }}>
                {entry.data.entry.title}
              </Typography.Title>
              <Space wrap style={{ marginBottom: 16 }}>
                <Tag>{CATEGORY_LABELS[entry.data.entry.category] ?? entry.data.entry.category}</Tag>
                <Muted>{entry.data.entry.readingMinutes} min read</Muted>
              </Space>
              <Markdown>{entry.data.entry.markdown}</Markdown>
              <LabNote text="Educational only. Nothing above is a recommendation, and the worked examples use illustrative numbers rather than quotes." />
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}
