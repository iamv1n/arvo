'use client';

import { CopyOutlined, DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Empty, Flex, Form, Input, Modal, Popconfirm, Select, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';
import { api, errorMessage, MCP_URL } from '../lib/api';
import { formatDate } from '../lib/format';

interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const Code = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[4]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
`;

function CopyableCode({ text }: { text: string }) {
  const { message } = App.useApp();
  return (
    <div style={{ position: 'relative' }}>
      <Code>{text}</Code>
      <Button
        size="small"
        icon={<CopyOutlined />}
        style={{ position: 'absolute', top: 8, right: 8 }}
        onClick={() => navigator.clipboard.writeText(text).then(() => message.success('Copied'))}
        aria-label="Copy"
      />
    </div>
  );
}

function setupSnippets(token: string) {
  return [
    {
      key: 'claude-code',
      label: 'Claude Code',
      text: `claude mcp add --transport http arvo ${MCP_URL} \\\n  --header "Authorization: Bearer ${token}"`,
    },
    {
      key: 'json',
      label: 'Claude Desktop / JSON config',
      text: JSON.stringify({ mcpServers: { arvo: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    },
    {
      key: 'stdio',
      label: 'Local (stdio)',
      text: JSON.stringify(
        { mcpServers: { arvo: { command: 'node', args: ['apps/mcp/dist/main.js', '--stdio'], env: { ARVO_TOKEN: token, DATABASE_URL: 'postgres://…' } } } },
        null,
        2,
      ),
    },
    {
      key: 'other',
      label: 'ChatGPT & others',
      text: `Server URL:     ${MCP_URL}\nTransport:      Streamable HTTP\nAuthentication: header  Authorization: Bearer ${token}`,
    },
  ];
}

/** Personal access tokens and copy-paste setup for MCP-compatible AI assistants. */
export function AiConnections() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: () => api<{ items: ApiToken[] }>('/me/tokens').then((r) => r.items) });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string; expiresInDays?: number }>();

  const create = useMutation({
    mutationFn: (body: { name: string; expiresInDays?: number }) => api<ApiToken & { token: string }>('/me/tokens', { method: 'POST', body }),
    onSuccess: async (result) => {
      setCreated(result.token);
      setCreating(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/me/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      message.success('Token revoked');
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Card
      title="Connect AI assistants"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          New token
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        Let Claude, ChatGPT or any MCP client answer questions about your finances. Tokens are read-only: assistants can
        view your data through Arvo&apos;s finance tools but can&apos;t change anything. When you use a cloud assistant, the
        data it looks up is sent to that provider.
      </Typography.Paragraph>

      {tokens.data?.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tokens yet" />
      ) : (
        <Flex vertical gap={8}>
          {tokens.data?.map((t) => (
            <Flex
              key={t.id}
              justify="space-between"
              align="center"
              gap={12}
              wrap
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ant-color-border-secondary)' }}
            >
              <Flex align="center" gap={10} style={{ minWidth: 0 }}>
                <KeyOutlined />
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong>{t.name}</Typography.Text>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    <code>{t.tokenPrefix}…</code> · created {formatDate(t.createdAt)} ·{' '}
                    {t.lastUsedAt ? `last used ${formatDate(t.lastUsedAt)}` : 'never used'}
                    {t.expiresAt && ` · expires ${formatDate(t.expiresAt)}`}
                  </Typography.Text>
                </div>
              </Flex>
              <Flex align="center" gap={8}>
                <Tag variant="filled">read-only</Tag>
                <Popconfirm title="Revoke this token?" description="Assistants using it stop working immediately." okButtonProps={{ danger: true }} onConfirm={() => revoke.mutate(t.id)}>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Revoke token" />
                </Popconfirm>
              </Flex>
            </Flex>
          ))}
        </Flex>
      )}

      <Modal
        open={creating}
        title="New access token"
        okText="Create token"
        confirmLoading={create.isPending}
        onCancel={() => setCreating(false)}
        onOk={() => form.validateFields().then((values) => create.mutate(values))}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ expiresInDays: 90 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 80 }]} extra="Where you'll use it, e.g. “Claude Desktop on laptop”">
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="expiresInDays" label="Expires">
            <Select
              options={[
                { value: 30, label: 'In 30 days' },
                { value: 90, label: 'In 90 days' },
                { value: 365, label: 'In 1 year' },
                { value: undefined, label: 'Never' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!created} title="Your new token" footer={<Button type="primary" onClick={() => setCreated(null)}>Done</Button>} onCancel={() => setCreated(null)} width={640}>
        {created && (
          <Flex vertical gap={16}>
            <Alert type="warning" showIcon title="Copy it now. For your security it won't be shown again." />
            <CopyableCode text={created} />
            <Typography.Text strong>Connect an assistant</Typography.Text>
            <Tabs items={setupSnippets(created).map((s) => ({ key: s.key, label: s.label, children: <CopyableCode text={s.text} /> }))} />
          </Flex>
        )}
      </Modal>
    </Card>
  );
}
