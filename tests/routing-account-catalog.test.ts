import { test, expect } from "bun:test";
import { defaultSettings } from "../src/store/app-settings";
import { useProviderAccounts } from "../src/lib/providers/use-provider-accounts";
import { resolveAutoRoutingForSend, cancelPendingAutoRouting } from "../src/store/auto-routing-dispatch";

test("an Auto send waits for connection metadata; cancellation cannot return an unrestricted native route", async () => {
  const before = useProviderAccounts.getState(), previousWindow = globalThis.window;
  const id = "44444444-4444-4444-8444-444444444444", model = "moonshotai/kimi-k3";
  let resolve!: (value: unknown) => void;
  globalThis.window = { api: { providerAccounts: { list: () => new Promise((done) => { resolve = done; }) } } } as never;
  useProviderAccounts.setState({ loaded: false, profiles: [], loading: false });
  const args = { taskId: "cold-send", state: { settings: { ...defaultSettings, autoRoutingEnabled: true, codexAccountProfileId: id,
    autoRoutingProfile: { ...defaultSettings.autoRoutingProfile, signals: { ...defaultSettings.autoRoutingProfile.signals, classifier: false } } },
    rateLimitsSnapshot: null, providerAvailability: { codex: true, "claude-code": false, cursor: false, kiro: false } },
    promptDraft: { text: "Fix typo", attachedFilePaths: [], attachments: [], runtimeOverrides: { autoRouting: true } },
    provider: "codex" as const, activeModel: model, prompt: "Fix typo", history: [], fileContextCount: 0, workspaceCwd: "/tmp/workspace" };
  try {
    const pending = resolveAutoRoutingForSend(args);
    expect(cancelPendingAutoRouting(args.taskId)).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    resolve({ ok: true, profiles: [{ id, providerId: "codex", label: "Fixture", kind: "managed", gateway: { baseUrl: "https://ai-gateway.vercel.sh/v1", secretId: id, models: [model] } }] });
    await new Promise((done) => setTimeout(done, 0));
    expect((await resolveAutoRoutingForSend(args))?.model).toBe(model);
    useProviderAccounts.setState({ loaded: true, profiles: [] });
    await expect(resolveAutoRoutingForSend(args)).rejects.toThrow();
  } finally { globalThis.window = previousWindow; useProviderAccounts.setState(before); }
});
