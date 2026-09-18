'use client';

import { Info, Warning } from '@phosphor-icons/react';
import { Drawer, Empty } from 'antd';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';

/*
 * Caveats, collected.
 *
 * Every lab figure carries a condition — this margin is a guess, this probability is a model,
 * this backtest may be overfitted. Printed inline they crowd out the numbers; deleted they
 * mislead. So each one registers itself here and shows only as a small "i" where it applies.
 * Clicking any of them opens a drawer on the right with the full text of every caveat on the
 * tab, in the order they appear.
 */

export interface RegisteredNote {
  id: string;
  title: ReactNode;
  body: ReactNode;
  tone: 'info' | 'warning';
}

interface NotesContextValue {
  notes: RegisteredNote[];
  register: (note: RegisteredNote) => void;
  unregister: (id: string) => void;
  open: (id?: string) => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

const Tab = styled.button<{ $count: number }>`
  all: unset;
  position: fixed;
  right: 0;
  top: 40%;
  z-index: 20;
  display: ${({ $count }) => ($count === 0 ? 'none' : 'flex')};
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-right: none;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSecondary};
  writing-mode: vertical-rl;

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.brand};
  }
`;

const Entry = styled.article<{ $tone: 'info' | 'warning'; $active: boolean }>`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  padding: ${({ theme }) => theme.space[4]}px;
  border-left: 3px solid ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warning : theme.colors.brand)};
  background: ${({ theme, $active }) => ($active ? theme.colors.bgMuted : 'transparent')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.borderSubtle};
  scroll-margin-top: 12px;

  svg {
    margin-top: 2px;
    color: ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warning : theme.colors.brandText)};
  }
  h4 {
    margin: 0 0 4px;
    font-family: ${({ theme }) => theme.typography.fontFamilySerif};
    font-size: 16px;
    font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  p,
  div {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

/** Wrap a tab (or the whole page) so its notes collect into one drawer. */
export function LabNotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<RegisteredNote[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const register = useCallback((note: RegisteredNote) => {
    setNotes((current) => {
      const rest = current.filter((item) => item.id !== note.id);
      return [...rest, note];
    });
  }, []);

  const unregister = useCallback((id: string) => setNotes((current) => current.filter((item) => item.id !== id)), []);

  const open = useCallback((id?: string) => {
    setOpenId(id ?? null);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ notes, register, unregister, open }), [notes, register, unregister, open]);

  return (
    <NotesContext.Provider value={value}>
      {children}
      <Tab type="button" $count={notes.length} onClick={() => open()} aria-label={`Show ${notes.length} notes`}>
        <Info size={14} weight="duotone" />
        {notes.length} notes
      </Tab>
      <Drawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        placement="right"
        width={420}
        title="What these numbers assume"
        styles={{ body: { padding: 0 } }}
      >
        {notes.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to caveat on this tab" style={{ marginTop: 40 }} />
        ) : (
          notes.map((note) => (
            <Entry key={note.id} id={`lab-note-${note.id}`} $tone={note.tone} $active={note.id === openId}>
              {note.tone === 'warning' ? <Warning size={16} weight="duotone" /> : <Info size={16} weight="duotone" />}
              <div>
                {note.title ? <h4>{note.title}</h4> : null}
                <div>{note.body}</div>
              </div>
            </Entry>
          ))
        )}
      </Drawer>
    </NotesContext.Provider>
  );
}

export function useLabNotes() {
  return useContext(NotesContext);
}

const Marker = styled.button<{ $tone: 'info' | 'warning' }>`
  all: unset;
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  vertical-align: -3px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  background: ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warningSubtle : theme.colors.brandSubtle)};
  color: ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warning : theme.colors.brandText)};
  border: 1px solid ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warning : theme.colors.brand)};

  &:hover,
  &:focus-visible {
    filter: brightness(1.1);
  }
`;

let counter = 0;

/**
 * Registers a caveat with the drawer and renders only a small marker where it belongs.
 * Falls back to nothing when used outside a provider, so a stray note can never break a page.
 */
export function NoteMarker({ title, body, tone = 'info' }: { title?: ReactNode; body: ReactNode; tone?: 'info' | 'warning' }) {
  const context = useLabNotes();
  const idRef = useRef<string>(undefined);
  if (idRef.current === undefined) {
    counter += 1;
    idRef.current = `n${counter}`;
  }
  const id = idRef.current;
  const register = context?.register;
  const unregister = context?.unregister;

  useEffect(() => {
    if (!register || !unregister) return;
    register({ id, title, body, tone });
    return () => unregister(id);
  }, [id, title, body, tone, register, unregister]);

  if (!context) return null;
  return (
    <Marker type="button" $tone={tone} onClick={() => context.open(id)} aria-label="Why this number is an estimate">
      i
    </Marker>
  );
}
