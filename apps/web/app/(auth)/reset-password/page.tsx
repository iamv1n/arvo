'use client';

import { Alert, Button, Form, Input, Result } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, errorMessage } from '../../../lib/api';
import { AuthCard } from '../auth-card';

function ResetPasswordForm() {
  const token = useSearchParams().get('token');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async ({ password }: { password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  let body;
  if (!token) {
    body = <Result status="warning" title="Missing reset link" subTitle="Open the link from your email, or request a new one." extra={<Link href="/forgot-password">Request a new link</Link>} />;
  } else if (done) {
    body = (
      <Result
        status="success"
        title="Password updated"
        subTitle="You've been signed out everywhere. Sign in with your new password."
        extra={
          <Link href="/login">
            <Button type="primary">Sign in</Button>
          </Link>
        }
      />
    );
  } else {
    body = (
      <>
        {error && (
          <Alert
            type="error"
            title={error}
            description={<Link href="/forgot-password">Request a new link</Link>}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="password" label="New password" rules={[{ required: true, min: 10, message: 'At least 10 characters' }]}>
            <Input.Password autoComplete="new-password" autoFocus size="large" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm new password"
            dependencies={['password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, value) => (value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            Set new password
          </Button>
        </Form>
      </>
    );
  }

  return (
    <AuthCard title="Choose a new password" footer={<Link href="/login">Back to sign in</Link>}>
      {body}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
