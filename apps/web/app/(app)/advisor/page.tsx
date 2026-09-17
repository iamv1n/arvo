'use client';

import { Col, Row } from 'antd';
import { AdvisorChat } from '../../../components/advisor/chat';
import { ProviderNotice } from '../../../components/advisor/ai-notice';
import { BriefingCard } from '../../../components/advisor/briefing-card';
import { SuggestionsInbox } from '../../../components/advisor/suggestions-inbox';
import { PageHeader } from '../../../components/page-header';
import { Stamp } from '../../../components/planning';
import { useAdvisorStatus } from '../../../lib/advisor';

/** Fixed heights keep the chat and side panels aligned; content scrolls inside. */
const CHAT_HEIGHT = 660;
const BRIEFING_HEIGHT = 260;
/** Card headers are ~58px each; the two side cards plus the gap match the chat card. */
const INBOX_HEIGHT = CHAT_HEIGHT - BRIEFING_HEIGHT - 16 - 2 * 58;

export default function AdvisorPage() {
  const status = useAdvisorStatus();
  const data = status.data;
  return (
    <>
      <PageHeader
        title="Advisor"
        subtitle="Ask about your money. Numbers come from your ledger, drafts wait for your approval."
        extra={data && <Stamp $tone={data.enabled ? 'positive' : 'neutral'}>{data.enabled ? `${data.providerLabel} · ${data.model}` : 'AI off'}</Stamp>}
      />
      <ProviderNotice status={data} />
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} xl={16}>
          <AdvisorChat status={data} height={CHAT_HEIGHT} />
        </Col>
        <Col xs={24} xl={8}>
          <div style={{ display: 'grid', gap: 16 }}>
            <BriefingCard height={BRIEFING_HEIGHT} />
            <SuggestionsInbox height={INBOX_HEIGHT} />
          </div>
        </Col>
      </Row>
    </>
  );
}
