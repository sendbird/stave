import { Check, ChevronDown, Info, TriangleAlert, Users } from "lucide-react";
import { useCallback } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
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
import { getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { cn } from "@/lib/utils";

/**
 * Composer control for Worker mode, beside the Advisor.
 *
 * Same split as the Advisor pill: the left half is a real one-click toggle and
 * the chevron opens the configuration. Turning delegation on and off is the
 * frequent action, so it must not cost a menu.
 *
 * The popover shows preset → model → effort in that order because that is the
 * dependency order: the preset supplies the `Auto` model, and the model decides
 * which efforts exist.
 */
export function PromptInputWorkerPill(args: {
  arm: WorkerArmState;
  /** Semantic resolution for the active primary. Drives every label and warning. */
  resolution: WorkerResolution;
  primaryProviderId: ProviderId;
  primaryModel: string;
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

  const openPicker = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  const iconToneClass =
    presentation.tone === "warning"
      ? "text-warning"
      : presentation.tone === "armed"
        ? getProviderWaveToneClass({ providerId: args.primaryProviderId })
        : undefined;

  return (
    <div
      className={cn(
        "inline-flex h-9 items-stretch gap-0.5 rounded-md",
        args.className,
      )}
      data-worker-control="true"
      data-testid="worker-mode-pill"
      data-worker-tone={presentation.tone}
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
              aria-pressed={args.arm.enabled}
              data-testid="worker-mode-toggle"
              className={cn(
                "h-full gap-1.5 px-2.5 text-xs shadow-none",
                presentation.tone === "off"
                  ? "text-muted-foreground hover:text-foreground"
                  : "font-medium text-foreground",
              )}
              onClick={onToggle}
            />
          }
        >
          <Users className={cn("size-4 shrink-0", iconToneClass)} />
          {presentation.label}
          {presentation.effortLabel ? (
            <span
              data-testid="worker-mode-effort"
              className="shrink-0 rounded bg-muted/70 px-1 text-[10px] leading-4 font-medium text-muted-foreground"
            >
              {presentation.effortLabel}
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
              aria-label={`Choose the worker preset, model, and effort for this task (${WORKER_PICKER_SHORTCUT_LABEL})`}
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
          className="w-[25rem] gap-2 p-2"
          data-testid="worker-mode-options"
        >
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <label
              htmlFor="worker-mode-switch"
              className="flex min-w-0 flex-1 flex-col gap-0.5"
            >
              <span className="text-sm font-medium leading-none">
                Worker mode
              </span>
              <span className="text-[11px] leading-4 text-muted-foreground">
                Primary plans and reviews; the worker implements.
              </span>
            </label>
            <Switch
              id="worker-mode-switch"
              checked={args.arm.enabled}
              onCheckedChange={onToggle}
              data-testid="worker-mode-switch"
            />
          </div>

          {args.arm.enabled ? (
            <>
              <div className="space-y-1 border-t border-border/60 pt-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Preset
                </p>
                <div className="max-h-52 space-y-0.5 overflow-y-auto">
                  {buildWorkerPresetOptions().map((option) => {
                    const isActive = presetId === option.id;
                    return (
                      <Button
                        key={option.id}
                        type="button"
                        variant="ghost"
                        data-testid={`worker-mode-preset-${option.id}`}
                        aria-pressed={isActive}
                        className={cn(
                          "h-auto min-h-11 w-full justify-start gap-2 rounded-md border px-2.5 py-1.5 text-left whitespace-normal",
                          isActive
                            ? "border-primary/30 bg-primary/10 hover:bg-primary/14"
                            : "border-transparent hover:border-border/70 hover:bg-muted/60",
                        )}
                        onClick={() => {
                          args.onSelectPreset(option.id);
                        }}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm font-medium leading-none">
                            {option.label}
                          </span>
                          <span className="text-[11px] leading-4 text-muted-foreground">
                            {option.summary}
                          </span>
                        </span>
                        {isActive ? (
                          <Check className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1 border-t border-border/60 pt-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Worker model
                </p>
                <div className="max-h-44 space-y-0.5 overflow-y-auto">
                  {buildWorkerModelOptions({
                    providerId: args.primaryProviderId,
                    presetId,
                  }).map((option) => {
                    const isActive = requestedModel === option.value;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="ghost"
                        aria-pressed={isActive}
                        data-testid={`worker-mode-model-${option.value}`}
                        className={cn(
                          "h-auto min-h-8 w-full justify-start gap-2 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-normal",
                          isActive && "bg-muted/70",
                        )}
                        onClick={() => {
                          args.onSelectModel(option.value);
                        }}
                      >
                        {option.value === WORKER_AUTO_VALUE ? (
                          <span className="flex size-3.5 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground">
                            A
                          </span>
                        ) : (
                          <ModelIcon
                            providerId={args.primaryProviderId}
                            model={option.value}
                            className="size-3.5"
                          />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{option.label}</span>
                          {option.description ? (
                            <span className="truncate text-[11px] leading-4 text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        {isActive ? (
                          <Check className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {effortOptions.length > 0 ? (
                <div
                  className="space-y-1 border-t border-border/60 pt-2"
                  data-testid="worker-mode-effort-row"
                >
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Worker effort
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {effortOptions.map((option) => {
                      const isActive = effortSelection === option.value;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          variant="ghost"
                          title={option.title}
                          aria-pressed={isActive}
                          data-testid={`worker-mode-effort-${option.value}`}
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
                    A cheap worker at high effort often beats a mid-tier worker
                    at its default.
                  </p>
                </div>
              ) : (
                <p
                  className="px-1 text-[11px] leading-4 text-muted-foreground"
                  data-testid="worker-mode-effort-unavailable"
                >
                  This worker model has no selectable effort; it runs at its own
                  default.
                </p>
              )}
            </>
          ) : null}

          {presentation.note ? (
            <p
              className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-xs leading-5 text-muted-foreground"
              data-testid="worker-mode-note"
            >
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{presentation.note}</span>
            </p>
          ) : null}

          {presentation.warning ? (
            <p
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs leading-5 text-warning"
              data-testid="worker-mode-warning"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{presentation.warning}</span>
            </p>
          ) : null}

          <p className="px-1 text-[11px] leading-4 text-muted-foreground">
            Applies to this task only, and is remembered per provider. One
            foreground worker runs at a time and the primary reviews its work
            before answering.{" "}
            <span className="whitespace-nowrap">
              {WORKER_TOGGLE_SHORTCUT_LABEL} toggles
            </span>
            ,{" "}
            <span className="whitespace-nowrap">
              {WORKER_PICKER_SHORTCUT_LABEL} opens this menu
            </span>
            .
          </p>
          <button
            type="button"
            data-testid="worker-mode-open-settings"
            className="px-1 text-left text-[11px] leading-4 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                  detail: { section: "providers" },
                }),
              );
            }}
          >
            Default arming, instructions, and turn caps live in Settings →
            Providers → Worker mode.
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
