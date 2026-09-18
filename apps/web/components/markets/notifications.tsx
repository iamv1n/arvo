'use client';

import { BellSimple, CheckCircle } from '@phosphor-icons/react';
import { App, Button, Card, Empty, Flex, Form, Input, InputNumber, Select, Space, Switch, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useTheme } from 'styled-components';
import { api } from '../../lib/api';
import { useMarketMutation, useNotificationSettings, useNotifications, type NotificationSettings } from '../../lib/markets';
import { MonoLabel } from '../mono-label';
import { Panel } from '../panel';

/*
 * The notification centre and its settings.
 *
 * Quiet hours hold back email and Telegram but never the in-app record. The point of quiet
 * hours is not to be woken, not to lose the notification — and the copy says so, because a
 * setting whose behaviour people have to guess at is a setting they turn off.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Notifications() {
  const theme = useTheme();
  const { message } = App.useApp();
  const { data, isLoading } = useNotifications(50);
  const { data: settings } = useNotificationSettings();

  const markRead = useMarketMutation((ids: string[]) => api('/notifications/read', { method: 'POST', body: { ids } }));
  const save = useMarketMutation((body: Partial<NotificationSettings>) => api<NotificationSettings>('/me/notification-settings', { method: 'PATCH', body }));

  return (
    <Flex gap={16} wrap align="flex-start">
      <div style={{ flex: '1 1 440px', minWidth: 300 }}>
        <Panel
          height={560}
          title="Notifications"
          flush
          extra={
            <Button size="small" icon={<CheckCircle size={14} />} disabled={!data?.unread} onClick={() => markRead.mutate([])}>
              Mark all read
            </Button>
          }
        >
          {!data?.notifications.length && !isLoading ? (
            <div style={{ padding: 48 }}>
              <Empty description="Nothing yet. Alerts you write and limits you set will appear here." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            <div style={{ padding: 8 }}>
              {(data?.notifications ?? []).map((notification) => (
                <Card
                  key={notification.id}
                  size="small"
                  style={{ marginBottom: 8, borderLeft: `3px solid ${notification.readAt ? 'transparent' : theme.colors.brand}` }}
                  styles={{ body: { padding: 12 } }}
                >
                  <Flex gap={12} align="flex-start">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Flex gap={8} align="center" wrap style={{ marginBottom: 2 }}>
                        <span style={{ fontWeight: notification.readAt ? 400 : 600 }}>{notification.title}</span>
                        {notification.kind === 'GUARDRAIL' && <Tag color="orange">Limit</Tag>}
                        {notification.kind === 'NEWS_DIGEST' && <Tag color="blue">News</Tag>}
                      </Flex>
                      <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>{notification.body}</div>
                      <MonoLabel style={{ marginTop: 6 }}>{new Date(notification.createdAt).toLocaleString()}</MonoLabel>
                    </div>
                    <Space direction="vertical" size={4}>
                      {notification.link && (
                        <Link href={notification.link}>
                          <Button size="small" type="link">
                            Open
                          </Button>
                        </Link>
                      )}
                      {!notification.readAt && (
                        <Button size="small" type="text" onClick={() => markRead.mutate([notification.id])}>
                          Mark read
                        </Button>
                      )}
                    </Space>
                  </Flex>
                </Card>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div style={{ flex: '1 1 360px', minWidth: 300 }}>
        <Panel height={560} title="How you are told">
          {settings && (
            <Form
              layout="vertical"
              initialValues={settings}
              onValuesChange={(changed: Partial<NotificationSettings>) =>
                save.mutate(changed, { onError: (error) => message.error((error as Error).message) })
              }
            >
              <Form.Item name="emailEnabled" label="Email" valuePropName="checked" tooltip="Alerts that ask for email are sent through your configured mail server.">
                <Switch />
              </Form.Item>

              <Form.Item name="telegramEnabled" label="Telegram" valuePropName="checked" tooltip="Needs a bot token configured on the server.">
                <Switch />
              </Form.Item>
              <Form.Item name="telegramChatId" label="Telegram chat id" tooltip="Message your bot once, then read the chat id from getUpdates.">
                <Input placeholder="123456789" style={{ maxWidth: 240 }} />
              </Form.Item>

              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                Quiet hours hold back email and Telegram. The in-app copy is still written — the point is not to be woken, not to lose the notification. A window
                that wraps midnight, like 22:00 to 07:00, works as you would expect.
              </Typography.Paragraph>
              <Flex gap={12} wrap>
                <Form.Item name="quietHoursStart" label="Quiet from" style={{ minWidth: 130 }}>
                  <Input type="time" />
                </Form.Item>
                <Form.Item name="quietHoursEnd" label="Quiet until" style={{ minWidth: 130 }}>
                  <Input type="time" />
                </Form.Item>
                <Form.Item name="timezone" label="Read in" style={{ flex: 1, minWidth: 180 }}>
                  <Input placeholder="Asia/Kolkata" />
                </Form.Item>
              </Flex>

              <Form.Item
                name="staleQuoteMinutes"
                label="Treat a price as stale after (minutes)"
                tooltip="A price alert on data older than this records “skipped, stale data” instead of firing."
              >
                <InputNumber min={1} max={43200} style={{ width: 160 }} />
              </Form.Item>

              <Form.Item name="refreshCooldownSeconds" label="Shortest gap between provider refreshes (seconds)">
                <InputNumber min={5} max={3600} style={{ width: 160 }} />
              </Form.Item>

              <Form.Item name="newsDigestFrequency" label="News digest">
                <Select
                  style={{ maxWidth: 200 }}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                  ]}
                />
              </Form.Item>

              <ExpiryRules settings={settings} onSave={(rules) => save.mutate({ expiryRules: rules })} />
            </Form>
          )}
        </Panel>
      </div>
    </Flex>
  );
}

/**
 * Per-index expiry weekday. Exchanges move expiry day — NSE has used Thursday, Monday and
 * Tuesday within a few years — so this is a setting rather than a constant, and changing it
 * recomputes the whole calendar.
 */
function ExpiryRules({ settings, onSave }: { settings: NotificationSettings; onSave: (rules: NotificationSettings['expiryRules']) => void }) {
  const rules = settings.expiryRules ?? [];
  return (
    <>
      <MonoLabel style={{ marginTop: 8, marginBottom: 8 }}>Expiry weekday per index</MonoLabel>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        Defaults follow the rules published as of September 2026: NSE indices expire on Tuesday, BSE indices on Thursday. Change one here if an exchange moves it.
      </Typography.Paragraph>
      <Flex vertical gap={8}>
        {rules.map((rule, index) => (
          <Flex key={rule.index} gap={8} align="center" wrap>
            <span style={{ minWidth: 110, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{rule.index}</span>
            <Select
              size="small"
              style={{ width: 130 }}
              value={rule.weekday}
              aria-label={`${rule.index} expiry weekday`}
              onChange={(weekday: number) => onSave(rules.map((r, i) => (i === index ? { ...r, weekday } : r)))}
              options={WEEKDAYS.map((label, value) => ({ value, label }))}
            />
            <Tag>{rule.weekly ? 'weekly + monthly' : 'monthly'}</Tag>
          </Flex>
        ))}
      </Flex>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
        <BellSimple size={12} weight="duotone" aria-hidden /> Alerts are yours: Arvo evaluates the rules you wrote and never recommends a trade.
      </Typography.Paragraph>
    </>
  );
}
