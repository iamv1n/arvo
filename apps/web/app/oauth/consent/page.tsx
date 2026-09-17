'use client';

import { CheckCircleFilled, LockOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Card, Flex, Result, Spin, Typography } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import styled from 'styled-components';
import { PixelLogo } from '../../../components/logo';
import { api, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

interface PendingRequest {
  id: string;
  client: { name: string; clientUri: string | null; logoUri: string | null; verified: boolean; clientId: string };
  redirectHost: string;
  scopes: string[];
  resource: string;
  expiresAt: string;
}

const Page = styled.main`
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: ${({ theme }) => theme.space[6]}px;
`;

const Permission = styled.li`
  display: flex;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[2]}px 0;
  color: ${({ theme }) => theme.colors.textSecondary};

  .anticon {
    margin-top: 3px;
  }
`;

const SCOPE_TEXT: Record<string, { allowed: string[] }> = {
  'finance:read': {
    allowed: ['View your accounts, balances and net worth', 'View transactions, categories and merchants', 'View analytics: cash flow, spending, recurring charges'],
  },
};

function Consent() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const requestId = params.get('request');
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(`/oauth/consent?request=${requestId ?? ''}`)}`);
  }, [status, router, requestId]);

  useEffect(() => {
    if (status !== 'authenticated' || !requestId) return;
    api<PendingRequest>(`/oauth/requests/${requestId}`).then(setPending, (e) => setError(errorMessage(e)));
  }, [status, requestId]);

  const decide = async (approve: boolean) => {
    setSubmitting(approve ? 'approve' : 'deny');
    try {
      const { redirectTo } = await api<{ redirectTo: string }>(`/oauth/requests/${requestId}/decision`, { method: 'POST', body: { approve } });
      window.location.assign(redirectTo);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(null);
    }
  };

  if (!requestId) return <Result status="warning" title="Missing authorization request" />;
  if (error) return <Result status="error" title="This connection request can't be completed" subTitle={error} />;
  if (status !== 'authenticated' || !pending) return <Spin size="large" />;

  const allowed = pending.scopes.flatMap((s) => SCOPE_TEXT[s]?.allowed ?? [s]);

  return (
    <Card style={{ width: '100%', maxWidth: 460 }} styles={{ body: { padding: 32 } }}>
      <Flex align="center" justify="center" gap={16} style={{ marginBottom: 24 }}>
        <span style={{ ['--arvo-logo-accent' as string]: 'var(--ant-color-primary)' }}>
          <PixelLogo size={48} />
        </span>
        <Typography.Text type="secondary" style={{ fontSize: 20 }}>
          ⇄
        </Typography.Text>
        <Avatar size={48} src={pending.client.logoUri ?? undefined} style={{ fontWeight: 600 }}>
          {pending.client.name.charAt(0).toUpperCase()}
        </Avatar>
      </Flex>
      <Typography.Title level={4} style={{ textAlign: 'center', marginTop: 0 }}>
        {pending.client.name} wants to access your Arvo finances
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
        Signed in as <strong>{user?.email}</strong>.{' '}
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void logout()}>
          Not you?
        </Button>
      </Typography.Paragraph>

      <Typography.Text strong>It will be able to</Typography.Text>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 12px' }}>
        {allowed.map((text) => (
          <Permission key={text}>
            <CheckCircleFilled style={{ color: 'var(--ant-color-success)' }} />
            {text}
          </Permission>
        ))}
        <Permission>
          <StopOutlined />
          It can&apos;t change, move or delete anything (read-only)
        </Permission>
      </ul>

      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        style={{ marginBottom: 20 }}
        title={pending.client.verified ? `Verified app from ${new URL(pending.client.clientId).host}` : 'Self-registered app'}
        description={
          <>
            After you approve, you&apos;ll return to <strong>{pending.redirectHost}</strong>. Data the assistant reads is sent to that
            provider. You can disconnect anytime in Settings → AI assistants.
          </>
        }
      />

      <Flex gap={12}>
        <Button block size="large" onClick={() => decide(false)} loading={submitting === 'deny'} disabled={!!submitting}>
          Deny
        </Button>
        <Button block size="large" type="primary" icon={<LockOutlined />} onClick={() => decide(true)} loading={submitting === 'approve'} disabled={!!submitting}>
          Allow access
        </Button>
      </Flex>
    </Card>
  );
}

export default function ConsentPage() {
  return (
    <Page>
      <Suspense fallback={<Spin size="large" />}>
        <Consent />
      </Suspense>
    </Page>
  );
}
