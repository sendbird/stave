/**
 * Per-control placement for the prompt input toolbar.
 *
 * The toolbar's left cluster grew to ten controls with nothing but `flex-wrap`
 * holding it together, so this lets a user demote the ones they never touch
 * into a `⋯` tray — or drop them entirely — without the codebase sprouting a
 * new `showXVisible` boolean per control (which is how `codexFastModeVisible`
 * happened).
 */

export const COMPOSER_CONTROL_IDS = [
  "plan",
  "providerMode",
  "thinking",
  "fast",
  "advisor",
  "worker",
  "review",
  "secrets",
  "compare",
  "runtime",
] as const;

export type ComposerControlId = (typeof COMPOSER_CONTROL_IDS)[number];

/**
 * `toolbar` is the default for every control, so an unset entry means "as it
 * shipped" and the persisted map stays sparse — a control added later defaults
 * to visible without a migration.
 */
export const COMPOSER_CONTROL_PLACEMENTS = [
  "toolbar",
  "overflow",
  "hidden",
] as const;

export type ComposerControlPlacement =
  (typeof COMPOSER_CONTROL_PLACEMENTS)[number];

export const DEFAULT_COMPOSER_CONTROL_PLACEMENT: ComposerControlPlacement =
  "toolbar";

export type ComposerControlPlacements = Partial<
  Record<ComposerControlId, ComposerControlPlacement>
>;

export const COMPOSER_CONTROL_LABELS: Record<ComposerControlId, string> = {
  plan: "Plan",
  providerMode: "Provider mode",
  thinking: "Thinking",
  fast: "Fast mode",
  advisor: "Advisor",
  worker: "Worker",
  review: "Review",
  secrets: "Secrets",
  compare: "Compare",
  runtime: "Runtime",
};

export const COMPOSER_CONTROL_DESCRIPTIONS: Record<ComposerControlId, string> =
  {
    plan: "Toggle plan mode before sending.",
    providerMode: "Manual, Guided, or Auto permission preset.",
    thinking: "Cycle extended thinking. Claude only.",
    fast: "Fast toggle inside the model picker. Codex only.",
    advisor: "Arm a second model to review the prompt before it runs.",
    worker: "Delegate bounded implementation work to a cheaper same-provider model.",
    review: "Review uncommitted local changes.",
    secrets: "Bind secrets into this run's environment.",
    compare: "Run the prompt in two candidate workspaces.",
    runtime: "Effective sandbox, approval, and timeout values.",
  };

/**
 * Fast lives inside the model/effort popover rather than the toolbar row, so
 * there is no tray position for it to move to — it is shown or it is not.
 */
const COMPOSER_CONTROLS_WITHOUT_OVERFLOW = new Set<ComposerControlId>(["fast"]);

export function composerControlSupportsOverflow(
  id: ComposerControlId,
): boolean {
  return !COMPOSER_CONTROLS_WITHOUT_OVERFLOW.has(id);
}

export function composerControlPlacementOptions(
  id: ComposerControlId,
): readonly ComposerControlPlacement[] {
  return composerControlSupportsOverflow(id)
    ? COMPOSER_CONTROL_PLACEMENTS
    : (["toolbar", "hidden"] as const);
}

/**
 * Controls that render as a bare icon. That reads fine in a horizontal toolbar
 * where position carries meaning, but in the vertical tray it is an unlabelled
 * glyph, so the tray pairs these with a visible caption.
 */
const ICON_ONLY_COMPOSER_CONTROLS = new Set<ComposerControlId>(["runtime"]);

export function composerControlIsIconOnly(id: ComposerControlId): boolean {
  return ICON_ONLY_COMPOSER_CONTROLS.has(id);
}

const CONTROL_ID_SET = new Set<string>(COMPOSER_CONTROL_IDS);
const PLACEMENT_SET = new Set<string>(COMPOSER_CONTROL_PLACEMENTS);

export function normalizeComposerControlPlacements(
  value: unknown,
): ComposerControlPlacements {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: ComposerControlPlacements = {};
  for (const [id, placement] of Object.entries(value)) {
    if (!CONTROL_ID_SET.has(id) || typeof placement !== "string") {
      continue;
    }
    if (!PLACEMENT_SET.has(placement)) {
      continue;
    }

    const controlId = id as ComposerControlId;
    // A control that cannot live in the tray degrades to visible rather than
    // vanishing, because "overflow" for it resolves to no rendered position.
    const resolved =
      placement === "overflow" && !composerControlSupportsOverflow(controlId)
        ? "toolbar"
        : (placement as ComposerControlPlacement);

    if (resolved === DEFAULT_COMPOSER_CONTROL_PLACEMENT) {
      continue;
    }
    normalized[controlId] = resolved;
  }
  return normalized;
}

/**
 * Which controls are holding a state that costs money or changes what the next
 * turn does. These are pulled back onto the toolbar regardless of placement —
 * hiding a control must not hide the fact that it is doing something.
 */
export function collectActiveComposerControls(args: {
  planMode?: boolean;
  thinkingMode?: "adaptive" | "enabled" | "disabled" | null;
  fastMode?: boolean;
  advisorArmed?: boolean;
  workerArmed?: boolean;
  runtimeTone?: "default" | "custom" | "warning";
  boundSecretCount?: number;
}): ComposerControlId[] {
  const active: ComposerControlId[] = [];
  if (args.planMode) {
    active.push("plan");
  }
  // "disabled" is as deliberate a deviation as "enabled"; only adaptive is rest.
  if (args.thinkingMode === "enabled" || args.thinkingMode === "disabled") {
    active.push("thinking");
  }
  if (args.fastMode) {
    active.push("fast");
  }
  if (args.advisorArmed) {
    active.push("advisor");
  }
  if (args.workerArmed) {
    active.push("worker");
  }
  if ((args.boundSecretCount ?? 0) > 0) {
    active.push("secrets");
  }
  if (args.runtimeTone && args.runtimeTone !== "default") {
    active.push("runtime");
  }
  return active;
}

export interface ComposerControlLayout {
  toolbar: ComposerControlId[];
  overflow: ComposerControlId[];
  hidden: ComposerControlId[];
  /** Configured away but pulled back because they are currently active. */
  forced: ComposerControlId[];
  placementById: Record<ComposerControlId, ComposerControlPlacement>;
}

export function resolveComposerControlLayout(args: {
  placements: ComposerControlPlacements;
  activeIds?: readonly ComposerControlId[];
  /**
   * Controls with nothing to render this frame (no review models, no runtime
   * rows, provider without a plan handler). They are excluded everywhere so the
   * tray does not advertise a control that would render as a blank row.
   */
  unavailableIds?: readonly ComposerControlId[];
}): ComposerControlLayout {
  const placements = normalizeComposerControlPlacements(args.placements);
  const active = new Set(args.activeIds ?? []);
  const unavailable = new Set(args.unavailableIds ?? []);

  const layout: ComposerControlLayout = {
    toolbar: [],
    overflow: [],
    hidden: [],
    forced: [],
    placementById: {} as Record<ComposerControlId, ComposerControlPlacement>,
  };

  for (const id of COMPOSER_CONTROL_IDS) {
    const configured = placements[id] ?? DEFAULT_COMPOSER_CONTROL_PLACEMENT;
    layout.placementById[id] = configured;

    if (unavailable.has(id)) {
      continue;
    }

    if (configured !== "toolbar" && active.has(id)) {
      layout.forced.push(id);
      layout.toolbar.push(id);
      continue;
    }

    layout[configured].push(id);
  }

  return layout;
}
