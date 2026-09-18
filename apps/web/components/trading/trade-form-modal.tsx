'use client';

import { App, DatePicker, Form, Input, InputNumber, Modal, Select, TimePicker } from 'antd';
import dayjs from 'dayjs';
import styled from 'styled-components';
import { api, errorMessage } from '../../lib/api';
import { useTradingMutation } from '../../lib/queries';
import type { Trade } from '../../lib/types';
import { Muted, SEGMENT_LABELS } from './shared';

/* Fields flow into as many columns as fit; the symbol and the note always take the full row. */
const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0 12px;

  .ant-form-item {
    min-width: 0;
  }
  .ant-form-item.wide {
    grid-column: 1 / -1;
  }
  .ant-form-item-label > label {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

/**
 * A fill entered by hand, for trades that never made it into a tradebook. Everything the
 * symbol can answer — underlying, expiry, strike, right, segment — is left to the parser, so
 * the form asks for what only the trader knows.
 */
export function TradeFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const create = useTradingMutation((body: Record<string, unknown>) => api<Trade>('/trades', { method: 'POST', body }));

  const submit = async () => {
    const values = await form.validateFields();
    create.mutate(
      {
        date: (values.date as dayjs.Dayjs).format('YYYY-MM-DD'),
        time: values.time ? (values.time as dayjs.Dayjs).format('HH:mm:ss') : null,
        broker: values.broker || undefined,
        segment: values.segment || undefined,
        symbol: String(values.symbol).trim(),
        side: values.side,
        quantity: String(values.quantity),
        price: String(values.price),
        lotSize: values.lotSize || undefined,
        orderId: values.orderId || null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => {
          message.success('Fill recorded');
          form.resetFields();
          onClose();
        },
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText="Record fill"
      confirmLoading={create.isPending}
      title="Record a fill"
      destroyOnHidden
      width={620}
    >
      <Form form={form} layout="vertical" initialValues={{ date: dayjs(), side: 'BUY', quantity: 1 }}>
        {/* An auto-fit grid rather than fixed spans: at 375px every field takes the full width,
            and the three-across row never squeezes a number picker to forty pixels. */}
        <FieldGrid>
          <Form.Item name="date" label="Trade date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} maxDate={dayjs()} />
          </Form.Item>
          <Form.Item name="time" label="Time" extra={<Muted>Needed for intraday and behaviour analysis</Muted>}>
            <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={1} />
          </Form.Item>
          <Form.Item
            className="wide"
            name="symbol"
            label="Trading symbol"
            rules={[{ required: true, max: 64 }]}
            extra={<Muted>As your broker files it: INFY, NIFTY25JUN24500CE, BANKNIFTY25JULFUT.</Muted>}
          >
            <Input placeholder="NIFTY25JUN24500CE" />
          </Form.Item>
          <Form.Item name="side" label="Side" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'BUY', label: 'Buy' },
                { value: 'SELL', label: 'Sell' },
              ]}
            />
          </Form.Item>
          <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]} extra={<Muted>Whole units</Muted>}>
            <InputNumber style={{ width: '100%' }} min={1} step={1} precision={0} />
          </Form.Item>
          <Form.Item name="price" label="Price" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="segment" label="Segment" extra={<Muted>Read from the symbol when left blank</Muted>}>
            <Select allowClear placeholder="Detect" options={Object.entries(SEGMENT_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="lotSize" label="Lot size">
            <InputNumber style={{ width: '100%' }} min={1} precision={0} />
          </Form.Item>
          <Form.Item name="broker" label="Broker">
            <Input placeholder="Manual" maxLength={60} />
          </Form.Item>
          <Form.Item name="orderId" label="Order id" extra={<Muted>Groups fills of one order for the brokerage cap</Muted>}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item className="wide" name="notes" label="Note">
            <Input maxLength={500} />
          </Form.Item>
        </FieldGrid>
        <Muted>Charges are estimated from the statutory rates for the trade date and your broker plan. You can correct them later from the import.</Muted>
      </Form>
    </Modal>
  );
}
