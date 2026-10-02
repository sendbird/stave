import { describe, expect, test } from "bun:test";

import {
  buildUsageHeadlineWindows,
  headlineUsagePercent,
  resolveStatusBarAccountView,
} from "../src/components/layout/status-bar-usage.utils";
import {
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountProfile,
} from "../src/lib/providers/provider-accounts";
import type {
  ClaudeUsageSnapshot,
  CodexUsageSnapshot,
  CursorUsageSnapshot,
  KiroUsageSnapshot,
} from "../src/lib/providers/provider.types";

function claudeSnapshot(
  patch: Partial<ClaudeUsageSnapshot> = {},
): ClaudeUsageSnapshot {
  return {
    source: "oauth",
    session: { usedPercent: 45, resetsAt: null },
    weekly: { usedPercent: 72, resetsAt: null },
    fableWeekly: null,
    error: null,
    ...patch,
  };
}

describe("status bar usage headline", () => {
  test("shows the weekly window alongside the 5h window", () => {
    expect(
      buildUsageHeadlineWindows({
        provider: "claude",
        claude: claudeSnapshot(),
      }),
    ).toMatchObject([
      { short: "5h", usedPercent: 45 },
      { short: "7d", usedPercent: 72 },
    ]);
  });

  test("includes the model-specific weekly window when reported", () => {
    expect(
      buildUsageHeadlineWindows({
        provider: "claude",
        claude: claudeSnapshot({
          fableWeekly: { usedPercent: 12, resetsAt: null },
        }),
      }),
    ).toHaveLength(3);
  });

  test("omits windows the snapshot does not report", () => {
    expect(
      buildUsageHeadlineWindows({
        provider: "claude",
        claude: claudeSnapshot({ session: null }),
      }),
    ).toMatchObject([{ short: "7d", usedPercent: 72 }]);
    expect(
      buildUsageHeadlineWindows({
        provider: "claude",
        claude: claudeSnapshot({
          source: "unavailable",
          error: "not signed in",
        }),
      }),
    ).toMatchObject([]);
  });

  test("keeps Codex collapsed to its first bucket", () => {
    const codex: CodexUsageSnapshot = {
      source: "rpc",
      buckets: [
        {
          limitId: "primary",
          limitName: "Plan",
          planType: "pro",
          primary: { usedPercent: 31, resetsAt: null },
          secondary: null,
          individualLimit: null,
          credits: null,
        },
      ],
      error: null,
    };
    expect(buildUsageHeadlineWindows({ provider: "codex", codex })).toMatchObject([
      { short: "", usedPercent: 31 },
    ]);
  });

  test("shows monthly Cursor and Kiro usage", () => {
    const cursor: CursorUsageSnapshot = {
      source: "dashboard",
      planType: "pro",
      monthly: {
        usedPercent: 38,
        resetsAt: null,
        used: 7.6,
        limit: 20,
      },
      buckets: [],
      error: null,
    };
    const kiro: KiroUsageSnapshot = {
      source: "acp",
      planName: "Pro",
      monthly: {
        usedPercent: 64,
        resetsAt: null,
        used: 640,
        limit: 1_000,
      },
      buckets: [],
      overagesEnabled: false,
      error: null,
    };
    expect(buildUsageHeadlineWindows({ provider: "cursor", cursor })).toMatchObject([
      { short: "", usedPercent: 38 },
    ]);
    expect(buildUsageHeadlineWindows({ provider: "kiro", kiro })).toMatchObject([
      { short: "", usedPercent: 64 },
    ]);
  });

  test("tones the dot by the window closest to its limit", () => {
    expect(
      headlineUsagePercent(
        buildUsageHeadlineWindows({
          provider: "claude",
          claude: claudeSnapshot(),
        }),
      ),
    ).toBe(72);
    expect(headlineUsagePercent([])).toBeNull();
  });
});

describe("status bar account", () => {
  const system: ProviderAccountProfile = {
    id: SYSTEM_ACCOUNT_PROFILE_ID,
    providerId: "claude-code",
    label: "System default",
    kind: "system",
  };
  const work: ProviderAccountProfile = {
    id: "11111111-1111-4111-8111-111111111111",
    providerId: "claude-code",
    label: "Work",
    kind: "managed",
  };
  const codex: ProviderAccountProfile = { ...system, providerId: "codex" };

  test("a single default account draws no switch and names nothing", () => {
    const view = resolveStatusBarAccountView({
      providerId: "claude-code",
      profiles: [system, codex],
      selectedId: SYSTEM_ACCOUNT_PROFILE_ID,
    });
    expect(view.canSwitch).toBe(false);
    expect(view.triggerLabel).toBeNull();
    expect(view.options).toEqual([system]);
  });

  test("names the account on the meter only off the default", () => {
    const profiles = [system, work, codex];
    expect(
      resolveStatusBarAccountView({
        providerId: "claude-code",
        profiles,
        selectedId: SYSTEM_ACCOUNT_PROFILE_ID,
      }),
    ).toMatchObject({ canSwitch: true, triggerLabel: null });
    expect(
      resolveStatusBarAccountView({
        providerId: "claude-code",
        profiles,
        selectedId: work.id,
      }),
    ).toMatchObject({ canSwitch: true, triggerLabel: "Work", gateway: false });
  });

  test("a gateway reads as API billing and a removed account says so", () => {
    const gateway: ProviderAccountProfile = {
      ...work,
      label: "Gateway",
      gateway: { baseUrl: "https://gateway.example", models: ["claude-opus-5-5"] } as never,
    };
    expect(
      resolveStatusBarAccountView({
        providerId: "claude-code",
        profiles: [system, gateway],
        selectedId: gateway.id,
      }),
    ).toMatchObject({ gateway: true, triggerLabel: "API billing" });
    expect(
      resolveStatusBarAccountView({
        providerId: "claude-code",
        profiles: [system],
        selectedId: work.id,
      }),
    ).toMatchObject({ selected: null, triggerLabel: "Account unavailable" });
  });
});
