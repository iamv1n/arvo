'use client';

import { Newspaper, Plus, Trash } from '@phosphor-icons/react';
import { App, Alert, Button, Card, Flex, Form, Input, Space, Switch, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTheme } from 'styled-components';
import { api } from '../../lib/api';
import { useMarketMutation, useNewsDigests, useNewsFeeds, useNewsStatus, type NewsDigest } from '../../lib/markets';
import { MonoLabel } from '../mono-label';
import { Blank } from './shared';

/*
 * The news tab.
 *
 * Off by default and gated twice: the server must allow fetching at all, and the summaries are
 * only written when an AI provider is configured. With AI off the headlines are still collected
 * and listed — the feature degrades rather than disappearing — and the explainer says exactly
 * which switch is missing rather than showing an empty page.
 *
 * Only holdings and watchlist instruments are matched. This is not a discovery feed, and never
 * offering an opinion on direction is a property of the prompt, not of good behaviour.
 */

export function News() {
  const theme = useTheme();
  const { message } = App.useApp();
  const { data: status } = useNewsStatus();
  const { data: feeds } = useNewsFeeds();
  const { data: digests } = useNewsDigests();
  const [showFeeds, setShowFeeds] = useState(false);

  const addFeed = useMarketMutation((body: { url: string; title?: string }) => api('/market/news/feeds', { method: 'POST', body }));
  const updateFeed = useMarketMutation((input: { id: string; isEnabled: boolean }) => api(`/market/news/feeds/${input.id}`, { method: 'PATCH', body: { isEnabled: input.isEnabled } }));
  const removeFeed = useMarketMutation((id: string) => api<void>(`/market/news/feeds/${id}`, { method: 'DELETE' }));
  const build = useMarketMutation(() => api<NewsDigest>('/market/news/digests', { method: 'POST', body: {} }));

  const blockedBy = !status?.fetchingEnabled ? 'fetching' : !status.aiEnabled ? 'ai' : null;

  return (
    <>
      {blockedBy === 'fetching' && (
        <Alert
          type="info"
          showIcon
          icon={<Newspaper size={18} weight="duotone" />}
          style={{ marginBottom: 16 }}
          message="News fetching is off on this server"
          description={
            <span>
              Arvo reaches no network unless you say so. Set <code>NEWS_DIGEST_ENABLED=true</code> on the API and restart it, then add the RSS or Atom feeds you
              already read. Only headlines that name something you hold or watch are kept.
            </span>
          }
        />
      )}
      {blockedBy === 'ai' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Turn on AI to get summaries"
          description={
            <span>
              Headlines will still be collected and listed. A provider is needed only to summarise them — and the summary states no view on direction either way.{' '}
              <Link href="/settings?tab=ai">Choose a provider in Settings</Link>.
            </span>
          }
        />
      )}

      <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          disabled={!status?.fetchingEnabled || !status?.enabledFeeds}
          loading={build.isPending}
          onClick={() => build.mutate(undefined, { onError: (error) => message.error((error as Error).message) })}
        >
          Build a digest now
        </Button>
        <Button onClick={() => setShowFeeds((open) => !open)}>{showFeeds ? 'Hide feeds' : `Feeds (${feeds?.length ?? 0})`}</Button>
        <MonoLabel style={{ marginLeft: 'auto' }}>Holdings and watchlists only · {status?.frequency ?? 'off'}</MonoLabel>
      </Flex>

      {showFeeds && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Form
            layout="inline"
            style={{ marginBottom: 12 }}
            onFinish={(values: { url: string; title?: string }) =>
              addFeed.mutate(values, { onError: (error) => message.error((error as Error).message) })
            }
          >
            <Form.Item name="url" rules={[{ required: true, message: 'A feed URL' }]} style={{ flex: 1, minWidth: 260 }}>
              <Input placeholder="https://example.com/markets.xml" />
            </Form.Item>
            <Form.Item name="title">
              <Input placeholder="Name (optional)" />
            </Form.Item>
            <Button htmlType="submit" icon={<Plus size={14} />}>
              Add feed
            </Button>
          </Form>
          <Flex vertical gap={8}>
            {(feeds ?? []).map((feed) => (
              <Flex key={feed.id} gap={12} align="center" wrap>
                <Switch size="small" checked={feed.isEnabled} onChange={(checked) => updateFeed.mutate({ id: feed.id, isEnabled: checked })} aria-label={`Enable ${feed.title ?? feed.url}`} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.title ?? feed.url}</span>
                {feed.lastError && <Tag color="red">Last fetch failed</Tag>}
                <Button size="small" type="text" danger icon={<Trash size={14} />} aria-label="Remove feed" onClick={() => removeFeed.mutate(feed.id)} />
              </Flex>
            ))}
          </Flex>
        </Card>
      )}

      {!digests?.length ? (
        <Blank
          title="No digests yet"
          body="A digest groups the headlines your feeds published about the instruments you hold and watch, with the sources linked. It never says what to do about them."
        />
      ) : (
        <Flex vertical gap={16}>
          {digests.map((digest) => (
            <Card key={digest.id} size="small" title={`${digest.periodStart} to ${digest.periodEnd}`} extra={<Tag>{digest.provider === 'none' ? 'No AI' : digest.provider}</Tag>}>
              {!digest.items.length ? (
                <Typography.Paragraph type="secondary">Nothing your feeds published named anything you hold or watch.</Typography.Paragraph>
              ) : (
                <Flex vertical gap={16}>
                  {digest.items.map((item) => (
                    <div key={item.symbol}>
                      <MonoLabel style={{ marginBottom: 4 }}>{item.symbol}</MonoLabel>
                      <div style={{ marginBottom: 8, color: theme.colors.textSecondary }}>{item.summary}</div>
                      <Space direction="vertical" size={2}>
                        {item.headlines.map((headline) => (
                          <a key={headline.url || headline.title} href={headline.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                            {headline.title} <span style={{ color: theme.colors.textMuted }}>· {headline.source}</span>
                          </a>
                        ))}
                      </Space>
                    </div>
                  ))}
                </Flex>
              )}
            </Card>
          ))}
        </Flex>
      )}

      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        Summaries are written from the headlines linked above and state no view on direction. Arvo fetches only the feeds you added, only when you ask.
      </Typography.Paragraph>
    </>
  );
}
