'use client';

import { palettes } from '@arvo/ui';
import { Popover } from 'antd';
import styled from 'styled-components';
import { useThemeMode } from '../lib/theme-mode';

/*
 * Palette picker: a trigger showing the current palette as three stacked ink stripes, and a
 * popover of "paint chips" — each chip is canvas, ink and brand side by side with its name.
 */

const Trigger = styled.button`
  all: unset;
  box-sizing: border-box;
  display: inline-grid;
  grid-template-columns: repeat(3, 8px);
  gap: 2px;
  align-items: stretch;
  height: 34px;
  padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.bgMuted};
  cursor: pointer;
  transition: border-color ${({ theme }) => theme.motion.normal};
  span {
    border-radius: 2px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    transition: transform 240ms cubic-bezier(0.34, 1.4, 0.64, 1);
  }
  &:hover {
    border-color: ${({ theme }) => theme.colors.brand};
  }
  &:hover span:nth-child(1) {
    transform: translateY(-2px);
  }
  &:hover span:nth-child(3) {
    transform: translateY(2px);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 2px;
  }
`;

const Chips = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 128px);
  gap: 8px;
`;

const Chip = styled.button<{ $active: boolean }>`
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: grid;
  gap: 6px;
  padding: 6px;
  border: 2px solid ${({ theme, $active }) => ($active ? theme.colors.textPrimary : theme.colors.borderSubtle)};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.bgSurface};
  transition: transform 160ms;
  &:hover {
    transform: translateY(-2px);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.brand};
    outline-offset: 2px;
  }
  .paint {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    height: 36px;
    border-radius: 2px;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.08);
  }
  .name {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Note = styled.p`
  margin: 10px 0 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

export function PalettePicker() {
  const { palette, setPalette, mode, setPreference } = useThemeMode();
  const current = palettes.find((p) => p.id === palette) ?? palettes[0];
  const content = (
    <div>
      <Chips role="radiogroup" aria-label="Light theme palette">
        {palettes.map((p) => (
          <Chip
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === palette}
            $active={p.id === palette}
            onClick={() => {
              setPalette(p.id);
              if (mode === 'dark') setPreference('light');
            }}
          >
            <span className="paint" aria-hidden>
              {p.swatch.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </span>
            <span className="name">
              {p.name}
              {p.id === palette ? <span aria-hidden>●</span> : null}
            </span>
          </Chip>
        ))}
      </Chips>
      <Note>{mode === 'dark' ? 'Palettes color the light theme — picking one switches to light.' : 'Colors the light theme.'}</Note>
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight" arrow={false}>
      <Trigger type="button" aria-label={`Color palette: ${current.name}`}>
        {current.swatch.map((c) => (
          <span key={c} style={{ background: c }} />
        ))}
      </Trigger>
    </Popover>
  );
}
