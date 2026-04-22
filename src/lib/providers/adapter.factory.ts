import type {
  ProviderAdapter,
  ProviderEventNormalizer,
  ProviderEventSource,
  ProviderId,
  ProviderTurnRequest,
} from "@/lib/providers/provider.types";
import { parseNormalizedEvent } from "@/lib/providers/runtime";

interface CreateProviderAdapterArgs<TRawEvent> {
  id: ProviderId;
  source: ProviderEventSource<TRawEvent>;
  normalizer: ProviderEventNormalizer<TRawEvent>;
  delayMs?: number;
}

export function createProviderAdapter<TRawEvent>(args: CreateProviderAdapterArgs<TRawEvent>): ProviderAdapter {
  const { id, source, normalizer, delayMs = 0 } = args;

  return {
    id,
    async *runTurn(turnArgs: ProviderTurnRequest) {
      for await (const rawEvent of source.streamTurn(turnArgs)) {
        if (delayMs > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
        const normalized = normalizer.normalize({ event: rawEvent });
        if (Array.isArray(normalized)) {
          for (const item of normalized) {
            const parsed = parseNormalizedEvent({ payload: item });
            if (!parsed) {
              continue;
            }
            yield parsed;
          }
          continue;
        }
        const parsed = parseNormalizedEvent({ payload: normalized });
        if (!parsed) {
          continue;
        }
        yield parsed;
      }
    },
  };
}
