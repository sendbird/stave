import { afterEach, expect, test } from "bun:test";
import type {
  ProviderAvailabilityResponse,
  ProviderId,
} from "../src/lib/providers/provider.types";
import { createEmptyProviderRuntimeCapabilities } from "../src/lib/providers/runtime-capabilities";

const originalWindow = (globalThis as { window?: unknown }).window;
afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

async function fixture() {
  const requests: Array<{
    providerId: ProviderId;
    runtimeOptions?: { codexBinaryPath?: string };
    resolve: (value: ProviderAvailabilityResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  const values = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    api: {
      provider: {
        checkAvailability: (args: { providerId: ProviderId }) =>
          new Promise<ProviderAvailabilityResponse>((resolve, reject) =>
            requests.push({ ...args, resolve, reject }),
          ),
      },
    },
  };
  const { useAppStore: store } = await import("../src/store/app.store");
  store.setState({
    ...store.getInitialState(),
    providerAvailability: {
      "claude-code": false,
      codex: false,
      cursor: false,
      kiro: false,
    },
  });
  return { store, requests };
}

const available = (providerId: ProviderId): ProviderAvailabilityResponse => ({
  ok: true,
  providerId,
  available: true,
  detail: "Ready",
  capabilities: createEmptyProviderRuntimeCapabilities(),
});

test("ready providers become usable before a slow sibling and concurrent refreshes coalesce", async () => {
  const { store, requests } = await fixture();
  const first = store.getState().refreshProviderAvailability();
  const second = store.getState().refreshProviderAvailability();
  expect(requests).toHaveLength(4);
  requests
    .find((request) => request.providerId === "codex")!
    .resolve(available("codex"));
  await Promise.resolve();
  expect(store.getState().providerAvailability.codex).toBe(true);
  expect(store.getState().providerAvailability.kiro).toBe(false);
  for (const request of requests)
    request.resolve(available(request.providerId));
  await Promise.all([first, second]);
});

test("failed discovery preserves last known availability and capabilities", async () => {
  const { store, requests } = await fixture();
  store.setState({
    providerAvailability: {
      ...store.getState().providerAvailability,
      codex: true,
    },
  });
  const previousCapabilities =
    store.getState().providerRuntimeCapabilities.codex;
  const pending = store.getState().refreshProviderAvailability();
  for (const request of requests) request.reject(new Error("Host unavailable"));
  await pending;
  expect(store.getState().providerAvailability.codex).toBe(true);
  expect(store.getState().providerRuntimeCapabilities.codex).toBe(
    previousCapabilities,
  );
});

test("changing binary settings discards stale responses and discovers the latest configuration", async () => {
  const { store, requests } = await fixture();
  const pending = store.getState().refreshProviderAvailability();
  store.setState({
    settings: {
      ...store.getState().settings,
      codexBinaryPath: "/tmp/new-runtime",
    },
  });
  for (const request of requests.slice())
    request.resolve(available(request.providerId));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.getState().providerAvailability.codex).toBe(false);
  expect(requests).toHaveLength(8);
  expect(requests[4]?.runtimeOptions?.codexBinaryPath).toBe("/tmp/new-runtime");
  for (const request of requests.slice(4))
    request.resolve(available(request.providerId));
  await pending;
  expect(store.getState().providerAvailability.codex).toBe(true);
});
