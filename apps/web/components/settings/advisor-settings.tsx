'use client';

import { App, Card, Flex, Select, Switch, Typography } from 'antd';
import { useAdvisorStatus, useUpdateAdvisorSettings } from '../../lib/advisor';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useReminderSettings, useUpdateReminderSettings } from '../../lib/reminders';
import { SectionIntro, SettingRow } from './setting-row';

/** AI advisor provider override and the weekly briefing email. */
export function AdvisorSettings() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const status = useAdvisorStatus();
  const updateAdvisor = useUpdateAdvisorSettings();
  const reminders = useReminderSettings();
  const updateReminders = useUpdateReminderSettings();
  const data = status.data;
  const current = data?.available.find((p) => p.provider === (data.override.provider ?? data.provider));

  const save = (input: { provider?: string | null; model?: string | null }) =>
    updateAdvisor.mutateAsync(input).then(
      () => message.success('Advisor preference saved'),
      (e) => message.error(errorMessage(e)),
    );

  return (
    <Card title={<SectionIntro title="AI advisor">Saved to your account. API keys are configured on the server, never here.</SectionIntro>}>
      <SettingRow
        label="Provider"
        hint={
          !data
            ? 'Loading…'
            : !data.enabled
              ? 'The advisor is off on this install. Set AI_PROVIDER and a key in the server environment to enable it.'
              : data.cloud
                ? `Your financial data is sent to ${data.providerLabel} to answer.`
                : 'Runs locally; your data stays on this machine.'
        }
      >
        <Flex gap={8} wrap justify="end">
          <Select<string>
            style={{ width: 200 }}
            disabled={!data?.enabled || updateAdvisor.isPending}
            value={data?.override.provider ?? 'default'}
            onChange={(provider) => void save({ provider: provider === 'default' ? null : provider })}
            options={[
              { value: 'default', label: `Install default${data?.enabled ? ` (${data.available.find((p) => p.provider === data.installDefault.provider)?.label ?? data.installDefault.provider})` : ''}` },
              ...(data?.available ?? []).map((p) => ({ value: p.provider, label: `${p.label}${p.cloud ? ' · cloud' : ' · local'}` })),
            ]}
          />
          <Select<string>
            style={{ width: 220 }}
            disabled={!data?.enabled || updateAdvisor.isPending}
            value={data?.model ?? undefined}
            placeholder="Model"
            showSearch
            onChange={(model) => void save({ model: model === current?.defaultModel && !data?.override.model ? null : model })}
            options={(current?.models ?? []).map((m) => ({ value: m, label: m }))}
          />
        </Flex>
      </SettingRow>
      <SettingRow
        label="Weekly briefing email"
        hint={
          user?.emailVerifiedAt
            ? 'Monday at 08:00 in your timezone: what changed, what is pacing over and one decision to make. Figures come from your data; the AI only writes the summary.'
            : 'Verify your email address to receive the weekly briefing.'
        }
      >
        <Flex vertical align="end" gap={4}>
          <Switch
            checked={reminders.data?.weeklyBriefing ?? false}
            disabled={!reminders.data || updateReminders.isPending}
            onChange={(weeklyBriefing) =>
              updateReminders.mutateAsync({ weeklyBriefing }).then(
                () => message.success(weeklyBriefing ? 'Weekly briefing on' : 'Weekly briefing off'),
                (e) => message.error(errorMessage(e)),
              )
            }
          />
          {data && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Advice level {data.adviceLevel}: analysis, education and simulation only
            </Typography.Text>
          )}
        </Flex>
      </SettingRow>
    </Card>
  );
}
