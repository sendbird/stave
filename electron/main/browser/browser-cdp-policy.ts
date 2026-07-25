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
