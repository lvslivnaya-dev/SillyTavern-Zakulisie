/** Meaning-based ranking helpers: pure, shared by the prompt builders (core) and the retrieval (integration). */

/**
 * Similarities of a list of items → 0..1 inside that list (the closest 1, the farthest 0): these models put almost every pair near 0.8,
 * so only the difference between the items says anything. `read(item)` → similarity or null. Returns item → number|null.
 */
export function relativeScores(items, read) {
  const values = items.map(item => read(item)).filter(value => value != null);
  if (!values.length) return () => null;
  const low = Math.min(...values);
  const span = Math.max(...values) - low;
  return item => {
    const value = read(item);
    if (value == null) return null;
    return span > 1e-9 ? (value - low) / span : 0.5;
  };
}
