import {
  type AdvisorArmState,
  isSupportedAdvisorTarget,
  listAdvisorEffortsForProvider,
  rememberAdvisorTargetByProvider,
  resolveAdvisorEffort,
} from "@/lib/providers/advisor";
import {
  getProviderLabel,
  listCodexReasoningEffortsForModel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import {
  CODEX_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import type {
  AdvisorEffort,
  AdvisorTarget,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  ADVISOR_PICKER_SHORTCUT_LABEL,
  ADVISOR_TOGGLE_SHORTCUT_LABEL,
} from "@/lib/advisor-shortcuts";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

export interface AdvisorProviderOption {
  id: ProviderId;
  label: string;
  /** One line under the label; the card is two columns wide, so it is short. */
  summary: string;
}

/** `null` is the "follow the model's default" row, not an absent choice. */
export type AdvisorEffortOptionValue = AdvisorEffort | null;

/**
 * String stand-in for the `null` option, for radio groups that key on strings.
 * Deliberately not a member of `AdvisorEffort` so it can never be persisted as
 * a tier.
 */
export const ADVISOR_EFFORT_AUTO_VALUE = "auto";

export interface AdvisorEffortOption {
  value: AdvisorEffortOptionValue;
  /** Short form for the chip row, which has to fit seven tiers. */
  label: string;
  /** Full name plus, for the auto row, what it currently resolves to. */
  title: string;
}

/**
 * Long-form tier names come from the Codex option contract because its scale is
 * a superset of Claude's, so both providers read the same words for the same
 * tier instead of drifting apart in a second table.
 */
export function formatAdvisorEffortLabel(effort: AdvisorEffort) {
  return findOptionLabel(CODEX_EFFORT_OPTIONS, effort);
}

const ADVISOR_EFFORT_SHORT_LABELS: Readonly<Record<AdvisorEffort, string>> = {
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "XH",
  max: "Max",
  ultra: "Ultra",
};

export function formatAdvisorEffortShortLabel(effort: AdvisorEffort) {
  return ADVISOR_EFFORT_SHORT_LABELS[effort];
}

/**
 * Which row of the effort control is selected.
 *
 * A pinned tier selects the tier that will actually *run*, not the one that was
 * written down. Selecting the literal pin would leave the row with nothing
 * highlighted whenever the pin was clamped away — the state would look unset at
 * exactly the moment it needs explaining. The clamp itself is spelled out by
 * `AdvisorPillPresentation.note`.
 */
export function resolveAdvisorEffortSelection(
  target: AdvisorTarget,
): AdvisorEffortOptionValue {
  return target.effort ? resolveAdvisorEffort(target) : null;
}

/**
 * Tiers offered for a target, narrowed to what the model actually accepts.
 *
 * Offering an unsupported tier would be a promise the runtime silently clamps
 * away, so Codex models are filtered by their reported scale rather than shown
 * greyed out — this row is small enough that absence reads as clearly as a
 * disabled cell would.
 */
export function buildAdvisorEffortOptions(
  target: AdvisorTarget,
): AdvisorEffortOption[] {
  const providerEfforts = listAdvisorEffortsForProvider(target.providerId);
  const supported =
    target.providerId === "codex"
      ? providerEfforts.filter((effort) =>
          (
            listCodexReasoningEffortsForModel({
              model: target.model,
            }) as readonly string[]
          ).includes(effort),
        )
      : providerEfforts;
  const autoEffort = resolveAdvisorEffort({
    providerId: target.providerId,
    model: target.model,
  });
  return [
    {
      value: null,
      label: "Auto",
      // Naming the resolved tier is the point: "Auto" alone hides that a Codex
      // advisor defaults to a high, slow tier on a call that blocks the turn.
      title: `Model default · ${formatAdvisorEffortLabel(autoEffort)}`,
    },
    ...supported.map((effort) => ({
      value: effort,
      label: formatAdvisorEffortShortLabel(effort),
      title: formatAdvisorEffortLabel(effort),
    })),
  ];
}

export type AdvisorPillTone = "off" | "armed" | "warning";

export interface AdvisorPillPresentation {
  label: string;
  /**
   * Resolved tier shown beside the label. Non-null whenever the Advisor is
   * armed with a usable target, pinned or not — the cost of each consult
   * should not depend on opening a menu to discover it.
   */
  effortLabel: string | null;
  tone: AdvisorPillTone;
  /** Tooltip on the toggle half of the split control. */
  tooltip: string;
  /** Accessible name for the toggle half. */
  toggleAriaLabel: string;
  /**
   * False when clicking the toggle could not produce a meaningful state — no
   * target is configured anywhere, so the picker has to open instead.
   */
  canToggle: boolean;
  /** Non-null when the armed configuration will not actually advise. */
  warning: string | null;
  /**
   * Non-null when the configuration works but not literally as written — today
   * only a pinned tier the model cannot run. Kept apart from `warning` so the
   * pill does not turn amber for something that still advises correctly.
   */
  note: string | null;
}

const ADVISOR_PROVIDER_OPTIONS: readonly AdvisorProviderOption[] = [
  {
    id: "claude-code",
    label: "Claude",
    summary: "Tools disabled",
  },
  {
    id: "codex",
    label: "Codex",
    summary: "Read-only thread",
  },
] as const;

export function buildAdvisorProviderOptions() {
  return ADVISOR_PROVIDER_OPTIONS;
}

/**
 * True when the Advisor would consult the very model running the turn. Legal,
 * but the "second opinion" is the same opinion, so the composer says so instead
 * of letting the pill read as a working cross-model setup.
 */
export function isAdvisorSelfAdvising(args: {
  target: AdvisorTarget | null;
  primaryProviderId: ProviderId;
  primaryModel: string;
}) {
  if (!args.target) {
    return false;
  }
  return (
    args.target.providerId === args.primaryProviderId &&
    args.target.model === args.primaryModel
  );
}

function describeTarget(target: AdvisorTarget) {
  return `${getProviderLabel({ providerId: target.providerId })} · ${toHumanModelName(
    { model: target.model },
  )}`;
}

/**
 * Identity plus the tier the call will run at. Used wherever the user is being
 * told what a click will cost; the plain `describeTarget` stays effort-free for
 * the self-advising comparison, which is about identity only.
 */
function describeTargetRun(target: AdvisorTarget) {
  return `${describeTarget(target)} · ${formatAdvisorEffortLabel(
    resolveAdvisorEffort(target),
  )}`;
}

export function describeAdvisorPill(args: {
  arm: AdvisorArmState;
  primaryProviderId: ProviderId;
  primaryModel: string;
  /** True while this task's turn is blocked waiting on the Advisor. */
  blocking?: boolean;
  /**
   * Why consults cannot reach the model right now (Local MCP down), already
   * phrased for display. An armed Advisor whose tool never reaches the primary
   * would otherwise fail silently: no consult, no card, no explanation.
   */
  consultBlock?: string | null;
}): AdvisorPillPresentation {
  const { arm } = args;
  const selfAdvising = isAdvisorSelfAdvising({
    target: arm.target,
    primaryProviderId: args.primaryProviderId,
    primaryModel: args.primaryModel,
  });

  if (!arm.enabled) {
    return {
      label: "Advisor",
      effortLabel: null,
      tone: "off",
      tooltip: arm.target
        ? `Advisor off for this task. ${ADVISOR_TOGGLE_SHORTCUT_LABEL} lets the primary consult ${describeTargetRun(arm.target)} on demand.`
        : `Advisor off. ${ADVISOR_PICKER_SHORTCUT_LABEL} picks a model the primary may consult during this task's turns.`,
      toggleAriaLabel: arm.target
        ? `Turn the Advisor on for this task using ${describeTargetRun(arm.target)}`
        : "Choose an Advisor model for this task",
      canToggle: arm.target !== null,
      warning: null,
      note: null,
    };
  }

  if (!arm.target) {
    return {
      label: "Advisor",
      effortLabel: null,
      tone: "warning",
      tooltip:
        "Advisor is on but no model is selected, so turns run without it.",
      toggleAriaLabel: "Choose an Advisor model for this task",
      canToggle: false,
      warning: "No Advisor model is selected, so this turn will skip it.",
      note: null,
    };
  }

  const unsupported = !isSupportedAdvisorTarget(arm.target);
  const label = `Advisor · ${getProviderLabel({
    providerId: arm.target.providerId,
  })}`;
  const resolvedEffort = resolveAdvisorEffort(arm.target);
  // Ordered by how early the consult dies: an uncatalogued model is skipped
  // before the tool is ever offered, a broken Local MCP link means the tool is
  // never offered at all, and self-advising still works — it is just pointless.
  const warning = unsupported
    ? `${toHumanModelName({ model: arm.target.model })} is not in the current ${getProviderLabel(
        { providerId: arm.target.providerId },
      )} catalog, so this turn will skip the Advisor.`
    : (args.consultBlock ??
      (selfAdvising
        ? `The Advisor and this task both run ${describeTarget(arm.target)}, so the second opinion is the same model.`
        : null));
  const note =
    arm.target.effort && arm.target.effort !== resolvedEffort
      ? `${toHumanModelName({ model: arm.target.model })} does not accept ${formatAdvisorEffortLabel(
          arm.target.effort,
        )}, so the Advisor runs at ${formatAdvisorEffortLabel(resolvedEffort)}.`
      : null;

  return {
    label,
    // The unsupported case would skip the Advisor entirely, so naming a tier
    // there would describe a call that never happens.
    effortLabel: unsupported
      ? null
      : formatAdvisorEffortShortLabel(resolvedEffort),
    tone:
      unsupported || selfAdvising || args.consultBlock ? "warning" : "armed",
    tooltip: args.blocking
      ? `Consulting ${describeTargetRun(arm.target)}. ${ADVISOR_TOGGLE_SHORTCUT_LABEL} cancels the consult and turns the Advisor off for this task.`
      : args.consultBlock
        ? `${args.consultBlock} ${ADVISOR_TOGGLE_SHORTCUT_LABEL} turns the Advisor off.`
        : `Lets the primary consult ${describeTargetRun(arm.target)} on demand during this task's turns. ${ADVISOR_TOGGLE_SHORTCUT_LABEL} turns it off.`,
    toggleAriaLabel: args.blocking
      ? "Cancel the running Advisor consult and turn it off for this task"
      : "Turn the Advisor off for this task",
    canToggle: true,
    warning,
    note,
  };
}

/**
 * Writes a target as the task's pick and remembers it for its provider.
 *
 * Arming is deliberately untouched: configuring which model would advise is a
 * separate act from paying for it, so the picker stays usable while the
 * Advisor is off. The per-provider entry is what makes switching provider and
 * back non-destructive — the flat target can only hold one provider's choice.
 */
export function buildAdvisorTargetPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  target: AdvisorTarget;
}): PromptDraftRuntimeOverrides {
  const base = args.overrides ?? {};
  return {
    ...base,
    advisorTarget: args.target,
    advisorTargetByProvider: rememberAdvisorTargetByProvider({
      byProvider: base.advisorTargetByProvider,
      target: args.target,
    }),
  };
}

/**
 * Selects which provider the task would consult, restoring that provider's own
 * remembered model and tier rather than resetting it to the catalog default.
 */
export function buildAdvisorProviderPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  arm: AdvisorArmState;
  providerId: ProviderId;
}): PromptDraftRuntimeOverrides {
  return buildAdvisorTargetPatch({
    overrides: args.overrides,
    target: args.arm.targetByProvider[args.providerId],
  });
}

/**
 * Arms or disarms the Advisor against the provider the picker is showing.
 *
 * Unlike the pill toggle this can arm from a cold start, because the picker
 * always has a provider selected — the user is looking at the model and tier
 * they are about to pay for.
 */
export function buildAdvisorEnabledPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  arm: AdvisorArmState;
  providerId: ProviderId;
  enabled: boolean;
}): PromptDraftRuntimeOverrides {
  if (!args.enabled) {
    return { ...(args.overrides ?? {}), advisorEnabled: false };
  }
  return {
    ...buildAdvisorProviderPatch({
      overrides: args.overrides,
      arm: args.arm,
      providerId: args.providerId,
    }),
    advisorEnabled: true,
  };
}

/**
 * Switches a provider's model while keeping its pinned tier.
 *
 * Exists so callers cannot rebuild the target by hand and silently drop
 * `effort` — the field is optional, so losing it fails as a quiet reversion to
 * the model default rather than as a type error.
 */
export function buildAdvisorModelPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  arm: AdvisorArmState;
  providerId: ProviderId;
  model: string;
}): PromptDraftRuntimeOverrides {
  const current = args.arm.targetByProvider[args.providerId];
  return buildAdvisorTargetPatch({
    overrides: args.overrides,
    target: {
      providerId: args.providerId,
      model: args.model,
      ...(current.effort ? { effort: current.effort } : {}),
    },
  });
}

/** Pins a tier, or clears the pin back to the model default when `null`. */
export function buildAdvisorEffortPatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  arm: AdvisorArmState;
  providerId: ProviderId;
  effort: AdvisorEffortOptionValue;
}): PromptDraftRuntimeOverrides {
  const current = args.arm.targetByProvider[args.providerId];
  return buildAdvisorTargetPatch({
    overrides: args.overrides,
    target: {
      providerId: args.providerId,
      model: current.model,
      ...(args.effort ? { effort: args.effort } : {}),
    },
  });
}

/**
 * Flips arming without changing the target, for the toggle half of the pill.
 * Returns `null` when there is nothing to arm, so the caller opens the picker
 * rather than writing an armed-but-targetless state.
 */
export function buildAdvisorTogglePatch(args: {
  overrides?: PromptDraftRuntimeOverrides;
  arm: AdvisorArmState;
}): PromptDraftRuntimeOverrides | null {
  if (args.arm.enabled) {
    return { ...(args.overrides ?? {}), advisorEnabled: false };
  }
  if (!args.arm.target) {
    return null;
  }
  return {
    ...(args.overrides ?? {}),
    advisorEnabled: true,
    advisorTarget: args.arm.target,
  };
}

/** Value for the composer's runtime summary row. */
export function formatAdvisorRuntimeStatusValue(arm: AdvisorArmState) {
  if (!arm.enabled || !arm.target) {
    return "Off";
  }
  return describeTargetRun(arm.target);
}
