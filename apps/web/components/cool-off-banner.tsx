'use client';

import { Alert, Button } from 'antd';
import Link from 'next/link';
import { HandPalm } from '@phosphor-icons/react';
import { useCoolOff } from '../lib/markets';

/**
 * The cool-off banner.
 *
 * It appears when a limit the trader set for themselves has been reached, and it does nothing
 * else: no order is blocked, no screen is disabled, nothing is hidden. That restraint is the
 * feature. A banner that blocked would be a broker's job and would be worked around within a
 * day; a note from the user's calmer self is the thing that occasionally works.
 */
export function CoolOffBanner({ showLink = true }: { showLink?: boolean }) {
  const { data } = useCoolOff();
  if (!data?.active) return null;

  const breached = data.statuses.filter((status) => status.breached);
  return (
    <Alert
      type="warning"
      showIcon
      icon={<HandPalm size={18} weight="duotone" />}
      style={{ marginBottom: 24 }}
      message={data.message ?? 'A limit you set has been reached'}
      description={
        <>
          {breached.map((status) => (
            <div key={status.kind} style={{ fontSize: 13 }}>
              {status.label}: you set {status.limit} and you are at {status.actual}.
            </div>
          ))}
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>
            Arvo is not stopping you doing anything — this is a note you left yourself.
          </div>
        </>
      }
      action={
        showLink ? (
          <Link href="/trading?tab=settings">
            <Button size="small">Review limits</Button>
          </Link>
        ) : undefined
      }
    />
  );
}
