'use client';

import { ArrowRightOutlined, DisconnectOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Form, Input, Modal, Popconfirm, Row, Select, Typography } from 'antd';
import { DataTable, TableToolbar, usePagedTable, useTableColumns, type DataColumn } from '../../../components/data-table';
import { usePreferences } from '../../../lib/preferences';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Amount } from '../../../components/amount';
import { PageHeader } from '../../../components/page-header';
import { api, errorMessage } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAccounts, useLedgerMutation, useTransfers } from '../../../lib/queries';
import type { Transfer } from '../../../lib/types';

interface Values {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: Dayjs;
  description: string;
}

export default function TransfersPage() {
  const { message } = App.useApp();
  const { preferences } = usePreferences();
  const [page, setPage] = useState(1);
  const transfers = useTransfers({ limit: preferences.pageSize, offset: (page - 1) * preferences.pageSize });
  const pagination = usePagedTable(transfers.data?.total, page, setPage);
  const accounts = useAccounts();
  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<Values>();

  const create = useLedgerMutation((v: Values) =>
    api('/transfers', { method: 'POST', body: { ...v, date: v.date.format('YYYY-MM-DD') } }),
  );
  const unlink = useLedgerMutation((id: string) => api(`/transfers/${id}`, { method: 'DELETE' }));

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await create.mutateAsync(values);
      message.success('Transfer recorded');
      setOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const { columns, settings } = useTableColumns<Transfer>('transfers', [
            { key: 'date', title: 'Date', render: (_, t) => formatDate(t.from.date), width: 130 },
            {
              key: 'route',
              alwaysVisible: true,
              title: 'Route',
              render: (_, t) => (
                <span>
                  {accountName.get(t.from.accountId)} <ArrowRightOutlined style={{ margin: '0 6px', opacity: 0.5 }} />{' '}
                  {accountName.get(t.to.accountId)}
                </span>
              ),
            },
            { key: 'description', title: 'Description', render: (_, t) => <Typography.Text ellipsis>{t.from.description}</Typography.Text> },
            {
              key: 'amount',
              alwaysVisible: true,
              title: 'Amount',
              align: 'right',
              width: 150,
              render: (_, t) => <Amount value={t.to.amount} currency={t.to.currency} signed={false} />,
            },
            {
              key: 'actions',
              alwaysVisible: true,
              label: 'Actions',
              width: 60,
              render: (_, t) => (
                <Popconfirm
                  title="Unlink this transfer?"
                  description="Both transactions stay and return to their previous type."
                  onConfirm={() =>
                    unlink.mutateAsync(t.id).then(
                      () => message.success('Transfer unlinked'),
                      (e) => message.error(errorMessage(e)),
                    )
                  }
                >
                  <Button type="text" icon={<DisconnectOutlined />} aria-label="Unlink" />
                </Popconfirm>
              ),
            },
  ] as DataColumn<Transfer>[]);

  const accountOptions = accounts.data?.filter((a) => a.isActive).map((a) => ({ value: a.id, label: a.name }));

  return (
    <>
      <PageHeader
        title="Transfers"
        subtitle="Money moving between your own accounts. Never counted as income or spending."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            New transfer
          </Button>
        }
      />
      <Card styles={{ body: { padding: 0 } }}>
        <TableToolbar>
          <span>{transfers.data ? `${transfers.data.total} transfers` : ' '}</span>
          {settings}
        </TableToolbar>
        <DataTable<Transfer>
          rowKey="id"
          loading={transfers.isFetching}
          dataSource={transfers.data?.items}
          scroll={{ x: 720 }}
          columns={columns}
          pagination={pagination}
        />
      </Card>
      <Modal open={open} title="New transfer" okText="Record" onOk={submit} onCancel={() => setOpen(false)} confirmLoading={create.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ date: dayjs() }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fromAccountId" label="From" rules={[{ required: true }]}>
                <Select options={accountOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="toAccountId"
                label="To"
                dependencies={['fromAccountId']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator: (_, v) =>
                      v && v === getFieldValue('fromAccountId') ? Promise.reject(new Error('Pick a different account')) : Promise.resolve(),
                  }),
                ]}
              >
                <Select options={accountOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="amount" label="Amount" rules={[{ required: true }, { pattern: /^\d{1,15}(\.\d{1,4})?$/, message: 'A positive number' }]}>
                <Input inputMode="decimal" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="D MMM YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input placeholder="Credit card bill payment" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
