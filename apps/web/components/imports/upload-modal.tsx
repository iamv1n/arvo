'use client';

import { InboxOutlined } from '@ant-design/icons';
import { App, Form, Modal, Select, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUpload, errorMessage } from '../../lib/api';
import { useAccounts, useImportMutation } from '../../lib/queries';
import type { ImportBatch } from '../../lib/types';

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadImportModal({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId?: string }) {
  const { message } = App.useApp();
  const router = useRouter();
  const accounts = useAccounts();
  const [form] = Form.useForm<{ accountId: string }>();
  const [file, setFile] = useState<UploadFile | null>(null);

  const upload = useImportMutation(async ({ accountId, file }: { accountId: string; file: File }) => {
    const data = new FormData();
    data.append('accountId', accountId);
    data.append('file', file);
    return apiUpload<ImportBatch>('/imports', data);
  });

  const submit = async () => {
    const { accountId } = await form.validateFields();
    if (!file?.originFileObj) {
      message.warning('Choose a statement file');
      return;
    }
    try {
      const batch = await upload.mutateAsync({ accountId, file: file.originFileObj });
      onClose();
      setFile(null);
      router.push(`/imports/${batch.id}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      title="Import a statement"
      okText="Upload"
      onOk={submit}
      onCancel={onClose}
      confirmLoading={upload.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ accountId }}>
        <Form.Item name="accountId" label="Account" rules={[{ required: true, message: 'Choose the account this statement belongs to' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            popupMatchSelectWidth={false}
            placeholder="Which account is this statement for?"
            loading={accounts.isPending}
            options={accounts.data?.filter((a) => a.isActive).map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
          />
        </Form.Item>
        <Upload.Dragger
          accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          maxCount={1}
          fileList={file ? [file] : []}
          beforeUpload={(f) => {
            if (f.size > MAX_BYTES) {
              message.error('Files must be at most 10 MB');
              return Upload.LIST_IGNORE;
            }
            return false;
          }}
          onChange={({ fileList }) => setFile(fileList.at(-1) ?? null)}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Drop a CSV, XLSX or PDF statement here</p>
          <p className="ant-upload-hint">Nothing is added to your ledger until you review and commit.</p>
        </Upload.Dragger>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          Files stay on your server and can be deleted at any time.
        </Typography.Paragraph>
      </Form>
    </Modal>
  );
}
