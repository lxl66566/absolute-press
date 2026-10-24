/**
 * Promise.all with a concurrency cap: a fixed worker pool over the input
 * list, preserving input order in the result. Rejection propagates (like
 * Promise.all) — callers that want per-item isolation catch inside `fn`.
 * Two consequences of the pool shape: the other workers keep draining the
 * queue after the first rejection (Promise.all does not stop them, so a
 * failure wastes the remaining IO), and the thrown error is whichever item
 * rejected first, not the input-order-first failure — error messages carry
 * the offending path, so attribution survives.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  // Pre-sized: every index is filled before Promise.all resolves.
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      // Unreachable (loop condition); satisfies noUncheckedIndexedAccess.
      if (item === undefined) break;
      // The sequential await per worker IS the concurrency cap; hoisting it
      // into a Promise.all would restore the unbounded fan-out.
      // oxlint-disable-next-line no-await-in-loop
      out[index] = await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}
