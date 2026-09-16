const DELIMITERS = [',', ';', '\t', '|'] as const;

/** Decodes bytes as UTF-8 (stripping a BOM), falling back to Windows-1252 for legacy exports. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Picks the delimiter that splits the first lines into the most consistent column counts. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best: { delimiter: string; score: number } = { delimiter: ',', score: -1 };
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => parseCsv(line, delimiter)[0]?.length ?? 0);
    const multi = counts.filter((c) => c > 1);
    if (multi.length === 0) continue;
    const mode = mostCommon(multi);
    const score = multi.filter((c) => c === mode).length * mode;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

/** RFC 4180 parser: quoted fields, escaped quotes, embedded delimiters and newlines. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((cell) => cell.trim()));
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}
