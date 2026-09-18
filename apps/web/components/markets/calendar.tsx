'use client';

import { CalendarBlank, Plus, UploadSimple } from '@phosphor-icons/react';
import { App, Button, Card, Checkbox, Flex, Form, Input, Modal, Segmented, Select, Space, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import { useTheme } from 'styled-components';
import { api } from '../../lib/api';
import {
  CORPORATE_ACTION_KINDS,
  IPO_STATUSES,
  uploadCalendar,
  useHolidays,
  useMarketEvents,
  useMarketMutation,
  type CorporateActionKind,
  type IpoStatus,
  type MarketEvent,
} from '../../lib/markets';
import { MonoLabel } from '../mono-label';
import { Panel } from '../panel';
import { Blank } from './shared';

/*
 * The calendar tab.
 *
 * One dated list across all three kinds, because that is how anyone actually asks the question:
 * "what is coming up?", not "show me the corporate actions table". Filters narrow it; the import
 * wizards sit beside it rather than in a separate screen, since a calendar that needs data is
 * useless without an obvious way to put data in it.
 *
 * Expiries are computed, not imported. The holiday file is the only thing an exchange calendar
 * adds, and importing it visibly moves the dates — which is why the count is shown.
 */

const KIND_LABELS: Record<MarketEvent['kind'], string> = {
  EXPIRY: 'Expiry',
  CORPORATE_ACTION: 'Corporate action',
  IPO: 'IPO',
};

const KIND_COLORS: Record<MarketEvent['kind'], string> = {
  EXPIRY: 'purple',
  CORPORATE_ACTION: 'green',
  IPO: 'blue',
};

const today = () => new Date().toISOString().slice(0, 10);
const shift = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export function Calendar() {
  const theme = useTheme();
  const [horizon, setHorizon] = useState<30 | 60 | 180>(60);
  const [kinds, setKinds] = useState<MarketEvent['kind'][]>(['EXPIRY', 'CORPORATE_ACTION', 'IPO']);
  const [relevantOnly, setRelevantOnly] = useState(false);
  const [wizard, setWizard] = useState<null | 'corporate-actions' | 'holidays' | 'ipos'>(null);
  const [manual, setManual] = useState<null | 'corporate-action' | 'ipo'>(null);

  const { data: events, isLoading } = useMarketEvents({ from: today(), to: shift(horizon) });
  const { data: holidays } = useHolidays();

  const shown = (events ?? []).filter((event) => kinds.includes(event.kind) && (!relevantOnly || event.isRelevant));
  const byDate = shown.reduce<Record<string, MarketEvent[]>>((groups, event) => {
    (groups[event.date] ??= []).push(event);
    return groups;
  }, {});

  return (
    <>
      <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={horizon}
          onChange={(value) => setHorizon(value as 30 | 60 | 180)}
          options={[
            { value: 30, label: '30 days' },
            { value: 60, label: '60 days' },
            { value: 180, label: '6 months' },
          ]}
        />
        <Select
          mode="multiple"
          style={{ minWidth: 260 }}
          value={kinds}
          onChange={setKinds}
          aria-label="Event kinds"
          options={(Object.keys(KIND_LABELS) as MarketEvent['kind'][]).map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
        />
        <Checkbox checked={relevantOnly} onChange={(e) => setRelevantOnly(e.target.checked)}>
          Only what I hold or watch
        </Checkbox>
        <Space style={{ marginLeft: 'auto' }} wrap>
          <Button size="small" icon={<Plus size={14} />} onClick={() => setManual('corporate-action')}>
            Add action
          </Button>
          <Button size="small" icon={<Plus size={14} />} onClick={() => setManual('ipo')}>
            Add IPO
          </Button>
          <Button size="small" icon={<UploadSimple size={14} />} onClick={() => setWizard('corporate-actions')}>
            Import
          </Button>
        </Space>
      </Flex>

      <Flex gap={16} wrap align="flex-start">
        <div style={{ flex: '1 1 460px', minWidth: 300 }}>
          <Panel height={520} title="Coming up" flush>
            {!shown.length && !isLoading ? (
              <Blank
                title="Nothing in this window"
                body="Expiries are computed from the exchange rules. Corporate actions and IPOs are yours to enter or import."
              />
            ) : (
              <div style={{ padding: 16 }}>
                {Object.entries(byDate).map(([date, group]) => (
                  <div key={date} style={{ marginBottom: 20 }}>
                    <MonoLabel style={{ marginBottom: 8 }}>
                      {new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                    </MonoLabel>
                    <Flex vertical gap={8}>
                      {group.map((event, index) => (
                        <Flex key={`${date}-${index}`} gap={10} align="flex-start">
                          <Tag color={KIND_COLORS[event.kind]} style={{ marginTop: 2 }}>
                            {KIND_LABELS[event.kind]}
                          </Tag>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: event.isRelevant ? 600 : 400 }}>
                              {event.title}
                              {event.isRelevant && (
                                <Tag color="gold" style={{ marginLeft: 8 }}>
                                  Yours
                                </Tag>
                              )}
                            </div>
                            {event.detail && <div style={{ fontSize: 12, color: theme.colors.textMuted }}>{event.detail}</div>}
                          </div>
                        </Flex>
                      ))}
                    </Flex>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div style={{ flex: '0 1 340px', minWidth: 280 }}>
          <Panel height={520} title="Where these dates come from">
            <Typography.Paragraph>
              <strong>Expiries are computed.</strong> Each index expires on a fixed weekday, and the monthly contract on the last such weekday of the month. NSE
              indices are on Tuesday and BSE on Thursday as of September 2026; exchanges move this, so the weekday is a setting you can change per index under
              Notifications.
            </Typography.Paragraph>
            <Typography.Paragraph>
              <strong>Holidays shift them.</strong> An expiry landing on a day the exchange is shut moves back to the previous trading day. Import the exchange
              holiday CSV and the calendar corrects itself.
            </Typography.Paragraph>
            <Flex gap={8} wrap style={{ marginBottom: 16 }}>
              <Tag>{holidays?.length ?? 0} holidays imported</Tag>
              <Button size="small" icon={<UploadSimple size={14} />} onClick={() => setWizard('holidays')}>
                Import holidays
              </Button>
            </Flex>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              Corporate actions and IPOs are your own records — entered by hand or imported from a file you downloaded. Arvo fetches nothing.
            </Typography.Paragraph>
            <Space wrap>
              <Button size="small" icon={<UploadSimple size={14} />} onClick={() => setWizard('corporate-actions')}>
                Import corporate actions
              </Button>
              <Button size="small" icon={<UploadSimple size={14} />} onClick={() => setWizard('ipos')}>
                Import IPOs
              </Button>
            </Space>
          </Panel>
        </div>
      </Flex>

      <ImportWizard kind={wizard} onClose={() => setWizard(null)} />
      <ManualEntry kind={manual} onClose={() => setManual(null)} />
    </>
  );
}

const WIZARDS = {
  'corporate-actions': {
    title: 'Import corporate actions',
    path: '/market/calendars/corporate-actions/import',
    help: 'A CSV or XLSX with a symbol, a purpose ("INTERIM DIVIDEND RS 6 PER SHARE", "BONUS 1:1") and an ex-date. Record and pay dates are used when present. Rows Arvo cannot classify are reported rather than guessed at.',
  },
  holidays: {
    title: 'Import trading holidays',
    path: '/market/calendars/holidays/import',
    help: 'A CSV of dates and descriptions, or just dates. This replaces the holidays for the exchange you choose: a day the exchange withdrew has to disappear, or every expiry after it stays wrong.',
  },
  ipos: {
    title: 'Import IPOs',
    path: '/market/calendars/ipos/import',
    help: 'A CSV with at least an issue name. Open and close dates, price band (one column or two), lot size and status are read when present.',
  },
} as const;

function ImportWizard({ kind, onClose }: { kind: null | keyof typeof WIZARDS; onClose: () => void }) {
  const { message } = App.useApp();
  const [exchange, setExchange] = useState('NSE');
  const [result, setResult] = useState<{ imported: number; parsed: number; warnings: string[] } | null>(null);
  const upload = useMarketMutation((file: File) => uploadCalendar(WIZARDS[kind!].path, file, kind === 'holidays' ? { exchange } : {}));
  const config = kind ? WIZARDS[kind] : null;

  return (
    <Modal
      open={!!kind}
      title={config?.title}
      onCancel={() => {
        setResult(null);
        onClose();
      }}
      footer={null}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{config?.help}</Typography.Paragraph>
      {kind === 'holidays' && (
        <Form.Item label="Exchange">
          <Select value={exchange} onChange={setExchange} style={{ maxWidth: 160 }} options={['NSE', 'BSE', 'MCX'].map((value) => ({ value, label: value }))} />
        </Form.Item>
      )}
      <Upload.Dragger
        accept=".csv,.xlsx,.xls"
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          upload.mutate(file as unknown as File, {
            onSuccess: (data) => {
              setResult(data);
              message.success(`${data.imported} of ${data.parsed} rows imported`);
            },
            onError: (error) => message.error((error as Error).message),
          });
          return false;
        }}
      >
        <p style={{ margin: '16px 0' }}>
          <CalendarBlank size={28} weight="duotone" aria-hidden />
        </p>
        <p>Drop a CSV or XLSX here, or click to choose one.</p>
      </Upload.Dragger>
      {result && (
        <Card size="small" style={{ marginTop: 16 }}>
          <div>
            {result.imported} of {result.parsed} rows imported.
          </div>
          {result.warnings.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
              {result.warnings.slice(0, 10).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Modal>
  );
}

function ManualEntry({ kind, onClose }: { kind: null | 'corporate-action' | 'ipo'; onClose: () => void }) {
  const { message } = App.useApp();
  const save = useMarketMutation((body: Record<string, unknown>) =>
    api(kind === 'ipo' ? '/market/calendars/ipos' : '/market/calendars/corporate-actions', { method: 'POST', body }),
  );

  return (
    <Modal open={!!kind} title={kind === 'ipo' ? 'Add an IPO' : 'Add a corporate action'} onCancel={onClose} footer={null} destroyOnHidden>
      <Form
        layout="vertical"
        initialValues={kind === 'ipo' ? { status: 'UPCOMING' } : { kind: 'DIVIDEND' }}
        onFinish={(values: Record<string, unknown>) =>
          save.mutate(
            Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== '')),
            { onSuccess: onClose, onError: (error) => message.error((error as Error).message) },
          )
        }
      >
        {kind === 'ipo' ? (
          <>
            <Form.Item name="name" label="Issue name" rules={[{ required: true, message: 'The name of the issue' }]}>
              <Input autoFocus />
            </Form.Item>
            <Flex gap={12} wrap>
              <Form.Item name="openDate" label="Opens" style={{ flex: 1, minWidth: 140 }}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="closeDate" label="Closes" style={{ flex: 1, minWidth: 140 }}>
                <Input type="date" />
              </Form.Item>
            </Flex>
            <Flex gap={12} wrap>
              <Form.Item name="priceBandLow" label="Band low" style={{ flex: 1, minWidth: 120 }}>
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item name="priceBandHigh" label="Band high" style={{ flex: 1, minWidth: 120 }}>
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item name="lotSize" label="Lot size" style={{ flex: 1, minWidth: 110 }}>
                <Input inputMode="numeric" />
              </Form.Item>
            </Flex>
            <Form.Item name="status" label="Status">
              <Select options={IPO_STATUSES.map((value: IpoStatus) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))} />
            </Form.Item>
          </>
        ) : (
          <>
            <Flex gap={12} wrap>
              <Form.Item name="symbol" label="Symbol" rules={[{ required: true, message: 'Which instrument?' }]} style={{ flex: 1, minWidth: 140 }}>
                <Input placeholder="TCS" autoFocus />
              </Form.Item>
              <Form.Item name="kind" label="Kind" style={{ minWidth: 150 }}>
                <Select options={CORPORATE_ACTION_KINDS.map((value: CorporateActionKind) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))} />
              </Form.Item>
            </Flex>
            <Flex gap={12} wrap>
              <Form.Item name="exDate" label="Ex-date" rules={[{ required: true, message: 'The ex-date' }]} style={{ flex: 1, minWidth: 150 }}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="payDate" label="Pay date" style={{ flex: 1, minWidth: 150 }}>
                <Input type="date" />
              </Form.Item>
            </Flex>
            <Flex gap={12} wrap>
              <Form.Item name="amount" label="Per share" style={{ flex: 1, minWidth: 130 }}>
                <Input inputMode="decimal" placeholder="6" />
              </Form.Item>
              <Form.Item name="ratio" label="Ratio" style={{ flex: 1, minWidth: 130 }}>
                <Input placeholder="1:1" />
              </Form.Item>
            </Flex>
          </>
        )}
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          Save
        </Button>
      </Form>
    </Modal>
  );
}
