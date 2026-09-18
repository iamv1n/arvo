'use client';

import { Card, Tabs } from 'antd';
import { useState } from 'react';
import { AREAS, SECTIONS, SectionBody, SectionHeading } from './mock';

/*
 * Pattern 2 — nested tabs.
 *
 * A second tab row inside each area tab. Cheapest to build, and every section is one click away,
 * but two identical-looking rows stacked at the top are easy to confuse, and they eat two bands
 * of vertical space before any content starts.
 */

export function PatternNestedTabs() {
  const [section, setSection] = useState(SECTIONS[0].key);
  const active = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];

  return (
    <Tabs
      items={AREAS[0].tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        children: (
          <Card styles={{ body: { paddingTop: 8 } }}>
            <Tabs
              size="small"
              activeKey={section}
              onChange={setSection}
              items={SECTIONS.map((s) => ({
                key: s.key,
                label: s.count ? `${s.label} (${s.count})` : s.label,
                children: (
                  <>
                    <SectionHeading section={active} />
                    <SectionBody section={s.key} />
                  </>
                ),
              }))}
            />
          </Card>
        ),
      }))}
    />
  );
}
