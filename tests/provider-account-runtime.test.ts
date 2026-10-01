import { describe, expect, test } from "bun:test";
import { withProviderAccountScope, withRequestAccountScope, currentProviderAccountId, providerAccountKey, providerAccountKeyMatchesTask } from "../electron/provider-accounts/runtime-scope";
import { recordCodexRateLimits, readCodexRateLimitsCache, clearCodexRateLimitsCache } from "../electron/providers/codex-rate-limits-cache";
import { listKeychainServiceCandidates } from "../electron/providers/rate-limits/claude-credentials";
import { getProviderSessionCursor } from "../src/lib/providers/provider-sessions";
import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";
import { buildQueuedTurnFromDraft } from "../src/store/prompt-draft-context";
import { buildPromptDraftForSend } from "../src/store/prompt-draft-send";
import { RuntimeOptionsObjectSchema } from "../electron/main/ipc/provider-runtime-schemas";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "../src/lib/providers/provider-accounts";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";
import { providerAccountEventMapper } from "../electron/provider-accounts/events";
import { arePromptDraftRuntimeOverridesEqual } from "../src/store/prompt-draft-runtime";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("account-bound execution", () => {
  test("interleaved requests retain independent identities and nested requests reset to default", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = withRequestAccountScope({ runtimeOptions: { codexAccountProfileId: A } }, async () => {
      await gate;
      expect(currentProviderAccountId("codex")).toBe(A);
      expect(withProviderAccountScope(undefined, () => currentProviderAccountId("codex"))).toBe(A);
      expect(withRequestAccountScope({}, () => currentProviderAccountId("codex"))).toBe(SYSTEM_ACCOUNT_PROFILE_ID);
      return providerAccountKey("codex", "task");
    });
    const second = withRequestAccountScope({ runtimeOptions: { codexAccountProfileId: B } }, async () => {
      release();
      await Promise.resolve();
      expect(currentProviderAccountId("codex")).toBe(B);
      return providerAccountKey("codex", "task");
    });
    const keys = await Promise.all([first, second]);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) expect(providerAccountKeyMatchesTask(key, "task")).toBe(true);
    expect(currentProviderAccountId("codex")).toBe(SYSTEM_ACCOUNT_PROFILE_ID);
    expect(providerAccountKey("codex", "task")).toBe("task");
  });

  test("usage notifications cannot overwrite another account", async () => {
    clearCodexRateLimitsCache();
    await Promise.all([A, B].map((id, index) => withProviderAccountScope({ codexAccountProfileId: id }, async () => {
      await Promise.resolve();
      recordCodexRateLimits({ buckets: [], source: "notification", now: index + 1 });
    })));
    expect(readCodexRateLimitsCache()).toBeNull();
    expect(withProviderAccountScope({ codexAccountProfileId: A }, readCodexRateLimitsCache)?.updatedAt).toBe(1);
    expect(withProviderAccountScope({ codexAccountProfileId: B }, readCodexRateLimitsCache)?.updatedAt).toBe(2);
    clearCodexRateLimitsCache();
  });

  test("custom Claude credential lookups exclude the default keychain service", () => {
    const services = withProviderAccountScope({ claudeAccountProfileId: A }, () => listKeychainServiceCandidates(["/tmp/account-a"]));
    expect(services).toHaveLength(1);
    expect(services[0]).toMatch(/^Claude Code-credentials-[0-9a-f]{8}$/);
    expect(services).not.toContain("Claude Code-credentials");
  });

  test("runtime transport validates both account identities", () => {
    expect(RuntimeOptionsObjectSchema.parse({ claudeAccountProfileId: A, codexAccountProfileId: B })).toEqual({ claudeAccountProfileId: A, codexAccountProfileId: B });
    expect(RuntimeOptionsObjectSchema.safeParse({ codexAccountProfileId: "/tmp/account" }).success).toBe(false);
  });

  test("cached usage reads and synthesized terminal events retain their originating profile", async () => {
    clearUsageReadState();
    const seen: string[] = [];
    const fetchers = { codex: async () => {
      seen.push(currentProviderAccountId("codex"));
      return { source: "rpc" as const, buckets: [], error: null };
    } };
    for (const id of [A, B, A]) await getRateLimitsSnapshot({ providers: ["codex"], runtimeOptions: { codexAccountProfileId: id }, fetchers });
    expect(seen).toEqual([A, B]);
    const stamp = withProviderAccountScope({ codexAccountProfileId: A }, () => providerAccountEventMapper({ providerId: "codex" }));
    expect(withProviderAccountScope({ codexAccountProfileId: B }, () => stamp({ type: "done", stop_reason: "runtime_failure" }))).toEqual({ type: "done", stop_reason: "runtime_failure", accountProfileId: A });
    clearUsageReadState();
  });

  test("A to B to A replay preserves each native cursor and the original default session", () => {
    const initial = { codex: "default-thread" };
    const a = replayProviderEventsToTaskState({ taskId: "task", messages: [], provider: "codex", model: "model", providerSession: initial, events: [
      { type: "provider_session", providerId: "codex", nativeSessionId: "thread-a", accountProfileId: A },
      { type: "text", text: "Answer A" },
      { type: "done", accountProfileId: A },
    ] });
    const b = replayProviderEventsToTaskState({ taskId: "task", messages: a.messages, provider: "codex", model: "model", providerSession: a.providerSession, events: [
      { type: "provider_session", providerId: "codex", nativeSessionId: "thread-b", accountProfileId: B },
      { type: "text", text: "Answer B" },
      { type: "done", accountProfileId: B },
    ] });
    expect(getProviderSessionCursor({ sessions: b.providerSession, providerId: "codex", accountProfileId: A })).toEqual(getProviderSessionCursor({ sessions: a.providerSession, providerId: "codex", accountProfileId: A }));
    expect(getProviderSessionCursor({ sessions: b.providerSession, providerId: "codex", accountProfileId: B })?.nativeSessionId).toBe("thread-b");
    expect(getProviderSessionCursor({ sessions: b.providerSession, providerId: "codex" })?.nativeSessionId).toBe("default-thread");
  });

  test("manual and auto queues keep the original account after the composer switches", () => {
    for (const autoRouting of [false, true]) {
      const draft = { text: "Queued", attachedFilePaths: [], attachments: [], runtimeOverrides: { codexAccountProfileId: A } };
      const queuedTurn = buildQueuedTurnFromDraft({ draft, providerId: "codex", autoRouting });
      const changedDraft = { ...draft, runtimeOverrides: { codexAccountProfileId: B } };
      const dispatched = buildPromptDraftForSend({ content: "Ignored", sourceDraft: changedDraft, storedDraft: changedDraft, queuedTurn });
      expect(dispatched.runtimeOverrides?.codexAccountProfileId).toBe(A);
      expect(dispatched.runtimeOverrides?.claudeAccountProfileId).toBe(SYSTEM_ACCOUNT_PROFILE_ID);
      expect(arePromptDraftRuntimeOverridesEqual(draft.runtimeOverrides, changedDraft.runtimeOverrides)).toBe(false);
    }
  });
});
