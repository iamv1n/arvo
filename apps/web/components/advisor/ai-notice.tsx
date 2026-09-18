'use client';

import { CloudArrowUp, HardDrives, Sparkle } from '@phosphor-icons/react';
import { Typography } from 'antd';
import styled from 'styled-components';
import type { AdvisorStatus } from '../../lib/advisor';
import { NoticeStrip } from '../notice-strip';
import { Eyebrow } from '../planning';

/**
 * Where questions and data go. A standing notice, so it reads as one ruled line above the chat
 * rather than a paragraph block that pushes the conversation off the first screen.
 */
export function ProviderNotice({ status }: { status: AdvisorStatus | undefined }) {
  if (!status?.enabled) return null;
  if (status.cloud) {
    return (
      <NoticeStrip
        storageKey="arvo.advisor.notice"
        icon={<CloudArrowUp size={13} weight="duotone" style={{ flex: 'none', marginTop: 2 }} />}
        headline={`Your financial data is sent to ${status.providerLabel} to answer.`}
        detail={`Questions and the figures the advisor looks up go to ${status.providerLabel} (${status.model}). Nothing is saved without your approval. Switch to a local model in Settings \u2192 Preferences.`}
      />
    );
  }
  return (
    <NoticeStrip
      storageKey="arvo.advisor.notice"
      icon={<HardDrives size={13} weight="duotone" style={{ flex: 'none', marginTop: 2 }} />}
      headline={`Answers run on ${status.providerLabel} (${status.model}).`}
      detail="Your data stays on this machine; nothing is sent to a provider."
    />
  );
}

const Code = styled.pre`
  margin: ${({ theme }) => theme.space[3]}px 0;
  padding: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[4]}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
`;

const Wrap = styled.div`
  display: grid;
  align-content: center;
  height: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space[6]}px;
`;

/** Shown in place of the chat when no provider is configured. */
export function SetupExplainer() {
  return (
    <Wrap>
      <Eyebrow>
        <Sparkle size={12} weight="fill" style={{ verticalAlign: -1, marginRight: 6 }} />
        Advisor is off
      </Eyebrow>
      <Typography.Title level={3} style={{ margin: '8px 0', fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 500 }}>
        Turn on the AI advisor
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Budgets, goals, savings opportunities and the weekly briefing below already work without AI. To ask questions in plain language, pick a provider in the server&apos;s <code>.env</code> and restart the API:
      </Typography.Paragraph>
      <Code>
        {`# Local and private (docker compose --profile ollama up -d ollama)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
AI_MODEL=llama3.1

# Or a cloud provider (your data is sent to it)
AI_PROVIDER=anthropic   # openai | gemini
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-5`}
      </Code>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Keys stay on the server. The advisor only reads your data through Arvo&apos;s finance tools and can&apos;t save anything without your approval.
      </Typography.Text>
    </Wrap>
  );
}
