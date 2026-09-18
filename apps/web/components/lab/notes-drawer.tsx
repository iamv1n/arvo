'use client';


import { Drawer, Empty, Tooltip } from 'antd';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styled, { keyframes } from 'styled-components';

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

const breathe = keyframes`
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
`;

/* A margin rule down the left of the content: it breathes while there are unread conditions,
   so the page says "there is something to check" without spending a line of text on it. */
const Rail = styled.button<{ $count: number; $seen: boolean }>`
  all: unset;
  position: sticky;
  top: 120px;
  float: left;
  margin-left: -18px;
  z-index: 5;
  display: ${({ $count }) => ($count === 0 ? 'none' : 'flex')};
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 10px;
  cursor: pointer;

  .bar {
    width: 3px;
    height: 84px;
    border-radius: 3px;
    background: ${({ theme }) => theme.colors.brand};
    animation: ${({ $seen }) => ($seen ? 'none' : breathe)} 2.4s ease-in-out infinite;
    opacity: ${({ $seen }) => ($seen ? 0.35 : 1)};
  }
  .count {
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 10px;
    color: ${({ theme }) => theme.colors.brandText};
  }

  &:hover .bar,
  &:focus-visible .bar {
    opacity: 1;
    height: 110px;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none;
    }
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

  .ref {
    margin-top: 2px;
    font-family: ${({ theme }) => theme.typography.fontFamilyMono};
    font-size: 12px;
    font-weight: 600;
    text-align: right;
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

  const [seen, setSeen] = useState(false);

  const open = useCallback((id?: string) => {
    setSeen(true);
    setOpenId(id ?? null);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ notes, register, unregister, open }), [notes, register, unregister, open]);

  return (
    <NotesContext.Provider value={value}>
      {children}
      <Tooltip title={`${notes.length} thing${notes.length === 1 ? '' : 's'} these numbers assume`} placement="right">
        <Rail type="button" $count={notes.length} $seen={seen} onClick={() => open()} aria-label={`Show ${notes.length} notes`}>
          <span className="bar" />
          <span className="count">{notes.length}</span>
        </Rail>
      </Tooltip>
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
          notes.map((note, index) => (
            <Entry key={note.id} id={`lab-note-${note.id}`} $tone={note.tone} $active={note.id === openId}>
              <span className="ref">{index + 1}</span>
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

/* A footnote reference, the way a printed page marks a condition: a raised number, not a badge. */
const Marker = styled.button<{ $tone: 'info' | 'warning' }>`
  all: unset;
  display: inline-block;
  margin-left: 4px;
  padding: 0 3px;
  cursor: pointer;
  vertical-align: super;
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  color: ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warning : theme.colors.brandText)};
  border-bottom: 1px dotted currentColor;

  &:hover,
  &:focus-visible {
    background: ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warningSubtle : theme.colors.brandSubtle)};
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
  const index = context.notes.findIndex((note) => note.id === id);
  return (
    <Marker type="button" $tone={tone} onClick={() => context.open(id)} aria-label="Why this number is an estimate">
      {index >= 0 ? index + 1 : '*'}
    </Marker>
  );
}
