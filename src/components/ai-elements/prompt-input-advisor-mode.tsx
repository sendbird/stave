import { ArrowLeftRight } from "lucide-react";
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
  type AdvisorEffortOptionValue,
  buildAdvisorEffortOptions,
  buildAdvisorProviderOptions,
  describeAdvisorPill,
  resolveAdvisorEffortSelection,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import {
  ADVISOR_PICKER_SHORTCUT_LABEL,
  ADVISOR_TOGGLE_SHORTCUT_LABEL,
} from "@/lib/advisor-shortcuts";
import type { AdvisorArmState } from "@/lib/providers/advisor";
import {
  getProviderLabel,
  getProviderWaveToneClass,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type {
  ManagedExecutionProviderId,
  ProviderId,
} from "@/lib/providers/provider.types";
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
import { cn } from "@/lib/utils";

/**
 * Composer control for arming the Advisor per task, next to the plan and
 * thinking toggles rather than behind Settings.
 *
 * One button opens one configuration surface. The switch in that surface arms
 * the Advisor and the remaining rows choose provider, model, and effort. This
 * keeps the side shelf icon-sized without separating one object into a toggle
 * and an adjacent chevron.
 */
export function PromptInputAdvisorPill(args: {
  arm: AdvisorArmState;
  primaryProviderId: ProviderId;
  primaryModel: string;
  /** Provider the picker configures, armed or not. Resolved by the host. */
  selectedProviderId: ManagedExecutionProviderId;
  /** Selectable models for {@link selectedProviderId}. */
  advisorModelOptions: readonly string[];
  /** True while this task's turn is blocked waiting on the Advisor. */
  blocking?: boolean;
  disabled?: boolean;
  /**
   * Picker visibility, controlled by the host. The pill can be demoted to the
   * `⋯` tray or hidden entirely, so `Alt+Shift+A` has to be able to open the
   * picker on a pill that is not currently mounted — which means the host owns
   * both this flag and the keyboard listener that sets it.
   */
  open: boolean;
  onSetEnabled: (enabled: boolean) => void;
  onSelectProvider: (providerId: ManagedExecutionProviderId) => void;
  onSelectModel: (model: string) => void;
  onSelectEffort: (effort: AdvisorEffortOptionValue) => void;
  /** Fires on open so the host can lazily load a provider model catalog. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Set when consults cannot reach the model because the Local MCP link is
   * down. Armed-but-unreachable is the one failure the Advisor cannot report
   * itself: no tool is offered, so no consult, card or trace is ever produced.
   */
  consultBlock?: string | null;
  className?: string;
}) {
  const open = args.open;
  const presentation = describeAdvisorPill({
    arm: args.arm,
    primaryProviderId: args.primaryProviderId,
    primaryModel: args.primaryModel,
    blocking: args.blocking,
    consultBlock: args.consultBlock,
  });
  const selectedProviderId = args.selectedProviderId;
  // The picker always has something to show, armed or not: an unarmed provider
  // falls back to its remembered pick and then to its catalog default.
  const selectedTarget = args.arm.targetByProvider[selectedProviderId];
  const effortSelection = resolveAdvisorEffortSelection(selectedTarget);
  const { onOpenChange, onSetEnabled } = args;

  const iconToneClass =
    presentation.tone === "warning"
      ? "text-warning"
      : presentation.tone === "armed" && args.arm.target
        ? getProviderWaveToneClass({
            providerId: args.arm.target.providerId,
          })
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
                    aria-label={`Configure Advisor · ${presentation.label}`}
                    {...composerControlAttributes}
                    data-advisor-control="true"
                    data-testid="advisor-mode-pill"
                    data-advisor-tone={presentation.tone}
                    className={cn(
                      COMPOSER_CONTROL_BUTTON,
                      args.className,
                      presentation.tone === "off"
                        ? "text-muted-foreground hover:text-foreground"
                        : "font-medium text-foreground",
                    )}
                  />
                }
              />
            }
          >
            <ArrowLeftRight className={cn("size-4 shrink-0", iconToneClass)} />
            <ComposerControlLabel>
              {presentation.label}
              {presentation.effortLabel ? (
                <span
                  data-testid="advisor-mode-effort"
                  className="shrink-0 rounded bg-muted/70 px-1 text-[10px] leading-4 font-medium text-muted-foreground"
                >
                  {presentation.effortLabel}
                </span>
              ) : null}
              {args.consultBlock ? (
                <span
                  data-testid="advisor-mode-unreachable"
                  className="shrink-0 rounded bg-warning/10 px-1 text-[10px] leading-4 font-medium text-warning dark:bg-warning/15"
                >
                  Unreachable
                </span>
              ) : null}
            </ComposerControlLabel>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72">
            {presentation.tooltip} Open to enable or configure Advisor.
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          className={cn("w-[23rem]", COMPOSER_OPTION_MENU_CONTENT)}
          data-testid="advisor-mode-options"
        >
          <ComposerOptionMenuToggle
            id="advisor-mode-switch"
            title="Advisor"
            description={`The primary may consult ${getProviderLabel({ providerId: selectedProviderId })} · ${toHumanModelName({ model: selectedTarget.model })} on demand.`}
            checked={args.arm.enabled}
            onCheckedChange={(checked) => onSetEnabled(checked)}
            testId="advisor-mode-switch"
          />

          <ComposerOptionMenuSection title="Advisor provider">
            <div className="grid grid-cols-2 gap-1">
              {buildAdvisorProviderOptions().map((option) => (
                <ComposerOptionCard
                  key={option.id}
                  label={option.label}
                  summary={option.summary}
                  icon={
                    <ModelIcon
                      providerId={option.id}
                      className="size-4 shrink-0 self-start"
                    />
                  }
                  active={selectedProviderId === option.id}
                  onSelect={() => {
                    args.onSelectProvider(option.id);
                  }}
                  testId={`advisor-mode-provider-${option.id}`}
                />
              ))}
            </div>
          </ComposerOptionMenuSection>

          <ComposerOptionMenuSection title="Advisor model" scroll>
            {args.advisorModelOptions.map((model) => (
              <ComposerOptionModelRow
                key={model}
                label={toHumanModelName({ model })}
                icon={
                  <ModelIcon
                    providerId={selectedProviderId}
                    model={model}
                    className="size-3.5"
                  />
                }
                active={selectedTarget.model === model}
                onSelect={() => {
                  args.onSelectModel(model);
                }}
                testId={`advisor-mode-model-${model}`}
              />
            ))}
          </ComposerOptionMenuSection>

          <ComposerOptionMenuSection
            title="Advisor effort"
            testId="advisor-mode-effort-row"
          >
            <ComposerOptionEffortChips
              options={buildAdvisorEffortOptions(selectedTarget)}
              selected={effortSelection}
              onSelect={(value) => {
                args.onSelectEffort(value);
              }}
              testId={(value) => `advisor-mode-effort-${value ?? "auto"}`}
            />
            <ComposerOptionMenuHint>
              Higher tiers give better advice and make the turn wait longer.
            </ComposerOptionMenuHint>
          </ComposerOptionMenuSection>

          {presentation.note ? (
            <ComposerOptionMenuCallout tone="note" testId="advisor-mode-note">
              {presentation.note}
            </ComposerOptionMenuCallout>
          ) : null}

          {presentation.warning ? (
            <ComposerOptionMenuCallout
              tone="warning"
              testId="advisor-mode-warning"
            >
              {presentation.warning}
            </ComposerOptionMenuCallout>
          ) : null}

          <ComposerOptionMenuHint>
            Applies to this task only. The primary model may consult the
            read-only Advisor on demand during its turn; every consult is one
            extra model call it waits on.{" "}
            <span className="whitespace-nowrap">
              {ADVISOR_TOGGLE_SHORTCUT_LABEL} toggles
            </span>
            ,{" "}
            <span className="whitespace-nowrap">
              {ADVISOR_PICKER_SHORTCUT_LABEL} opens this menu
            </span>
            .
          </ComposerOptionMenuHint>
          <ComposerOptionMenuSettingsLink
            section="providers"
            testId="advisor-mode-open-settings"
          >
            Defaults and consult budget live in Settings → Providers → Advisor.
          </ComposerOptionMenuSettingsLink>
        </PopoverContent>
    </Popover>
  );
}
