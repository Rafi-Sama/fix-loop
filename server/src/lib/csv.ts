type Cell = string | number | boolean | Date | null | undefined;

/**
 * RFC 4180 CSV. Cells that a spreadsheet would treat as a formula (=, +, -, @, tab, CR) are
 * prefixed with a quote so user-supplied text can't execute in Excel/Sheets (CSV injection).
 */
export function toCsv<T extends Record<string, Cell>>(rows: T[], columns: { key: keyof T; header: string }[]): string {
  const cell = (v: Cell): string => {
    if (v === null || v === undefined) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
