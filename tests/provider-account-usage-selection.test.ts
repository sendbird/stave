import { expect, test } from "bun:test";
import { createProviderSupportActions } from "../src/store/app-store-provider-actions";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import type { AppState } from "../src/store/app-store.types";
import type { RateLimitsSnapshotResponse } from "../src/lib/providers/provider.types";

test("a usage response from the previous account cannot replace current readings", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let finish!: (snapshot: RateLimitsSnapshotResponse) => void;
  const requested: unknown[] = [];
  const pending = new Promise<RateLimitsSnapshotResponse>((resolve) => { finish = resolve; });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { api: { provider: { getRateLimitsSnapshot: (args: unknown) => {
      requested.push(args);
      return pending;
    } } } },
  });
  let state = {
    settings: { codexAccountProfileId: "11111111-1111-4111-8111-111111111111" },
    rateLimitsSnapshot: emptyRateLimitsSnapshot(),
    rateLimitsUpdatedAtByProvider: {},
  } as AppState;
  const initial = state.rateLimitsSnapshot;
  const actions = createProviderSupportActions({
    get: () => state,
    set: (patch) => {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    },
  });
  try {
    const refresh = actions.refreshRateLimits({ providers: ["codex"] });
    const originalId = state.settings.codexAccountProfileId;
    state = { ...state, settings: { ...state.settings, codexAccountProfileId: "22222222-2222-4222-8222-222222222222" } };
    finish({ ...emptyRateLimitsSnapshot(), codex: { source: "rpc", buckets: [], error: null } });
    await refresh;
    expect(requested[0]).toMatchObject({ runtimeOptions: { codexAccountProfileId: originalId } });
    expect(state.rateLimitsSnapshot).toBe(initial);
    expect(state.rateLimitsUpdatedAtByProvider).toEqual({});
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
