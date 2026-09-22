import { describe, expect, test } from "bun:test";
import { emptyRateLimitsSnapshot } from "@/lib/providers/account-usage-block";
import { buildStarterProfile } from "@/lib/providers/auto-routing-profile";
import type {
  ProviderId,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import { defaultSettings } from "@/store/app-settings";
import { resolveAutoRoutingForSend } from "@/store/auto-routing-dispatch";
import { resolveRoutingProviderAvailability } from "@/store/auto-routing";

const RESETS_AT = Math.floor(Date.now() / 1000) + 3600;

/** Provider switching stays OFF everywhere here: failover must not need it. */
const PROFILE = (() => {
  const starter = buildStarterProfile("starter-balanced");
  return {
    ...starter,
    signals: { ...starter.signals, classifier: false, providerSwitch: false },
  };
})();

const AVAILABILITY: Record<ProviderId, boolean> = {
  "claude-code": true,
  codex: true,
  cursor: false,
  kiro: false,
};

function codexUsage(usedPercent: number): RateLimitsSnapshotResponse["codex"] {
  return {
    source: "rpc",
    error: null,
    buckets: [
      {
        limitId: "codex",
        limitName: null,
        planType: null,
        primary: { usedPercent, windowDurationMins: 300, resetsAt: RESETS_AT },
        secondary: null,
        individualLimit: null,
        credits: null,
      },
    ],
  };
}

function claudeUsage(args: {
  session?: number;
  weekly?: number;
  fableWeekly?: number;
}): RateLimitsSnapshotResponse["claude"] {
  const window = (usedPercent: number | undefined) =>
    usedPercent == null ? null : { usedPercent, resetsAt: RESETS_AT };
  return {
    source: "cli",
    error: null,
    session: window(args.session),
    weekly: window(args.weekly),
    fableWeekly: window(args.fableWeekly),
  } as RateLimitsSnapshotResponse["claude"];
}

function snapshot(
  patch: Partial<RateLimitsSnapshotResponse>,
): RateLimitsSnapshotResponse {
  return { ...emptyRateLimitsSnapshot(), ...patch };
}

async function routeWith(rateLimitsSnapshot: RateLimitsSnapshotResponse | null) {
  return resolveAutoRoutingForSend({
    taskId: `usage-failover-${crypto.randomUUID()}`,
    state: {
      settings: {
        ...defaultSettings,
        autoRoutingEnabled: true,
        autoRoutingAllowProviderSwitch: false,
        autoRoutingProfile: PROFILE,
      },
      providerAvailability: AVAILABILITY,
      rateLimitsSnapshot,
    } as never,
    promptDraft: {
      text: "refactor the payment module",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: { autoRouting: true },
    } as never,
    provider: "codex",
    activeModel: "gpt-5.6-sol",
    prompt: "refactor the payment module",
    history: [],
    fileContextCount: 0,
    workspaceCwd: "/tmp/usage-failover",
  });
}

describe("Auto routing failover when an account is exhausted", () => {
  test("an exhausted Codex account routes to the other provider even with provider switching off", async () => {
    const decision = await routeWith(snapshot({ codex: codexUsage(100) }));
    expect(decision?.providerId).toBe("claude-code");
  });

  test("a Codex account with headroom stays pinned to Codex", async () => {
    const decision = await routeWith(snapshot({ codex: codexUsage(40) }));
    expect(decision?.providerId).toBe("codex");
  });

  test("every provider exhausted still produces a route for the usage guard to reject", async () => {
    const decision = await routeWith(
      snapshot({
        codex: codexUsage(100),
        claude: claudeUsage({ session: 100, weekly: 100 }),
      }),
    );
    // No provider can run the turn, so Auto must not fail to resolve — the
    // account-usage guard is what reports the block and its reset time.
    expect(decision?.providerId).toBe("codex");
  });
});

describe("resolveRoutingProviderAvailability", () => {
  test("drops only the exhausted provider", () => {
    expect(
      resolveRoutingProviderAvailability({
        profile: PROFILE,
        providerAvailability: AVAILABILITY,
        rateLimitsSnapshot: snapshot({ codex: codexUsage(100) }),
      }),
    ).toMatchObject({ codex: false, "claude-code": true });
  });

  test("an exhausted model-specific window does not retire the whole provider", () => {
    // Fable's weekly window binds one model family; Sonnet and Opus remain
    // routable, so Claude must stay a candidate.
    const availability = resolveRoutingProviderAvailability({
      profile: PROFILE,
      providerAvailability: AVAILABILITY,
      rateLimitsSnapshot: snapshot({
        claude: claudeUsage({ session: 10, weekly: 10, fableWeekly: 100 }),
      }),
    });
    expect(availability?.["claude-code"]).not.toBe(false);
  });

  test("no snapshot leaves availability untouched", () => {
    expect(
      resolveRoutingProviderAvailability({
        profile: PROFILE,
        providerAvailability: AVAILABILITY,
        rateLimitsSnapshot: null,
      }),
    ).toBe(AVAILABILITY);
  });

  test("an already-unavailable provider is not counted as remaining headroom", () => {
    // Codex exhausted and Claude uninstalled: nothing is routable, so the
    // usage filter is dropped rather than leaving zero candidates.
    expect(
      resolveRoutingProviderAvailability({
        profile: PROFILE,
        providerAvailability: { ...AVAILABILITY, "claude-code": false },
        rateLimitsSnapshot: snapshot({ codex: codexUsage(100) }),
      }),
    ).toMatchObject({ codex: true });
  });
});
