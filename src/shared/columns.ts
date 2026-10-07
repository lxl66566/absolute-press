/**
 * Validate an ExpandableList column-name list (island `columns` / `inline`
 * props cross the node/client boundary as untyped JSON): only arrays of
 * strings count, and an empty list behaves as absent (undefined).
 */
export function normalizeColumns(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const columns = value.filter(
    (item): item is string => typeof item === 'string',
  );
  return columns.length > 0 ? columns : undefined;
}
