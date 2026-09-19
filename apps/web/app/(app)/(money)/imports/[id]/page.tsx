'use client';

import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { App, Button, Card, Flex, Result, Skeleton, Steps, Typography } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MappingStep } from '../../../../../components/imports/mapping-step';
import { ReviewStep } from '../../../../../components/imports/review-step';
import { BatchStatusTag } from '../../../../../components/imports/status-tags';
import { PageHeader } from '../../../../../components/page-header';
import { downloadFile, errorMessage } from '../../../../../lib/api';
import { formatDate } from '../../../../../lib/format';
import { useAccounts, useImportSummary } from '../../../../../lib/queries';

const STEP = { PENDING: 1, PROCESSING: 1, REVIEW: 2, COMPLETED: 3, FAILED: 1, CANCELLED: 2 } as const;

export default function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { message } = App.useApp();
  const summary = useImportSummary(id);
  const accounts = useAccounts();
  const [remapping, setRemapping] = useState(false);

  if (summary.isPending) return <Skeleton active />;
  if (summary.isError || !summary.data) {
    return <Result status="404" title="Import not found" extra={<Link href="/imports">Back to imports</Link>} />;
  }

  const { batch, counts } = summary.data;
  const account = accounts.data?.find((a) => a.id === batch.accountId);
  const showMapping = batch.status === 'PENDING' || (batch.status === 'REVIEW' && remapping);

  const download = () => downloadFile(`/imports/${batch.id}/file`, batch.filename).catch((e) => message.error(errorMessage(e)));

  return (
    <>
      <Link href="/imports" style={{ display: 'inline-flex', gap: 6, marginBottom: 12 }}>
        <ArrowLeftOutlined /> Imports
      </Link>
      <PageHeader
        title={batch.filename}
        subtitle={
          <Flex gap={8} align="center" wrap component="span">
            <BatchStatusTag status={batch.status} />
            <span>
              {account?.name ?? 'Account'} · {batch.fileType} · {(batch.fileSize / 1024).toFixed(0)} KB · uploaded {formatDate(batch.createdAt)}
            </span>
          </Flex>
        }
        extra={
          <Button icon={<DownloadOutlined />} onClick={download}>
            Original file
          </Button>
        }
      />
      <Card style={{ marginBottom: 16 }} styles={{ body: { overflowX: 'auto' } }}>
        <Steps
          current={STEP[batch.status]}
          status={batch.status === 'FAILED' ? 'error' : batch.status === 'CANCELLED' ? 'error' : undefined}
          items={[
            { title: 'Upload' },
            { title: 'Match columns', description: batch.fileType === 'PDF' ? 'Automatic for PDF' : undefined },
            { title: 'Review' },
            { title: 'Commit' },
          ]}
        />
      </Card>

      {batch.status === 'FAILED' && (
        <Result status="error" title="This file could not be imported" subTitle={batch.errorMessage} extra={<Link href="/imports">Try another file</Link>} />
      )}
      {batch.status === 'CANCELLED' && <Result status="info" title="Import cancelled" subTitle="Nothing was added to your ledger." />}
      {batch.status === 'COMPLETED' && (
        <Result
          status="success"
          title={`${counts.committed} transactions added to ${account?.name ?? 'your account'}`}
          subTitle={`${counts.total - counts.committed} rows were skipped. Committed ${batch.completedAt ? formatDate(batch.completedAt) : ''}.`}
          extra={[
            <Link key="tx" href={`/accounts/${batch.accountId}`}>
              <Button type="primary">View account</Button>
            </Link>,
            <Link key="dash" href="/dashboard">
              <Button>Dashboard</Button>
            </Link>,
          ]}
        />
      )}
      {showMapping && (
        <MappingStep
          batch={batch}
          onProcessed={() => {
            setRemapping(false);
          }}
        />
      )}
      {batch.status === 'REVIEW' && !remapping && <ReviewStep summary={summary.data} onRemap={() => setRemapping(true)} />}
      {batch.status === 'REVIEW' && remapping && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          Applying a new mapping re-reads the file and replaces the current review.{' '}
          <Button type="link" onClick={() => setRemapping(false)}>
            Back to review
          </Button>
        </Typography.Paragraph>
      )}
    </>
  );
}
