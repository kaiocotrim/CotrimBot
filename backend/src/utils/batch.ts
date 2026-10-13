export async function processInBatches<T>(
  items: readonly T[],
  processItem: (item: T) => unknown,
  batchSize = 5,
): Promise<void> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("batchSize must be a positive integer");
  }

  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(processItem));
  }
}
