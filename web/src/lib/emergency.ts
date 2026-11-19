/** Whole-word keyword match, same rule as the server ("fire" doesn't match "fireplace"). */
export function emergencyHits(text: string, keywords: readonly string[]): string[] {
  const t = text.toLowerCase();
  return keywords.filter((k) => new RegExp(`(^|[^a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(t));
}
