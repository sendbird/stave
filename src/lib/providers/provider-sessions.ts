import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import {
  getProviderSessionLabel as getProviderSessionLabelFromCatalog,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export const providerSessionOrder: ProviderId[] = listProviderIds();

export function getProviderSessionId(args: {
  sessions?: TaskProviderSessionState;
  providerId: ProviderId;
}): string | null {
  const value = args.sessions?.[args.providerId]?.trim();
  return value ? value : null;
}

export function listProviderSessions(args: {
  sessions?: TaskProviderSessionState;
}) {
  return providerSessionOrder.flatMap((providerId) => {
    const nativeSessionId = getProviderSessionId({
      sessions: args.sessions,
      providerId,
    });

    return nativeSessionId
      ? [{ providerId, nativeSessionId }]
      : [];
  });
}

export function getProviderSessionLabel(args: { providerId: ProviderId }) {
  return getProviderSessionLabelFromCatalog(args);
}
