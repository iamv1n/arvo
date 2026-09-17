'use client';

import { CheckCircleFilled, CopyOutlined, DownloadOutlined, ExclamationCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Flex, Form, Input, Modal, Steps, Tag, Typography } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import type { TokenResponse, TwoFactorStatus } from '../../lib/types';
import { MonoLabel } from '../mono-label';
import { SectionIntro, SettingRow } from './setting-row';

const CodeGrid = styled.ol`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[2]}px ${({ theme }) => theme.space[6]}px;
  margin: 0;
  padding: ${({ theme }) => theme.space[4]}px ${({ theme }) => theme.space[5]}px;
  list-style: none;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 15px;
  letter-spacing: 0.04em;
  counter-reset: code;

  li::before {
    counter-increment: code;
    content: counter(code, decimal-leading-zero) '  ';
    color: ${({ theme }) => theme.colors.textMuted};
    font-size: 11px;
  }
`;

const SecretKey = styled(Typography.Text)`
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 13px;
  word-break: break-all;
`;

const QrFrame = styled.div`
  flex: none;
  padding: ${({ theme }) => theme.space[2]}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: #ffffff;
  line-height: 0;
`;

const errorOf = (e: unknown) => errorMessage(e);

/* ------------------------------------------------------------ email status */

export function EmailVerificationSettings() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [sending, setSending] = useState(false);
  const verified = !!user?.emailVerifiedAt;

  const resend = async () => {
    setSending(true);
    try {
      const { sent } = await api<{ sent: boolean }>('/auth/resend-verification', { method: 'POST' });
      message.success(sent ? `Verification link sent to ${user?.email}` : 'Your email is already verified');
    } catch (e) {
      message.error(errorOf(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SettingRow
      label="Email address"
      hint={verified ? `Verified on ${formatDate(user!.emailVerifiedAt!)}` : 'Confirm your address so password resets and security notices reach you.'}
    >
      <Flex align="center" gap={12}>
        <Typography.Text>{user?.email}</Typography.Text>
        {verified ? (
          <Tag color="success" icon={<CheckCircleFilled />}>
            Verified
          </Tag>
        ) : (
          <>
            <Tag color="warning" icon={<ExclamationCircleFilled />}>
              Unverified
            </Tag>
            <Button size="small" loading={sending} onClick={() => void resend()}>
              Resend link
            </Button>
          </>
        )}
      </Flex>
    </SettingRow>
  );
}

/* --------------------------------------------------------- change password */

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { applyTokens } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async (values: { currentPassword: string; newPassword: string }) => {
    setSaving(true);
    try {
      applyTokens(await api<TokenResponse>('/auth/change-password', { method: 'POST', body: { currentPassword: values.currentPassword, newPassword: values.newPassword } }));
      message.success('Password changed. Other sessions were signed out.');
      form.resetFields();
      onClose();
    } catch (e) {
      message.error(errorOf(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Change password" open={open} onCancel={onClose} okText="Change password" confirmLoading={saving} onOk={() => form.submit()} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} style={{ marginTop: 16 }}>
        <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item name="newPassword" label="New password" rules={[{ required: true, min: 10, message: 'At least 10 characters' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Confirm new password"
          dependencies={['newPassword']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, value) => (value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ------------------------------------------------------------- recovery codes */

function RecoveryCodes({ codes, email }: { codes: string[]; email: string }) {
  const { message } = App.useApp();
  const text = `Arvo recovery codes for ${email}\nGenerated ${new Date().toISOString().slice(0, 10)}. Each code works once.\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    Object.assign(document.createElement('a'), { href: url, download: 'arvo-recovery-codes.txt' }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <Flex vertical gap={12}>
      <Alert type="warning" showIcon title="Save these codes now" description="They are shown only once. Each code signs you in once if you lose your authenticator." />
      <CodeGrid>
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </CodeGrid>
      <Flex gap={8}>
        <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(codes.join('\n')).then(() => message.success('Copied'))}>
          Copy
        </Button>
        <Button icon={<DownloadOutlined />} onClick={download}>
          Download .txt
        </Button>
      </Flex>
    </Flex>
  );
}

/* ----------------------------------------------------------- enable (setup) */

interface TotpSetup {
  otpauthUri: string;
  secret: string;
  qrDataUrl: string;
}

function EnableTwoFactorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, reloadUser } = useAuth();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api<TotpSetup>('/auth/2fa/totp/setup', { method: 'POST' }));
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value = code) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ recoveryCodes: string[] }>('/auth/2fa/totp/enable', { method: 'POST', body: { code: value } });
      setCodes(res.recoveryCodes);
      await Promise.all([reloadUser(), queryClient.invalidateQueries({ queryKey: ['2fa'] })]);
      message.success('Two-factor authentication is on');
    } catch (e) {
      setError(errorOf(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setSetup(null);
    setCode('');
    setCodes(null);
    setError(null);
    onClose();
  };

  const current = codes ? 2 : setup ? 1 : 0;

  return (
    <Modal
      title="Turn on two-factor authentication"
      open={open}
      onCancel={codes ? undefined : close}
      closable={!codes}
      mask={{ closable: false }}
      afterOpenChange={(visible) => {
        if (visible && !setup && !codes) void start();
      }}
      footer={
        codes ? (
          <Button type="primary" onClick={close}>
            I&apos;ve saved my codes
          </Button>
        ) : (
          <Flex justify="end" gap={8}>
            <Button onClick={close}>Cancel</Button>
            <Button type="primary" loading={busy} disabled={!/^\d{6}$/.test(code)} onClick={() => void confirm()}>
              Confirm
            </Button>
          </Flex>
        )
      }
      width={560}
      destroyOnHidden
    >
      <Steps size="small" current={current} style={{ margin: '16px 0 24px' }} items={[{ title: 'Scan' }, { title: 'Confirm' }, { title: 'Save codes' }]} />
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      {codes ? (
        <RecoveryCodes codes={codes} email={user?.email ?? ''} />
      ) : !setup ? (
        <Flex justify="center" style={{ padding: 32 }}>
          <Button loading={busy} onClick={() => void start()}>
            Generate key
          </Button>
        </Flex>
      ) : (
        <Flex vertical gap={20}>
          <Flex gap={20} align="center" wrap>
            <QrFrame>
              {/* Rendered by the API from the otpauth URI; no third-party QR service. */}
              <img src={setup.qrDataUrl} width={168} height={168} alt="QR code for your authenticator app" />
            </QrFrame>
            <Flex vertical gap={6} style={{ flex: 1, minWidth: 220 }}>
              <MonoLabel>1 · Scan</MonoLabel>
              <Typography.Text type="secondary">
                Scan with an authenticator app such as 1Password, Google Authenticator, Authy or Aegis. Can&apos;t scan? Enter this key:
              </Typography.Text>
              <SecretKey copyable={{ text: setup.secret }}>{setup.secret.match(/.{1,4}/g)?.join(' ')}</SecretKey>
            </Flex>
          </Flex>
          <Flex vertical gap={8}>
            <MonoLabel>2 · Enter the 6-digit code</MonoLabel>
            <Input.OTP
              length={6}
              value={code}
              formatter={(v) => v.replace(/\D/g, '')}
              onChange={(v) => {
                setCode(v);
                if (/^\d{6}$/.test(v)) void confirm(v);
              }}
              disabled={busy}
            />
          </Flex>
        </Flex>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------- regenerate / disable */

function CodeActionModal({
  mode,
  onClose,
}: {
  mode: 'regenerate' | 'disable' | null;
  onClose: () => void;
}) {
  const { user, reloadUser } = useAuth();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  const close = () => {
    setCodes(null);
    form.resetFields();
    onClose();
  };

  const submit = async (values: { password?: string; code: string }) => {
    setBusy(true);
    try {
      if (mode === 'disable') {
        await api('/auth/2fa/disable', { method: 'POST', body: { password: values.password, code: values.code } });
        message.success('Two-factor authentication is off');
        await Promise.all([reloadUser(), queryClient.invalidateQueries({ queryKey: ['2fa'] })]);
        close();
      } else {
        const res = await api<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes/regenerate', { method: 'POST', body: { code: values.code } });
        setCodes(res.recoveryCodes);
        await queryClient.invalidateQueries({ queryKey: ['2fa'] });
      }
    } catch (e) {
      message.error(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const disabling = mode === 'disable';
  return (
    <Modal
      title={disabling ? 'Turn off two-factor authentication' : 'New recovery codes'}
      open={mode !== null}
      onCancel={close}
      destroyOnHidden
      footer={
        codes ? (
          <Button type="primary" onClick={close}>
            I&apos;ve saved my codes
          </Button>
        ) : (
          <Flex justify="end" gap={8}>
            <Button onClick={close}>Cancel</Button>
            <Button type="primary" danger={disabling} loading={busy} onClick={() => form.submit()}>
              {disabling ? 'Turn off' : 'Generate new codes'}
            </Button>
          </Flex>
        )
      }
    >
      {codes ? (
        <RecoveryCodes codes={codes} email={user?.email ?? ''} />
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
            {disabling
              ? 'Your account will be protected by your password only, and your recovery codes will stop working.'
              : 'Your existing recovery codes will stop working immediately.'}
          </Typography.Paragraph>
          <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
            {disabling && (
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password autoComplete="current-password" autoFocus />
              </Form.Item>
            )}
            <Form.Item name="code" label="Authenticator code or recovery code" rules={[{ required: true, min: 6 }]}>
              <Input autoComplete="one-time-code" autoFocus={!disabling} style={{ fontFamily: 'var(--font-mono), monospace' }} placeholder="123456" />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- the card */

export function SecuritySettings() {
  const { user } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [action, setAction] = useState<'regenerate' | 'disable' | null>(null);
  const status = useQuery({ queryKey: ['2fa', user?.id], queryFn: () => api<TwoFactorStatus>('/auth/2fa') });
  const enabled = status.data?.enabled ?? user?.twoFactorEnabled ?? false;

  return (
    <Card title={<SectionIntro title="Security">Sign-in, password and two-factor authentication.</SectionIntro>}>
      <EmailVerificationSettings />
      <SettingRow label="Password" hint="Changing it signs out your other sessions.">
        <Button onClick={() => setPasswordOpen(true)}>Change password</Button>
      </SettingRow>
      <SettingRow
        label="Two-factor authentication"
        hint={
          enabled
            ? `On since ${status.data?.enabledAt ? formatDate(status.data.enabledAt) : '—'}. Sign-in asks for an authenticator code, an emailed code or a recovery code.`
            : 'Add a second step at sign-in with an authenticator app. Emailed codes and recovery codes work as backups.'
        }
      >
        {enabled ? (
          <Tag color="success" icon={<SafetyCertificateOutlined />}>
            On
          </Tag>
        ) : (
          <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => setEnableOpen(true)}>
            Set up authenticator
          </Button>
        )}
      </SettingRow>
      {enabled && (
        <SettingRow
          label="Recovery codes"
          hint={
            status.data
              ? `${status.data.recoveryCodesRemaining} of 10 unused.${status.data.recoveryCodesRemaining <= 3 ? ' Generate new ones soon.' : ''}`
              : undefined
          }
        >
          <Flex gap={8} wrap>
            <Button onClick={() => setAction('regenerate')}>Regenerate</Button>
            <Button danger onClick={() => setAction('disable')}>
              Turn off 2FA
            </Button>
          </Flex>
        </SettingRow>
      )}
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <EnableTwoFactorModal open={enableOpen} onClose={() => setEnableOpen(false)} />
      <CodeActionModal mode={action} onClose={() => setAction(null)} />
    </Card>
  );
}
