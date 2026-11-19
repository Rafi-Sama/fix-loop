import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/lib/csv.js';

describe('csv', () => {
  const cols = [{ key: 'a' as const, header: 'A' }];
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([{ a: 'x, "y"\nz' }], cols)).toBe('A\r\n"x, ""y""\nz"\r\n');
  });
  it('neutralises spreadsheet formulas from user text', () => {
    expect(toCsv([{ a: '=HYPERLINK("http://evil")' }], cols)).toBe(`A\r\n"'=HYPERLINK(""http://evil"")"\r\n`);
    expect(toCsv([{ a: '@SUM(A1)' }], cols)).toBe("A\r\n'@SUM(A1)\r\n");
  });
  it('leaves negative numbers alone', () => {
    expect(toCsv([{ a: -5 }], cols)).toBe('A\r\n-5\r\n');
  });
});
