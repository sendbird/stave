/**
 * Atelier serves people and machines from different hosts.
 *
 * Pages and links (`/apps/crane/...`, Martin project pages, connector settings)
 * live on the UI host, which sits behind an SSO gate. That gate answers a
 * machine request with a redirect, and a redirect drops the connector's bearer
 * token, so connector requests go to the API host instead. Users configure the
 * UI host; Stave derives the API host from it with the same rule Atelier uses
 * when it hands out machine URLs.
 */
export const ATELIER_UI_BASE_URL = "https://atelier.sdix.io";
export const ATELIER_API_BASE_URL = "https://api.atelier.sdix.io";

/**
 * Base URL for connector requests to the Atelier configured as `baseUrl`.
 *
 * Only the production UI host maps to its API host. Localhost and any other
 * custom origin serve pages and API from one host, so they stay unchanged.
 */
export function atelierApiBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return normalized === ATELIER_UI_BASE_URL
    ? ATELIER_API_BASE_URL
    : normalized;
}
