import type {
  LensCdpApprovalRequestPayload,
  LensCdpApprovalResponse,
  LensSecurityConfig,
} from "../../../src/lib/lens/lens.types";

const CDP_APPROVAL_TIMEOUT_MS = 15_000;
const TRANSIENT_CDP_APPROVAL_MS = 15_000;

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
    host: string;
    workspaceId: string;
    resolve: (approved: boolean) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
const transientCdpApprovals = new Map<string, number>();

function normalizeHostEntry(value: string): string | null {
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
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    const host = withoutWildcard
      .split(/[/?#:]/, 1)[0]
      ?.replace(/^\[/, "")
      .replace(/\]$/, "")
      .replace(/\.$/, "");
    return host || null;
  }
}

function normalizeHostList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];

  for (const value of values) {
    const host = normalizeHostEntry(value);
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    hosts.push(host);
  }

  return hosts;
}

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
  return url.hostname.toLowerCase().replace(/\.$/, "");
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
    allowedHosts: normalizeHostList(config.allowedHosts),
    blockedHosts: normalizeHostList(config.blockedHosts),
    developerModeCdp: config.developerModeCdp === true,
    cdpApprovedHosts: normalizeHostList(config.cdpApprovedHosts),
  };
  return getLensSecurityConfig();
}

export function assertNavigationAllowed(
  targetUrl: string,
  config: LensSecurityConfig = currentSecurityConfig,
): void {
  const parsed = parseHttpUrl(targetUrl);
  const host = normalizeParsedHost(parsed);
  const allowedHosts = normalizeHostList(config.allowedHosts);
  const blockedHosts = normalizeHostList(config.blockedHosts);

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
  url: string;
  reason?: string;
}): Promise<void> {
  const config = currentSecurityConfig;
  const parsed = parseHttpUrl(args.url);
  const host = normalizeParsedHost(parsed);

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
      `Lens CDP access for ${host} is not approved. Open Lens and approve it in Settings > Lens > Developer Mode.`,
    );
  }

  const requestId = `lens-cdp-${Date.now()}-${++cdpApprovalSequence}`;
  const approved = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      pendingCdpApprovals.delete(requestId);
      resolve(false);
    }, CDP_APPROVAL_TIMEOUT_MS);

    pendingCdpApprovals.set(requestId, {
      host,
      workspaceId: args.workspaceId,
      resolve,
      timeout,
    });

    renderer.send("lens:cdp-approval-request", {
      workspaceId: args.workspaceId,
      requestId,
      url: args.url,
      host,
      reason: args.reason ?? "Lens CDP action",
    } satisfies LensCdpApprovalRequestPayload);
  });

  if (!approved) {
    throw new Error(
      `Lens CDP access for ${host} was not approved. Approve the host from the Lens panel or add it in Settings > Lens > Developer Mode.`,
    );
  }
}

export function respondCdpApproval(response: LensCdpApprovalResponse): boolean {
  const pending = pendingCdpApprovals.get(response.requestId);
  if (!pending) {
    return false;
  }

  pendingCdpApprovals.delete(response.requestId);
  clearTimeout(pending.timeout);

  if (response.approved) {
    rememberTransientCdpApproval(pending.workspaceId, pending.host);
    if (response.remember) {
      addApprovedCdpHost(pending.host);
    }
  }

  pending.resolve(response.approved);
  return true;
}
