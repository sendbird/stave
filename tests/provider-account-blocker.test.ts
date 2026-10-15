import { describe, expect, test } from "bun:test";
import { selectComposerShelfRows } from "@/components/session/composer-shelf/composer-shelf.utils";
import { classifyProviderAccountFailure } from "@/lib/providers/provider-error-recovery";
import {
  describeProviderAccountBlocker,
  providerAccountBlockerActionLabel,
  resolveProviderAccountBlocker,
} from "@/lib/providers/provider-account-blocker";
import type { ToolingStatusEntry } from "@/lib/tooling-status";

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
    expect(resolveProviderAccountBlocker({ ...base, providerId: "opencode", available: false })).toBeNull();
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
    expect(classifyProviderAccountFailure("[error] Selected model is at capacity. (status: 503)")).toBeNull();
  });
});
