'use client';

import { ArrowClockwise, CalendarBlank, Compass } from '@phosphor-icons/react';
import { App, Button, Empty, Skeleton, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import styled from 'styled-components';
import { useGenerateBriefing, useLatestBriefing, type BriefingView } from '../../lib/advisor';
import { errorMessage } from '../../lib/api';
import { useMoney } from '../../lib/use-money';
import { Eyebrow, Stamp, type StampTone } from '../planning';
import { Panel } from '../panel';

const Decision = styled.div`
  padding: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[4]}px;
  display: grid;
  gap: 2px;
  border-left: 3px solid ${({ theme }) => theme.colors.brand};
  background: ${({ theme }) => theme.colors.brandSubtle};
  border-radius: 0 ${({ theme }) => theme.radii.md}px ${({ theme }) => theme.radii.md}px 0;
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 16px;
  line-height: 1.45;
`;

const Narrative = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 15px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Line = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 4px 12px;
  padding: 6px 0;
  font-size: 13px;

  & + & {
    border-top: 1px dashed ${({ theme }) => theme.colors.borderSubtle};
  }
  .what {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    overflow: hidden;
  }
  .what > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .figure {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
`;

const Section = styled.section`
  display: grid;
  gap: 4px;
`;

const STATUS_TONE: Record<string, StampTone> = { over: 'negative', at_risk: 'warning', on_track: 'positive', behind: 'warning', achieved: 'positive' };

function GenerateButton({ label }: { label?: string }) {
  const generate = useGenerateBriefing();
  const { message } = App.useApp();
  return (
    <Tooltip title="Rebuild this week's briefing from your latest data">
      <Button
        size="small"
        type={label ? 'primary' : 'text'}
        icon={<ArrowClockwise size={14} />}
        loading={generate.isPending}
        onClick={() => generate.mutateAsync().catch((e) => message.error(errorMessage(e)))}
        aria-label="Refresh briefing"
      >
        {label}
      </Button>
    </Tooltip>
  );
}

function Body({ view, compact }: { view: BriefingView; compact: boolean }) {
  const format = useMoney();
  const b = view.data;
  const money = (v: string) => format(v, b.currency);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {view.narrative && !compact && (
        <div>
          <Narrative>{view.narrative}</Narrative>
          <Eyebrow style={{ display: 'block', marginTop: 6 }}>Written by {view.provider} from the figures below</Eyebrow>
        </div>
      )}
      <Decision>
        <Eyebrow>One decision</Eyebrow>
        {b.decision.text}
      </Decision>
      {b.budgets.attention.length > 0 && (
        <Section>
          <Eyebrow>Budgets pacing over</Eyebrow>
          {b.budgets.attention.slice(0, compact ? 2 : 4).map((a) => (
            <Line key={a.budgetId}>
              <span className="what">
                <span>{a.categoryName}</span>
                <Stamp $tone={STATUS_TONE[a.status] ?? 'neutral'}>{a.status.replace('_', ' ')}</Stamp>
              </span>
              <span className="figure">
                {money(a.spent)} / {money(a.limit)}
              </span>
            </Line>
          ))}
        </Section>
      )}
      {!compact && b.goals.length > 0 && (
        <Section>
          <Eyebrow>Goals</Eyebrow>
          {b.goals.slice(0, 3).map((g) => (
            <Line key={g.goalId}>
              <span className="what">
                <span>{g.name}</span>
                <Stamp $tone={STATUS_TONE[g.status] ?? 'neutral'}>{g.status.replace('_', ' ')}</Stamp>
              </span>
              <span className="figure">{g.percent}%</span>
            </Line>
          ))}
        </Section>
      )}
      {b.savings.top.length > 0 && (
        <Section>
          <Eyebrow>Ways to spend less · {money(b.savings.totalMonthly)}/mo</Eyebrow>
          {b.savings.top.slice(0, compact ? 2 : 3).map((s) => (
            <Line key={s.id}>
              <span className="what">
                <span>{s.title}</span>
              </span>
              <span className="figure">{money(s.monthlySaving)}</span>
            </Line>
          ))}
        </Section>
      )}
      {!compact && b.upcoming.length > 0 && (
        <Section>
          <Eyebrow>Next 7 days</Eyebrow>
          {b.upcoming.slice(0, 4).map((u) => (
            <Line key={`${u.label}-${u.date}`}>
              <span className="what">
                <span>
                  {dayjs(u.date).format('ddd D MMM')} · {u.label}
                </span>
              </span>
              <span className="figure">{money(u.amount)}</span>
            </Line>
          ))}
        </Section>
      )}
    </div>
  );
}

/** The latest weekly briefing. `compact` is the dashboard version. */
export function BriefingCard({ height, compact = false }: { height: number; compact?: boolean }) {
  const briefing = useLatestBriefing();
  const view = briefing.data;
  return (
    <Panel
      height={height}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <CalendarBlank size={18} weight="duotone" />
          Weekly briefing
        </span>
      }
      extra={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {view && <Eyebrow>Week of {dayjs(view.weekStart).format('D MMM')}</Eyebrow>}
          {compact ? <Link href="/advisor">Open advisor</Link> : view && <GenerateButton />}
        </span>
      }
    >
      {briefing.isPending ? (
        <Skeleton active />
      ) : !view ? (
        <div style={{ height: '100%', display: 'grid', placeContent: 'center' }}>
          <Empty image={<Compass size={40} weight="duotone" />} styles={{ image: { height: 44 } }} description="No briefing yet. Build one from this week's numbers.">
            <GenerateButton label="Build briefing" />
          </Empty>
        </div>
      ) : (
        <>
          <Body view={view} compact={compact} />
          {compact && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
              Updated {dayjs(view.updatedAt).format('D MMM, HH:mm')}
            </Typography.Text>
          )}
        </>
      )}
    </Panel>
  );
}
