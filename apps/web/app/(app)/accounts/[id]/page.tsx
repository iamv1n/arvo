'use client';

import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Popconfirm, Result, Row, Skeleton, Space } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AccountFormModal } from '../../../../components/account-form-modal';
import { PageHeader } from '../../../../components/page-header';
import { StatCard } from '../../../../components/stat-card';
import { TransactionFormModal } from '../../../../components/transaction-form-modal';
import { TransactionsTable } from '../../../../components/transactions-table';
import { api, errorMessage } from '../../../../lib/api';
import { formatMoney, titleCase } from '../../../../lib/format';
import { periodRange } from '../../../../lib/periods';
import { useAccounts, useLedgerMutation, useSummary, useTransactions } from '../../../../lib/queries';
import type { Transaction } from '../../../../lib/types';

const PAGE_SIZE = 25;

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === id);
  const [page, setPage] = useState(1);
  const transactions = useTransactions({ accountId: id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const month = useMemo(() => ({ ...periodRange('this-month'), accountId: id }), [id]);
  const summary = useSummary(month);
  const [editAccount, setEditAccount] = useState(false);
  const [txModal, setTxModal] = useState<{ open: boolean; transaction?: Transaction }>({ open: false });
  const remove = useLedgerMutation(() => api(`/accounts/${id}`, { method: 'DELETE' }));

  if (accounts.isPending) return <Skeleton active />;
  if (!account) {
    return <Result status="404" title="Account not found" extra={<Link href="/accounts">Back to accounts</Link>} />;
  }

  return (
    <>
      <Link href="/accounts" style={{ display: 'inline-flex', gap: 6, marginBottom: 12 }}>
        <ArrowLeftOutlined /> Accounts
      </Link>
      <PageHeader
        title={account.name}
        subtitle={[account.institution, titleCase(account.type), account.currency, !account.isActive && 'Inactive'].filter(Boolean).join(' · ')}
        extra={
          <Space wrap>
            <Button icon={<EditOutlined />} onClick={() => setEditAccount(true)}>
              Edit
            </Button>
            <Popconfirm
              title="Delete this account?"
              description="Only accounts without transactions can be deleted."
              okButtonProps={{ danger: true }}
              onConfirm={() =>
                remove.mutateAsync(undefined).then(
                  () => {
                    message.success('Account deleted');
                    router.push('/accounts');
                  },
                  (e) => message.error(errorMessage(e)),
                )
              }
            >
              <Button danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setTxModal({ open: true })} disabled={!account.isActive}>
              Add transaction
            </Button>
          </Space>
        }
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <StatCard label="Balance" value={formatMoney(account.balance, account.currency)} hint={`Opening ${formatMoney(account.openingBalance, account.currency)}`} />
        </Col>
        <Col xs={12} md={8}>
          <StatCard label="Money in this month" loading={summary.isPending} value={summary.data && formatMoney(summary.data.income, account.currency)} tone="positive" />
        </Col>
        <Col xs={12} md={8}>
          <StatCard label="Spent this month" loading={summary.isPending} value={summary.data && formatMoney(summary.data.expenses, account.currency)} />
        </Col>
      </Row>
      <Card styles={{ body: { padding: 0 } }}>
        <TransactionsTable
          hideAccount
          data={transactions.data?.items ?? []}
          loading={transactions.isFetching}
          onEdit={(transaction) => setTxModal({ open: true, transaction })}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: transactions.data?.total, onChange: setPage, showSizeChanger: false }}
        />
      </Card>
      <AccountFormModal open={editAccount} account={account} onClose={() => setEditAccount(false)} />
      <TransactionFormModal
        open={txModal.open}
        transaction={txModal.transaction}
        defaultAccountId={account.id}
        onClose={() => setTxModal({ open: false })}
      />
    </>
  );
}
