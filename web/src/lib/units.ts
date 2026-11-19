/**
 * "101-104, 201, A-C" → ["101","102","103","104","201","A","B","C"]. Zero padding is kept ("01-03").
 * Returns an error string for a malformed or oversized range.
 */
export function parseUnitLabels(input: string): string[] | string {
  const out: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const part = raw.trim();
    if (!part) continue;
    const num = /^([A-Za-z]*)(\d+)\s*[-–]\s*\1?(\d+)$/.exec(part);
    const let_ = /^([A-Za-z])\s*[-–]\s*([A-Za-z])$/.exec(part);
    if (num) {
      const [, prefix = '', a = '', b = ''] = num;
      const from = Number(a);
      const to = Number(b);
      if (to < from) return `“${part}” runs backwards`;
      if (to - from > 499) return `“${part}” is more than 500 units`;
      for (let i = from; i <= to; i++) out.push(`${prefix}${String(i).padStart(a.length, '0')}`);
    } else if (let_) {
      const from = let_[1]!.charCodeAt(0);
      const to = let_[2]!.charCodeAt(0);
      if (to < from) return `“${part}” runs backwards`;
      for (let c = from; c <= to; c++) out.push(String.fromCharCode(c));
    } else if (part.length > 50) return `“${part.slice(0, 20)}…” is too long for a unit label`;
    else out.push(part);
  }
  const unique = [...new Set(out)];
  if (unique.length > 500) return 'Add at most 500 units at a time';
  return unique;
}
