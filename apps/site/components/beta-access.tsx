'use client';

import { CheckOutlined, CopyOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Modal, type ButtonProps } from 'antd';
import { createContext, useCallback, useContext, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import { APP_URL } from '../lib/config';
import { CONTACT_EMAIL } from '../lib/legal';

const SUBJECT = 'Arvo beta access request';
const BODY = 'Hi,\n\nI would like to request access to the Arvo beta.\n\nName:\nHow I plan to use Arvo:\n';
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;

const BetaContext = createContext<(() => void) | null>(null);

const Content = styled.div`
  & p {
    margin: 0 0 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: 15px;
    line-height: 1.6;
  }
  & .email {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin: 16px 0 4px;
    padding: 8px 8px 8px 14px;
    border-radius: ${({ theme }) => theme.radii.md}px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    background: ${({ theme }) => theme.colors.bgMuted};
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 13px;
    color: ${({ theme }) => theme.colors.textPrimary};
    overflow-wrap: anywhere;
  }
`;

/** Provides one shared closed-beta modal for every app call-to-action on the page. */
export function BetaAccessProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    setOpen(false);
    setCopied(false);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <BetaContext.Provider value={show}>
      {children}
      <Modal
        open={open}
        onCancel={close}
        title="Arvo is in closed beta"
        centered
        destroyOnHidden
        footer={[
          <Button key="close" onClick={close}>
            Close
          </Button>,
          <Button key="mail" type="primary" href={MAILTO} icon={<MailOutlined />}>
            Request access by email
          </Button>,
        ]}
      >
        <Content>
          <p>
            Thanks for your interest! Access to Arvo is invite-only while we polish things. Send a short email and we will
            get you set up.
          </p>
          <div className="email">
            <span>{CONTACT_EMAIL}</span>
            <Button
              size="small"
              type="text"
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={copy}
              aria-label="Copy email address"
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <span aria-live="polite" style={{ position: 'absolute', left: -9999 }}>
            {copied ? 'Email address copied' : ''}
          </span>
        </Content>
      </Modal>
    </BetaContext.Provider>
  );
}

function useOpenBeta() {
  const open = useContext(BetaContext);
  if (!open) throw new Error('OpenAppButton must be used inside BetaAccessProvider');
  return open;
}

const DASHBOARD = APP_URL ? `${APP_URL}/dashboard` : null;

/** "Open Arvo" button: links to the app when configured, otherwise opens the closed-beta modal. */
export function OpenAppButton({ children = 'Open Arvo', ...props }: Omit<ButtonProps, 'href' | 'onClick'>) {
  const openBeta = useOpenBeta();
  if (DASHBOARD) {
    return (
      <Button {...props} href={DASHBOARD}>
        {children}
      </Button>
    );
  }
  return (
    <Button {...props} onClick={openBeta} aria-haspopup="dialog">
      {children}
    </Button>
  );
}

/** Plain-text link variant for footers. */
export function OpenAppLink({ children = 'Open Arvo' }: { children?: ReactNode }) {
  const openBeta = useOpenBeta();
  const onClick = useMemo(
    () =>
      DASHBOARD
        ? undefined
        : (event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            openBeta();
          },
    [openBeta],
  );
  return (
    <a href={DASHBOARD ?? '#'} onClick={onClick} aria-haspopup={DASHBOARD ? undefined : 'dialog'}>
      {children}
    </a>
  );
}
