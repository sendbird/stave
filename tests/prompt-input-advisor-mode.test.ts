import { describe, expect, test } from "bun:test";
import {
  buildAdvisorArmOptions,
  buildAdvisorArmPatch,
  buildAdvisorEffortOptions,
  buildAdvisorEffortPatch,
  buildAdvisorModelPatch,
  buildAdvisorTargetPatch,
  buildAdvisorTogglePatch,
  describeAdvisorPill,
  formatAdvisorRuntimeStatusValue,
  isAdvisorSelfAdvising,
  resolveAdvisorArmOptionId,
  resolveAdvisorEffortSelection,
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
  test("offers off plus both providers, independent of the primary", () => {
    expect(buildAdvisorArmOptions().map((option) => option.id)).toEqual([
      "off",
      "claude-code",
      "codex",
    ]);
  });

  test("reports the armed provider as the active option", () => {
    expect(
      resolveAdvisorArmOptionId(arm({ settingsTarget: CODEX_TARGET })),
    ).toBe("codex");
  });

  test("reports off when a task disarmed a configured default", () => {
    expect(
      resolveAdvisorArmOptionId(
        arm({
          overrides: { advisorEnabled: false },
          settingsTarget: CODEX_TARGET,
        }),
      ),
    ).toBe("off");
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
  test("selecting off disarms without discarding the target", () => {
    expect(
      buildAdvisorArmPatch({
        overrides: { codexPlanMode: true },
        arm: arm({ settingsTarget: CODEX_TARGET }),
        optionId: "off",
      }),
    ).toEqual({ codexPlanMode: true, advisorEnabled: false });
  });

  test("switching provider picks that provider's default model", () => {
    const patch = buildAdvisorArmPatch({
      arm: arm({ settingsTarget: CODEX_TARGET }),
      optionId: "claude-code",
    });
    expect(patch.advisorEnabled).toBe(true);
    expect(patch.advisorTarget?.providerId).toBe("claude-code");
    expect(patch.advisorTarget?.model).not.toBe(CODEX_TARGET.model);
  });

  test("re-selecting the armed provider keeps the chosen model", () => {
    expect(
      buildAdvisorArmPatch({
        arm: arm({ settingsTarget: CODEX_TARGET }),
        optionId: "codex",
      }).advisorTarget,
    ).toEqual(CODEX_TARGET);
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

  test("refuses to write an armed-but-targetless state", () => {
    expect(
      buildAdvisorTogglePatch({ arm: arm({ settingsTarget: null }) }),
    ).toBeNull();
  });

  test("choosing a model arms the task at that exact target", () => {
    expect(
      buildAdvisorTargetPatch({
        overrides: { advisorEnabled: false },
        target: CODEX_TARGET,
      }),
    ).toEqual({ advisorEnabled: true, advisorTarget: CODEX_TARGET });
  });

  test("preserves unrelated runtime overrides on every write", () => {
    const overrides = { model: "gpt-5.6-terra", boundSecretIds: ["secret-1"] };
    expect(
      buildAdvisorTargetPatch({ overrides, target: CODEX_TARGET }),
    ).toMatchObject(overrides);
    expect(
      buildAdvisorArmPatch({
        overrides,
        arm: arm({ settingsTarget: null }),
        optionId: "codex",
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
        effort: "low",
      }),
    ).toEqual({
      advisorEnabled: true,
      advisorTarget: { ...CODEX_TARGET, effort: "low" },
    });
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
        effort: null,
      })?.advisorTarget,
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
        model: "gpt-5.6-terra",
      })?.advisorTarget,
    ).toEqual({ providerId: "codex", model: "gpt-5.6-terra", effort: "low" });
  });

  test("switching provider keeps a tier the new provider has", () => {
    expect(
      buildAdvisorArmPatch({
        arm: arm({
          overrides: {
            advisorEnabled: true,
            advisorTarget: { ...CODEX_TARGET, effort: "low" },
          },
        }),
        optionId: "claude-code",
      }).advisorTarget?.effort,
    ).toBe("low");
  });

  test("switching provider drops a tier the new provider does not have", () => {
    expect(
      buildAdvisorArmPatch({
        arm: arm({
          overrides: {
            advisorEnabled: true,
            advisorTarget: { ...CODEX_TARGET, effort: "ultra" },
          },
        }),
        optionId: "claude-code",
      }).advisorTarget,
    ).not.toHaveProperty("effort");
  });

  test("effort patches need a target, so they cannot arm an empty Advisor", () => {
    const empty = arm({ settingsTarget: null });
    expect(buildAdvisorEffortPatch({ arm: empty, effort: "low" })).toBeNull();
    expect(buildAdvisorModelPatch({ arm: empty, model: "x" })).toBeNull();
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
