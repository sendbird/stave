import { createBridgeProviderSource, hasBridgeProviderSource } from "@/lib/providers/bridge.source";
import { createProviderAdapter } from "@/lib/providers/adapter.factory";
import type { NormalizedProviderEvent, ProviderAdapter, ProviderEventSource, ProviderId } from "@/lib/providers/provider.types";

const bridgeUnavailableSource: ProviderEventSource<NormalizedProviderEvent> = {
  async *streamTurn() {
    yield { type: "system", content: "Provider bridge unavailable. Use bun run dev:desktop or bun run dev:all." };
    yield { type: "done" };
  },
};

function createBridgeSource(providerId: ProviderId): ProviderEventSource<NormalizedProviderEvent> {
  if (hasBridgeProviderSource()) {
    return createBridgeProviderSource<NormalizedProviderEvent>({ providerId });
  }
  return bridgeUnavailableSource;
}

export function getProviderAdapter(args: { providerId: ProviderId }): ProviderAdapter {
  // All three providers (claude-code, codex, stave) use the same IPC bridge.
  // The stave meta-provider routes to the real provider on the electron side.
  const source = createBridgeSource(args.providerId);
  return createProviderAdapter({
    id: args.providerId,
    source,
    normalizer: {
      normalize: ({ event }) => event,
    },
  });
}
