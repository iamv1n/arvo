'use client';


import { Drawer, Empty, Tooltip } from 'antd';
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

/* The way in: a small disc in the bottom-right corner, the size of a scroll indicator. It carries
   the count and nothing else, and it never sits in the reading column. */
const Opener = styled.button<{ $count: number }>`
  all: unset;
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 20;
  display: ${({ $count }) => ($count === 0 ? 'none' : 'inline-flex')};
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.bgSurfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  font-family: ${({ theme }) => theme.typography.fontFamilyMono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  opacity: 0.75;
  transition:
    opacity 200ms,
    border-color 200ms;

  &:hover,
  &:focus-visible {
    opacity: 1;
    border-color: ${({ theme }) => theme.colors.brand};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.brand};
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

  const open = useCallback((id?: string) => {
    setOpenId(id ?? null);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ notes, register, unregister, open }), [notes, register, unregister, open]);

  return (
    <NotesContext.Provider value={value}>
      {children}
      <Tooltip title={`What these numbers assume · ${notes.length} note${notes.length === 1 ? '' : 's'}`} placement="left">
        <Opener type="button" $count={notes.length} onClick={() => open()} aria-label={`What these numbers assume, ${notes.length} notes`}>
          <span className="dot" aria-hidden />
          assumptions
        </Opener>
      </Tooltip>
      <Drawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        placement="right"
        width={440}
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

  // Nothing is drawn in the content: the conditions live in the drawer, reached from the rail.
  return null;
}
