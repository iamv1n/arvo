'use client';

import { FileArrowUp } from '@phosphor-icons/react';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useReminderSettings } from '../lib/reminders';

/** Dashboard nudge when no statement was imported within the user's reminder period. */
export function UploadReminderBanner() {
  const { data } = useReminderSettings();
  if (!data?.overdue) return null;
  const days = data.daysSinceLastImport;
  return (
    <Alert
      type="info"
      showIcon
      icon={<FileArrowUp size={18} weight="duotone" />}
      style={{ marginBottom: 24 }}
      title={days === null ? "You haven't imported a statement yet." : `It's been ${days} days since your last statement import.`}
      description="Upload your latest statements to keep budgets, goals and insights current."
      action={
        <Link href="/imports">
          <Button size="small">Go to imports</Button>
        </Link>
      }
    />
  );
}
