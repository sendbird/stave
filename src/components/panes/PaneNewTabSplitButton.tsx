import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, Globe, Plus, Settings2, SquareTerminal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import { ModelIcon } from "@/components/ai-elements";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui";
import { openPaneTabInGroup } from "@/components/panes/pane-host-controller";
import type { PaneSurfaceDescriptor } from "@/lib/panes/types";
import {
  describeTaskPresetModelEffort,
  getTaskPresetShortcutLabel,
  type TaskPreset,
} from "@/lib/task-presets";
import { isTaskArchived } from "@/lib/tasks";
import { getCliSessionContextLabel } from "@/lib/terminal/terminal-tab-labels";
import {
  getCliSessionProviderLabel,
  type CliSessionContextMode,
} from "@/lib/terminal/types";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";

const CLI_SESSION_CHOICES = [
  { provider: "claude-code", contextMode: "workspace" },
  { provider: "claude-code", contextMode: "active-task" },
  { provider: "codex", contextMode: "workspace" },
  { provider: "codex", contextMode: "active-task" },
] as const satisfies readonly {
  provider: "claude-code" | "codex";
  contextMode: CliSessionContextMode;
}[];

const IS_MAC =
  typeof navigator !== "undefined" &&
  /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent);

/** The `Ctrl+1..9` slot a preset answers to, as the menu row's hint. */
export function formatPresetSlotShortcut(index: number): string | null {
  const slot = getTaskPresetShortcutLabel(index);
  if (!slot) return null;
  return IS_MAC ? `⌃${slot}` : `Ctrl+${slot}`;
}

function openPresetSettings() {
  window.dispatchEvent(
    new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "presets" } }),
  );
}

function presetTitle(preset: TaskPreset) {
  if (preset.kind === "cli-session") {
    return i18n.t("panes:paneNewTab.cliSessionPreset", { label: preset.label });
  }
  const modelEffort = describeTaskPresetModelEffort(preset);
  return modelEffort ? `${preset.label} · ${modelEffort}` : preset.label;
}

/**
 * The tab strip's new-tab control: a split button whose main (+) half launches
 * the first preset (the `Ctrl+1` slot) and whose chevron lists every preset with its
 * slot, then the blank surfaces (task, CLI session, terminal, Lens) and the
 * entry to preset management. It replaces the row of preset chips that used to
 * sit between the top bar and the tab strip.
 */
export function PaneNewTabSplitButton(props: { groupId: string }) {
  useTranslation();
  const [
    presets,
    providerAvailability,
    hasActiveTask,
    activeTaskTitle,
    applyTaskPreset,
    resetTaskPresetsToDefault,
    createTask,
    createCliSessionTab,
    createTerminalTab,
    createLensTab,
  ] = useAppStore(
    useShallow((state) => {
      const activeTask =
        state.tasks.find(
          (task) => task.id === state.activeTaskId && !isTaskArchived(task),
        ) ?? null;
      return [
        state.settings.taskPresets,
        state.providerAvailability,
        Boolean(activeTask),
        activeTask?.title ?? null,
        state.applyTaskPreset,
        state.resetTaskPresetsToDefault,
        state.createTask,
        state.createCliSessionTab,
        state.createTerminalTab,
        state.createLensTab,
      ] as const;
    }),
  );
  const primaryPreset = presets[0] ?? null;

  const openCreatedSurfaceInGroup = (surface: PaneSurfaceDescriptor) =>
    openPaneTabInGroup({ surface, groupId: props.groupId });

  const createTaskInGroup = () => {
    const previousFirstTaskId = useAppStore.getState().tasks[0]?.id;
    createTask({ title: "" });
    const createdTaskId = useAppStore.getState().tasks[0]?.id;
    if (createdTaskId && createdTaskId !== previousFirstTaskId) {
      openCreatedSurfaceInGroup({ kind: "task", taskId: createdTaskId });
    }
  };

  const createLensInGroup = () => {
    const lensSessionId = createLensTab();
    if (lensSessionId) {
      openCreatedSurfaceInGroup({ kind: "lens", lensSessionId });
    }
  };

  const primaryLabel = primaryPreset
    ? i18n.t("panes:paneNewTab.launchPreset", { label: presetTitle(primaryPreset) })
    : i18n.t("panes:paneHeaderActions.newTask");

  return (
    <div className={sx(styles.split)} data-testid="preset-launcher">
      <Tooltip
        content={primaryLabel}
        shortcut={primaryPreset ? formatPresetSlotShortcut(0) ?? undefined : undefined}
      >
        <AdsButton
          layout="host"
          type="button"
          xstyle={[styles.half, styles.primary, transition.colors, focusRing.ring]}
          aria-label={primaryLabel}
          data-preset-id={primaryPreset?.id}
          onClick={() =>
            primaryPreset
              ? applyTaskPreset({ presetId: primaryPreset.id })
              : createTaskInGroup()
          }
        >
          <Plus className={sx(styles.chevronIcon)} aria-hidden />
        </AdsButton>
      </Tooltip>
      <DropdownMenu>
        <Tooltip content={i18n.t("panes:paneHeaderActions.createNewPaneTab")}>
          <span className={sx(layoutShellStyles.inlineFlex)}>
            <DropdownMenuTrigger
              render={
                <AdsButton
                  layout="host"
                  type="button"
                  xstyle={[styles.half, styles.chevron, transition.colors, focusRing.ring]}
                  aria-label={i18n.t("panes:paneHeaderActions.createNewPaneTab")}
                />
              }
            >
              <ChevronDown className={sx(styles.chevronIcon)} aria-hidden />
            </DropdownMenuTrigger>
          </span>
        </Tooltip>
        <DropdownMenuContent align="end" xstyle={styles.menu}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{i18n.t("panes:paneNewTab.presets")}</DropdownMenuLabel>
            {presets.map((preset, index) => {
              const shortcut = formatPresetSlotShortcut(index);
              return (
                <DropdownMenuItem
                  key={preset.id}
                  data-preset-id={preset.id}
                  onSelect={() => applyTaskPreset({ presetId: preset.id })}
                >
                  <ModelIcon
                    providerId={preset.provider}
                    model={preset.model}
                    className={sx(styles.icon)}
                  />
                  <span className={sx(styles.itemLabel)}>{presetTitle(preset)}</span>
                  {shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}
                </DropdownMenuItem>
              );
            })}
            {presets.length === 0 ? (
              <DropdownMenuItem onSelect={() => resetTaskPresetsToDefault()}>
                {i18n.t("panes:paneNewTab.restoreDefaults")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={createTaskInGroup}>
            <Plus className={sx(styles.icon)} />
            {i18n.t("panes:paneHeaderActions.newTask")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SquareTerminal className={sx(styles.icon)} />
              {i18n.t("panes:paneHeaderActions.newCLISession")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={sx(styles.submenu)}>
              <DropdownMenuLabel>{i18n.t("panes:paneHeaderActions.startHere")}</DropdownMenuLabel>
              {CLI_SESSION_CHOICES.map((choice) => {
                const providerAvailable = providerAvailability[choice.provider];
                const requiresTask = choice.contextMode === "active-task";
                const disabled = !providerAvailable || (requiresTask && !hasActiveTask);
                const providerLabel = getCliSessionProviderLabel(choice.provider);
                const contextLabel = getCliSessionContextLabel(choice.contextMode);
                const secondaryLabel = !providerAvailable
                  ? i18n.t("panes:paneHeaderActions.isUnavailableInThisEnvironment", { value1: providerLabel })
                  : requiresTask
                    ? hasActiveTask
                      ? i18n.t("panes:paneHeaderActions.continueFromTheActiveTaskContext")
                      : i18n.t("panes:paneHeaderActions.selectAnActiveTaskFirst")
                    : i18n.t("panes:paneHeaderActions.useTheCurrentWorkspaceContext");
                const taskHint = requiresTask && hasActiveTask ? activeTaskTitle : null;

                return (
                  <DropdownMenuItem
                    key={`${choice.provider}:${choice.contextMode}`}
                    disabled={disabled}
                    className={sx(styles.item)}
                    onSelect={() => {
                      const cliSessionTabId = createCliSessionTab({
                        provider: choice.provider,
                        contextMode: choice.contextMode,
                      });
                      if (cliSessionTabId) {
                        openCreatedSurfaceInGroup({ kind: "cli-session", cliSessionTabId });
                      }
                    }}
                  >
                    <div className={sx(styles.choice)}>
                      <ModelIcon providerId={choice.provider} className={sx(styles.providerIcon)} />
                      <div className={sx(styles.content)}>
                        <div className={sx(styles.label)}>
                          {providerLabel} · {contextLabel}
                        </div>
                        <div className={sx(styles.description)}>{secondaryLabel}</div>
                        {taskHint ? <div className={sx(styles.taskHint)}>{taskHint}</div> : null}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => createTerminalTab()}>
            <SquareTerminal className={sx(styles.icon)} />
            {i18n.t("panes:paneHeaderActions.newTerminal")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={createLensInGroup}>
            <Globe className={sx(styles.icon)} />
            {i18n.t("panes:paneHeaderActions.newLens")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openPresetSettings}>
            <Settings2 className={sx(styles.icon)} />
            {i18n.t("panes:paneNewTab.managePresets")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const styles = stylex.create({
  split: {
    alignItems: "stretch",
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    flexShrink: 0,
    height: vars["--ads-control-height-xs"],
    overflow: "hidden",
  },
  half: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":is([data-popup-open])": vars["--ads-color-overlay-hover"],
    },
    borderWidth: 0,
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-control"],
    margin: 0,
  },
  // Icon-only so the strip keeps its room for tabs and the task's own
  // actions; the preset it launches is named in the tooltip and label.
  primary: {
    justifyContent: "center",
    paddingInline: 0,
    width: vars["--ads-control-height-xs"],
  },
  chevron: {
    borderInlineStartColor: vars["--ads-color-border-subtle"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--ads-border-width-hairline"],
    justifyContent: "center",
    paddingInline: vars["--ads-space-4"],
  },
  icon: {
    flexShrink: 0,
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  chevronIcon: {
    flexShrink: 0,
    height: vars["--ads-control-icon-size-md"],
    width: vars["--ads-control-icon-size-md"],
  },
  itemLabel: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  menu: { width: 256 },
  submenu: { width: 256 },
  item: { alignItems: "flex-start" },
  choice: { alignItems: "flex-start", display: "flex", gap: vars["--ads-space-8"], minWidth: 0 },
  providerIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: vars["--ads-control-icon-size-md"],
    marginBlockStart: vars["--ads-space-2"],
    width: vars["--ads-control-icon-size-md"],
  },
  content: { minWidth: 0 },
  label: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-2"],
  },
  taskHint: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockStart: vars["--ads-space-2"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
