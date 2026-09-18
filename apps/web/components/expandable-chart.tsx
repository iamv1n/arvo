'use client';

import { ArrowsOut } from '@phosphor-icons/react';
import { Modal, Tooltip } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import styled from 'styled-components';

/*
 * Every chart on a panel is small by necessity: the panels have fixed body heights so the grid
 * stays still while data loads. This wrapper keeps that, and adds a way to read the chart
 * properly — click it, or the corner button, and the same chart is drawn again inside a modal at
 * roughly three times the area, with the panel's title and caption for context.
 *
 * The chart is passed as a render function of its height rather than as an element, because the
 * recharts wrappers in this app all take a numeric `height` and the two sizes differ.
 */

const Frame = styled.div<{ $height: number }>`
  position: relative;
  height: ${({ $height }) => $height}px;
  min-width: 0;
  cursor: zoom-in;
  border-radius: ${({ theme }) => theme.radii.sm}px;
  outline-offset: 2px;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
  }

  .arvo-expand {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: ${({ theme }) => theme.radii.sm}px;
    background: transparent;
    color: ${({ theme }) => theme.colors.textMuted};
    opacity: 0;
    cursor: zoom-in;
    transition: opacity ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  }

  &:hover .arvo-expand,
  &:focus-within .arvo-expand {
    opacity: 1;
  }

  .arvo-expand:hover {
    border-color: ${({ theme }) => theme.colors.border};
    background: ${({ theme }) => theme.colors.bgSurfaceRaised};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  /* Touch devices never hover, so the affordance stays visible there. */
  @media (hover: none) {
    .arvo-expand {
      opacity: 1;
    }
  }
`;

const Caption = styled.div`
  margin-top: ${({ theme }) => theme.space[3]}px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** Height of the enlarged chart: roughly 70% of the viewport, never taller than 640px. */
function useModalChartHeight(open: boolean) {
  const measure = useCallback(() => Math.max(280, Math.min(640, Math.round((typeof window === 'undefined' ? 900 : window.innerHeight) * 0.7))), []);
  const [height, setHeight] = useState(560);
  useEffect(() => {
    if (!open) return;
    const apply = () => setHeight(measure());
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [open, measure]);
  return height;
}

export function ExpandableChart({
  title,
  height,
  render,
  caption,
  label,
  disabled = false,
}: {
  /** Shown as the modal title; also used for the accessible label. */
  title: ReactNode;
  /** The chart height inside the panel. The modal draws the same chart much taller. */
  height: number;
  render: (chartHeight: number, expanded: boolean) => ReactNode;
  /** Legend or explanatory line repeated under the enlarged chart. */
  caption?: ReactNode;
  /** Plain-text name for the aria-label when `title` is not a string. */
  label?: string;
  /** Skip the affordance entirely, e.g. while the chart is empty or loading. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const modalHeight = useModalChartHeight(open);
  const name = label ?? (typeof title === 'string' ? title : 'chart');

  if (disabled) {
    return <div style={{ height, minWidth: 0 }}>{render(height, false)}</div>;
  }

  return (
    <>
      <Frame
        $height={height}
        role="button"
        tabIndex={0}
        aria-label={`Enlarge ${name}`}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Tooltip title="Click to enlarge">
          <span className="arvo-expand" aria-hidden>
            <ArrowsOut size={14} />
          </span>
        </Tooltip>
        {render(height, false)}
      </Frame>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={title}
        footer={null}
        centered
        destroyOnHidden
        width="min(1200px, 92vw)"
        styles={{ body: { maxHeight: 'min(78vh, 720px)', overflowY: 'auto' } }}
      >
        <div style={{ minWidth: 0 }}>{render(modalHeight, true)}</div>
        {caption && <Caption>{caption}</Caption>}
      </Modal>
    </>
  );
}
