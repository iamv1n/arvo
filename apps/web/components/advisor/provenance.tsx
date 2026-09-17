'use client';

import { CaretDown, CaretRight, Database, WarningCircle } from '@phosphor-icons/react';
import { Popover } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';
import { toolLabel, type ToolCallRecord } from '../../lib/advisor';
import { Eyebrow } from '../planning';

const Toggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const Chip = styled.button<{ $error?: boolean; $running?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 3px 10px;
  border: 1px dashed ${({ theme, $error }) => ($error ? theme.colors.expense : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  color: ${({ theme, $error }) => ($error ? theme.colors.expense : theme.colors.textSecondary)};
  font-size: 12px;
  cursor: pointer;
  opacity: ${({ $running }) => ($running ? 0.6 : 1)};

  span.summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Details = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  max-width: 360px;
  margin: 0;
  font-size: 12px;

  dt {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    color: ${({ theme }) => theme.colors.textMuted};
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
`;

const show = (value: unknown) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value));

function ChipDetails({ record }: { record: ToolCallRecord }) {
  const used = Object.entries(record.dataUsed);
  const input = Object.entries(record.input);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Eyebrow>{record.ok ? 'Data used' : `Failed · ${record.error?.code}`}</Eyebrow>
      {record.ok ? (
        used.length ? (
          <Details>
            {used.map(([k, v]) => (
              <FragmentRow key={k} label={k.replace(/_/g, ' ')} value={show(v)} />
            ))}
          </Details>
        ) : (
          <span style={{ fontSize: 12 }}>{record.summary}</span>
        )
      ) : (
        <span style={{ fontSize: 12 }}>{record.error?.message}</span>
      )}
      {input.length > 0 && (
        <>
          <Eyebrow>Asked with</Eyebrow>
          <Details>
            {input.map(([k, v]) => (
              <FragmentRow key={k} label={k.replace(/_/g, ' ')} value={show(v)} />
            ))}
          </Details>
        </>
      )}
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value.length > 160 ? `${value.slice(0, 157)}…` : value}</dd>
    </>
  );
}

/** Collapsible "Data used" row: one chip per tool call, each opening its provenance. */
export function Provenance({ records, running = [], defaultOpen = false }: { records: ToolCallRecord[]; running?: { id: string; name: string }[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = records.length + running.length;
  if (!count) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <Toggle type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <CaretDown size={12} /> : <CaretRight size={12} />}
        <Database size={13} weight="duotone" />
        Data used · {count} {count === 1 ? 'lookup' : 'lookups'}
      </Toggle>
      {(open || running.length > 0) && (
        <Chips>
          {records.map((r) => (
            <Popover key={r.id} content={<ChipDetails record={r} />} trigger="click" placement="bottomLeft">
              <Chip type="button" $error={!r.ok}>
                {!r.ok && <WarningCircle size={13} />}
                {toolLabel(r.name)}
                {r.ok && r.summary !== 'OK' && <span className="summary">{r.summary}</span>}
              </Chip>
            </Popover>
          ))}
          {running.map((r) => (
            <Chip key={r.id} type="button" $running disabled>
              {toolLabel(r.name)} <span className="summary">looking…</span>
            </Chip>
          ))}
        </Chips>
      )}
    </div>
  );
}
