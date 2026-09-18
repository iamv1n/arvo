'use client';

import { ArrowRight, PiggyBank } from '@phosphor-icons/react';
import { Card, Empty, Skeleton, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import styled from 'styled-components';
import { PageHeader } from '../../../components/page-header';
import { Eyebrow, Figure, SectionTitle, Stamp, type StampTone } from '../../../components/planning';
import { useSavingsOpportunities } from '../../../lib/queries';
import type { SavingsKind, SavingsOpportunity } from '../../../lib/types';
import { useMoney } from '../../../lib/use-money';

const KIND: Record<SavingsKind, { label: string; tone: StampTone }> = {
  category_creep: { label: 'Category creep', tone: 'warning' },
  merchant_creep: { label: 'Merchant creep', tone: 'warning' },
  subscription_price_increase: { label: 'Price increase', tone: 'negative' },
  fees_and_interest: { label: 'Fees & interest', tone: 'negative' },
  one_off_spike: { label: 'One-off', tone: 'neutral' },
};

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[6]}px;
  align-items: end;
  padding: ${({ theme }) => theme.space[6]}px ${({ theme }) => theme.space[8]}px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.inkSurface};
  color: ${({ theme }) => theme.colors.onInk};
  border-top: 4px solid ${({ theme }) => theme.colors.brand};

  .big {
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    /* Must survive a 375px phone: the floor is small enough for ₹1,24,350.00/month. */
    font-size: clamp(30px, 7vw, 60px);
    overflow-wrap: anywhere;
    font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
    font-variant-numeric: lining-nums tabular-nums;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .big small {
    font-size: 0.45em;
    letter-spacing: -0.01em;
    opacity: 0.8;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: ${({ theme }) => theme.space[3]}px;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.75;
  }
  dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: ${({ theme }) => theme.space[4]}px;
    margin: 0;
    min-width: 0;
  }
  dl > div {
    min-width: 0;
  }
  dt {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
  }
  dd {
    margin: 4px 0 0;
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    font-size: clamp(19px, 2vw, 24px);
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    padding: ${({ theme }) => theme.space[6]}px;
  }
`;

const Item = styled.div<{ $muted?: boolean }>`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) minmax(0, auto) 40px;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  min-height: 84px;
  padding: ${({ theme }) => theme.space[4]}px ${({ theme }) => theme.space[6]}px;
  opacity: ${({ $muted }) => ($muted ? 0.72 : 1)};

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
  .rank {
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    font-size: 26px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  .right {
    min-width: 0;
    text-align: right;
  }

  @media (max-width: 760px) {
    grid-template-columns: 32px minmax(0, 1fr) minmax(0, auto);
    gap: ${({ theme }) => theme.space[3]}px;
    padding: ${({ theme }) => theme.space[4]}px;
    .go {
      display: none;
    }
  }
`;

function evidenceHref(o: SavingsOpportunity): string {
  return `/transactions?${new URLSearchParams(o.evidence.query).toString()}`;
}

export default function SavingsPage() {
  const money = useMoney();
  const savings = useSavingsOpportunities();
  const data = savings.data;
  const currency = data?.currency ?? 'INR';
  const actionable = data?.opportunities.filter((o) => !o.informational) ?? [];
  const informational = data?.opportunities.filter((o) => o.informational) ?? [];
  const monthLabel = data ? dayjs(`${data.month}-01`).format('MMMM') : '';

  const rationale = (o: SavingsOpportunity): string => {
    const r = o.rationale;
    const pct = r.changePercent !== null ? ` · ${r.changePercent > 0 ? '+' : ''}${r.changePercent}%` : '';
    switch (o.kind) {
      case 'category_creep':
      case 'merchant_creep':
        return `${money(r.current, currency)} in ${monthLabel} vs ${money(r.baseline ?? 0, currency)} usual${pct}`;
      case 'subscription_price_increase':
        return `${money(r.current, currency)} now, was ${money(r.baseline ?? 0, currency)}${pct}`;
      case 'fees_and_interest':
        return `${money(r.current, currency)} charged ${dayjs(r.period.from).format('MMM')}–${dayjs(r.period.to).format('MMM')}`;
      case 'one_off_spike':
        return `${money(r.current, currency)} on ${dayjs(r.period.from).format('D MMM')}${Number(r.baseline) > 0 ? ` · category usually ${money(r.baseline ?? 0, currency)}/month` : ''}`;
    }
  };

  const row = (o: SavingsOpportunity, i: number) => (
    <Item key={o.id} $muted={o.informational}>
      <span className="rank">{o.informational ? '·' : i + 1}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 15 }} ellipsis>
            {o.title}
          </Typography.Text>
          <Stamp $tone={KIND[o.kind].tone}>{KIND[o.kind].label}</Stamp>
          {!o.informational && !o.includedInTotal && (
            <Tooltip title="Overlaps with another item, so it is not added to the total.">
              <Eyebrow>Overlaps</Eyebrow>
            </Tooltip>
          )}
        </div>
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
          {rationale(o)}
        </Typography.Text>
        <Eyebrow>
          {o.rationale.basis} · {o.confidence} confidence
        </Eyebrow>
      </div>
      <div className="right">
        {o.informational ? (
          <Eyebrow>Worth a look</Eyebrow>
        ) : (
          <>
            <Figure $size={24}>{money(o.monthlySaving, currency)}</Figure>
            <Eyebrow style={{ display: 'block' }}>a month</Eyebrow>
          </>
        )}
      </div>
      <Tooltip title="See the transactions">
        <Link className="go" href={evidenceHref(o)} aria-label={`Transactions for ${o.title}`} style={{ display: 'grid', placeItems: 'center' }}>
          <ArrowRight size={20} />
        </Link>
      </Tooltip>
    </Item>
  );

  return (
    <>
      <PageHeader title="Save more" subtitle="Where your spending crept up, what got pricier and what fees cost you — every figure traced to transactions." />

      <Hero>
        <div>
          <div className="label">
            <PiggyBank size={16} weight="duotone" /> You could keep
          </div>
          {savings.isPending ? (
            <Skeleton.Input active size="large" />
          ) : (
            <div className="big">
              {money(data?.totalMonthly ?? 0, currency)}
              <small>/month</small>
            </div>
          )}
        </div>
        <dl>
          <div>
            <dt>A year</dt>
            <dd>{data ? money(data.totalYearly, currency, { compact: true }) : '—'}</dd>
          </div>
          <div>
            <dt>Opportunities</dt>
            <dd>{data ? actionable.length : '—'}</dd>
          </div>
          <div>
            <dt>Compared</dt>
            <dd>{data ? `${dayjs(`${data.month}-01`).format('MMM YYYY')}` : '—'}</dd>
          </div>
          <div>
            <dt>Against</dt>
            <dd>3-month avg</dd>
          </div>
        </dl>
      </Hero>

      <SectionTitle>
        <span>Ranked by monthly saving</span>
        <small>{data ? `As of ${dayjs(data.asOf).format('D MMM YYYY')}` : ' '}</small>
      </SectionTitle>
      <Card styles={{ body: { padding: 0 } }}>
        {savings.isPending ? (
          <div style={{ padding: 24 }}>
            <Skeleton active />
          </div>
        ) : actionable.length === 0 ? (
          <Empty
            style={{ padding: '40px 0' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Nothing stands out: spending is in line with the last three months and no fees or price rises were found."
          />
        ) : (
          actionable.map(row)
        )}
      </Card>

      {informational.length > 0 && (
        <>
          <SectionTitle>
            <span>Large one-offs</span>
            <small>Not counted in the total</small>
          </SectionTitle>
          <Card styles={{ body: { padding: 0 } }}>{informational.map(row)}</Card>
        </>
      )}
    </>
  );
}
