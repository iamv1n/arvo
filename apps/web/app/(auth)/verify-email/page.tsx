'use client';

import { Button, Result, Spin } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { AuthCard } from '../auth-card';

function VerifyEmail() {
  const token = useSearchParams().get('token');
  const { status, reloadUser } = useAuth();
  const [state, setState] = useState<{ kind: 'pending' } | { kind: 'done' } | { kind: 'error'; message: string }>({ kind: 'pending' });
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single use: never submit twice (StrictMode runs effects twice).
    if (!token || started.current) return;
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token }, auth: false }).then(
      () => setState({ kind: 'done' }),
      (e) => setState({ kind: 'error', message: errorMessage(e) }),
    );
  }, [token]);

  useEffect(() => {
    if (state.kind === 'done' && status === 'authenticated') void reloadUser();
  }, [state.kind, status, reloadUser]);

  const next = status === 'authenticated' ? { href: '/dashboard', label: 'Go to dashboard' } : { href: '/login', label: 'Sign in' };

  if (!token) return <Result status="warning" title="Missing verification link" subTitle="Open the link from your email." />;
  if (state.kind === 'pending') return <Spin size="large" style={{ display: 'block', margin: '32px auto' }} />;
  if (state.kind === 'error') {
    return (
      <Result
        status="error"
        title="This link didn't work"
        subTitle={`${state.message}. You can send a new one from Settings → Account.`}
        extra={
          <Link href={status === 'authenticated' ? '/settings?tab=account' : '/login?next=/settings?tab=account'}>
            <Button>Open settings</Button>
          </Link>
        }
      />
    );
  }
  return (
    <Result
      status="success"
      title="Email confirmed"
      subTitle="Thanks — your address is verified."
      extra={
        <Link href={next.href}>
          <Button type="primary">{next.label}</Button>
        </Link>
      }
    />
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Confirm your email" footer={<Link href="/login">Back to sign in</Link>}>
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
