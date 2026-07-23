export function normalizeLensHostEntry(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const withoutWildcard = trimmed.startsWith("*.") ? trimmed.slice(2) : trimmed;
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(withoutWildcard)
        ? withoutWildcard
        : `http://${withoutWildcard}`,
    );
    const host = url.hostname
      .toLowerCase()
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .replace(/\.$/, "");
    return host && !/\s/.test(host) ? host : null;
  } catch {
    const host = withoutWildcard
      .split(/[/?#:]/, 1)[0]
      ?.replace(/^\[/, "")
      .replace(/\]$/, "")
      .replace(/\.$/, "");
    return host && !/\s/.test(host) ? host : null;
  }
}

export function normalizeLensHostList(
  value: unknown,
  fallback: readonly string[] = [],
): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const seen = new Set<string>();
  const hosts: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const host = normalizeLensHostEntry(entry);
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    hosts.push(host);
  }
  return hosts;
}
