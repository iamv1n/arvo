import type { ReactNode } from 'react';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Server-rendered numbered sections for a legal page. Styling comes from the surrounding LegalShell. */
export function LegalSections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
          <h2 id={`${s.id}-title`}>
            {i + 1}. {s.title}
          </h2>
          {s.body}
        </section>
      ))}
    </>
  );
}
