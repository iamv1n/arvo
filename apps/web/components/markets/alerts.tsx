'use client';

import { BellRinging, Play, Plus, Trash } from '@phosphor-icons/react';
import { App, Button, Card, Descriptions, Empty, Flex, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTheme } from 'styled-components';
import { api } from '../../lib/api';
import {
  ALERT_KIND_LABELS,
  useAlert,
  useAlerts,
  useMarketMutation,
  useWatchlists,
  type Alert,
  type AlertEvaluation,
  type AlertKind,
} from '../../lib/markets';
import { MonoLabel } from '../mono-label';
import { AlertStatusTag, Blank } from './shared';

/*
 * The alerts tab.
 *
 * The form is built around one idea: before saving anything, the user reads their rule back as
 * an English sentence. "Notify me once if NIFTY closes above 25,000" is checkable at a glance in
 * a way that a form full of dropdowns is not, and a rule the user misread is a rule that wakes
 * them at 2am for nothing.
 *
 * Trigger history shows the evidence snapshot, not a re-computation. Six months later "why did
 * this fire?" has an answer that does not depend on today's prices.
 */

/** The same sentence the server writes, so the preview and the email never disagree. */
function describe(kind: AlertKind, params: Record<string, unknown>, repeats: boolean): string {
  const once = repeats ? 'Notify me whenever' : 'Notify me once if';
  const value = (key: string, fallback = '…') => String(params[key] ?? '') || fallback;
  switch (kind) {
    case 'PRICE_LEVEL':
      return `${once} ${value('symbol', 'that instrument')} trades ${params.direction === 'BELOW' ? 'at or below' : 'at or above'} ${value('level')}.`;
    case 'PORTFOLIO_DRAWDOWN':
      return `${once} my portfolio falls more than ${value('percent')}% below its peak.`;
    case 'HOLDING_PNL':
      return `${once} this holding's unrealised P&L is ${params.direction === 'BELOW' ? 'at or below' : 'at or above'} ${value('value')}${params.mode === 'PERCENT' ? '%' : ''}.`;
    case 'SIP_MISSED':
      return `${once} ${String(params.label ?? '') || 'a recurring debit'} has not been seen within ${value('graceDays')} days of the date it was expected.`;
    case 'OPTION_DELTA':
      return `${once} an open option position's delta goes beyond ±${value('maxAbsDelta')}.`;
    case 'REALISED_LOSS_LIMIT':
      return `${once} my realised losses this ${String(params.window ?? 'day').toLowerCase()} reach ${value('amount')}.`;
    case 'TRADE_COUNT':
      return `${once} I place more than ${value('count')} trades in a day.`;
    case 'EXPIRY_UPCOMING':
      return `${once} an open F&O position expires within ${value('daysBefore')} days.`;
    case 'CORPORATE_ACTION':
      return `${once} a holding or watched instrument has a corporate action within ${value('daysBefore')} days.`;
    default:
      return '';
  }
}

const DEFAULT_PARAMS: Record<AlertKind, Record<string, unknown>> = {
  PRICE_LEVEL: { symbol: '', exchange: null, direction: 'ABOVE', level: '' },
  PORTFOLIO_DRAWDOWN: { percent: '10' },
  HOLDING_PNL: { holdingId: '', mode: 'PERCENT', direction: 'BELOW', value: '-10' },
  SIP_MISSED: { seriesId: null, label: null, graceDays: 5 },
  OPTION_DELTA: { positionId: null, label: null, maxAbsDelta: '100', spot: '0', impliedVolatilityPercent: '14' },
  REALISED_LOSS_LIMIT: { window: 'DAY', amount: '5000' },
  TRADE_COUNT: { count: 10 },
  EXPIRY_UPCOMING: { daysBefore: 3 },
  CORPORATE_ACTION: { daysBefore: 7 },
};

export function Alerts({ focusId }: { focusId?: string | null }) {
  const theme = useTheme();
  const { message } = App.useApp();
  const { data: alerts, isLoading } = useAlerts();
  const [editing, setEditing] = useState<Alert | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusId ?? null);

  const remove = useMarketMutation((id: string) => api<void>(`/alerts/${id}`, { method: 'DELETE' }));
  const toggle = useMarketMutation((input: { id: string; isEnabled: boolean }) => api(`/alerts/${input.id}`, { method: 'PATCH', body: { isEnabled: input.isEnabled } }));
  const evaluate = useMarketMutation(() => api<{ evaluated: number; fired: number }>('/alerts/evaluate', { method: 'POST' }));

  if (!isLoading && !alerts?.length) {
    return (
      <>
        <Blank
          title="No alerts yet"
          body="An alert is a rule you write: a price crossing a level, a drawdown past a percentage, a SIP that did not arrive. Arvo checks them hourly and tells you what happened, with the numbers it used."
          action={
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Write an alert
            </Button>
          }
        />
        <AlertForm open={editing === 'new'} alert={null} onClose={() => setEditing(null)} />
      </>
    );
  }

  return (
    <>
      <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
          New alert
        </Button>
        <Button
          icon={<Play size={15} />}
          loading={evaluate.isPending}
          onClick={() =>
            evaluate.mutate(undefined, {
              onSuccess: (result) =>
                message.success(`${result.evaluated} alert${result.evaluated === 1 ? '' : 's'} checked, ${result.fired} fired`),
            })
          }
        >
          Evaluate now
        </Button>
        <MonoLabel style={{ marginLeft: 'auto' }}>Checked hourly · never on stale prices</MonoLabel>
      </Flex>

      <Flex vertical gap={12}>
        {(alerts ?? []).map((alert) => (
          <Card key={alert.id} size="small" styles={{ body: { padding: 16 } }}>
            <Flex gap={16} align="flex-start" wrap>
              <div style={{ flex: 1, minWidth: 260 }}>
                <Flex gap={8} align="center" wrap style={{ marginBottom: 4 }}>
                  <span style={{ fontFamily: theme.typography.fontFamilySerif, fontSize: 17 }}>{alert.name}</span>
                  <AlertStatusTag status={alert.lastStatus} enabled={alert.isEnabled} />
                  {!alert.repeats && <Tag>Once</Tag>}
                  {alert.channels.filter((c) => c !== 'IN_APP').map((channel) => (
                    <Tag key={channel} color="geekblue">
                      {channel === 'EMAIL' ? 'Email' : 'Telegram'}
                    </Tag>
                  ))}
                </Flex>
                <div style={{ color: theme.colors.textSecondary }}>{alert.rule}</div>
                {alert.lastMessage && (
                  <div style={{ marginTop: 6, fontSize: 12, color: alert.lastStatus === 'SKIPPED_STALE' ? theme.colors.warning : theme.colors.textMuted }}>
                    {alert.lastMessage}
                  </div>
                )}
              </div>
              <Space wrap>
                <Switch
                  size="small"
                  checked={alert.isEnabled}
                  onChange={(checked) => toggle.mutate({ id: alert.id, isEnabled: checked })}
                  aria-label={`${alert.isEnabled ? 'Turn off' : 'Turn on'} ${alert.name}`}
                />
                <Button size="small" onClick={() => setOpenId(alert.id)}>
                  History ({alert.triggerCount})
                </Button>
                <Button size="small" onClick={() => setEditing(alert)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  type="text"
                  icon={<Trash size={14} />}
                  aria-label={`Delete ${alert.name}`}
                  onClick={() =>
                    Modal.confirm({
                      title: `Delete "${alert.name}"?`,
                      content: 'The rule and its trigger history go with it.',
                      okText: 'Delete',
                      okButtonProps: { danger: true },
                      onOk: () => remove.mutateAsync(alert.id),
                    })
                  }
                />
              </Space>
            </Flex>
          </Card>
        ))}
      </Flex>

      <AlertForm open={editing !== null} alert={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <HistoryDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function AlertForm({ open, alert, onClose }: { open: boolean; alert: Alert | null; onClose: () => void }) {
  const theme = useTheme();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { data: lists } = useWatchlists();
  const [preview, setPreview] = useState<AlertEvaluation | null>(null);

  const kind: AlertKind = Form.useWatch('kind', form) ?? alert?.kind ?? 'PRICE_LEVEL';
  const params = (Form.useWatch('params', form) ?? {}) as Record<string, unknown>;
  const repeats = Form.useWatch('repeats', form) ?? false;

  const save = useMarketMutation((body: Record<string, unknown>) =>
    alert ? api(`/alerts/${alert.id}`, { method: 'PATCH', body }) : api('/alerts', { method: 'POST', body }),
  );
  const test = useMarketMutation((id: string) => api<AlertEvaluation>(`/alerts/${id}/test`, { method: 'POST' }));

  return (
    <Modal
      open={open}
      title={alert ? `Edit "${alert.name}"` : 'Write an alert'}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={620}
      afterOpenChange={(visible) => {
        if (!visible) return;
        setPreview(null);
        form.setFieldsValue(
          alert
            ? { name: alert.name, kind: alert.kind, params: alert.params, repeats: alert.repeats, cooldownMinutes: alert.cooldownMinutes, channels: alert.channels }
            : { name: '', kind: 'PRICE_LEVEL', params: DEFAULT_PARAMS.PRICE_LEVEL, repeats: false, cooldownMinutes: 1440, channels: ['IN_APP'] },
        );
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values: Record<string, unknown>) =>
          save.mutate(alert ? { ...values, kind: undefined } : values, {
            onSuccess: onClose,
            onError: (error) => message.error((error as Error).message),
          })
        }
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name the alert so you recognise it in an email' }]}>
          <Input placeholder="NIFTY above 25,000" autoFocus />
        </Form.Item>

        <Form.Item name="kind" label="What should Arvo watch?">
          <Select
            disabled={!!alert}
            onChange={(next: AlertKind) => form.setFieldValue('params', DEFAULT_PARAMS[next])}
            options={ALERT_KIND_LABELS.map((entry) => ({
              value: entry.kind,
              label: (
                <div>
                  <div>{entry.label}</div>
                  <div style={{ fontSize: 12, color: theme.colors.textMuted }}>{entry.hint}</div>
                </div>
              ),
            }))}
          />
        </Form.Item>

        <KindFields kind={kind} symbols={(lists ?? []).map((list) => list.id)} />

        <Flex gap={16} wrap>
          <Form.Item name="repeats" label="Repeats" valuePropName="checked" tooltip="Off means one-shot: the alert turns itself off once it fires.">
            <Switch />
          </Form.Item>
          <Form.Item name="cooldownMinutes" label="Cooldown (minutes)" tooltip="The shortest gap between two firings of the same alert.">
            <InputNumber min={0} max={43200} />
          </Form.Item>
          <Form.Item name="channels" label="Send it" style={{ flex: 1, minWidth: 220 }}>
            <Select
              mode="multiple"
              options={[
                { value: 'IN_APP', label: 'In the app', disabled: true },
                { value: 'EMAIL', label: 'Email' },
                { value: 'TELEGRAM', label: 'Telegram' },
              ]}
            />
          </Form.Item>
        </Flex>

        <Card size="small" style={{ background: theme.colors.brandSubtle, borderColor: theme.colors.brand, marginBottom: 16 }}>
          <MonoLabel style={{ marginBottom: 4 }}>Your rule, in words</MonoLabel>
          <div style={{ fontFamily: theme.typography.fontFamilySerif, fontSize: 16 }}>{describe(kind, params, repeats as boolean)}</div>
        </Card>

        {preview && (
          <Card size="small" style={{ marginBottom: 16 }}>
            <MonoLabel style={{ marginBottom: 4 }}>If Arvo checked right now</MonoLabel>
            <div>{preview.message}</div>
            <div style={{ marginTop: 6 }}>
              <AlertStatusTag status={preview.status} enabled />
            </div>
          </Card>
        )}

        <Space>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {alert ? 'Save changes' : 'Create alert'}
          </Button>
          {alert && (
            <Button
              loading={test.isPending}
              onClick={() => test.mutate(alert.id, { onSuccess: setPreview })}
              icon={<BellRinging size={15} />}
            >
              Test it (fires nothing)
            </Button>
          )}
        </Space>
      </Form>
    </Modal>
  );
}

/** The fields one alert kind needs, and nothing else. */
function KindFields({ kind }: { kind: AlertKind; symbols: string[] }) {
  switch (kind) {
    case 'PRICE_LEVEL':
      return (
        <Flex gap={12} wrap>
          <Form.Item name={['params', 'symbol']} label="Symbol" rules={[{ required: true, message: 'Which instrument?' }]} style={{ flex: 1, minWidth: 140 }}>
            <Input placeholder="NIFTY" />
          </Form.Item>
          <Form.Item name={['params', 'direction']} label="Direction" style={{ minWidth: 150 }}>
            <Select options={[{ value: 'ABOVE', label: 'Rises to or above' }, { value: 'BELOW', label: 'Falls to or below' }]} />
          </Form.Item>
          <Form.Item name={['params', 'level']} label="Level" rules={[{ required: true, message: 'A price level' }]} style={{ minWidth: 140 }}>
            <Input inputMode="decimal" placeholder="25000" />
          </Form.Item>
        </Flex>
      );
    case 'PORTFOLIO_DRAWDOWN':
      return (
        <Form.Item name={['params', 'percent']} label="Drawdown from the peak (%)" rules={[{ required: true, message: 'A percentage' }]}>
          <Input inputMode="decimal" placeholder="10" style={{ maxWidth: 160 }} />
        </Form.Item>
      );
    case 'HOLDING_PNL':
      return (
        <Flex gap={12} wrap>
          <Form.Item name={['params', 'holdingId']} label="Holding id" rules={[{ required: true, message: 'Copy it from /portfolio' }]} style={{ flex: 1, minWidth: 220 }}>
            <Input placeholder="Holding id from your portfolio" />
          </Form.Item>
          <Form.Item name={['params', 'mode']} label="Measured in" style={{ minWidth: 140 }}>
            <Select options={[{ value: 'PERCENT', label: 'Percent' }, { value: 'AMOUNT', label: 'Rupees' }]} />
          </Form.Item>
          <Form.Item name={['params', 'direction']} label="Direction" style={{ minWidth: 150 }}>
            <Select options={[{ value: 'ABOVE', label: 'At or above' }, { value: 'BELOW', label: 'At or below' }]} />
          </Form.Item>
          <Form.Item name={['params', 'value']} label="Threshold" rules={[{ required: true, message: 'A threshold' }]} style={{ minWidth: 140 }}>
            <Input inputMode="decimal" placeholder="-10" />
          </Form.Item>
        </Flex>
      );
    case 'SIP_MISSED':
      return (
        <Flex gap={12} wrap>
          <Form.Item name={['params', 'label']} label="Which debit" tooltip="Leave blank to watch every recurring series Arvo detected." style={{ flex: 1, minWidth: 220 }}>
            <Input placeholder="Any recurring debit" />
          </Form.Item>
          <Form.Item name={['params', 'graceDays']} label="Grace (days)" style={{ minWidth: 140 }}>
            <InputNumber min={0} max={90} />
          </Form.Item>
        </Flex>
      );
    case 'OPTION_DELTA':
      return (
        <Flex gap={12} wrap>
          <Form.Item name={['params', 'maxAbsDelta']} label="Delta limit (±)" rules={[{ required: true, message: 'A delta limit' }]} style={{ minWidth: 160 }}>
            <Input inputMode="decimal" placeholder="100" />
          </Form.Item>
          <Form.Item name={['params', 'spot']} label="Spot" tooltip="Used when no quote is known for the underlying." style={{ minWidth: 140 }}>
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name={['params', 'impliedVolatilityPercent']} label="IV (%)" style={{ minWidth: 120 }}>
            <Input inputMode="decimal" />
          </Form.Item>
        </Flex>
      );
    case 'REALISED_LOSS_LIMIT':
      return (
        <Flex gap={12} wrap>
          <Form.Item name={['params', 'window']} label="Over" style={{ minWidth: 150 }}>
            <Select options={[{ value: 'DAY', label: 'A day' }, { value: 'WEEK', label: 'A week' }]} />
          </Form.Item>
          <Form.Item name={['params', 'amount']} label="Loss limit" rules={[{ required: true, message: 'An amount' }]} style={{ minWidth: 160 }}>
            <Input inputMode="decimal" placeholder="5000" />
          </Form.Item>
        </Flex>
      );
    case 'TRADE_COUNT':
      return (
        <Form.Item name={['params', 'count']} label="Trades in a day" rules={[{ required: true, message: 'A count' }]}>
          <InputNumber min={1} max={1000} />
        </Form.Item>
      );
    case 'EXPIRY_UPCOMING':
    case 'CORPORATE_ACTION':
      return (
        <Form.Item name={['params', 'daysBefore']} label="Days of notice" rules={[{ required: true, message: 'How many days ahead?' }]}>
          <InputNumber min={0} max={60} />
        </Form.Item>
      );
    default:
      return null;
  }
}

function HistoryDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const theme = useTheme();
  const { data } = useAlert(id);
  return (
    <Modal open={!!id} title={data?.name ?? 'Trigger history'} onCancel={onClose} footer={null} width={640} destroyOnHidden>
      {data && <Typography.Paragraph type="secondary">{data.rule}</Typography.Paragraph>}
      {!data?.triggers.length ? (
        <Empty description="This alert has not fired yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Flex vertical gap={12}>
          {data.triggers.map((trigger) => (
            <Card key={trigger.id} size="small">
              <MonoLabel style={{ marginBottom: 4 }}>{new Date(trigger.firedAt).toLocaleString()}</MonoLabel>
              <div style={{ marginBottom: 8 }}>{trigger.message}</div>
              <Descriptions size="small" column={1} styles={{ label: { color: theme.colors.textMuted, width: 160 } }}>
                {Object.entries(trigger.evidence)
                  .filter(([key, value]) => key !== 'kind' && value !== null && typeof value !== 'object')
                  .map(([key, value]) => (
                    <Descriptions.Item key={key} label={key}>
                      {String(value)}
                    </Descriptions.Item>
                  ))}
              </Descriptions>
            </Card>
          ))}
        </Flex>
      )}
      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>
        The figures above are the snapshot the decision was made from. They are never recomputed, so this page says what Arvo actually saw.
      </Typography.Paragraph>
    </Modal>
  );
}
