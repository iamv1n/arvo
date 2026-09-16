'use client';

import { MoonFilled, SunFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import styled from 'styled-components';
import { useThemeMode } from '../lib/theme-mode';

const Track = styled.button<{ $dark: boolean }>`
  all: unset;
  box-sizing: border-box;
  position: relative;
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  width: 68px;
  height: 34px;
  padding: 3px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: inset 0 1px 2px rgba(16, 24, 40, 0.06);
  cursor: pointer;
  transition: border-color ${({ theme }) => theme.motion.normal};

  &:hover {
    border-color: ${({ theme }) => theme.colors.brand};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 2px;
  }

  /* The sliding knob. */
  &::before {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 3px);
    height: calc(100% - 6px);
    border-radius: ${({ theme }) => theme.radii.sm}px;
    background: ${({ theme }) => theme.colors.brandGradient};
    box-shadow: ${({ theme }) => theme.shadows.brand};
    transform: translateX(${({ $dark }) => ($dark ? '100%' : '0')});
    transition: transform 320ms cubic-bezier(0.34, 1.3, 0.64, 1);
  }
`;

const Icon = styled.span<{ $active: boolean }>`
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  font-size: 14px;
  color: ${({ theme, $active }) => ($active ? theme.colors.onBrand : theme.colors.textMuted)};
  transform: ${({ $active }) => ($active ? 'scale(1) rotate(0deg)' : 'scale(0.85) rotate(-30deg)')};
  opacity: ${({ $active }) => ($active ? 1 : 0.7)};
  transition:
    color ${({ theme }) => theme.motion.normal},
    transform 320ms ${({ theme }) => theme.motion.easing},
    opacity ${({ theme }) => theme.motion.normal};
`;

/** Sliding light/dark switch. Follows the system until the visitor picks a mode, which is then remembered. */
export function ThemeToggle() {
  const { mode, preference, setPreference } = useThemeMode();
  const dark = mode === 'dark';
  const label = `${dark ? 'Dark' : 'Light'} mode${preference === 'system' ? ' (following system)' : ''} — switch to ${dark ? 'light' : 'dark'}`;
  return (
    <Tooltip title={label}>
      <Track
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="Dark mode"
        $dark={dark}
        onClick={() => setPreference(dark ? 'light' : 'dark')}
      >
        <Icon $active={!dark} aria-hidden>
          <SunFilled />
        </Icon>
        <Icon $active={dark} aria-hidden>
          <MoonFilled />
        </Icon>
      </Track>
    </Tooltip>
  );
}
