import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { isOptionalProvider } from "@/lib/providers/provider-readiness";

/**
 * Unavailable providers worth naming in a route explanation. Display only:
 * the router reads `providerAvailability` unchanged.
 *
 * Claude Code and Codex are always set up, so an outage of either always
 * shows. Cursor, Kiro and OpenCode are unavailable mostly because the user
 * never set them up (Settings hides them by the same availability signal), so
 * one shows only when the decision involved it: the route, a rule or the agent
 * asked for it, or the task was running on it.
 */
export function listRouteUnavailableProviders(args: {
  availability?: Partial<Record<ProviderId, boolean>>;
  involved: ReadonlyArray<string | null | undefined>;
}): ProviderId[] {
  return listProviderIds().filter(
    (providerId) =>
      args.availability?.[providerId] === false &&
      (!isOptionalProvider(providerId) || args.involved.includes(providerId)),
  );
}
