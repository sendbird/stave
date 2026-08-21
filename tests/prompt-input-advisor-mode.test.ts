import { describe, expect, test } from "bun:test";
import {
  buildAdvisorEffortOptions,
  buildAdvisorEffortPatch,
  buildAdvisorEnabledPatch,
  buildAdvisorModelPatch,
  buildAdvisorProviderOptions,
  buildAdvisorProviderPatch,
  buildAdvisorTargetPatch,
  buildAdvisorTogglePatch,
  describeAdvisorPill,
  formatAdvisorRuntimeStatusValue,
  isAdvisorSelfAdvising,
  resolveAdvisorEffortSelection,
  resolveAdvisorSelectedProviderId,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import { resolveAdvisorArmState } from "@/lib/providers/advisor";

const CODEX_TARGET = { providerId: "codex" as const, model: "gpt-5.6-sol" };
const CLAUDE_TARGET = {
  providerId: "claude-code" as const,
  model: "claude-fable-5",
};

const CLAUDE_PRIMARY = {
  primaryProviderId: "claude-code" as const,
  primaryModel: "claude-opus-4-8",
};

function arm(args: {
  overrides?: Parameters<typeof resolveAdvisorArmState>[0]["overrides"];
  settingsTarget?: Parameters<
    typeof resolveAdvisorArmState
  >[0]["settingsTarget"];
}) {
  return resolveAdvisorArmState({
    overrides: args.overrides,
    settingsTarget: args.settingsTarget ?? null,
  });
}

describe("advisor pill options", () => {
  test("offers both providers, independent of the primary", () => {
    expect(buildAdvisorProviderOptions().map((option) => option.id)).toEqual([
      "claude-code",
      "codex",
    ]);
  });

  test("configures the armed provider", () => {
    expect(
      resolveAdvisorSelectedProviderId({
        arm: arm({ settingsTarget: CODEX_TARGET }),
        ...CLAUDE_PRIMARY,
      }),
    ).toBe("codex");
  });

  test("keeps configuring the remembered provider while disarmed", () => {
    // Turning the Advisor off must not move the picker to another provider;
    // the pick is remembered precisely so re-arming is not a fresh decision.
    expect(
      resolveAdvisorSelectedProviderId({
        arm: arm({
          overrides: { advisorEnabled: false },
          settingsTarget: CODEX_TARGET,
        }),
        ...CLAUDE_PRIMARY,
      }),
    ).toBe("codex");
  });

  test("opens on the provider that is not running the turn", () => {
    // With nothing configured, the only pick that can produce a real second
    // opinion is the other provider.
    expect(
      resolveAdvisorSelectedProviderId({
        arm: arm({ settingsTarget: null }),
        ...CLAUDE_PRIMARY,
      }),
    ).toBe("codex");
    expect(
      resolveAdvisorSelectedProviderId({
        arm: arm({ settingsTarget: null }),
        primaryProviderId: "codex",
        primaryModel: "gpt-5.6-sol",
      }),
    ).toBe("claude-code");
  });
});

describe("advisor pill presentation", () => {
  test("names the advisor provider once armed", () => {
    const presentation = describeAdvisorPill({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.label).toBe("Advisor · Codex");
    expect(presentation.tone).toBe("armed");
    expect(presentation.canToggle).toBe(true);
    expect(presentation.warning).toBeNull();
  });

  test("stays a plain toggle while off but pointed at a remembered target", () => {
    const presentation = describeAdvisorPill({
      arm: arm({
        overrides: { advisorEnabled: false },
        settingsTarget: CODEX_TARGET,
      }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.label).toBe("Advisor");
    expect(presentation.tone).toBe("off");
    expect(presentation.canToggle).toBe(true);
    expect(presentation.tooltip).toContain("Codex");
  });

  test("cannot toggle when nothing is configured to arm", () => {
    const presentation = describeAdvisorPill({
      arm: arm({ settingsTarget: null }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.canToggle).toBe(false);
    expect(presentation.tone).toBe("off");
  });

  test("warns when the advisor would consult the model running the turn", () => {
    const presentation = describeAdvisorPill({
      arm: arm({
        settingsTarget: { providerId: "claude-code", model: "claude-fable-5" },
      }),
      primaryProviderId: "claude-code",
      primaryModel: "claude-fable-5",
    });
    expect(presentation.tone).toBe("warning");
    expect(presentation.warning).toContain("same model");
  });

  test("does not warn when only the provider matches", () => {
    expect(
      describeAdvisorPill({
        arm: arm({ settingsTarget: CLAUDE_TARGET }),
        ...CLAUDE_PRIMARY,
      }).warning,
    ).toBeNull();
  });

  test("warns that an off-catalog model makes the turn skip the advisor", () => {
    const presentation = describeAdvisorPill({
      arm: arm({
        settingsTarget: {
          providerId: "claude-code",
          model: "claude-retired-1",
        },
      }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.tone).toBe("warning");
    expect(presentation.warning).toContain("skip the Advisor");
  });

  test("armed with no target reads as a warning, not as working", () => {
    const presentation = describeAdvisorPill({
      arm: arm({ overrides: { advisorEnabled: true }, settingsTarget: null }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.tone).toBe("warning");
    expect(presentation.canToggle).toBe(false);
    expect(presentation.warning).toContain("skip it");
  });

  test("promises to cancel a running consult rather than only future ones", () => {
    const presentation = describeAdvisorPill({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      ...CLAUDE_PRIMARY,
      blocking: true,
    });
    expect(presentation.tooltip).toContain("cancels the consult");
    expect(presentation.toggleAriaLabel).toContain("Cancel");
  });

  test("self-advising detection needs both provider and model to match", () => {
    expect(
      isAdvisorSelfAdvising({
        target: CLAUDE_TARGET,
        primaryProviderId: "claude-code",
        primaryModel: "claude-fable-5",
      }),
    ).toBe(true);
    expect(
      isAdvisorSelfAdvising({
        target: CLAUDE_TARGET,
        ...CLAUDE_PRIMARY,
      }),
    ).toBe(false);
    expect(isAdvisorSelfAdvising({ target: null, ...CLAUDE_PRIMARY })).toBe(
      false,
    );
  });
});

describe("advisor pill writes", () => {
  test("the switch disarms without discarding the target", () => {
    expect(
      buildAdvisorEnabledPatch({
        overrides: { codexPlanMode: true },
        arm: arm({ settingsTarget: CODEX_TARGET }),
        providerId: "codex",
        enabled: false,
      }),
    ).toEqual({ codexPlanMode: true, advisorEnabled: false });
  });

  test("the switch can arm from a cold start", () => {
    // The picker always shows a provider, model and tier, so turning it on is
    // never a blind purchase — unlike the pill toggle, which opens the menu.
    const patch = buildAdvisorEnabledPatch({
      arm: arm({ settingsTarget: null }),
      providerId: "codex",
      enabled: true,
    });
    expect(patch.advisorEnabled).toBe(true);
    expect(patch.advisorTarget?.providerId).toBe("codex");
  });

  test("switching provider leaves arming alone", () => {
    // Configuring which model would advise is a separate act from paying for
    // it, so the picker stays usable while the Advisor is off.
    const patch = buildAdvisorProviderPatch({
      overrides: { advisorEnabled: false },
      arm: arm({ settingsTarget: CODEX_TARGET }),
      providerId: "claude-code",
    });
    expect(patch.advisorEnabled).toBe(false);
    expect(patch.advisorTarget?.providerId).toBe("claude-code");
    expect(patch.advisorTarget?.model).not.toBe(CODEX_TARGET.model);
  });

  test("switching provider and back restores that provider's own model", () => {
    const overrides = buildAdvisorModelPatch({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      providerId: "claude-code",
      model: CLAUDE_TARGET.model,
    });
    const switchedAway = buildAdvisorProviderPatch({
      overrides,
      arm: arm({ overrides, settingsTarget: CODEX_TARGET }),
      providerId: "codex",
    });
    expect(switchedAway.advisorTarget?.model).toBe(CODEX_TARGET.model);
    expect(
      buildAdvisorProviderPatch({
        overrides: switchedAway,
        arm: arm({ overrides: switchedAway }),
        providerId: "claude-code",
      }).advisorTarget,
    ).toEqual(CLAUDE_TARGET);
  });

  test("a provider keeps its own pinned tier", () => {
    const overrides = buildAdvisorEffortPatch({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      providerId: "codex",
      effort: "low",
    });
    expect(overrides.advisorTargetByProvider?.codex).toEqual({
      model: CODEX_TARGET.model,
      effort: "low",
    });
    // Claude never had a tier pinned, so it must not inherit Codex's.
    expect(
      buildAdvisorProviderPatch({
        overrides,
        arm: arm({ overrides }),
        providerId: "claude-code",
      }).advisorTarget?.effort,
    ).toBeUndefined();
  });

  test("choosing a model keeps that provider's pinned tier", () => {
    const overrides = buildAdvisorEffortPatch({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      providerId: "codex",
      effort: "max",
    });
    expect(
      buildAdvisorModelPatch({
        overrides,
        arm: arm({ overrides }),
        providerId: "codex",
        model: "gpt-5.6-luna",
      }).advisorTarget,
    ).toEqual({ providerId: "codex", model: "gpt-5.6-luna", effort: "max" });
  });

  test("clearing the pin drops back to the model default", () => {
    const overrides = buildAdvisorEffortPatch({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      providerId: "codex",
      effort: "max",
    });
    expect(
      buildAdvisorEffortPatch({
        overrides,
        arm: arm({ overrides }),
        providerId: "codex",
        effort: null,
      }).advisorTarget?.effort,
    ).toBeUndefined();
  });

  test("toggling on copies the inherited target into the task", () => {
    expect(
      buildAdvisorTogglePatch({
        arm: arm({
          overrides: { advisorEnabled: false },
          settingsTarget: CODEX_TARGET,
        }),
      }),
    ).toEqual({ advisorEnabled: true, advisorTarget: CODEX_TARGET });
  });

  test("toggling off leaves the task target in place", () => {
    const overrides = { advisorEnabled: true, advisorTarget: CLAUDE_TARGET };
    expect(
      buildAdvisorTogglePatch({ overrides, arm: arm({ overrides }) }),
    ).toEqual({ advisorEnabled: false, advisorTarget: CLAUDE_TARGET });
  });

  test("a task target alone does not arm the advisor", () => {
    // Only `advisorEnabled` arms. A target without it means "remembered pick",
    // so a hand-edited or partially migrated snapshot cannot start paying for
    // an advisor the user never turned on.
    expect(
      arm({ overrides: { advisorTarget: CLAUDE_TARGET } }).effectiveTarget,
    ).toBeNull();
  });

  test("configuring a provider never arms it on its own", () => {
    const overrides = buildAdvisorModelPatch({
      arm: arm({ settingsTarget: null }),
      providerId: "codex",
      model: CODEX_TARGET.model,
    });
    expect(overrides.advisorEnabled).toBeUndefined();
    expect(arm({ overrides }).effectiveTarget).toBeNull();
  });

  test("refuses to write an armed-but-targetless state", () => {
    expect(
      buildAdvisorTogglePatch({ arm: arm({ settingsTarget: null }) }),
    ).toBeNull();
  });

  test("preserves unrelated runtime overrides on every write", () => {
    const overrides = { model: "gpt-5.6-terra", boundSecretIds: ["secret-1"] };
    expect(
      buildAdvisorTargetPatch({ overrides, target: CODEX_TARGET }),
    ).toMatchObject(overrides);
    expect(
      buildAdvisorProviderPatch({
        overrides,
        arm: arm({ settingsTarget: null }),
        providerId: "codex",
      }),
    ).toMatchObject(overrides);
  });
});

describe("advisor runtime summary", () => {
  test("shows the pair that will actually run", () => {
    expect(
      formatAdvisorRuntimeStatusValue(arm({ settingsTarget: CODEX_TARGET })),
    ).toContain("Codex");
  });

  test("reads Off whenever no advisor will run", () => {
    expect(formatAdvisorRuntimeStatusValue(arm({ settingsTarget: null }))).toBe(
      "Off",
    );
    expect(
      formatAdvisorRuntimeStatusValue(
        arm({
          overrides: { advisorEnabled: false },
          settingsTarget: CODEX_TARGET,
        }),
      ),
    ).toBe("Off");
  });
});

describe("advisor effort control", () => {
  test("the auto row names the tier it resolves to", () => {
    // "Auto" alone hides that a Codex advisor defaults to a high, slow tier on
    // a call that blocks the turn.
    expect(buildAdvisorEffortOptions(CODEX_TARGET)[0]).toEqual({
      value: null,
      label: "Auto",
      title: "Model default · X-High",
    });
  });

  test("only tiers the model accepts are offered", () => {
    const sol = buildAdvisorEffortOptions(CODEX_TARGET).map((o) => o.value);
    const luna = buildAdvisorEffortOptions({
      providerId: "codex",
      model: "gpt-5.6-luna",
    }).map((o) => o.value);
    const claude = buildAdvisorEffortOptions(CLAUDE_TARGET).map((o) => o.value);

    expect(sol).toContain("ultra");
    // Offering a tier the runtime would clamp away is a promise the UI cannot keep.
    expect(luna).not.toContain("ultra");
    expect(claude).not.toContain("ultra");
    expect(claude).toEqual([null, "low", "medium", "high", "xhigh", "max"]);
  });

  test("an unpinned target selects the auto row", () => {
    expect(resolveAdvisorEffortSelection(CODEX_TARGET)).toBeNull();
  });

  test("a clamped pin selects the tier that will run, not the one written down", () => {
    // Selecting the literal pin would leave the row with nothing highlighted at
    // exactly the moment the state needs explaining.
    const target = {
      providerId: "codex" as const,
      model: "gpt-5.6-luna",
      effort: "ultra" as const,
    };
    expect(resolveAdvisorEffortSelection(target)).toBe("max");
    expect(
      buildAdvisorEffortOptions(target).some((o) => o.value === "max"),
    ).toBe(true);
  });

  test("pinning a tier keeps the provider and model", () => {
    expect(
      buildAdvisorEffortPatch({
        arm: arm({ settingsTarget: CODEX_TARGET }),
        providerId: "codex",
        effort: "low",
      }).advisorTarget,
    ).toEqual({ ...CODEX_TARGET, effort: "low" });
  });

  test("clearing the pin removes the field rather than storing a tier", () => {
    // A stored tier would stop tracking the model default; absence is the
    // difference between "auto" and "coincidentally the same value".
    expect(
      buildAdvisorEffortPatch({
        arm: arm({
          overrides: {
            advisorEnabled: true,
            advisorTarget: { ...CODEX_TARGET, effort: "low" },
          },
        }),
        providerId: "codex",
        effort: null,
      }).advisorTarget,
    ).toEqual(CODEX_TARGET);
  });

  test("switching the model keeps the pinned tier", () => {
    expect(
      buildAdvisorModelPatch({
        arm: arm({
          overrides: {
            advisorEnabled: true,
            advisorTarget: { ...CODEX_TARGET, effort: "low" },
          },
        }),
        providerId: "codex",
        model: "gpt-5.6-terra",
      }).advisorTarget,
    ).toEqual({ providerId: "codex", model: "gpt-5.6-terra", effort: "low" });
  });

  test("a provider with no remembered pin starts unpinned", () => {
    // Tiers are per provider now, so Codex's pin must not follow the user into
    // a Claude advisor whose scale merely happens to contain the same word.
    expect(
      buildAdvisorProviderPatch({
        arm: arm({
          overrides: {
            advisorEnabled: true,
            advisorTarget: { ...CODEX_TARGET, effort: "low" },
          },
        }),
        providerId: "claude-code",
      }).advisorTarget,
    ).not.toHaveProperty("effort");
  });

  test("effort can be pinned before the Advisor is ever armed", () => {
    const empty = arm({ settingsTarget: null });
    const patch = buildAdvisorEffortPatch({
      arm: empty,
      providerId: "codex",
      effort: "low",
    });
    expect(patch.advisorTarget?.effort).toBe("low");
    // Pre-configuring is not purchasing: the turn still runs without an
    // Advisor until the switch says otherwise.
    expect(patch.advisorEnabled).toBeUndefined();
    expect(arm({ overrides: patch }).effectiveTarget).toBeNull();
  });
});

describe("advisor pill reports the effort", () => {
  test("an armed pill shows the resolved tier without opening the menu", () => {
    const presentation = describeAdvisorPill({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.effortLabel).toBe("XH");
    expect(presentation.tooltip).toContain("X-High");
    expect(presentation.note).toBeNull();
  });

  test("a clamped pin is a note, not a warning, because it still advises", () => {
    const presentation = describeAdvisorPill({
      arm: arm({
        overrides: {
          advisorEnabled: true,
          advisorTarget: {
            providerId: "codex",
            model: "gpt-5.6-luna",
            effort: "ultra",
          },
        },
      }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.tone).toBe("armed");
    expect(presentation.warning).toBeNull();
    expect(presentation.note).toContain("runs at Max");
    expect(presentation.effortLabel).toBe("Max");
  });

  test("an off-catalog model names no tier, because no call will happen", () => {
    const presentation = describeAdvisorPill({
      arm: arm({
        settingsTarget: {
          providerId: "claude-code",
          model: "claude-retired-1",
        },
      }),
      ...CLAUDE_PRIMARY,
    });
    expect(presentation.tone).toBe("warning");
    expect(presentation.effortLabel).toBeNull();
  });

  test("the tooltips teach the shortcut instead of only describing the click", () => {
    const off = describeAdvisorPill({
      arm: arm({
        overrides: { advisorEnabled: false },
        settingsTarget: CODEX_TARGET,
      }),
      ...CLAUDE_PRIMARY,
    });
    const blocking = describeAdvisorPill({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      ...CLAUDE_PRIMARY,
      blocking: true,
    });
    expect(off.tooltip).toContain("Alt+A");
    expect(blocking.tooltip).toContain("Alt+A");
    expect(blocking.tooltip).toContain("cancels the consult");
  });

  test("the runtime summary row names the tier the turn will pay for", () => {
    expect(
      formatAdvisorRuntimeStatusValue(arm({ settingsTarget: CODEX_TARGET })),
    ).toBe("Codex · GPT-5.6 Sol · X-High");
  });

  describe("an armed Advisor the model cannot reach", () => {
    const BLOCK =
      "Advisor consults reach the model through the Local MCP server. The Local MCP server is turned off in Settings → Developer.";

    test("says the armed Advisor is unreachable instead of looking healthy", () => {
      const presentation = describeAdvisorPill({
        ...CLAUDE_PRIMARY,
        arm: arm({ settingsTarget: CODEX_TARGET }),
        consultBlock: BLOCK,
      });

      expect(presentation.tone).toBe("warning");
      expect(presentation.warning).toBe(BLOCK);
      expect(presentation.tooltip).toContain("Local MCP server is turned off");
    });

    test("an uncatalogued model still wins, since it dies first", () => {
      const presentation = describeAdvisorPill({
        ...CLAUDE_PRIMARY,
        // Claude has no dynamic catalog, so an unknown Claude model is the one
        // target the renderer can prove will be skipped before any tool call.
        arm: arm({
          settingsTarget: { providerId: "claude-code", model: "claude-gone-9" },
        }),
        consultBlock: BLOCK,
      });

      expect(presentation.warning).toContain("not in the current");
    });

    test("a disarmed Advisor is not warned about", () => {
      const presentation = describeAdvisorPill({
        ...CLAUDE_PRIMARY,
        arm: arm({ overrides: { advisorEnabled: false }, settingsTarget: CODEX_TARGET }),
        consultBlock: BLOCK,
      });

      expect(presentation.tone).toBe("off");
      expect(presentation.warning).toBeNull();
    });
  });
});
