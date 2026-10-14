import { randomUUID } from "node:crypto";
import type { GatewayCredentials } from "./gateway-runtime";
import { snapshotProviderAccounts, type ProviderAccountSelection } from "../../src/lib/providers/provider-account-selection";

/** Private process transport. These frames never enter the renderer or event bus. */
export interface HostGatewayCredentialRequest {
  type: "gateway-credential-request";
  id: string;
  accounts: ProviderAccountSelection;
  decisionConnectionId?: string;
}
export interface HostGatewayCredentialResponse {
  type: "gateway-credential-response";
  id: string;
  credentials?: GatewayCredentials;
  decisionToken?: string;
}

export function createHostGatewayCredentialBroker(send: (request: HostGatewayCredentialRequest) => Promise<void>) {
  const pending = new Map<string, (response: HostGatewayCredentialResponse | undefined) => void>();
  return {
    receive(response: HostGatewayCredentialResponse) { pending.get(response.id)?.(response); },
    close() { for (const settle of [...pending.values()]) settle(undefined); },
    request(accounts: ProviderAccountSelection, decisionConnectionId?: string, signal?: AbortSignal): Promise<HostGatewayCredentialResponse | undefined> {
      if (signal?.aborted) return Promise.resolve(undefined);
      return new Promise((resolve) => {
        const id = randomUUID();
        const finish = (response?: HostGatewayCredentialResponse) => {
          if (!pending.delete(id)) return;
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          resolve(response);
        };
        const abort = () => finish();
        const timer = setTimeout(finish, 10_000);
        pending.set(id, finish);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) { finish(); return; }
        void send({ type: "gateway-credential-request", id, accounts: snapshotProviderAccounts(accounts), ...(decisionConnectionId ? { decisionConnectionId } : {}) }).catch(() => finish());
      });
    },
  };
}

let broker: ReturnType<typeof createHostGatewayCredentialBroker> | undefined;
export function setHostGatewayCredentialBroker(value: ReturnType<typeof createHostGatewayCredentialBroker>) { broker = value; }
export function requestHostGatewayCredentials(accounts: ProviderAccountSelection, decisionConnectionId?: string, signal?: AbortSignal) {
  return broker?.request(accounts, decisionConnectionId, signal) ?? Promise.resolve(undefined);
}
