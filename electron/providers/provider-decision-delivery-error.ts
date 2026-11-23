import type { ProviderDecisionFailureReason } from "../../src/lib/providers/provider.types";

/** Carries a provider rejection through the Local MCP host error envelope. */
export class ProviderDecisionDeliveryError extends Error {
  constructor(message: string | undefined, readonly reason?: ProviderDecisionFailureReason) {
    super(message);
  }
}
