import type { ProviderId } from "@/lib/providers/provider.types";
import type { ModelSelectorOption } from "./model-selector.utils";

/**
 * A request to open the composer's model selector on one provider's tab, and
 * optionally on one model group there, such as an API connection's
 * "<name> · API billing". Settings > Accounts makes one after switching a
 * provider's account, when the provider is still being checked again.
 */
export interface ModelSelectorOpenRequest {
  providerId: ProviderId;
  group?: string;
}

/**
 * Whether the selector can honor the request now: the provider has a tab, and
 * the requested group is among its models. Until then the selector keeps the
 * request and shows its usual tab; availability that arrives late then moves
 * it to the requested tab, as long as the person has not picked a tab first.
 */
export function isModelSelectorOpenRequestReady(args: {
  request: ModelSelectorOpenRequest;
  providerIds: readonly ProviderId[];
  options: readonly Pick<ModelSelectorOption, "providerId" | "group" | "isAuto">[];
}) {
  const { request } = args;
  if (!args.providerIds.includes(request.providerId)) return false;
  if (!request.group) return true;
  return args.options.some((option) => !option.isAuto && option.providerId === request.providerId && option.group === request.group);
}
