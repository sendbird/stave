import { describe, expect, test } from "bun:test";
import { selectComposerShelfRows } from "@/components/session/composer-shelf/composer-shelf.utils";
import { classifyProviderAccountFailure } from "@/lib/providers/provider-error-recovery";
import {
  describeProviderAccountBlocker,
  providerAccountBlockerActionLabel,
  resolveProviderAccountBlocker,
} from "@/lib/providers/provider-account-blocker";
import type { ToolingStatusEntry } from "@/lib/tooling-status";
import { emptyRateLimitsSnapshot } from "@/lib/providers/account-usage-block";
import { composerUsageLimitReached } from "@/lib/providers/use-provider-account-blocker";
import { mapCodexRateLimitBuckets } from "../electron/providers/codex-snapshot-mappers";
import type { AppState } from "@/store/app-store.types";

const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";
const tool = (overrides: Partial<ToolingStatusEntry> = {}): ToolingStatusEntry => ({
  id: "claude",
  label: "Claude Code",
  state: "ready",
  available: true,
  summary: "",
  detail: "",
  version: "1.0.0",
  executablePath: "/tmp/fixture/claude",
  authState: "authenticated",
  authDetail: null,
  ...overrides,
});
const system = { id: "system-default", kind: "system" as const, label: "System default" };
const work = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "managed" as const, label: "Work" };
const connection = {
  id: CONNECTION_ID,
  kind: "managed" as const,
  label: "Company gateway",
  gateway: { baseUrl: "https://ai-gateway.vercel.sh/claude-code", secretId: "11111111-1111-4111-8111-111111111111", models: ["anthropic/claude-sonnet-5"] },
};
const base = { providerId: "claude-code" as const, available: true, tool: tool(), selectedProfile: system, otherAccountCount: 0, limitReached: false };

describe("why the composer cannot send", () => {
  test("nothing to say while sending works or nothing was checked", () => {
    expect(resolveProviderAccountBlocker(base)).toBeNull();
    expect(resolveProviderAccountBlocker({ ...base, tool: undefined, available: false })).toBeNull();
    // OpenCode manages its own provider sign-in; a ready CLI has nothing to fix here.
    expect(resolveProviderAccountBlocker({ ...base, providerId: "opencode", available: true, tool: tool({ id: "opencode", authState: "not-required" }) })).toBeNull();
  });

  test("one cause per state, each with its own button", () => {
    const missing = resolveProviderAccountBlocker({ ...base, available: false, tool: tool({ available: false, authState: "unknown" }) });
    expect(missing).toMatchObject({ kind: "cli-missing", action: "set-up", focus: "getting-started" });

    const systemSignedOut = resolveProviderAccountBlocker({ ...base, available: false, tool: tool({ authState: "unauthenticated" }) });
    expect(systemSignedOut).toMatchObject({ kind: "signed-out", action: "sign-in", focus: "claude-code-signin" });
    const workSignedOut = resolveProviderAccountBlocker({ ...base, available: false, selectedProfile: work, tool: tool({ authState: "unauthenticated" }) });
    expect(workSignedOut).toMatchObject({ kind: "signed-out", focus: "claude-code", accountLabel: "Work" });

    // A gateway account does not need the CLI sign-in; only its key matters.
    expect(resolveProviderAccountBlocker({ ...base, selectedProfile: connection, tool: tool({ authState: "unauthenticated" }) })).toBeNull();
    expect(resolveProviderAccountBlocker({ ...base, available: false, selectedProfile: connection, tool: tool({ authState: "unauthenticated" }) }))
      .toMatchObject({ kind: "key-unreadable", action: "connect-key", focus: `api-connection:${CONNECTION_ID}` });

    expect(resolveProviderAccountBlocker({ ...base, limitReached: true, otherAccountCount: 1 })).toMatchObject({ kind: "limit-reached", action: "switch", focus: "claude-code" });
    expect(resolveProviderAccountBlocker({ ...base, limitReached: true })).toMatchObject({ kind: "limit-reached", action: "add-account", focus: "claude-code-add" });
  });

  test("Cursor, Kiro and OpenCode point to their CLI row for a missing or signed-out CLI", () => {
    for (const providerId of ["cursor", "kiro", "opencode"] as const) {
      expect(resolveProviderAccountBlocker({ ...base, providerId, available: false, selectedProfile: undefined, tool: tool({ id: providerId, available: false, authState: "unknown" }) }))
        .toMatchObject({ kind: "cli-missing", action: "set-up", focus: `cli:${providerId}` });
    }
    const cursor = resolveProviderAccountBlocker({ ...base, providerId: "cursor", available: false, selectedProfile: undefined, tool: tool({ id: "cursor", authState: "unauthenticated" }) });
    expect(cursor).toMatchObject({ kind: "signed-out", action: "sign-in", focus: "cli:cursor" });
    expect(describeProviderAccountBlocker(cursor!)).toBe("Cursor Agent is not signed in.");
    // No account to switch to, so no usage-limit line for them.
    expect(resolveProviderAccountBlocker({ ...base, providerId: "kiro", selectedProfile: undefined, limitReached: true, tool: tool({ id: "kiro" }) })).toBeNull();
  });

  test("the line names the provider and the account", () => {
    const blocker = resolveProviderAccountBlocker({ ...base, providerId: "codex", available: false, tool: tool({ id: "codex", authState: "unauthenticated" }) })!;
    expect(describeProviderAccountBlocker(blocker)).toBe("Codex is not signed in on System default.");
    expect(providerAccountBlockerActionLabel(blocker)).toBe("Sign in");
  });

  test("the shelf shows the account line first, and not over a paused usage limit", () => {
    expect(selectComposerShelfRows({ run: null, queueCount: 0, accountBlocked: true })).toEqual(["account"]);
    expect(selectComposerShelfRows({ run: "turn", queueCount: 1, accountBlocked: true })).toEqual(["account", "run", "queue"]);
    expect(selectComposerShelfRows({ run: null, queueCount: 1, limited: true, accountBlocked: true })).toEqual(["limit", "queue"]);
    expect(selectComposerShelfRows({ run: null, queueCount: 0 })).toEqual([]);
  });
});

describe("turn errors that end on the account", () => {
  test("recognizes the runtimes' sign-in and usage-limit messages", () => {
    expect(classifyProviderAccountFailure("[error] Claude authentication failed. Run `claude auth login` and retry.")).toBe("auth");
    expect(classifyProviderAccountFailure("[error] Codex authentication failed. Run `codex login` and retry.")).toBe("auth");
    expect(classifyProviderAccountFailure("[error] Codex usage limit reached. Wait for the limit to reset or check account limits.")).toBe("usage-limit");
    expect(classifyProviderAccountFailure("[error] You've hit your limit · resets 5pm")).toBe("usage-limit");
    expect(classifyProviderAccountFailure("[error] something else", "usage_limit")).toBe("usage-limit");
    expect(classifyProviderAccountFailure("[error] Kiro CLI provider stream failed: not authenticated. Run `kiro-cli login` if authentication has expired.")).toBe("auth");
    expect(classifyProviderAccountFailure("[error] OpenCode provider stream failed: Authentication required. Connect a provider in OpenCode.")).toBe("auth");
    expect(classifyProviderAccountFailure("[error] Selected model is at capacity. (status: 503)")).toBeNull();
  });
});

describe("the composer usage-limit line matches the send guard", () => {
  const codexSnapshot = (sharedUsed: number) => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.codex = {
      source: "rpc",
      error: null,
      buckets: mapCodexRateLimitBuckets({
        rateLimitsByLimitId: {
          codex: { limitId: "codex", limitName: "Codex", primary: { usedPercent: sharedUsed, resetsAt: null } },
          codex_bengalfox: { limitId: "codex_bengalfox", limitName: "GPT-5.3-Codex-Spark", primary: { usedPercent: 100, resetsAt: null } },
        },
      }),
    };
    return { settings: { blockTurnsWhenAccountLimitReached: true }, rateLimitsSnapshot: snapshot } as Pick<AppState, "settings" | "rateLimitsSnapshot">;
  };

  test("a limit that only another model uses shows no line for the selected model", () => {
    const state = codexSnapshot(20);
    expect(composerUsageLimitReached({ providerId: "codex", model: "gpt-6.1-sol", state })).toBe(false);
    expect(composerUsageLimitReached({ providerId: "codex", model: "gpt-5.3-codex-spark", state })).toBe(true);
  });

  test("Claude's model weekly limit stays with the model that uses it", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.claude = { source: "oauth", session: { usedPercent: 10, resetsAt: null }, weekly: { usedPercent: 10, resetsAt: null }, fableWeekly: { usedPercent: 100, resetsAt: null }, error: null };
    const state = { settings: { blockTurnsWhenAccountLimitReached: true }, rateLimitsSnapshot: snapshot } as Pick<AppState, "settings" | "rateLimitsSnapshot">;
    expect(composerUsageLimitReached({ providerId: "claude-code", model: "claude-opus-5-5", state })).toBe(false);
    expect(composerUsageLimitReached({ providerId: "claude-code", model: "claude-fable-5-1", state })).toBe(true);
  });

  test("Stave Auto routes on send, so it never shows the line; a shared limit still does for a model", () => {
    const state = codexSnapshot(100);
    expect(composerUsageLimitReached({ providerId: "codex", model: "gpt-6.1-sol", state })).toBe(true);
    expect(composerUsageLimitReached({ providerId: "codex", autoRouting: true, state })).toBe(false);
    const off = { ...state, settings: { blockTurnsWhenAccountLimitReached: false } } as typeof state;
    expect(composerUsageLimitReached({ providerId: "codex", model: "gpt-6.1-sol", state: off })).toBe(false);
  });
});
