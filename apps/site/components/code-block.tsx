'use client';

import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useState } from 'react';
import styled from 'styled-components';

const CodeCard = styled.div`
  position: relative;
  border-radius: ${({ theme }) => theme.radii.xl}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
  min-width: 0;
  margin: 0 0 16px;
`;

const CodeBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 6px 16px;
  background: ${({ theme }) => theme.colors.bgMuted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
`;

const Pre = styled.pre`
  margin: 0 !important;
  padding: ${({ theme }) => theme.space[4]}px ${({ theme }) => theme.space[5]}px;
  overflow-x: auto;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 13.5px;
  line-height: 1.8;
  color: ${({ theme }) => theme.colors.textPrimary};
  & code {
    padding: 0 !important;
    background: transparent !important;
    font-size: inherit !important;
    overflow-wrap: normal !important;
  }
  & .p {
    color: ${({ theme }) => theme.colors.brandText};
    user-select: none;
  }
  & .c {
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

/**
 * Code sample with a copy button. In `shell` mode, lines starting with `#` render as comments,
 * other lines get a `$` prompt, and only the commands are copied.
 */
export function CodeBlock({ code, label = 'terminal', shell = true }: { code: string; label?: string; shell?: boolean }) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n');
  const copyText = shell ? lines.filter((l) => l.trim() && !l.trimStart().startsWith('#')).join('\n') : code;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      message.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Could not access the clipboard');
    }
  };
  return (
    <CodeCard>
      <CodeBar>
        <span>{label}</span>
        <Button size="small" type="text" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </CodeBar>
      <Pre>
        <code>
          {lines.map((line, i) => (
            <span key={i}>
              {shell && line.trimStart().startsWith('#') ? (
                <span className="c">{line}</span>
              ) : shell && line.trim() ? (
                <>
                  <span className="p">$ </span>
                  {line}
                </>
              ) : (
                line
              )}
              {i < lines.length - 1 ? '\n' : null}
            </span>
          ))}
        </code>
      </Pre>
    </CodeCard>
  );
}
