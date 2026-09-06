import { Users } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  buildWorkerEffortOptions,
  buildWorkerModelOptions,
  buildWorkerPresetOptions,
  describeWorkerPill,
  resolveWorkerEffortSelection,
} from "@/components/ai-elements/prompt-input-worker-mode.utils";
import {
  WORKER_PICKER_SHORTCUT_LABEL,
  WORKER_TOGGLE_SHORTCUT_LABEL,
} from "@/lib/worker-shortcuts";
import {
  DEFAULT_WORKER_PRESET_ID,
  WORKER_AUTO_VALUE,
  type WorkerArmState,
  type WorkerEffortPreference,
  type WorkerPresetId,
  type WorkerResolution,
  getWorkerPreset,
} from "@/lib/providers/worker-mode";
import { getProviderWaveTone } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  COMPOSER_OPTION_MENU_CONTENT,
  ComposerOptionCard,
  ComposerOptionEffortChips,
  ComposerOptionMenuCallout,
  ComposerOptionMenuHint,
  ComposerOptionMenuSection,
  ComposerOptionMenuSettingsLink,
  ComposerOptionMenuToggle,
  ComposerOptionModelRow,
} from "@/components/ai-elements/composer-option-menu";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { cx, sx } from "../ads/utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
import { workerModeStyles } from "./prompt-input-worker-mode.styles";

// Provider wave tone → StyleX style. `getProviderWaveTone` returns a semantic
// tone (this file consumes that contract); themed provider CSS variables and
// the ADS accent token carry the color.
const providerWaveToneStyles = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  accent: { color: vars.colorAccent },
});

/**
 * Composer control for Worker mode, beside the Advisor.
 *
 * One button opens the complete Worker surface: its switch arms delegation,
 * then preset → model → effort follows the configuration dependency order.
 * Keeping the state and options together avoids a second chevron button in the
 * compact side shelf.
 */
export function PromptInputWorkerPill(args: {
  arm: WorkerArmState;
  /** Semantic resolution for the active primary. Drives every label and warning. */
  resolution: WorkerResolution;
  primaryProviderId: ProviderId;
  primaryModel: string;
  runtimeModels?: readonly string[];
  /** Local MCP delivery failure for providers using the ACP Worker adapter. */
  executionBlock?: string | null;
  disabled?: boolean;
  /**
   * Picker visibility, controlled by the host. The pill can be demoted to the
   * `⋯` tray or hidden entirely, so `Alt+Shift+W` has to be able to open the
   * picker on a pill that is not currently mounted — which means the host owns
   * both this flag and the keyboard listener that sets it.
   */
  open: boolean;
  onToggle: () => void;
  onSelectPreset: (presetId: WorkerPresetId) => void;
  onSelectModel: (model: string) => void;
  onSelectEffort: (effort: WorkerEffortPreference) => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const open = args.open;
  const presentation = describeWorkerPill({
    arm: args.arm,
    resolution: args.resolution,
    primaryProviderId: args.primaryProviderId,
    primaryModel: args.primaryModel,
  });
  const { onOpenChange, onToggle } = args;
  const presetId = args.arm.config.presetId ?? DEFAULT_WORKER_PRESET_ID;
  const requestedModel = args.arm.config.model ?? WORKER_AUTO_VALUE;
  // Effort options depend on the model the turn would actually use, not on the
  // preference string — `Auto` has to expand before the scale is knowable.
  const effectiveWorkerModel =
    args.resolution.status === "ready"
      ? args.resolution.profile.resolvedWorkerModel
      : getWorkerPreset(presetId).autoModel[args.primaryProviderId];
  const effortOptions = buildWorkerEffortOptions({
    providerId: args.primaryProviderId,
    workerModel: effectiveWorkerModel,
    presetId,
  });
  const effortSelection = resolveWorkerEffortSelection(args.arm.config);

  const isWarningTone = presentation.tone === "warning";
  const waveToneStyle =
    presentation.tone === "armed"
      ? providerWaveToneStyles[
          getProviderWaveTone({ providerId: args.primaryProviderId })
        ]
      : undefined;

  return (
    <Popover open={open} onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={args.disabled}
                  aria-label={`Configure Worker mode · ${presentation.label}`}
                  {...composerControlAttributes}
                  data-worker-control="true"
                  data-testid="worker-mode-pill"
                  data-worker-tone={presentation.tone}
                  className={cx(
                    COMPOSER_CONTROL_BUTTON,
                    args.className,
                    sx(
                      presentation.tone === "off"
                        ? workerModeStyles.pillOff
                        : workerModeStyles.pillActive,
                    ),
                  )}
                />
              }
            />
          }
        >
          <Users
            className={sx(
              workerModeStyles.icon,
              isWarningTone && workerModeStyles.iconWarning,
              waveToneStyle,
            )}
          />
          <ComposerControlLabel>
            {presentation.label}
            {presentation.effortLabel ? (
              <span
                data-testid="worker-mode-effort"
                className={sx(workerModeStyles.effortBadge)}
              >
                {presentation.effortLabel}
              </span>
            ) : null}
          </ComposerControlLabel>
        </TooltipTrigger>
        <TooltipContent side="top" className={sx(workerModeStyles.tooltip)}>
          {presentation.tooltip} Open to enable or configure Worker mode.
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className={sx(workerModeStyles.popover)}
        xstyle={COMPOSER_OPTION_MENU_CONTENT}
        data-testid="worker-mode-options"
      >
        <ComposerOptionMenuToggle
          id="worker-mode-switch"
          title="Worker mode"
          description="Primary plans and reviews; the worker implements."
          checked={args.arm.enabled}
          onCheckedChange={onToggle}
          testId="worker-mode-switch"
        />

        {/* Configuration stays editable while Worker mode is off: setting a
              task up before turning it on is the normal order, and gating the
              rows behind the switch made the menu look empty at exactly the
              moment the user came to fill it in. */}
        <ComposerOptionMenuSection title="Preset" scroll>
          {buildWorkerPresetOptions().map((option) => (
            <ComposerOptionCard
              key={option.id}
              label={option.label}
              summary={option.summary}
              active={presetId === option.id}
              onSelect={() => {
                args.onSelectPreset(option.id);
              }}
              testId={`worker-mode-preset-${option.id}`}
            />
          ))}
        </ComposerOptionMenuSection>

        <ComposerOptionMenuSection title="Worker model" scroll>
          {buildWorkerModelOptions({
            providerId: args.primaryProviderId,
            presetId,
            runtimeModels: args.runtimeModels,
            selectedModel: requestedModel,
          }).map((option) => (
            <ComposerOptionModelRow
              key={option.value}
              label={option.label}
              description={option.description}
              icon={
                option.value === WORKER_AUTO_VALUE ? (
                  <span className={sx(workerModeStyles.modelFallbackIcon)}>
                    A
                  </span>
                ) : (
                  <ModelIcon
                    providerId={args.primaryProviderId}
                    model={option.value}
                    className={sx(workerModeStyles.modelIconSize)}
                  />
                )
              }
              active={requestedModel === option.value}
              onSelect={() => {
                args.onSelectModel(option.value);
              }}
              testId={`worker-mode-model-${option.value}`}
            />
          ))}
        </ComposerOptionMenuSection>

        {effortOptions.length > 0 ? (
          <ComposerOptionMenuSection
            title="Worker effort"
            testId="worker-mode-effort-row"
          >
            <ComposerOptionEffortChips
              options={effortOptions}
              selected={effortSelection}
              onSelect={(value) => {
                args.onSelectEffort(value);
              }}
              testId={(value) => `worker-mode-effort-${value}`}
            />
            <ComposerOptionMenuHint>
              Higher effort allows more reasoning and can take longer.
            </ComposerOptionMenuHint>
          </ComposerOptionMenuSection>
        ) : (
          <ComposerOptionMenuHint testId="worker-mode-effort-unavailable">
            This worker model has no selectable effort; it runs at its own
            default.
          </ComposerOptionMenuHint>
        )}

        {presentation.note ? (
          <ComposerOptionMenuCallout tone="note" testId="worker-mode-note">
            {presentation.note}
          </ComposerOptionMenuCallout>
        ) : null}

        {args.executionBlock || presentation.warning ? (
          <ComposerOptionMenuCallout
            tone="warning"
            testId="worker-mode-warning"
          >
            {args.executionBlock ?? presentation.warning}
          </ComposerOptionMenuCallout>
        ) : null}

        <ComposerOptionMenuHint>
          Applies to this task only, and is remembered per provider. One
          foreground worker runs at a time and the primary reviews its work
          before answering.{" "}
          <span className={sx(workerModeStyles.nowrap)}>
            {WORKER_TOGGLE_SHORTCUT_LABEL} toggles
          </span>
          ,{" "}
          <span className={sx(workerModeStyles.nowrap)}>
            {WORKER_PICKER_SHORTCUT_LABEL} opens this menu
          </span>
          .
        </ComposerOptionMenuHint>
        <ComposerOptionMenuSettingsLink
          section="providers"
          testId="worker-mode-open-settings"
        >
          Default arming, instructions, and turn caps live in Settings →
          Providers → Worker mode.
        </ComposerOptionMenuSettingsLink>
      </PopoverContent>
    </Popover>
  );
}
