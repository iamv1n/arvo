'use client';

import { Alert, Button, Flex, Form, Input, Typography } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MonoLabel } from '../../../components/mono-label';
import { ApiError, api, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import type { TwoFactorChallenge, TwoFactorMethod } from '../../../lib/types';
import { AuthCard } from '../auth-card';

const METHOD_COPY: Record<TwoFactorMethod, { title: string; hint: string }> = {
  totp: { title: 'Enter your authenticator code', hint: 'Open your authenticator app and enter the 6-digit code for Arvo.' },
  email: { title: 'Check your email', hint: 'We sent a 6-digit code to your email. It expires in 10 minutes.' },
  recovery: { title: 'Use a recovery code', hint: 'Enter one of the recovery codes you saved when you turned on two-factor authentication. Each works once.' },
};

function SecondStep({ challenge, onCancel }: { challenge: TwoFactorChallenge; onCancel: () => void }) {
  const { verifyTwoFactor } = useAuth();
  const [method, setMethod] = useState<TwoFactorMethod>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const submit = async (value = code) => {
    if (!value.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyTwoFactor(challenge.challengeToken, method, value.trim());
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'INVALID_CHALLENGE' ? 'This sign-in attempt expired. Start again.' : errorMessage(e));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const sendEmail = async () => {
    setSending(true);
    setError(null);
    try {
      await api('/auth/2fa/email/send', { method: 'POST', body: { challengeToken: challenge.challengeToken }, auth: false });
      setEmailSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const switchTo = (next: TwoFactorMethod) => {
    setMethod(next);
    setCode('');
    setError(null);
    if (next === 'email' && !emailSent) void sendEmail();
  };

  const copy = METHOD_COPY[method];
  const otp = method !== 'recovery';

  return (
    <>
      <MonoLabel>Step 2 of 2 · Two-factor</MonoLabel>
      <Typography.Title level={4} style={{ margin: '6px 0 4px', fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 500 }}>
        {copy.title}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{copy.hint}</Typography.Paragraph>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {otp ? (
          <Flex justify="center" style={{ marginBottom: 20 }}>
            <Input.OTP
              key={method}
              length={6}
              size="large"
              autoFocus
              value={code}
              formatter={(v) => v.replace(/\D/g, '')}
              onChange={(v) => {
                setCode(v);
                if (/^\d{6}$/.test(v)) void submit(v);
              }}
              disabled={submitting || (method === 'email' && sending)}
            />
          </Flex>
        ) : (
          <Input
            size="large"
            autoFocus
            placeholder="xxxxx-xxxxx"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ marginBottom: 20, fontFamily: 'var(--font-mono), monospace' }}
          />
        )}
        <Button type="primary" htmlType="submit" block size="large" loading={submitting} disabled={!code.trim()}>
          Verify and sign in
        </Button>
      </form>
      <Flex vertical align="center" gap={2} style={{ marginTop: 16 }}>
        {method !== 'totp' && (
          <Button type="link" size="small" onClick={() => switchTo('totp')}>
            Use your authenticator app
          </Button>
        )}
        {method !== 'email' && (
          <Button type="link" size="small" onClick={() => switchTo('email')}>
            Email me a code instead
          </Button>
        )}
        {method === 'email' && (
          <Button type="link" size="small" loading={sending} onClick={() => void sendEmail()}>
            {emailSent ? 'Resend code' : 'Send code'}
          </Button>
        )}
        {method !== 'recovery' && (
          <Button type="link" size="small" onClick={() => switchTo('recovery')}>
            Use a recovery code
          </Button>
        )}
        <Button type="text" size="small" onClick={onCancel}>
          Back to sign in
        </Button>
      </Flex>
    </>
  );
}

function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next.startsWith('/') ? next : '/dashboard');
  }, [status, router, next]);

  const onFinish = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      setChallenge(await login(values.email, values.password));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (challenge) {
    return (
      <AuthCard title="Confirm it's you" footer={<>Never share sign-in codes. Arvo will never ask for them.</>}>
        <SecondStep challenge={challenge} onCancel={() => setChallenge(null)} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign in to your finances" footer={<>New here? <Link href="/register">Create an account</Link></>}>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
          <Input autoComplete="email" autoFocus size="large" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true }]}
          extra={
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
          }
        >
          <Input.Password autoComplete="current-password" size="large" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
          Sign in
        </Button>
      </Form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
