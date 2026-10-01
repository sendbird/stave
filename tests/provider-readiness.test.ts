import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ToolingStatusEntry } from "@/lib/tooling-status";
import {
  providerReadiness,
  providerReadsAllowed,
  providerSurfaceVisible,
  publishProviderTooling,
  useProviderReadinessStore,
} from "@/lib/providers/provider-readiness-store";
import { loadProviderModelCatalog } from "@/lib/providers/use-provider-model-catalogs";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";
import { createProviderSupportActions } from "@/store/app-store-provider-actions";
import { providerToolingStatePatch } from "@/store/provider-tooling";
import type { AppState } from "@/store/app-store.types";
import { emptyRateLimitsSnapshot } from "@/lib/providers/account-usage-block";

const originalWindow = globalThis.window;
let clock = Date.now();
function tool(patch: Partial<ToolingStatusEntry> = {}): ToolingStatusEntry {
  return {
    id: "cursor",
    label: "Cursor",
    state: "ready",
    available: true,
    authState: "authenticated",
    authDetail: null,
    summary: "Ready",
    detail: "Ready",
    version: "1.0.0",
    executablePath: "/tmp/provider-cli",
    checkedAt: new Date(++clock).toISOString(),
    ...patch,
  };
}

beforeEach(() => {
  useProviderReadinessStore.setState({ providers: {} });
  clearUsageReadState();
});
afterEach(() => {
  globalThis.window = originalWindow;
});

describe("optional provider readiness", () => {
  test("startup, login, logout, and a changed binary gate reads without changing saved selections", () => {
    const options = { cursorBinaryPath: "/tmp/provider-cli" };
    expect(providerReadsAllowed("cursor", options)).toBe(false);
    expect(providerSurfaceVisible("cursor", options)).toBe(false);
    publishProviderTooling(tool(), options);
    expect(providerReadsAllowed("cursor", options)).toBe(true);
    expect(
      providerReadsAllowed("cursor", { cursorBinaryPath: "/tmp/other-cli" }),
    ).toBe(false);
    publishProviderTooling(
      tool({ authState: "unauthenticated", state: "warning" }),
      options,
    );
    expect(providerSurfaceVisible("cursor", options)).toBe(false);
    const state = {
      settings: options,
      providerAvailability: { cursor: true, kiro: false },
      rateLimitsSnapshot: emptyRateLimitsSnapshot(),
      rateLimitsUpdatedAtByProvider: {},
      tasks: [{ id: "saved-task", provider: "cursor" }],
      promptDraftByTask: {
        "saved-task": { selectedModel: "saved-model", modelEffort: "high" },
      },
    } as unknown as AppState;
    const next = { ...state, ...providerToolingStatePatch(state) };
    expect(next.providerAvailability.cursor).toBe(false);
    expect(next.tasks).toBe(state.tasks);
    expect(next.promptDraftByTask).toBe(state.promptDraftByTask);
    publishProviderTooling(tool(), options);
    expect(providerReadsAllowed("cursor", options)).toBe(true);
  });

  test("initial unknown stays hidden; a transient failure after ready retains a stale surface", () => {
    publishProviderTooling(
      tool({ state: "unknown", authState: "unknown", available: false }),
    );
    expect(providerSurfaceVisible("cursor")).toBe(false);
    publishProviderTooling(tool());
    publishProviderTooling(
      tool({ state: "unknown", authState: "unknown", available: false }),
    );
    expect(providerSurfaceVisible("cursor")).toBe(true);
    expect(providerReadsAllowed("cursor")).toBe(false);
    expect(providerReadiness("cursor")?.stale).toBe(true);
    publishProviderTooling(tool({ state: "error", available: false }));
    expect(providerSurfaceVisible("cursor")).toBe(false);
  });

  test("an older probe cannot replace a newer logout", () => {
    const ready = tool();
    publishProviderTooling(
      tool({ state: "warning", authState: "unauthenticated" }),
    );
    publishProviderTooling(ready);
    expect(providerReadsAllowed("cursor")).toBe(false);
  });

  test("hidden catalogs make no bridge call, including forced refresh; reauthentication reloads", async () => {
    let calls = 0;
    globalThis.window = {
      api: {
        provider: {
          getModelCatalog: async () => {
            calls++;
            return {
              ok: true,
              models: [
                {
                  model: "dynamic-test-model",
                  displayName: "Test Model",
                  description: "",
                  hidden: false,
                  isDefault: false,
                  defaultEffort: null,
                  supportedEfforts: [],
                },
              ],
              detail: "Listed",
            };
          },
        },
      },
    } as unknown as Window & typeof globalThis;
    const args = {
      providerId: "cursor" as const,
      runtimeOptions: { cursorBinaryPath: "/tmp/catalog-test-cli" },
    };
    expect(
      (await loadProviderModelCatalog({ ...args, force: true })).models,
    ).toEqual([]);
    expect(calls).toBe(0);
    publishProviderTooling(tool(), args.runtimeOptions);
    expect((await loadProviderModelCatalog(args)).models).toContain(
      "dynamic-test-model",
    );
    publishProviderTooling(
      tool({ state: "unknown", authState: "unknown" }),
      args.runtimeOptions,
    );
    expect((await loadProviderModelCatalog(args)).models).toContain(
      "dynamic-test-model",
    );
    expect(calls).toBe(1);
    publishProviderTooling(
      tool({ state: "warning", authState: "unauthenticated" }),
      args.runtimeOptions,
    );
    expect((await loadProviderModelCatalog(args)).models).toEqual([]);
    publishProviderTooling(tool(), args.runtimeOptions);
    await loadProviderModelCatalog(args);
    expect(calls).toBe(2);
  });

  test("a catalog reply arriving after logout cannot repopulate models", async () => {
    let release!: (value: unknown) => void;
    globalThis.window = {
      api: {
        provider: {
          getModelCatalog: () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        },
      },
    } as unknown as Window & typeof globalThis;
    const args = {
      providerId: "kiro" as const,
      runtimeOptions: { kiroBinaryPath: "/tmp/catalog-race-cli" },
    };
    publishProviderTooling(tool({ id: "kiro" }), args.runtimeOptions);
    const request = loadProviderModelCatalog(args);
    publishProviderTooling(
      tool({ id: "kiro", authState: "unauthenticated", state: "warning" }),
      args.runtimeOptions,
    );
    release({ ok: true, models: [], detail: "Late" });
    expect((await request).models).toEqual([]);
    expect((await loadProviderModelCatalog(args)).models).toEqual([]);
  });

  test("native usage gating skips both fetchers; reauthentication separates the cache", async () => {
    let calls = 0;
    let identity: string | null = null;
    const args = {
      providers: ["kiro" as const],
      optionalReadKey: () => identity,
      fetchers: {
        kiro: async () => {
          calls++;
          return {
            source: "acp" as const,
            planName: `Profile ${identity}`,
            monthly: null,
            buckets: [],
            overagesEnabled: false,
            error: null,
          };
        },
      },
    };
    await getRateLimitsSnapshot({ ...args, force: true });
    expect(calls).toBe(0);
    identity = "first-login";
    await getRateLimitsSnapshot(args);
    identity = null;
    await getRateLimitsSnapshot(args);
    expect(calls).toBe(1);
    identity = "second-login";
    const result = await getRateLimitsSnapshot(args);
    expect(calls).toBe(2);
    expect(result.kiro.planName).toBe("Profile second-login");
  });

  test("renderer usage filtering blocks hidden providers and discards a reply after logout", async () => {
    let release!: (value: unknown) => void;
    let calls = 0;
    globalThis.window = {
      api: {
        provider: {
          getRateLimitsSnapshot: () => {
            calls++;
            return new Promise((resolve) => {
              release = resolve;
            });
          },
        },
      },
    } as unknown as Window & typeof globalThis;
    let state = {
      settings: {
        cursorBinaryPath: "",
        kiroBinaryPath: "",
        codexBinaryPath: "",
      },
      providerAvailability: { cursor: false, kiro: false },
      rateLimitsSnapshot: emptyRateLimitsSnapshot(),
      rateLimitsUpdatedAtByProvider: {},
    } as unknown as AppState;
    const actions = createProviderSupportActions({
      get: () => state,
      set: (patch) => {
        state = {
          ...state,
          ...(typeof patch === "function" ? patch(state) : patch),
        };
      },
    });
    await actions.refreshRateLimits({ providers: ["cursor"], force: true });
    expect(calls).toBe(0);
    publishProviderTooling(tool());
    const request = actions.refreshRateLimits({ providers: ["cursor"] });
    publishProviderTooling(
      tool({ authState: "unauthenticated", state: "warning" }),
    );
    release({
      ...emptyRateLimitsSnapshot(),
      cursor: { source: "dashboard", planName: "Old account", error: null },
    });
    await request;
    expect(state.rateLimitsSnapshot?.cursor.source).toBe("unavailable");
  });
});
