'use client';

import { Alert, Button, Form, Input, Select } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { AuthCard } from '../auth-card';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD', 'CAD', 'JPY'];

export default function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  const onFinish = async (values: { name: string; email: string; password: string; currency: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await register({ ...values, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Create your private finance workspace" footer={<>Already have an account? <Link href="/login">Sign in</Link></>}>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false} initialValues={{ currency: 'INR' }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
          <Input autoComplete="name" autoFocus size="large" />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
          <Input autoComplete="email" size="large" />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true, min: 10, message: 'At least 10 characters' }]}>
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>
        <Form.Item name="currency" label="Base currency">
          <Select size="large" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
          Create account
        </Button>
      </Form>
    </AuthCard>
  );
}
