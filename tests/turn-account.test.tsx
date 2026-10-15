import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TurnModelTooltip } from "@/components/session/TurnModelTooltip";
import {
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountProfile,
} from "@/lib/providers/provider-accounts";
import {
  describeTurnAccountDetail,
  findTurnAccountProfile,
  resolveTurnAccountRef,
  shouldShowTurnAccountInline,
} from "@/lib/providers/turn-account";

const WORK_ID = "0b4f7b52-5d0f-4a51-9c39-6d2f0b9e4a11";
const GATEWAY_ID = "6c0f2d1e-1b7a-4f3e-8a4c-2f9d5e7b8c90";

const profiles: ProviderAccountProfile[] = [
  { id: SYSTEM_ACCOUNT_PROFILE_ID, providerId: "claude-code", label: "System default", kind: "system" },
  { id: WORK_ID, providerId: "claude-code", label: "Work", kind: "managed" },
  { id: SYSTEM_ACCOUNT_PROFILE_ID, providerId: "codex", label: "System default", kind: "system" },
];

describe("resolveTurnAccountRef", () => {
  test("uses the account stamped on the turn", () => {
    expect(
      resolveTurnAccountRef({
        providerId: "claude-code",
        nativeAccountProfileId: WORK_ID,
        nativeProviderTurnId: "turn-1",
      }),
    ).toEqual({ providerId: "claude-code", profileId: WORK_ID });
  });

  test("reads an unstamped turn that reached the provider as System default", () => {
    expect(
      resolveTurnAccountRef({ providerId: "codex", nativeProviderSessionId: "thread-1" }),
    ).toEqual({ providerId: "codex", profileId: SYSTEM_ACCOUNT_PROFILE_ID });
  });

  test("stays unknown for a turn that never reached the provider", () => {
    expect(resolveTurnAccountRef({ providerId: "claude-code" })).toBeUndefined();
  });

  test("has no account for providers without Stave accounts", () => {
    for (const providerId of ["cursor", "kiro", "user"] as const) {
      expect(
        resolveTurnAccountRef({
          providerId,
          nativeAccountProfileId: WORK_ID,
          nativeProviderTurnId: "turn-1",
        }),
      ).toBeUndefined();
    }
  });
});

describe("turn account lookup", () => {
  test("matches provider and id together", () => {
    expect(
      findTurnAccountProfile(profiles, { providerId: "codex", profileId: SYSTEM_ACCOUNT_PROFILE_ID })?.providerId,
    ).toBe("codex");
    expect(findTurnAccountProfile(profiles, { providerId: "codex", profileId: WORK_ID })).toBeUndefined();
  });

  test("names the account inline only when the provider has more than one", () => {
    expect(shouldShowTurnAccountInline(profiles, "claude-code")).toBe(true);
    expect(shouldShowTurnAccountInline(profiles, "codex")).toBe(false);
  });
});

describe("describeTurnAccountDetail", () => {
  const work = profiles[1];

  test("names who the account is signed in as", () => {
    expect(
      describeTurnAccountDetail(work, { state: "signed-in", email: "me@example.com", plan: "Max", checkedAt: 1 }),
    ).toBe("me@example.com · Max");
    expect(
      describeTurnAccountDetail(work, { state: "signed-in", email: null, plan: null, checkedAt: 1 }),
    ).toBeNull();
  });

  test("flags a signed-out account and stays quiet when the check failed", () => {
    expect(describeTurnAccountDetail(work, { state: "signed-out", checkedAt: 1 })).toBe("Not signed in");
    expect(describeTurnAccountDetail(work, { state: "unknown", reason: "failed", checkedAt: 1 })).toBeNull();
  });

  test("has nothing to say about a removed account", () => {
    expect(describeTurnAccountDetail(undefined, undefined)).toBeNull();
  });
});

describe("TurnModelTooltip", () => {
  test("shows the model alone without an account", () => {
    const html = renderToStaticMarkup(<TurnModelTooltip modelLabel="Cursor Auto" />);
    expect(html).toContain("Cursor Auto");
    expect(html).not.toContain("data-turn-account-name");
  });

  test("shows the account name while its sign-in is checked", () => {
    const html = renderToStaticMarkup(
      <TurnModelTooltip
        modelLabel="Claude Opus 4.8 · High"
        account={{ ref: { providerId: "claude-code", profileId: WORK_ID }, profile: profiles[1] }}
      />,
    );
    expect(html).toContain("Claude Opus 4.8 · High");
    expect(html).toContain("Account: Work");
    expect(html).toContain("Checking sign-in");
  });

  test("says when the account was removed and skips the sign-in line", () => {
    const html = renderToStaticMarkup(
      <TurnModelTooltip
        modelLabel="GPT-5"
        account={{ ref: { providerId: "codex", profileId: WORK_ID }, profile: undefined }}
      />,
    );
    expect(html).toContain("Account: Removed account");
    expect(html).not.toContain("data-turn-account-detail");
  });

  test("marks an API connection entry as API billing", () => {
    const html = renderToStaticMarkup(
      <TurnModelTooltip
        modelLabel="Claude Sonnet"
        account={{
          ref: { providerId: "claude-code", profileId: GATEWAY_ID },
          profile: {
            id: GATEWAY_ID,
            providerId: "claude-code",
            label: "Team gateway",
            kind: "external",
            gateway: {} as never,
          },
        }}
      />,
    );
    expect(html).toContain("Account: Team gateway");
    expect(html).toContain("API billing");
  });
});
