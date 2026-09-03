import {
  DEFAULT_JIRA_CONNECTOR_SETTINGS,
  JiraConnectorSettingsSchema,
  normalizeJiraSiteUrl,
  type JiraConnectorPublicStatus,
  type JiraConnectorSettings,
} from "../../../src/lib/jira-connector/types";
import { getJiraConnectorCredentialVault } from "./credential-service";
import { JiraHttpClient, JiraHttpError } from "./http-client";
import type { JiraStoredCredentialMetadata } from "./credential-vault";

let settings: JiraConnectorSettings = { ...DEFAULT_JIRA_CONNECTOR_SETTINGS };
let cachedMetadata: JiraStoredCredentialMetadata | null = null;
let cachedSiteUrl: string | null = null;
let cachedClient: JiraHttpClient | null = null;
/** Bound on the query probe so a hung site cannot wedge the Settings button. */
const JIRA_QUERY_PROBE_TIMEOUT_MS = 15_000;

let lastErrorCode: string | null = null;
let secureStorageAvailable = true;

function vault() {
  return getJiraConnectorCredentialVault();
}

/**
 * Reuse one client per site URL: the URL is normalized and validated in the
 * constructor, so rebuilding it per request would re-run that work on every
 * poll for no benefit.
 */
function clientFor(siteUrl: string): JiraHttpClient {
  if (cachedClient && cachedSiteUrl === siteUrl) {
    return cachedClient;
  }
  cachedClient = new JiraHttpClient({ siteUrl });
  cachedSiteUrl = siteUrl;
  return cachedClient;
}

function recordError(error: unknown) {
  lastErrorCode =
    error instanceof JiraHttpError ? error.code : "request_failed";
}

function buildStatus(): JiraConnectorPublicStatus {
  return {
    configured: Boolean(cachedMetadata),
    secureStorageAvailable,
    siteUrl: cachedMetadata?.siteUrl ?? (settings.siteUrl || null),
    accountId: cachedMetadata?.accountId ?? null,
    displayName: cachedMetadata?.displayName ?? null,
    lastErrorCode,
  };
}

/**
 * Synchronous snapshot for IPC status reads and renderer pushes. It reflects
 * the last vault load; `loadJiraConnectorStatus` refreshes it.
 */
export function getJiraConnectorStatus(): JiraConnectorPublicStatus {
  return buildStatus();
}

export async function loadJiraConnectorStatus(): Promise<JiraConnectorPublicStatus> {
  try {
    secureStorageAvailable = vault().isSecureStorageAvailable();
    cachedMetadata = secureStorageAvailable
      ? await vault().getMetadata()
      : null;
  } catch {
    // A vault that cannot be read is reported as unconfigured rather than
    // thrown: the Settings surface has to stay reachable to fix it.
    cachedMetadata = null;
  }
  return buildStatus();
}

export function getJiraConnectorSettings(): JiraConnectorSettings {
  return settings;
}

/** The renderer pushes settings on load and on every change. */
export function configureJiraConnector(
  input: JiraConnectorSettings,
): JiraConnectorPublicStatus {
  settings = JiraConnectorSettingsSchema.parse(input);
  // The cached client is bound to a site URL, and settings are the only place
  // that URL can change.
  cachedClient = null;
  cachedSiteUrl = null;
  return buildStatus();
}

function requireSiteUrl(): string {
  const siteUrl = settings.siteUrl || cachedMetadata?.siteUrl || "";
  if (!siteUrl) {
    throw new JiraHttpError("not_configured");
  }
  return normalizeJiraSiteUrl(siteUrl);
}

async function requireCredential() {
  const credential = await vault().getCredential();
  if (!credential) {
    throw new JiraHttpError("not_configured");
  }
  return credential;
}

/**
 * Validate before persisting: storing an unverified token would report the
 * connector as configured and then fail on every poll with no way for the user
 * to tell a typo from an outage.
 */
export async function setJiraCredential(args: {
  email: string;
  token: string;
}): Promise<JiraConnectorPublicStatus> {
  const siteUrl = requireSiteUrl();
  secureStorageAvailable = vault().isSecureStorageAvailable();
  try {
    const identity = await clientFor(siteUrl).getMyself({
      email: args.email,
      token: args.token,
    });
    await vault().saveCredential({
      siteUrl,
      authMode: "cloud-api-token",
      email: args.email,
      token: args.token,
      accountId: identity.accountId,
      displayName: identity.displayName,
    });
    lastErrorCode = null;
  } catch (error) {
    recordError(error);
    throw error;
  }
  return loadJiraConnectorStatus();
}

export async function clearJiraCredential(): Promise<JiraConnectorPublicStatus> {
  await vault().clear();
  cachedMetadata = null;
  lastErrorCode = null;
  return loadJiraConnectorStatus();
}

/**
 * Validate the saved credential *and* the saved query.
 *
 * Checking identity alone made a broken JQL pass: the token was fine, so the
 * test said "connected" and the Tasks list stayed silently empty. Running the
 * query for a single row costs one more request and turns that into a named
 * error the Settings card and the list can both show. No new reply field is
 * needed — a rejected query lands in `lastErrorCode`, which the public status
 * already carries.
 */
export async function testJiraConnection(): Promise<JiraConnectorPublicStatus> {
  const siteUrl = requireSiteUrl();
  try {
    const credential = await requireCredential();
    const client = clientFor(siteUrl);
    const identity = await client.getMyself({
      email: credential.email,
      token: credential.token,
    });
    await vault().saveCredential({
      ...credential,
      siteUrl,
      accountId: identity.accountId,
      displayName: identity.displayName,
    });
    await client.searchIssues({
      email: credential.email,
      token: credential.token,
      jql: settings.jql,
      // One row is enough to learn whether the query parses and is permitted;
      // pulling the whole page here would spend rate limit the list needs.
      maxResults: 1,
      signal: AbortSignal.timeout(JIRA_QUERY_PROBE_TIMEOUT_MS),
    });
    lastErrorCode = null;
  } catch (error) {
    recordError(error);
    throw error;
  }
  return loadJiraConnectorStatus();
}

/**
 * Run the configured JQL. The credential is resolved and consumed here so it
 * never crosses back out to the adapter or the renderer.
 */
export async function listJiraIssuesForCurrentUser(args: {
  signal: AbortSignal;
}): Promise<{ issues: unknown[]; truncated: boolean }> {
  const siteUrl = requireSiteUrl();
  try {
    const credential = await requireCredential();
    const page = await clientFor(siteUrl).searchIssues({
      email: credential.email,
      token: credential.token,
      jql: settings.jql,
      maxResults: settings.maxResults,
      signal: args.signal,
    });
    lastErrorCode = null;
    return { issues: page.issues, truncated: page.hasMore };
  } catch (error) {
    recordError(error);
    throw error;
  }
}

export async function getJiraIssue(args: {
  key: string;
  signal: AbortSignal;
}): Promise<unknown> {
  const siteUrl = requireSiteUrl();
  try {
    const credential = await requireCredential();
    const issue = await clientFor(siteUrl).getIssue({
      email: credential.email,
      token: credential.token,
      key: args.key,
      signal: args.signal,
    });
    lastErrorCode = null;
    return issue;
  } catch (error) {
    recordError(error);
    throw error;
  }
}

const SAFE_MESSAGES: Record<string, string> = {
  unauthorized: "Jira rejected the email and API token.",
  forbidden: "This Jira account cannot read the requested issues.",
  invalid_jql: "Jira rejected the search query.",
  not_found: "The Jira issue was not found.",
  rate_limited: "Jira is rate limiting requests. Try again shortly.",
  server_error: "Jira reported a server error.",
  network_unavailable: "Jira could not be reached.",
  response_too_large: "The Jira response was too large to read.",
  invalid_response: "Jira returned an unexpected response.",
  not_configured: "Add a Jira site URL and API token in Settings.",
};

/**
 * Derived from the error code only. A Jira error body can quote the JQL and
 * the request headers, so it never reaches a user-visible string.
 */
export function safeJiraErrorMessage(error: unknown): string {
  const code = error instanceof JiraHttpError ? error.code : "request_failed";
  return SAFE_MESSAGES[code] ?? "The Jira request failed.";
}

export function resetJiraConnectorServiceForTests() {
  settings = { ...DEFAULT_JIRA_CONNECTOR_SETTINGS };
  cachedMetadata = null;
  cachedSiteUrl = null;
  cachedClient = null;
  lastErrorCode = null;
  secureStorageAvailable = true;
}
