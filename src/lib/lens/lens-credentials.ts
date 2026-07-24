export interface LensCredentialMetadata {
  id: string;
  hosts: string[];
  username: string;
  autoFill: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LensCredentialUpsertInput {
  id?: string;
  hosts: string[];
  username: string;
  /** Required when creating an entry. Omit while editing to keep the saved secret. */
  password?: string;
  autoFill: boolean;
}

export interface LensCredentialFillResult {
  ok: boolean;
  host?: string;
  filledUsername?: boolean;
  filledPassword?: boolean;
  submitted?: boolean;
  message?: string;
}

/**
 * Normalize a credential target to one exact hostname. Credentials never use
 * wildcard or parent-domain matching so a secret cannot spill into a sibling
 * host without an explicit saved entry.
 */
export function normalizeLensCredentialHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith("*.")) {
    return null;
  }

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return host && !/\s/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Normalize every credential target of an account to exact hostnames,
 * dropping duplicates while preserving order. Returns null when any entry is
 * invalid or when no hostname remains, so a partially valid list never saves
 * silently narrower than the user intended.
 */
export function normalizeLensCredentialHosts(
  values: string[],
): string[] | null {
  const hosts: string[] = [];
  for (const value of values) {
    if (!value.trim()) {
      continue;
    }
    const host = normalizeLensCredentialHost(value);
    if (!host) {
      return null;
    }
    if (!hosts.includes(host)) {
      hosts.push(host);
    }
  }
  return hosts.length > 0 ? hosts : null;
}
