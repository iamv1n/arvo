'use client';

import { Alert, Button, Form, Input, Result } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { api, errorMessage } from '../../../lib/api';
import { AuthCard } from '../auth-card';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async ({ email }: { email: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
      setSentTo(email);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Reset your password" footer={<>Remembered it? <Link href="/login">Sign in</Link></>}>
      {sentTo ? (
        <Result
          status="success"
          title="Check your inbox"
          subTitle={`If an account exists for ${sentTo}, we've sent a link to reset the password. It expires in 1 hour.`}
          style={{ padding: '16px 0' }}
        />
      ) : (
        <>
          {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]} extra="We'll email you a link to choose a new password.">
              <Input autoComplete="email" autoFocus size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              Send reset link
            </Button>
          </Form>
        </>
      )}
    </AuthCard>
  );
}
