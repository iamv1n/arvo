'use client';

import { ArrowLeft, FloppyDisk, Image as ImageIcon } from '@phosphor-icons/react';
import { App, Button, Card, Checkbox, Col, Descriptions, Empty, Input, InputNumber, Row, Select, Skeleton, Space, Tooltip, Upload } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_URL, api, apiUpload, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { usePosition, useTradingMutation, useTradingSettings } from '../../lib/queries';
import type { JournalEntry, PositionLeg } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { DataTable } from '../data-table';
import { Eyebrow, Figure, SectionTitle, Stamp } from '../planning';
import { Panel } from '../panel';
import { CHARGE_LABELS, ChargesSourceTag, DIRECTION_TONES, NotAdvice, SEGMENT_LABELS, SIDE_TONES, STYLE_LABELS, Muted, Pnl, num } from './shared';

/**
 * One round trip, end to end: every fill that went into it, where the money went in charges,
 * and the notes and tags the trader attached to it afterwards.
 */
export function PositionDetail({ id, asOf }: { id: string; asOf: string }) {
  const money = useMoney();
  const query = usePosition(id, asOf);
  const currency = 'INR';

  if (query.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 10 }} />
      </Card>
    );
  }
  if (!query.data) {
    return <Empty description="That position no longer exists" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 48 }} />;
  }

  const { position, journal, mistakeChecklist } = query.data;
  const legs = [...position.entries, ...position.exits].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Link href={`/trading?asOf=${asOf}`}>
          <Button size="small" icon={<ArrowLeft size={14} />}>
            Back to trading
          </Button>
        </Link>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card>
            <Space size={10} wrap style={{ marginBottom: 8 }}>
              <Stamp $tone={DIRECTION_TONES[position.direction]}>{position.direction}</Stamp>
              <Stamp $tone="neutral">{SEGMENT_LABELS[position.segment]}</Stamp>
              <Stamp $tone="neutral">{STYLE_LABELS[position.style]}</Stamp>
              {position.settledAtExpiry && <Stamp $tone="warning">Settled at expiry</Stamp>}
              {position.rolledFrom && <Stamp $tone="neutral">Rolled over</Stamp>}
            </Space>
            <SectionTitle style={{ marginTop: 0 }}>
              <span>{position.label}</span>
              <Eyebrow>
                {position.symbol} · {position.broker} · {position.exchange}
              </Eyebrow>
            </SectionTitle>
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Eyebrow>Net P&amp;L</Eyebrow>
                <div>
                  <Figure>
                    <Pnl $value={num(position.netPnl)}>{money(position.netPnl, currency)}</Pnl>
                  </Figure>
                </div>
              </Col>
              <Col xs={12} md={6}>
                <Eyebrow>Gross</Eyebrow>
                <div>
                  <Figure $size={20}>
                    <Pnl $value={num(position.grossPnl)}>{money(position.grossPnl, currency)}</Pnl>
                  </Figure>
                </div>
              </Col>
              <Col xs={12} md={6}>
                <Eyebrow>Charges</Eyebrow>
                <div>
                  <Figure $size={20}>{money(position.charges.total, currency)}</Figure>
                </div>
                <Muted>{position.chargesPercentOfGross === null ? 'no gross profit to compare' : `${position.chargesPercentOfGross}% of gross profit`}</Muted>
              </Col>
              <Col xs={12} md={6}>
                <Eyebrow>R-multiple</Eyebrow>
                <div>
                  <Figure $size={20}>{rMultiple(position.averageEntryPrice, position.quantity, position.netPnl, journal?.stopPrice ?? null)}</Figure>
                </div>
                <Muted>{journal?.stopPrice ? `stop ${money(journal.stopPrice, currency)}` : 'record a stop below'}</Muted>
              </Col>
            </Row>

            <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 20 }}>
              <Descriptions.Item label="Opened">{formatDate(position.openedAt)}{position.openedTime ? ` ${position.openedTime}` : ''}</Descriptions.Item>
              <Descriptions.Item label="Closed">
                {position.closedAt ? `${formatDate(position.closedAt)}${position.closedTime ? ` ${position.closedTime}` : ''}` : 'Still open'}
              </Descriptions.Item>
              <Descriptions.Item label="Sessions held">{position.sessionsHeld}</Descriptions.Item>
              <Descriptions.Item label="Quantity">{position.quantity}{position.status === 'OPEN' ? ` (${position.openQuantity} open)` : ''}</Descriptions.Item>
              <Descriptions.Item label="Average entry">{money(position.averageEntryPrice, currency)}</Descriptions.Item>
              <Descriptions.Item label="Average exit">{position.averageExitPrice ? money(position.averageExitPrice, currency) : '—'}</Descriptions.Item>
              {position.expiry && <Descriptions.Item label="Expiry">{formatDate(position.expiry)}</Descriptions.Item>}
              {position.strike && <Descriptions.Item label="Strike">{money(position.strike, currency)}</Descriptions.Item>}
              <Descriptions.Item label="Lot size">{position.lotSize}</Descriptions.Item>
            </Descriptions>

            {position.warnings.map((warning) => (
              <Muted key={warning} style={{ display: 'block', marginTop: 8 }}>
                {warning}
              </Muted>
            ))}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Panel height={290} title="Where the charges went" extra={<ChargesSourceTag source={position.charges.source} />}>
            {CHARGE_LABELS.map(([key, label]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
                <span>{label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(position.charges[key] as string, currency)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 600 }}>
              <span>Total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(position.charges.total, currency)}</span>
            </div>
          </Panel>
        </Col>

        <Col span={24}>
          <Card title="Fills" extra={<Eyebrow>Matched first in, first out</Eyebrow>}>
            <DataTable<PositionLeg>
              rowKey={(row) => `${row.tradeId}-${row.date}-${row.quantity}-${row.side}`}
              dataSource={legs}
              pagination={false}
              columns={[
                {
                  key: 'when',
                  title: 'When',
                  render: (_, row) => (
                    <div>
                      <div>{formatDate(row.date)}</div>
                      <Muted>{row.time ?? (row.kind === 'TRADE' ? 'no time recorded' : row.kind.toLowerCase())}</Muted>
                    </div>
                  ),
                },
                { key: 'side', title: 'Side', render: (_, row) => <Stamp $tone={SIDE_TONES[row.side]}>{row.side}</Stamp> },
                { key: 'quantity', title: 'Qty', align: 'right', render: (_, row) => row.quantity },
                { key: 'price', title: 'Price', align: 'right', render: (_, row) => money(row.price, currency) },
                { key: 'amount', title: 'Value', align: 'right', render: (_, row) => money(row.amount, currency) },
                {
                  key: 'charges',
                  title: 'Charges',
                  align: 'right',
                  render: (_, row) => (
                    <Tooltip
                      title={CHARGE_LABELS.map(([key, label]) => `${label}: ${money(row.charges[key] as string, currency)}`).join('\n')}
                      styles={{ root: { whiteSpace: 'pre-line' } }}
                    >
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(row.charges.total, currency)}</span>
                    </Tooltip>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col span={24}>
          <JournalEditor positionId={position.id} entry={journal} mistakeChecklist={mistakeChecklist} />
        </Col>
        <Col span={24}>
          <NotAdvice text="This is a record of a trade you have already made. Notes and tags here are for your own review; nothing on this page is a recommendation." />
        </Col>
      </Row>
    </>
  );
}

/** Notes, tags, the mistakes checklist, the stop that drives the R-multiple, and screenshots. */
function JournalEditor({ positionId, entry, mistakeChecklist }: { positionId: string; entry: JournalEntry | null; mistakeChecklist: string[] }) {
  const { message } = App.useApp();
  const settings = useTradingSettings();
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [setupTags, setSetupTags] = useState<string[]>(entry?.setupTags ?? []);
  const [emotionTags, setEmotionTags] = useState<string[]>(entry?.emotionTags ?? []);
  const [mistakes, setMistakes] = useState<string[]>(entry?.mistakes ?? []);
  const [stopPrice, setStopPrice] = useState<string | null>(entry?.stopPrice ?? null);
  const [targetPrice, setTargetPrice] = useState<string | null>(entry?.targetPrice ?? null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setNotes(entry?.notes ?? '');
    setSetupTags(entry?.setupTags ?? []);
    setEmotionTags(entry?.emotionTags ?? []);
    setMistakes(entry?.mistakes ?? []);
    setStopPrice(entry?.stopPrice ?? null);
    setTargetPrice(entry?.targetPrice ?? null);
  }, [entry]);

  const save = useTradingMutation(() =>
    api<JournalEntry>(`/trading/journal/${positionId}`, {
      method: 'PUT',
      body: {
        notes: notes.trim() === '' ? null : notes.trim(),
        setupTags,
        emotionTags,
        mistakes,
        stopPrice: stopPrice === null || stopPrice === '' ? null : String(stopPrice),
        targetPrice: targetPrice === null || targetPrice === '' ? null : String(targetPrice),
      },
    }),
  );
  const removeShot = useTradingMutation((name: string) => api(`/trading/journal/${positionId}/screenshots/${name}`, { method: 'DELETE' }));

  const uploadShot = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await apiUpload(`/trading/journal/${positionId}/screenshots`, body);
      await save.mutateAsync(undefined as never);
      message.success('Screenshot saved on this machine');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card
      title="Journal"
      extra={
        <Button
          type="primary"
          icon={<FloppyDisk size={15} weight="duotone" />}
          loading={save.isPending}
          onClick={() =>
            save.mutate(undefined as never, {
              onSuccess: () => message.success('Saved'),
              onError: (error) => message.error(errorMessage(error)),
            })
          }
        >
          Save
        </Button>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Eyebrow>What happened, in your own words</Eyebrow>
          <Input.TextArea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={6}
            maxLength={4000}
            showCount
            placeholder="Why you took it, how it behaved, and what you would do differently."
            style={{ marginTop: 6 }}
          />
        </Col>
        <Col xs={24} md={10}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Eyebrow>Setup</Eyebrow>
              <Select
                mode="tags"
                value={setupTags}
                onChange={setSetupTags}
                style={{ width: '100%', marginTop: 6 }}
                placeholder="Breakout, pullback, expiry…"
                options={(settings.data?.setupTags ?? []).map((tag) => ({ value: tag }))}
              />
            </div>
            <div>
              <Eyebrow>How you felt</Eyebrow>
              <Select
                mode="tags"
                value={emotionTags}
                onChange={setEmotionTags}
                style={{ width: '100%', marginTop: 6 }}
                placeholder="Calm, impatient, FOMO…"
                options={(settings.data?.emotionTags ?? []).map((tag) => ({ value: tag }))}
              />
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <Eyebrow>Stop you used</Eyebrow>
                <InputNumber
                  value={stopPrice === null ? null : Number(stopPrice)}
                  onChange={(value) => setStopPrice(value === null ? null : String(value))}
                  style={{ width: '100%', marginTop: 6 }}
                  min={0}
                  placeholder="For the R-multiple"
                />
              </Col>
              <Col span={12}>
                <Eyebrow>Target</Eyebrow>
                <InputNumber
                  value={targetPrice === null ? null : Number(targetPrice)}
                  onChange={(value) => setTargetPrice(value === null ? null : String(value))}
                  style={{ width: '100%', marginTop: 6 }}
                  min={0}
                />
              </Col>
            </Row>
          </Space>
        </Col>

        <Col xs={24} md={14}>
          <Eyebrow>Mistakes checklist</Eyebrow>
          <Checkbox.Group value={mistakes} onChange={(values) => setMistakes(values as string[])} style={{ marginTop: 8, width: '100%' }}>
            <Row>
              {mistakeChecklist.map((item) => (
                <Col xs={24} sm={12} key={item}>
                  <Checkbox value={item} style={{ marginBottom: 6 }}>
                    {item}
                  </Checkbox>
                </Col>
              ))}
            </Row>
          </Checkbox.Group>
        </Col>

        <Col xs={24} md={10}>
          <Eyebrow>Screenshots</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <Upload
              accept="image/png,image/jpeg,image/webp"
              showUploadList={false}
              beforeUpload={(file) => {
                void uploadShot(file as unknown as File);
                return false;
              }}
            >
              <Button icon={<ImageIcon size={15} weight="duotone" />} loading={uploading}>
                Add a chart screenshot
              </Button>
            </Upload>
            <Muted style={{ display: 'block', marginTop: 6 }}>PNG, JPEG or WebP up to 5 MB. Stored on this machine only — nothing is uploaded anywhere.</Muted>
            <Space wrap style={{ marginTop: 12 }}>
              {(entry?.screenshots ?? []).map((shot) => {
                const name = shot.path.split('/')[1];
                return (
                  <div key={shot.path} style={{ textAlign: 'center' }}>
                    {/* A plain img: the screenshot is served by the API from local disk, not optimised by Next. */}
                    <img
                      src={`${API_URL}/trading/journal/${positionId}/screenshots/${name}`}
                      alt={shot.filename}
                      style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(128,128,128,0.25)' }}
                    />
                    <div>
                      <Button size="small" type="link" danger onClick={() => removeShot.mutate(name)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Space>
          </div>
        </Col>
      </Row>
    </Card>
  );
}

/** Result ÷ what the position risked, when a stop was recorded. */
function rMultiple(entryPrice: string, quantity: string, netPnl: string, stopPrice: string | null): string {
  if (!stopPrice) return '—';
  const risk = Math.abs(Number(entryPrice) - Number(stopPrice)) * Number(quantity);
  if (!risk) return '—';
  return `${(Number(netPnl) / risk).toFixed(2)}R`;
}
