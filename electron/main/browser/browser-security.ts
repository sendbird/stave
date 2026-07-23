import {
  DEFAULT_LENS_SESSION_ID,
  type LensCdpApprovalRequestPayload,
  type LensCdpApprovalResponse,
  type LensSecurityConfig,
} from "../../../src/lib/lens/lens.types";
import {
  normalizeLensHostEntry,
  normalizeLensHostList,
} from "../../../src/lib/lens/lens-security";

const CDP_APPROVAL_TIMEOUT_MS = 60_000;
const TRANSIENT_CDP_APPROVAL_MS = 60_000;

const DEFAULT_SECURITY_CONFIG: LensSecurityConfig = {
  allowedHosts: [],
  blockedHosts: [],
  developerModeCdp: true,
  cdpApprovedHosts: [],
};

let currentSecurityConfig: LensSecurityConfig = {
  ...DEFAULT_SECURITY_CONFIG,
};
let cdpApprovalSequence = 0;

const pendingCdpApprovals = new Map<
  string,
  {
    key: string;
    host: string;
    workspaceId: string;
    promise: Promise<CdpApprovalOutcome>;
    resolve: (outcome: CdpApprovalOutcome) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
const pendingCdpApprovalKeys = new Map<string, string>();
const transientCdpApprovals = new Map<string, number>();

type CdpApprovalOutcome = "approved" | "denied" | "timed-out";

function parseHttpUrl(targetUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error(`Invalid Lens URL: ${targetUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Lens navigation only supports HTTP(S) URLs: ${targetUrl}`);
  }

  return parsed;
}

function normalizeParsedHost(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isLoopbackHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

function hostMatchesEntry(host: string, entry: string): boolean {
  return host === entry || host.endsWith(`.${entry}`);
}

function hostMatchesList(host: string, entries: readonly string[]): boolean {
  return entries.some((entry) => hostMatchesEntry(host, entry));
}

function cdpApprovalKey(workspaceId: string, host: string): string {
  return `${workspaceId}\n${host}`;
}

function hasTransientCdpApproval(workspaceId: string, host: string): boolean {
  const key = cdpApprovalKey(workspaceId, host);
  const expiresAt = transientCdpApprovals.get(key);
  if (!expiresAt) {
    return false;
  }
  if (expiresAt <= Date.now()) {
    transientCdpApprovals.delete(key);
    return false;
  }
  return true;
}

function rememberTransientCdpApproval(workspaceId: string, host: string): void {
  transientCdpApprovals.set(
    cdpApprovalKey(workspaceId, host),
    Date.now() + TRANSIENT_CDP_APPROVAL_MS,
  );
}

function addApprovedCdpHost(host: string): void {
  setLensSecurityConfig({
    ...currentSecurityConfig,
    cdpApprovedHosts: [...currentSecurityConfig.cdpApprovedHosts, host],
  });
}

function settlePendingCdpApproval(
  requestId: string,
  outcome: CdpApprovalOutcome,
): boolean {
  const pending = pendingCdpApprovals.get(requestId);
  if (!pending) {
    return false;
  }

  pendingCdpApprovals.delete(requestId);
  pendingCdpApprovalKeys.delete(pending.key);
  clearTimeout(pending.timeout);
  pending.resolve(outcome);
  return true;
}

export function getLensSecurityConfig(): LensSecurityConfig {
  return {
    allowedHosts: [...currentSecurityConfig.allowedHosts],
    blockedHosts: [...currentSecurityConfig.blockedHosts],
    developerModeCdp: currentSecurityConfig.developerModeCdp,
    cdpApprovedHosts: [...currentSecurityConfig.cdpApprovedHosts],
  };
}

export function setLensSecurityConfig(
  config: LensSecurityConfig,
): LensSecurityConfig {
  currentSecurityConfig = {
    allowedHosts: normalizeLensHostList(config.allowedHosts),
    blockedHosts: normalizeLensHostList(config.blockedHosts),
    developerModeCdp: config.developerModeCdp === true,
    cdpApprovedHosts: normalizeLensHostList(config.cdpApprovedHosts),
  };
  return getLensSecurityConfig();
}

export function assertNavigationAllowed(
  targetUrl: string,
  config: LensSecurityConfig = currentSecurityConfig,
): void {
  const parsed = parseHttpUrl(targetUrl);
  const host = normalizeParsedHost(parsed);
  const allowedHosts = normalizeLensHostList(config.allowedHosts);
  const blockedHosts = normalizeLensHostList(config.blockedHosts);

  if (isLoopbackHost(host)) {
    return;
  }

  if (hostMatchesList(host, blockedHosts)) {
    throw new Error(
      `Lens navigation blocked by Settings > Lens > Site Access: ${host}`,
    );
  }

  if (allowedHosts.length > 0 && !hostMatchesList(host, allowedHosts)) {
    throw new Error(
      `Lens navigation is limited by Settings > Lens > Site Access. Add ${host} to allowed hosts to continue.`,
    );
  }
}

export async function assertCdpAllowed(args: {
  workspaceId: string;
  /** Lens session the CDP request originates from ("default" when omitted). */
  lensSessionId?: string;
  url: string;
  reason?: string;
}): Promise<void> {
  const config = currentSecurityConfig;
  const parsed = parseHttpUrl(args.url);
  const host = normalizeLensHostEntry(normalizeParsedHost(parsed));
  if (!host) {
    throw new Error(`Invalid Lens URL hostname: ${args.url}`);
  }

  if (!config.developerModeCdp) {
    throw new Error(
      "Lens Developer Mode CDP is disabled. Enable Settings > Lens > Developer Mode to allow CDP-backed Lens actions.",
    );
  }

  if (
    hostMatchesList(host, config.cdpApprovedHosts) ||
    hasTransientCdpApproval(args.workspaceId, host)
  ) {
    return;
  }

  const { getMainWindow } = await import("../window");
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    throw new Error(
      `Lens CDP access for ${host} is not approved. Keep Stave open and retry this action to show the approval dialog, or add ${host} in Settings > Lens > Developer Mode > Approved CDP Hosts.`,
    );
  }

  const key = cdpApprovalKey(args.workspaceId, host);
  const existingRequestId = pendingCdpApprovalKeys.get(key);
  const existingRequest = existingRequestId
    ? pendingCdpApprovals.get(existingRequestId)
    : undefined;

  let outcome: CdpApprovalOutcome;
  if (existingRequest) {
    outcome = await existingRequest.promise;
  } else {
    const requestId = `lens-cdp-${Date.now()}-${++cdpApprovalSequence}`;
    const expiresAt = Date.now() + CDP_APPROVAL_TIMEOUT_MS;
    let resolveApproval: (outcome: CdpApprovalOutcome) => void = () => {};
    const promise = new Promise<CdpApprovalOutcome>((resolve) => {
      resolveApproval = resolve;
    });
    const timeout = setTimeout(() => {
      settlePendingCdpApproval(requestId, "timed-out");
    }, CDP_APPROVAL_TIMEOUT_MS);

    pendingCdpApprovals.set(requestId, {
      key,
      host,
      workspaceId: args.workspaceId,
      promise,
      resolve: resolveApproval,
      timeout,
    });
    pendingCdpApprovalKeys.set(key, requestId);

    renderer.send("lens:cdp-approval-request", {
      workspaceId: args.workspaceId,
      lensSessionId: args.lensSessionId ?? DEFAULT_LENS_SESSION_ID,
      requestId,
      url: args.url,
      host,
      reason: args.reason ?? "Lens CDP action",
      expiresAt,
    } satisfies LensCdpApprovalRequestPayload);

    outcome = await promise;
  }

  if (outcome === "timed-out") {
    throw new Error(
      `Lens CDP approval for ${host} timed out after 60 seconds. Retry this action to show a new approval dialog. If the dialog is not visible, add ${host} in Settings > Lens > Developer Mode > Approved CDP Hosts.`,
    );
  }
  if (outcome === "denied") {
    throw new Error(
      `Lens CDP access for ${host} was denied. Retry this action to request access again, or add ${host} in Settings > Lens > Developer Mode > Approved CDP Hosts.`,
    );
  }
}

export function respondCdpApproval(response: LensCdpApprovalResponse): boolean {
  const pending = pendingCdpApprovals.get(response.requestId);
  if (!pending) {
    return false;
  }

  if (response.approved) {
    rememberTransientCdpApproval(pending.workspaceId, pending.host);
    if (response.remember) {
      addApprovedCdpHost(pending.host);
    }
  }

  return settlePendingCdpApproval(
    response.requestId,
    response.approved ? "approved" : "denied",
  );
}
