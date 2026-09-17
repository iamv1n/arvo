'use client';

import { ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { LandingGlobals, Nav, Root, SiteFooter, SkipLink } from '../landing/landing-page';
import { Container, Eyebrow, fonts } from '../landing/primitives';

export interface LegalTocItem {
  id: string;
  title: string;
}

const PrintStyles = createGlobalStyle`
  @media print {
    header, footer, [data-legal-toc], [data-no-print] { display: none !important; }
    html, body, [data-landing] { background: #fff !important; color: #000 !important; }
    [data-legal-doc] * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
    [data-legal-doc] a { text-decoration: underline; }
    [data-legal-doc] section { break-inside: avoid-page; }
  }
`;

const Layout = styled(Container)`
  display: grid;
  gap: ${({ theme }) => theme.space[10]}px;
  padding-top: ${({ theme }) => theme.space[10]}px;
  padding-bottom: 96px;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    grid-template-columns: 240px minmax(0, 1fr);
    gap: ${({ theme }) => theme.space[16]}px;
    padding-top: ${({ theme }) => theme.space[16]}px;
  }
`;

const Toc = styled.nav`
  display: none;
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    display: block;
    position: sticky;
    top: 88px;
    align-self: start;
    max-height: calc(100dvh - 110px);
    overflow-y: auto;
  }
  & p {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
  & ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    border-left: 1px solid ${({ theme }) => theme.colors.border};
  }
  & a {
    display: block;
    padding: 5px 12px;
    margin-left: -1px;
    border-left: 2px solid transparent;
    font-size: 13px;
    line-height: 1.4;
    color: ${({ theme }) => theme.colors.textSecondary};
    text-decoration: none;
  }
  & a:hover,
  & a:focus-visible {
    color: ${({ theme }) => theme.colors.brandText};
    border-left-color: ${({ theme }) => theme.colors.brand};
  }
`;

const MobileToc = styled.details`
  margin-top: ${({ theme }) => theme.space[6]}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg}px;
  background: ${({ theme }) => theme.colors.bgSurface};
  padding: 10px 14px;
  & summary {
    cursor: pointer;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & ol {
    margin: 10px 0 4px;
    padding-left: 22px;
    line-height: 1.9;
    font-size: 14px;
  }
  & a {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  @media (min-width: ${({ theme }) => theme.breakpoints.lg}px) {
    display: none;
  }
`;

const Doc = styled.article`
  min-width: 0;
  max-width: 760px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 16px;
  line-height: 1.75;
  & h1 {
    margin: 0;
    font-family: ${fonts.serif};
    font-weight: 450;
    font-variation-settings: 'opsz' 144;
    font-size: clamp(30px, 5vw, 44px);
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & section {
    scroll-margin-top: 84px;
    padding-top: ${({ theme }) => theme.space[8]}px;
    margin-top: ${({ theme }) => theme.space[8]}px;
    border-top: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
  & h2 {
    margin: 0 0 12px;
    font-family: ${fonts.serif};
    font-weight: 500;
    font-size: 22px;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & h3 {
    margin: 20px 0 6px;
    font-size: 17px;
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & p {
    margin: 0 0 14px;
  }
  & ul,
  & ol {
    margin: 0 0 14px;
    padding-left: 22px;
  }
  & li + li {
    margin-top: 6px;
  }
  & strong {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  & a {
    color: ${({ theme }) => theme.colors.brandText};
    overflow-wrap: anywhere;
  }
  & table {
    display: block;
    overflow-x: auto;
    width: 100%;
    margin: 0 0 16px;
    border-collapse: collapse;
    font-size: 14px;
    line-height: 1.5;
  }
  & th,
  & td {
    text-align: left;
    vertical-align: top;
    padding: 8px 12px 8px 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  }
  & th {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: 600;
    white-space: nowrap;
  }
  & td:first-child code {
    white-space: nowrap;
  }
  & code {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 0.88em;
    padding: 1px 5px;
    border-radius: ${({ theme }) => theme.radii.sm}px;
    background: ${({ theme }) => theme.colors.bgMuted};
    color: ${({ theme }) => theme.colors.textPrimary};
    overflow-wrap: anywhere;
  }
`;

const Back = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: ${({ theme }) => theme.space[6]}px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary} !important;
  text-decoration: none;
  &:hover {
    color: ${({ theme }) => theme.colors.brandText} !important;
  }
`;

const Meta = styled.p`
  margin: 12px 0 0 !important;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Summary = styled.p`
  margin: 16px 0 0 !important;
  font-size: 18px;
  line-height: 1.65;
`;

const Callout = styled.aside`
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 12px;
  margin-top: ${({ theme }) => theme.space[6]}px;
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radii.lg}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgSurface};
  font-size: 14px;
  line-height: 1.6;
  & .anticon {
    color: ${({ theme }) => theme.colors.brandText};
    margin-top: 4px;
  }
  & p {
    margin: 0 !important;
  }
`;

export function LegalShell({
  title,
  summary,
  updated,
  toc,
  notice,
  children,
  eyebrow = 'Legal',
}: {
  title: string;
  summary: ReactNode;
  updated: string;
  eyebrow?: string;
  toc: LegalTocItem[];
  notice?: ReactNode;
  /** The document sections, rendered on the server by `LegalSections`. */
  children: ReactNode;
}) {
  const updatedLabel = new Date(`${updated}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <Root data-landing id="top">
      <LandingGlobals />
      <PrintStyles />
      <SkipLink href="#main">Skip to content</SkipLink>
      <Nav base="/" />
      <main id="main">
        <Layout>
          <Toc aria-label="On this page" data-legal-toc>
            <p>On this page</p>
            <ol>
              {toc.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </Toc>
          <Doc data-legal-doc>
            <Back href="/" data-no-print>
              <ArrowLeftOutlined aria-hidden /> Back to home
            </Back>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1>{title}</h1>
            <Meta>
              Last updated: <time dateTime={updated}>{updatedLabel}</time>
            </Meta>
            <Summary>{summary}</Summary>
            {notice ? (
              <Callout role="note">
                <InfoCircleOutlined aria-hidden />
                <p>{notice}</p>
              </Callout>
            ) : null}
            <MobileToc data-no-print>
              <summary>Contents</summary>
              <ol>
                {toc.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.title}</a>
                  </li>
                ))}
              </ol>
            </MobileToc>
            {children}
          </Doc>
        </Layout>
      </main>
      <SiteFooter base="/" />
    </Root>
  );
}
