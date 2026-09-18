'use client';

import { Bell } from '@phosphor-icons/react';
import { Badge, Button, Dropdown, Empty, Flex, Typography } from 'antd';
import Link from 'next/link';
import { useTheme } from 'styled-components';
import { api } from '../lib/api';
import { useMarketMutation, useNotifications, useUnreadCount } from '../lib/markets';

/**
 * The bell in the app shell.
 *
 * It holds the five most recent notifications and a link to the rest. The badge polls a single
 * integer once a minute and on window focus, which is the moment that actually matters; a
 * websocket for one number would be infrastructure with no second user.
 */
export function NotificationBell() {
  const theme = useTheme();
  const { data: unread = 0 } = useUnreadCount();
  const { data } = useNotifications(5);
  const markRead = useMarketMutation((ids: string[]) => api('/notifications/read', { method: 'POST', body: { ids } }));
  const items = data?.notifications ?? [];

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      popupRender={() => (
        <div
          style={{
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: theme.colors.bgSurface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.lg,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
            padding: 8,
          }}
        >
          <Flex align="center" justify="space-between" style={{ padding: '4px 8px 8px' }}>
            <Typography.Text strong>Notifications</Typography.Text>
            {unread > 0 && (
              <Button size="small" type="link" onClick={() => markRead.mutate([])}>
                Mark all read
              </Button>
            )}
          </Flex>
          {!items.length ? (
            <Empty description="Nothing yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 16 }} />
          ) : (
            items.map((notification) => (
              <Link
                key={notification.id}
                href={notification.link ?? '/markets?tab=notifications'}
                onClick={() => !notification.readAt && markRead.mutate([notification.id])}
                style={{
                  display: 'block',
                  padding: '8px 10px',
                  borderRadius: theme.radii.md,
                  borderLeft: `3px solid ${notification.readAt ? 'transparent' : theme.colors.brand}`,
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: notification.readAt ? 400 : 600, fontSize: 13 }}>{notification.title}</div>
                <div style={{ fontSize: 12, color: theme.colors.textSecondary }}>{notification.body}</div>
              </Link>
            ))
          )}
          <div style={{ padding: '8px 10px 4px', borderTop: `1px solid ${theme.colors.borderSubtle}`, marginTop: 8 }}>
            <Link href="/markets?tab=notifications" style={{ fontSize: 13 }}>
              Open the notification centre
            </Link>
          </div>
        </div>
      )}
    >
      <Badge count={unread} size="small" offset={[-2, 4]}>
        <Button type="text" icon={<Bell size={19} weight="duotone" />} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} />
      </Badge>
    </Dropdown>
  );
}
