export function countDiagnostics(diagnostics) {
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([
      diagnostic.file,
      diagnostic.code,
      diagnostic.source,
    ]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function compareDiagnostics(actual, baseline) {
  const added = [];
  const removed = [];
  for (const key of new Set([
    ...Object.keys(actual),
    ...Object.keys(baseline),
  ])) {
    const difference = (actual[key] ?? 0) - (baseline[key] ?? 0);
    if (difference > 0)
      added.push({ diagnostic: JSON.parse(key), count: difference });
    if (difference < 0)
      removed.push({ diagnostic: JSON.parse(key), count: -difference });
  }
  return { added, removed };
}
