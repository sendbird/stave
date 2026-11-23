import type { LensSecurityConfig } from "../../../src/lib/lens/lens.types";

export interface LensTransientCdpApproval {
  workspaceId: string;
  host: string;
  expiresAt: number;
}

export interface LensCdpPolicyConfig extends LensSecurityConfig {
  transientCdpApprovals: readonly LensTransientCdpApproval[];
}

type LensCdpPolicyListener = (config: LensCdpPolicyConfig) => void;

const policyListeners = new Set<LensCdpPolicyListener>();
const ORBIT_HOST_LOOKUP_TIMEOUT_MS = 1_000;

export function isCdpLoopbackHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}

export async function isWorkspaceOrbitCdpHost(
  workspaceId: string,
  host: string,
): Promise<boolean> {
  // A host-service restart must not delay the approval dialog until the
  // startup handshake times out.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { invokeHostService } = await import("../host-service-client");
    const lookup = invokeHostService(
      "workspace-scripts.has-orbit-host",
      { workspaceId, host },
      { timeoutMs: ORBIT_HOST_LOOKUP_TIMEOUT_MS },
    );
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ORBIT_HOST_LOOKUP_TIMEOUT_MS);
    });
    const result = await Promise.race([lookup, deadline]);
    return result?.matches === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function publishLensCdpPolicy(config: LensCdpPolicyConfig): void {
  for (const listener of policyListeners) {
    listener(config);
  }
}

export function subscribeLensCdpPolicy(
  listener: LensCdpPolicyListener,
): () => void {
  policyListeners.add(listener);
  return () => policyListeners.delete(listener);
}
