'use client';

import { ArrowsClockwise, CalendarX, ChartBar, Repeat, TrendUp } from '@phosphor-icons/react';
import { Alert, Card, Col, Empty, Row, Skeleton, Space, Tag } from 'antd';
import Link from 'next/link';
import { formatDate } from '../../lib/format';
import { useTradingBehaviour, type TradeFilters } from '../../lib/queries';
import type { BehaviourFlagKind } from '../../lib/types';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, SectionTitle } from '../planning';
import { StatCard } from '../stat-card';
import { Muted, NotAdvice, Pnl, num } from './shared';

const ICONS: Record<BehaviourFlagKind, React.ReactNode> = {
  OVER_TRADING: <ChartBar size={17} weight="duotone" />,
  REVENGE_TRADE: <Repeat size={17} weight="duotone" />,
  SIZE_CREEP: <TrendUp size={17} weight="duotone" />,
  AVERAGING_DOWN: <ArrowsClockwise size={17} weight="duotone" />,
  EXPIRY_DAY_CONCENTRATION: <CalendarX size={17} weight="duotone" />,
};

/**
 * Patterns in how the trading happened, rather than in what it made. Each flag shows the rule
 * that produced it and links to the positions behind it, so it can be argued with.
 */
export function BehaviourView({ asOf, filters }: { asOf: string; filters: TradeFilters }) {
  const money = useMoney();
  const query = useTradingBehaviour(asOf, filters);

  if (query.isPending) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }
  const data = query.data;
  if (!data) return null;

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={8}>
          <StatCard
            label="Median fills per day"
            icon={<ChartBar size={17} weight="duotone" />}
            value={String(data.rules.medianTradesPerDay)}
            hint={`A day is flagged above ${data.rules.overTradingMultiple}× this`}
          />
        </Col>
        <Col xs={12} md={8}>
          <StatCard
            label="Revenge-trade window"
            icon={<Repeat size={17} weight="duotone" />}
            iconTone="info"
            value={`${data.rules.revengeWindowMinutes} min`}
            hint="Change it in trading settings"
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label="Derivative fills on expiry day"
            icon={<CalendarX size={17} weight="duotone" />}
            iconTone="warning"
            value={data.expiryDayRatio === null ? '—' : `${data.expiryDayRatio}%`}
            hint="Of all your futures and options fills"
          />
        </Col>
      </Row>

      {data.flags.length === 0 ? (
        <Card>
          <Empty
            style={{ padding: '32px 0' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Nothing to flag. Either the patterns are not there, or there are not enough trades yet to tell."
          />
        </Card>
      ) : (
        <>
          <SectionTitle style={{ marginTop: 0 }}>
            <span>What turned up</span>
            <Eyebrow>{data.flags.length} observations</Eyebrow>
          </SectionTitle>
          <Row gutter={[16, 16]}>
            {data.flags.slice(0, 40).map((flag, index) => (
              <Col xs={24} lg={12} key={`${flag.kind}-${flag.date ?? index}-${flag.subject ?? index}`}>
                <Card>
                  <Space align="start" size={12}>
                    <span style={{ opacity: 0.8 }}>{ICONS[flag.kind]}</span>
                    <div style={{ minWidth: 0 }}>
                      <Eyebrow>
                        {flag.title}
                        {flag.date ? ` · ${formatDate(flag.date)}` : ''}
                      </Eyebrow>
                      <p style={{ margin: '6px 0' }}>{flag.explanation}</p>
                      <Muted>Rule: {flag.rule}</Muted>
                      <div style={{ marginTop: 10 }}>
                        <Space wrap size={6}>
                          {flag.netPnl !== null && (
                            <Tag>
                              <Pnl $value={num(flag.netPnl)}>{money(flag.netPnl, 'INR')}</Pnl>
                            </Tag>
                          )}
                          {flag.positionIds.slice(0, 4).map((id, at) => (
                            <Link key={id} href={`/trading/${id}?asOf=${asOf}`}>
                              <Tag color="default">Position {at + 1}</Tag>
                            </Link>
                          ))}
                          <Tag>{flag.count} fills</Tag>
                        </Space>
                      </div>
                    </div>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="These are descriptions, not verdicts"
        description="Some of these patterns are a deliberate strategy for some people — scaling into a planned position looks exactly like averaging down. The flags say what happened and how often; what to make of it is yours."
      />
      <NotAdvice text={data.disclaimer} style={{ marginTop: 16 }} />
    </>
  );
}
