'use client';

import { BankOutlined, CreditCardOutlined, EditOutlined, PlusOutlined, WalletOutlined } from '@ant-design/icons';
import { AccountType, LIABILITY_ACCOUNT_TYPES } from '@arvo/types';
import { Button, Card, Col, Empty, Flex, Row, Skeleton, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import styled from 'styled-components';
import { AccountFormModal } from '../../../components/account-form-modal';
import { Amount } from '../../../components/amount';
import { PageHeader } from '../../../components/page-header';
import { useAuth } from '../../../lib/auth';
import { formatMoney, titleCase } from '../../../lib/format';
import { useAccounts, useNetWorth } from '../../../lib/queries';
import type { Account } from '../../../lib/types';

const ICONS: Partial<Record<AccountType, React.ReactNode>> = {
  BANK: <BankOutlined />,
  CREDIT_CARD: <CreditCardOutlined />,
  CASH: <WalletOutlined />,
};

const IconBadge = styled.span`
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.brandSubtle};
  color: ${({ theme }) => theme.colors.brand};
  font-size: 18px;
`;

const Summary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[8]}px;
  margin-bottom: ${({ theme }) => theme.space[6]}px;

  strong {
    display: block;
    font-size: ${({ theme }) => theme.typography.fontSize.xl}px;
    font-variant-numeric: tabular-nums;
  }
`;

export default function AccountsPage() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'INR';
  const accounts = useAccounts();
  const netWorth = useNetWorth();
  const [editing, setEditing] = useState<Account | undefined>();
  const [open, setOpen] = useState(false);

  const openForm = (account?: Account) => {
    setEditing(account);
    setOpen(true);
  };

  const groups = [
    { title: 'Assets', items: accounts.data?.filter((a) => !LIABILITY_ACCOUNT_TYPES.includes(a.type)) ?? [] },
    { title: 'Liabilities', items: accounts.data?.filter((a) => LIABILITY_ACCOUNT_TYPES.includes(a.type)) ?? [] },
  ];

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Balances are your opening balance plus every recorded transaction."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
            New account
          </Button>
        }
      />
      {netWorth.data && (
        <Summary>
          <div>
            <Typography.Text type="secondary">Net worth</Typography.Text>
            <strong>{formatMoney(netWorth.data.netWorth, currency)}</strong>
          </div>
          <div>
            <Typography.Text type="secondary">Assets</Typography.Text>
            <strong>{formatMoney(netWorth.data.assets, currency)}</strong>
          </div>
          <div>
            <Typography.Text type="secondary">Owed</Typography.Text>
            <strong>{formatMoney(netWorth.data.liabilities, currency)}</strong>
          </div>
        </Summary>
      )}

      {accounts.isPending ? (
        <Skeleton active />
      ) : accounts.data?.length === 0 ? (
        <Card>
          <Empty description="No accounts yet">
            <Button type="primary" onClick={() => openForm()}>
              Add your first account
            </Button>
          </Empty>
        </Card>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <section key={group.title} style={{ marginBottom: 32 }}>
              <Typography.Title level={5} type="secondary" style={{ marginBottom: 12 }}>
                {group.title}
              </Typography.Title>
              <Row gutter={[16, 16]}>
                {group.items.map((account) => (
                  <Col key={account.id} xs={24} md={12} xl={8}>
                    <Card hoverable style={{ opacity: account.isActive ? 1 : 0.6 }}>
                      <Flex gap={12} align="center">
                        <IconBadge>{ICONS[account.type] ?? <BankOutlined />}</IconBadge>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Link href={`/accounts/${account.id}`}>
                            <Typography.Text strong ellipsis style={{ display: 'block' }}>
                              {account.name}
                            </Typography.Text>
                          </Link>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {account.institution ?? titleCase(account.type)}
                          </Typography.Text>
                        </div>
                        <Button type="text" icon={<EditOutlined />} onClick={() => openForm(account)} aria-label="Edit" />
                      </Flex>
                      <Flex justify="space-between" align="flex-end" style={{ marginTop: 20 }}>
                        <Flex gap={4}>
                          <Tag variant="filled">{titleCase(account.type)}</Tag>
                          {!account.isActive && <Tag>Inactive</Tag>}
                        </Flex>
                        <Amount value={account.balance} currency={account.currency} size="lg" signed={false} />
                      </Flex>
                    </Card>
                  </Col>
                ))}
              </Row>
            </section>
          ))
      )}
      <AccountFormModal open={open} account={editing} onClose={() => setOpen(false)} />
    </>
  );
}
