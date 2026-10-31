// temporary-migration: atelier-retired-host
/**
 * Atelier left `https://atelier.delight-tools.ai` on 2026-10-30. That host now
 * only redirects, and a redirect drops the connector's bearer token, so every
 * request to it fails. A saved Crane connector setting or Atelier pairing that
 * still names it is read as the new UI host. The pairing and its secret stay
 * valid because they live in Atelier's migrated database; only the host
 * changes. Any other host, including localhost, is returned unchanged, so
 * running this again changes nothing.
 */
import { ATELIER_UI_BASE_URL } from "./hosts";

export const RETIRED_ATELIER_BASE_URL = "https://atelier.delight-tools.ai";

/** The new UI host for a URL on the retired host; anything else as given. */
export function migrateRetiredAtelierBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return baseUrl;
  }
  if (url.origin !== RETIRED_ATELIER_BASE_URL || url.username || url.password) {
    return baseUrl;
  }
  // `href` starts with the normalized origin, so only the host is swapped and
  // any path keeps reaching the normalizer exactly as it did before.
  return `${ATELIER_UI_BASE_URL}${url.href.slice(url.origin.length)}`.replace(
    /\/+$/,
    "",
  );
}

/** Rewrites saved renderer settings in place, before rehydration normalizes them. */
export function migrateCraneConnectorRetiredHost(
  settings: Record<string, unknown>,
): void {
  const connector = settings.craneConnector;
  if (!connector || typeof connector !== "object" || Array.isArray(connector)) {
    return;
  }
  const { baseUrl } = connector as { baseUrl?: unknown };
  if (typeof baseUrl !== "string") {
    return;
  }
  const migrated = migrateRetiredAtelierBaseUrl(baseUrl);
  if (migrated !== baseUrl) {
    settings.craneConnector = { ...connector, baseUrl: migrated };
  }
}
// end temporary-migration: atelier-retired-host
