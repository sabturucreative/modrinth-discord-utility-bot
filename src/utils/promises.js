async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}

module.exports = { mapLimit };