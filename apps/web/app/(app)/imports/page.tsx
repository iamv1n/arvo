'use client';

import { DeleteOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Popconfirm, Table, Typography } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { UploadImportModal } from '../../../components/imports/upload-modal';
import { BatchStatusTag } from '../../../components/imports/status-tags';
import { PageHeader } from '../../../components/page-header';
import { api, errorMessage } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAccounts, useImportMutation, useImports } from '../../../lib/queries';
import type { ImportBatch } from '../../../lib/types';

const ICONS = { CSV: <FileTextOutlined />, XLSX: <FileExcelOutlined />, PDF: <FilePdfOutlined /> };

export default function ImportsPage() {
  const { message } = App.useApp();
  const imports = useImports();
  const accounts = useAccounts();
  const accountName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);
  const [open, setOpen] = useState(false);
  const remove = useImportMutation((id: string) => api(`/imports/${id}`, { method: 'DELETE' }));

  return (
    <>
      <PageHeader
        title="Imports"
        subtitle="Upload bank and card statements, review what was found, then commit to your ledger."
        extra={
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setOpen(true)}>
            Import statement
          </Button>
        }
      />
      <Card styles={{ body: { padding: 0 } }}>
        <Table<ImportBatch>
          rowKey="id"
          loading={imports.isPending}
          dataSource={imports.data}
          scroll={{ x: 820 }}
          locale={{
            emptyText: (
              <Empty description="No imports yet" style={{ padding: 32 }}>
                <Button type="primary" onClick={() => setOpen(true)}>
                  Import your first statement
                </Button>
              </Empty>
            ),
          }}
          columns={[
            {
              title: 'File',
              render: (_, b) => (
                <Link href={`/imports/${b.id}`} style={{ display: 'inline-flex', gap: 8 }}>
                  {ICONS[b.fileType]}
                  <Typography.Text ellipsis style={{ maxWidth: 260 }}>
                    {b.filename}
                  </Typography.Text>
                </Link>
              ),
            },
            { title: 'Account', render: (_, b) => accountName.get(b.accountId), width: 200 },
            { title: 'Status', render: (_, b) => <BatchStatusTag status={b.status} />, width: 150 },
            {
              title: 'Rows',
              align: 'right',
              width: 150,
              render: (_, b) =>
                b.status === 'COMPLETED' ? `${b.processedRows} of ${b.totalRows} added` : b.totalRows ? `${b.totalRows} found` : '—',
            },
            { title: 'Uploaded', render: (_, b) => formatDate(b.createdAt), width: 130 },
            {
              key: 'actions',
              width: 60,
              render: (_, b) => (
                <Popconfirm
                  title="Delete this import?"
                  description={b.status === 'COMPLETED' ? 'The file is removed; committed transactions stay.' : 'The file and review data are removed.'}
                  okButtonProps={{ danger: true }}
                  onConfirm={() =>
                    remove.mutateAsync(b.id).then(
                      () => message.success('Import deleted'),
                      (e) => message.error(errorMessage(e)),
                    )
                  }
                >
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Delete import" />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>
      <UploadImportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
