'use client';

import { App, Card, Flex, Segmented, Select, Typography } from 'antd';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { lastImportHint, useReminderSettings, useUpdateReminderSettings } from '../../lib/reminders';
import type { ReminderFrequency } from '../../lib/types';
import { SectionIntro, SettingRow } from './setting-row';

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

export function ReminderSettings() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const settings = useReminderSettings();
  const update = useUpdateReminderSettings();
  const data = settings.data;

  const save = (input: { frequency?: ReminderFrequency; day?: number | null }) =>
    update.mutateAsync(input).then(
      () => message.success('Reminder preference saved'),
      (e) => message.error(errorMessage(e)),
    );

  return (
    <Card title={<SectionIntro title="Email">Saved to your account.</SectionIntro>}>
      <SettingRow label="Upload reminders" hint={lastImportHint(data)}>
        <Flex vertical align="end" gap={8}>
          <Flex gap={8} wrap justify="end">
            <Segmented<ReminderFrequency>
              value={data?.frequency ?? 'off'}
              disabled={!data || update.isPending}
              onChange={(frequency) => void save({ frequency })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'every_15_days', label: 'Every 15 days' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
            {data?.frequency === 'monthly' && (
              <Select<number | 'any'>
                value={data.day ?? 'any'}
                style={{ width: 150 }}
                disabled={update.isPending}
                onChange={(day) => void save({ day: day === 'any' ? null : day })}
                options={[
                  { value: 'any', label: 'A month after' },
                  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `On the ${ordinal(i + 1)}` })),
                ]}
              />
            )}
          </Flex>
          {data?.nextReminderAt && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user?.emailVerifiedAt
                ? `Next reminder ${formatDate(data.nextReminderAt)} unless you import before then`
                : 'Verify your email address to receive reminders'}
            </Typography.Text>
          )}
        </Flex>
      </SettingRow>
    </Card>
  );
}
