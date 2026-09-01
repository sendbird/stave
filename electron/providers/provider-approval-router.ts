import type { ProviderResponderResult } from "./types";

export type ProviderApprovalResponder = (args: {
  requestId: string;
  approved: boolean;
  reason?: string;
  scope?: "once" | "always";
}) => ProviderResponderResult;

/**
 * Routes one renderer approval surface to the primary provider plus any
 * turn-scoped nested providers. Responders own their pending request ids, so an
 * unknown result is safe to probe and lets the router avoid coupling to each
 * adapter's request-id format.
 */
export function createProviderApprovalRouter() {
  let primary: ProviderApprovalResponder | null = null;
  const nested = new Set<ProviderApprovalResponder>();

  return {
    respond: ((args) => {
      const ordered = args.requestId.includes("worker:")
        ? [...nested, primary]
        : [primary, ...nested];
      const pendingRequestIds = new Set<string>();
      for (const responder of ordered) {
        if (!responder) {
          continue;
        }
        const result = responder(args);
        if (result.ok) {
          return result;
        }
        for (const requestId of result.pendingRequestIds) {
          pendingRequestIds.add(requestId);
        }
      }
      return {
        ok: false,
        reason: "unknown-request",
        pendingRequestIds: [...pendingRequestIds],
      };
    }) satisfies ProviderApprovalResponder,
    registerPrimary(responder: ProviderApprovalResponder) {
      primary = responder;
    },
    registerNested(responder: ProviderApprovalResponder) {
      nested.add(responder);
      return () => nested.delete(responder);
    },
  };
}
