'use client';

import { App, Button, Card, Col, Form, Input, Row, Select } from 'antd';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLedgerMutation } from '../../lib/queries';
import { SectionIntro } from './setting-row';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD', 'CAD', 'JPY'];

export function ProfileSettings() {
  const { user, reloadUser } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const save = useLedgerMutation((values: { name: string; currency: string; timezone: string }) => api('/me', { method: 'PATCH', body: values }));

  return (
    <Card>
      <SectionIntro title="Profile">Your name, base currency for reports, and timezone for dates like “this month”.</SectionIntro>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={user ?? undefined}
        style={{ maxWidth: 560, marginTop: 16 }}
        onFinish={async (values) => {
          try {
            await save.mutateAsync(values);
            await reloadUser();
            message.success('Profile saved');
          } catch (e) {
            message.error(errorMessage(e));
          }
        }}
      >
        <Form.Item label="Email">
          <Input value={user?.email} disabled />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 120 }]}>
          <Input />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={10}>
            <Form.Item name="currency" label="Base currency" extra="Used for dashboards and analytics">
              <Select showSearch options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item name="timezone" label="Timezone">
              <Select showSearch options={Intl.supportedValuesOf('timeZone').map((tz) => ({ value: tz, label: tz }))} />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          Save profile
        </Button>
      </Form>
    </Card>
  );
}
