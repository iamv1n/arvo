'use client';

import { DeleteOutlined } from '@ant-design/icons';
import { ChatCircleText, PaperPlaneRight, Plus, Sparkle, Stop } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Grid, Input, Popconfirm, Select, Skeleton, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  advisorKeys,
  SUGGESTED_PROMPTS,
  useConversation,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  type AdvisorMessage,
  type AdvisorStatus,
  type Suggestion,
  type ToolCallRecord,
} from '../../lib/advisor';
import { apiStream, errorMessage } from '../../lib/api';
import { Eyebrow, Stamp } from '../planning';
import { SetupExplainer } from './ai-notice';
import { Markdown } from './markdown';
import { Provenance } from './provenance';

const Shell = styled.div<{ $sidebar: boolean }>`
  display: grid;
  grid-template-columns: ${({ $sidebar }) => ($sidebar ? '232px minmax(0, 1fr)' : 'minmax(0, 1fr)')};
  height: 100%;
`;

const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  background: ${({ theme }) => theme.colors.bgCanvas};
`;

const ConversationButton = styled.button<{ $active: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 10px 12px 10px 16px;
  border: 0;
  border-left: 2px solid ${({ theme, $active }) => ($active ? theme.colors.brand : 'transparent')};
  background: ${({ theme, $active }) => ($active ? theme.colors.bgSurface : 'transparent')};
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: left;
  cursor: pointer;

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .delete {
    opacity: 0;
  }
  &:hover .delete,
  &:focus-within .delete {
    opacity: 1;
  }
`;

const Thread = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: ${({ theme }) => theme.space[5]}px ${({ theme }) => theme.space[6]}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}px) {
    padding: ${({ theme }) => theme.space[4]}px;
  }
`;

const UserBubble = styled.div`
  justify-self: end;
  max-width: 80%;
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radii.lg}px ${({ theme }) => theme.radii.lg}px 4px ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.inkSurface};
  color: ${({ theme }) => theme.colors.onInk};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Answer = styled.div`
  max-width: 92%;
`;

const Messages = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[5]}px;
`;

const Composer = styled.form`
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: ${({ theme }) => theme.space[3]}px ${({ theme }) => theme.space[4]}px;
  border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
`;

const Prompts = styled.div`
  display: grid;
  gap: 10px;
  align-content: center;
  justify-items: start;
  height: 100%;
  max-width: 520px;
  margin: 0 auto;
`;

const PromptButton = styled.button`
  width: 100%;
  padding: 12px 16px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamilySerif};
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.brand};
  }
`;

const ERROR_TEXT: Record<string, string> = {
  AI_AUTH: 'The AI provider rejected the API key. Check the key in the server environment.',
  AI_RATE_LIMITED: 'The AI provider is rate limiting requests. Try again in a minute.',
  AI_UNAVAILABLE: 'The AI provider could not be reached.',
  AI_BAD_RESPONSE: 'The AI provider rejected the request. Check AI_MODEL.',
  AI_ABORTED: 'Stopped.',
};

interface Live {
  conversationId: string;
  question: string;
  text: string;
  records: ToolCallRecord[];
  running: { id: string; name: string }[];
  suggestions: Suggestion[];
}

const KIND: Record<string, string> = { budget: 'budget', goal: 'goal', rule: 'categorization rule', scenario: 'scenario' };

function Drafted({ suggestions }: { suggestions: Suggestion[] }) {
  if (!suggestions.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {suggestions.map((s) => (
        <Stamp key={s.id} $tone={s.status === 'approved' ? 'positive' : s.status === 'dismissed' ? 'neutral' : 'warning'}>
          Drafted {KIND[s.kind]} · {s.status}
        </Stamp>
      ))}
    </div>
  );
}

function AssistantMessage({ message, suggestions }: { message: AdvisorMessage; suggestions: Suggestion[] }) {
  return (
    <Answer>
      <Eyebrow style={{ display: 'block', marginBottom: 6 }}>
        <Sparkle size={11} weight="fill" style={{ verticalAlign: -1, marginRight: 4 }} />
        Advisor{message.model ? ` · ${message.model}` : ''} · {dayjs(message.createdAt).format('D MMM, HH:mm')}
      </Eyebrow>
      {message.content && <Markdown>{message.content}</Markdown>}
      {message.status === 'error' && (
        <Alert type={message.errorCode === 'AI_ABORTED' ? 'info' : 'error'} showIcon style={{ marginTop: 8 }} title={ERROR_TEXT[message.errorCode ?? ''] ?? 'The advisor could not finish this answer.'} />
      )}
      <Provenance records={message.toolCalls} />
      <Drafted suggestions={suggestions} />
    </Answer>
  );
}

export function AdvisorChat({ status, height }: { status: AdvisorStatus | undefined; height: number }) {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const conversations = useConversations();
  const create = useCreateConversation();
  const remove = useDeleteConversation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const detail = useConversation(activeId);

  // Open the most recent conversation by default.
  const items = conversations.data ?? [];
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !conversations.data) return;
    picked.current = true;
    if (conversations.data.length) setActiveId(conversations.data[0]!.id);
  }, [conversations.data]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [detail.data?.messages.length, live?.text, live?.records.length, live?.running.length]);

  const enabled = !!status?.enabled;

  const send = async (content: string) => {
    const question = content.trim();
    if (!question || live) return;
    let id = activeId;
    try {
      if (!id) {
        id = (await create.mutateAsync()).id;
        setActiveId(id);
      }
    } catch (e) {
      message.error(errorMessage(e));
      return;
    }
    const conversationId = id;
    setDraft('');
    setLive({ conversationId, question, text: '', records: [], running: [], suggestions: [] });
    const controller = new AbortController();
    abort.current = controller;
    try {
      await apiStream(
        `/advisor/conversations/${conversationId}/messages`,
        { content: question },
        (event, data) => {
          setLive((prev) => {
            if (!prev) return prev;
            switch (event) {
              case 'delta':
                return { ...prev, text: prev.text + (data as { text: string }).text };
              case 'tool_call': {
                const call = data as { id: string; name: string };
                return { ...prev, running: [...prev.running, { id: call.id, name: call.name }] };
              }
              case 'tool_result': {
                const record = data as ToolCallRecord;
                return { ...prev, records: [...prev.records, record], running: prev.running.filter((r) => r.id !== record.id) };
              }
              case 'suggestion':
                return { ...prev, suggestions: [...prev.suggestions, data as Suggestion] };
              default:
                return prev;
            }
          });
          if (event === 'suggestion') void queryClient.invalidateQueries({ queryKey: advisorKeys.suggestions });
        },
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        message.error(errorMessage(e));
        setDraft(question);
      }
    } finally {
      abort.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: advisorKeys.conversation(conversationId) }),
        queryClient.invalidateQueries({ queryKey: advisorKeys.conversations }),
        queryClient.invalidateQueries({ queryKey: advisorKeys.suggestions }),
      ]);
      setLive(null);
    }
  };

  const newChat = () => {
    if (live) return;
    setActiveId(null);
    queryClient.removeQueries({ queryKey: advisorKeys.conversation('none') });
  };

  const messages = activeId ? (detail.data?.messages ?? []) : [];
  const suggestionsFor = (messageId: string) => (detail.data?.suggestions ?? []).filter((s) => s.messageId === messageId);
  const showLive = live && live.conversationId === activeId;
  const sidebar = !!screens.lg;

  const list = (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
      {conversations.isPending ? (
        <div style={{ padding: 16 }}>
          <Skeleton active paragraph={{ rows: 4 }} title={false} />
        </div>
      ) : items.length === 0 ? (
        <Typography.Text type="secondary" style={{ display: 'block', padding: '12px 16px', fontSize: 13 }}>
          No conversations yet.
        </Typography.Text>
      ) : (
        items.map((c) => (
          <ConversationButton key={c.id} type="button" $active={c.id === activeId} onClick={() => !live && setActiveId(c.id)}>
            <span>
              <span className="title" style={{ display: 'block' }}>
                {c.title}
              </span>
              <Eyebrow>{dayjs(c.updatedAt).format('D MMM')}</Eyebrow>
            </span>
            <Popconfirm
              title="Delete this conversation?"
              onConfirm={(e) => {
                e?.stopPropagation();
                return remove.mutateAsync(c.id).then(() => c.id === activeId && setActiveId(null), (err) => message.error(errorMessage(err)));
              }}
            >
              <Button className="delete" size="small" type="text" icon={<DeleteOutlined />} aria-label="Delete conversation" onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          </ConversationButton>
        ))
      )}
    </div>
  );

  return (
    <Card styles={{ body: { height, padding: 0 } }} style={{ overflow: 'hidden' }}>
      <Shell $sidebar={sidebar}>
        {sidebar && (
          <Sidebar>
            <div style={{ padding: 12 }}>
              <Button block icon={<Plus size={14} />} onClick={newChat} disabled={!enabled || !!live}>
                New conversation
              </Button>
            </div>
            <Eyebrow style={{ padding: '4px 16px 8px' }}>
              <ChatCircleText size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              Conversations
            </Eyebrow>
            {list}
          </Sidebar>
        )}
        <Thread>
          {!sidebar && items.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid var(--ant-color-border-secondary)' }}>
              <Select
                style={{ flex: 1, minWidth: 0 }}
                value={activeId ?? undefined}
                placeholder="New conversation"
                onChange={(id) => !live && setActiveId(id)}
                options={items.map((c) => ({ value: c.id, label: c.title }))}
              />
              <Tooltip title="New conversation">
                <Button icon={<Plus size={14} />} onClick={newChat} disabled={!enabled || !!live} aria-label="New conversation" />
              </Tooltip>
            </div>
          )}
          {!enabled && status ? (
            <Scroll>
              <SetupExplainer />
            </Scroll>
          ) : (
            <>
              <Scroll ref={scroller}>
                {activeId && detail.isPending && !showLive ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : messages.length === 0 && !showLive ? (
                  <Prompts>
                    <Eyebrow>Ask about your money</Eyebrow>
                    <Typography.Title level={3} style={{ margin: '0 0 6px', fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 500 }}>
                      Every figure comes from your ledger.
                    </Typography.Title>
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <PromptButton key={prompt} type="button" onClick={() => void send(prompt)} disabled={!enabled}>
                        {prompt}
                      </PromptButton>
                    ))}
                  </Prompts>
                ) : (
                  <Messages>
                    {messages.map((m) =>
                      m.role === 'user' ? <UserBubble key={m.id}>{m.content}</UserBubble> : m.status === 'streaming' && showLive ? null : <AssistantMessage key={m.id} message={m} suggestions={suggestionsFor(m.id)} />,
                    )}
                    {showLive && (
                      <>
                        {!messages.some((m) => m.role === 'user' && m.content === live.question && dayjs().diff(m.createdAt, 'minute') < 5) && <UserBubble>{live.question}</UserBubble>}
                        <Answer>
                          <Eyebrow style={{ display: 'block', marginBottom: 6 }}>
                            <Sparkle size={11} weight="fill" style={{ verticalAlign: -1, marginRight: 4 }} />
                            Advisor · {live.running.length ? 'looking up your data…' : live.text ? 'writing…' : 'thinking…'}
                          </Eyebrow>
                          {live.text ? <Markdown>{live.text}</Markdown> : <Skeleton active title={false} paragraph={{ rows: 2, width: ['80%', '50%'] }} />}
                          <Provenance records={live.records} running={live.running} />
                          <Drafted suggestions={live.suggestions} />
                        </Answer>
                      </>
                    )}
                  </Messages>
                )}
              </Scroll>
              <Composer
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
              >
                <Input.TextArea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about spending, budgets, goals or a purchase…"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  maxLength={4000}
                  disabled={!enabled}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                />
                {live ? (
                  <Button icon={<Stop size={16} weight="fill" />} onClick={() => abort.current?.abort()} aria-label="Stop" />
                ) : (
                  <Button type="primary" htmlType="submit" icon={<PaperPlaneRight size={16} weight="fill" />} disabled={!enabled || !draft.trim()} aria-label="Send" />
                )}
              </Composer>
            </>
          )}
        </Thread>
      </Shell>
    </Card>
  );
}
