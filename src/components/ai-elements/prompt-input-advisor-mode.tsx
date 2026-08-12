import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  CircleSlash,
  Info,
  TriangleAlert,
} from "lucide-react";
import { useCallback } from "react";
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
  type AdvisorArmOptionId,
  type AdvisorEffortOptionValue,
  buildAdvisorArmOptions,
  buildAdvisorEffortOptions,
  describeAdvisorPill,
  resolveAdvisorArmOptionId,
  resolveAdvisorEffortSelection,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import {
  ADVISOR_PICKER_SHORTCUT_LABEL,
  ADVISOR_TOGGLE_SHORTCUT_LABEL,
} from "@/lib/advisor-shortcuts";
import type { AdvisorArmState } from "@/lib/providers/advisor";
import {
  getProviderWaveToneClass,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { cn } from "@/lib/utils";

/**
 * Composer control for arming the Advisor per task, next to the plan and
 * thinking toggles rather than behind Settings.
 *
 * Split on purpose: the left half is a real one-click toggle, the chevron opens
 * the target picker. Turning the Advisor on and off is the frequent action, so
 * it must not cost a menu.
 */
export function PromptInputAdvisorPill(args: {
  arm: AdvisorArmState;
  primaryProviderId: ProviderId;
  primaryModel: string;
  /** Selectable models for the currently armed provider. */
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
  onToggle: () => void;
  onSelectProvider: (optionId: AdvisorArmOptionId) => void;
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
  const activeOptionId = resolveAdvisorArmOptionId(args.arm);
  // Bound to a const so the non-null narrow survives into the row callbacks
  // below; narrowing `args.arm.target` directly does not cross a closure.
  const armedTarget = args.arm.target;
  const effortSelection = armedTarget
    ? resolveAdvisorEffortSelection(armedTarget)
    : null;
  const { onOpenChange, onToggle } = args;
  const canToggle = presentation.canToggle;

  const openPicker = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  // Nothing is configured to arm, so the picker is the only honest response to
  // a request to toggle.
  const requestToggle = useCallback(() => {
    if (!canToggle) {
      openPicker();
      return;
    }
    onToggle();
  }, [canToggle, onToggle, openPicker]);

  const iconToneClass =
    presentation.tone === "warning"
      ? "text-warning"
      : presentation.tone === "armed" && args.arm.target
        ? getProviderWaveToneClass({
            providerId: args.arm.target.providerId,
          })
        : undefined;

  return (
    <div
      className={cn(
        "inline-flex h-9 items-stretch gap-0.5 rounded-md",
        args.className,
      )}
      data-advisor-control="true"
      data-testid="advisor-mode-pill"
      data-advisor-tone={presentation.tone}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={args.disabled}
              aria-label={presentation.toggleAriaLabel}
              // Only a real toggle announces a pressed state; with nothing to
              // arm this button opens the picker instead.
              aria-pressed={
                presentation.canToggle ? args.arm.enabled : undefined
              }
              data-testid="advisor-mode-toggle"
              className={cn(
                "h-full gap-1.5 px-2.5 text-xs shadow-none",
                presentation.tone === "off"
                  ? "text-muted-foreground hover:text-foreground"
                  : "font-medium text-foreground",
              )}
              onClick={requestToggle}
            />
          }
        >
          <ArrowLeftRight className={cn("size-4 shrink-0", iconToneClass)} />
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
            // An amber icon alone reads as "something is slightly off"; the
            // word says the armed Advisor is unreachable without opening
            // anything.
            <span
              data-testid="advisor-mode-unreachable"
              className="shrink-0 rounded bg-warning/10 px-1 text-[10px] leading-4 font-medium text-warning dark:bg-warning/15"
            >
              Unreachable
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72">
          {presentation.tooltip}
        </TooltipContent>
      </Tooltip>

      <Popover open={open} onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}>
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={args.disabled}
              aria-label={`Choose which model advises this task and at what effort (${ADVISOR_PICKER_SHORTCUT_LABEL})`}
              className="inline-flex w-7 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50"
            />
          }
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180",
            )}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-[23rem] gap-2 p-2"
          data-testid="advisor-mode-options"
        >
          <div className="space-y-1">
            {buildAdvisorArmOptions().map((option) => {
              const isActive = activeOptionId === option.id;
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant="ghost"
                  data-testid={`advisor-mode-option-${option.id}`}
                  className={cn(
                    "h-auto min-h-14 w-full justify-start gap-3 rounded-lg border px-3 py-2.5 text-left whitespace-normal",
                    isActive
                      ? "border-primary/30 bg-primary/10 hover:bg-primary/14"
                      : "border-transparent hover:border-border/70 hover:bg-muted/60",
                  )}
                  onClick={() => {
                    args.onSelectProvider(option.id);
                    onOpenChange?.(false);
                  }}
                >
                  {/* `off` keeps the slot so all three rows share one text
                      baseline; a mark there would imply a vendor. */}
                  <span className="flex size-4 shrink-0 items-center justify-center self-start pt-0.5">
                    {option.id === "off" ? (
                      <CircleSlash className="size-3.5 text-muted-foreground/70" />
                    ) : (
                      <ModelIcon providerId={option.id} className="size-4" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium leading-none">
                      {option.label}
                    </span>
                    <span className="text-[11px] leading-4 text-muted-foreground">
                      {option.id === "off" && args.blocking
                        ? "Skips the running Advisor too"
                        : option.summary}
                    </span>
                    <span className="text-xs leading-4 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                  {isActive ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </Button>
              );
            })}
          </div>

          {args.arm.enabled && armedTarget ? (
            <div className="space-y-1 border-t border-border/60 pt-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Advisor model
              </p>
              <div className="max-h-52 space-y-0.5 overflow-y-auto">
                {args.advisorModelOptions.map((model) => {
                  const isActive = armedTarget.model === model;
                  return (
                    <Button
                      key={model}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-auto min-h-8 w-full justify-start gap-2 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-normal",
                        isActive && "bg-muted/70",
                      )}
                      onClick={() => {
                        args.onSelectModel(model);
                      }}
                    >
                      {/* Every row here is the armed provider, so the mark is an
                          anchor rather than a distinction — it matches the main
                          model list users already read. */}
                      <ModelIcon
                        providerId={armedTarget.providerId}
                        model={model}
                        className="size-3.5"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {toHumanModelName({ model })}
                      </span>
                      {isActive ? (
                        <Check className="size-3.5 shrink-0 text-primary" />
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {args.arm.enabled && args.arm.target ? (
            <div
              className="space-y-1 border-t border-border/60 pt-2"
              data-testid="advisor-mode-effort-row"
            >
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Advisor effort
              </p>
              <div className="flex flex-wrap gap-1">
                {buildAdvisorEffortOptions(args.arm.target).map((option) => {
                  const isActive = effortSelection === option.value;
                  return (
                    <Button
                      key={option.value ?? "auto"}
                      type="button"
                      variant="ghost"
                      title={option.title}
                      aria-pressed={isActive}
                      data-testid={`advisor-mode-effort-${option.value ?? "auto"}`}
                      className={cn(
                        "h-7 min-w-11 flex-1 justify-center rounded-md border px-2 text-xs",
                        isActive
                          ? "border-primary/30 bg-primary/10 font-medium text-foreground hover:bg-primary/14"
                          : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/60",
                      )}
                      onClick={() => {
                        args.onSelectEffort(option.value);
                      }}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              <p className="px-1 text-[11px] leading-4 text-muted-foreground">
                Higher tiers give better advice and make the turn wait longer.
              </p>
            </div>
          ) : null}

          {presentation.note ? (
            <p
              className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-xs leading-5 text-muted-foreground"
              data-testid="advisor-mode-note"
            >
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{presentation.note}</span>
            </p>
          ) : null}

          {presentation.warning ? (
            <p
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs leading-5 text-warning"
              data-testid="advisor-mode-warning"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{presentation.warning}</span>
            </p>
          ) : null}

          <p className="px-1 text-[11px] leading-4 text-muted-foreground">
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
          </p>
          <button
            type="button"
            data-testid="advisor-mode-open-settings"
            className="px-1 text-left text-[11px] leading-4 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                  detail: { section: "providers" },
                }),
              );
            }}
          >
            Defaults and consult budget live in Settings → Providers → Advisor.
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
