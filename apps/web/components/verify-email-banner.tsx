'use client';

import { MailOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Shown across the app until the account email is confirmed. Dismissal lasts for this tab session. */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('arvo:verify-banner-dismissed') === '1';
    } catch {
      return false;
    }
  });

  if (!user || user.emailVerifiedAt || dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      const { sent } = await api<{ sent: boolean }>('/auth/resend-verification', { method: 'POST' });
      message.success(sent ? `Check ${user.email} for a new link` : 'Your email is already verified');
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Alert
      type="warning"
      showIcon
      icon={<MailOutlined />}
      style={{ marginBottom: 24 }}
      title={<>Confirm your email address, <strong>{user.email}</strong>, so password resets and security notices reach you.</>}
      action={
        <Button size="small" loading={sending} onClick={() => void resend()}>
          Resend link
        </Button>
      }
      closable={{
        onClose: () => {
          setDismissed(true);
          try {
            sessionStorage.setItem('arvo:verify-banner-dismissed', '1');
          } catch {
            // storage unavailable
          }
        },
      }}
    />
  );
}
