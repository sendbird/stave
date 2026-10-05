import { i18n, useTranslation } from "@/i18n";
import { Fragment, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Keyboard, Search, X } from "lucide-react";
import { Kbd } from "@/components/ads/components/Kbd";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
  KbdGroup,
  KbdSeparator,
} from "@/components/ui";
import {
  describeModelShortcutKey,
  listModelShortcutEffortOptions,
  MODEL_SHORTCUT_SLOT_LABELS,
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import {
  buildAppShortcutSequences,
  normalizeAppShortcutKeys,
} from "@/lib/app-shortcuts";
import {
  DEFAULT_PROMPT_COMMENT_SHORTCUT,
  normalizePromptCommentShortcut,
} from "@/lib/prompt-comment-shortcuts";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  normalizeVisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";
import {
  getTaskPresetShortcutLabel,
  TASK_PRESET_SHORTCUT_SLOT_LABELS,
} from "@/lib/task-presets";
import { useAppStore } from "@/store/app.store";
import { shortcutsDrawerStyles } from "./keyboard-shortcuts-drawer.styles";

interface KeyboardShortcutsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  label: string;
  description: string;
  sequences: string[][];
  sequenceJoiner?: "or" | "then";
}

interface ShortcutSection {
  title: string;
  description: string;
  shortcuts: ShortcutItem[];
}

function ShortcutKeys({
  sequences,
  sequenceJoiner = "or",
}: Pick<ShortcutItem, "sequences" | "sequenceJoiner">) {
  useTranslation();
  return (
    <div className={sx(shortcutsDrawerStyles.keys)}>
      {sequences.map((sequence, sequenceIndex) => (
        <Fragment key={sequence.join("-")}>
          {sequenceIndex > 0 ? (
            <span className={sx(shortcutsDrawerStyles.keysJoiner)}>
              {sequenceJoiner}
            </span>
          ) : null}
          <KbdGroup aria-label={i18n.t("shell:keyboardShortcutsDrawer.keyboardShortcut", { value1: sequence.join(" ") })}>
            {sequence.map((part, partIndex) => (
              <Fragment key={`${part}-${partIndex}`}>
                {partIndex > 0 ? <KbdSeparator>+</KbdSeparator> : null}
                <Kbd size="sm">{part}</Kbd>
              </Fragment>
            ))}
          </KbdGroup>
        </Fragment>
      ))}
    </div>
  );
}

export function KeyboardShortcutsDrawer({
  open,
  onOpenChange,
}: KeyboardShortcutsDrawerProps) {
  useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const modifierLabel = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "Cmd"
        : "Ctrl",
    [],
  );
  const [
    storedModelShortcutKeys,
    storedModelShortcutEfforts,
    storedAppShortcutKeys,
    storedPromptCommentShortcut,
    storedVisualCommentShortcut,
    taskPresets,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelShortcutKeys,
          state.settings.modelShortcutEfforts,
          state.settings.appShortcutKeys,
          state.settings.promptCommentShortcut,
          state.settings.visualCommentShortcut,
          state.settings.taskPresets,
        ] as const,
    ),
  );
  const normalizedAppShortcutKeys = useMemo(
    () => normalizeAppShortcutKeys(storedAppShortcutKeys),
    [storedAppShortcutKeys],
  );
  const normalizedModelShortcutKeys = useMemo(
    () => normalizeModelShortcutKeys(storedModelShortcutKeys),
    [storedModelShortcutKeys],
  );
  const normalizedModelShortcutEfforts = useMemo(
    () => normalizeModelShortcutEfforts(storedModelShortcutEfforts),
    [storedModelShortcutEfforts],
  );
  const normalizedPromptCommentShortcut = normalizePromptCommentShortcut(
    storedPromptCommentShortcut ?? DEFAULT_PROMPT_COMMENT_SHORTCUT,
  );
  const promptCommentShortcutSequences = useMemo(
    () =>
      normalizedPromptCommentShortcut === "mod-enter"
        ? [[modifierLabel, "Enter"]]
        : normalizedPromptCommentShortcut === "shift-enter"
          ? [["Shift", "Enter"]]
          : [[i18n.t("shell:keyboardShortcutsDrawer.disabled")]],
    [modifierLabel, normalizedPromptCommentShortcut, i18n.language],
  );
  const normalizedVisualCommentShortcut = normalizeVisualCommentShortcut(
    storedVisualCommentShortcut ?? DEFAULT_VISUAL_COMMENT_SHORTCUT,
  );
  const visualCommentShortcutSequences = useMemo(
    () =>
      normalizedVisualCommentShortcut === "mod-alt-period"
        ? [[modifierLabel, "Alt", "."]]
        : normalizedVisualCommentShortcut === "mod-period"
          ? [[modifierLabel, "."]]
          : normalizedVisualCommentShortcut === "mod-shift-period"
            ? [[modifierLabel, "Shift", "."]]
            : [[i18n.t("shell:keyboardShortcutsDrawer.disabled")]],
    [modifierLabel, normalizedVisualCommentShortcut, i18n.language],
  );
  const modelShortcutItems = useMemo<ShortcutItem[]>(() => {
    const assignedItems = MODEL_SHORTCUT_SLOT_LABELS.map((slotLabel, index) => {
      const details = describeModelShortcutKey({
        shortcutKey: normalizedModelShortcutKeys[index] ?? "",
      });
      if (!details) {
        return null;
      }
      const effort = normalizedModelShortcutEfforts[index] ?? "";
      const effortLabel = listModelShortcutEffortOptions({
        shortcutKey: details.key,
      }).find((option) => option.value === effort)?.label;
      const effortDescription = effortLabel
        ? i18n.t("shell:keyboardShortcutsDrawer.atEffort", { value1: effortLabel })
        : i18n.t("shell:keyboardShortcutsDrawer.withTheCurrentEffortSetting");
      return {
        label: i18n.t("shell:keyboardShortcutsDrawer.select", { value1: details.modelLabel }),
        description: i18n.t("shell:keyboardShortcutsDrawer.switchTheActiveTaskToAndUse", { value1: details.providerLabel, value2: details.modelLabel, value3: effortDescription }),
        sequences: [["Alt", slotLabel]],
      } satisfies ShortcutItem;
    }).filter((item): item is ShortcutItem => item != null);

    if (assignedItems.length > 0) {
      return assignedItems;
    }

    return [
      {
        label: i18n.t("shell:keyboardShortcutsDrawer.modelShortcutSlots"),
        description:
          i18n.t("shell:keyboardShortcutsDrawer.assignAlt10InSettingsCommandPalette"),
        sequences: [["Alt", "1-0"]],
      },
    ];
  }, [normalizedModelShortcutEfforts, normalizedModelShortcutKeys, i18n.language]);
  const presetShortcutItems = useMemo<ShortcutItem[]>(() => {
    const assignedItems = taskPresets
      .slice(0, TASK_PRESET_SHORTCUT_SLOT_LABELS.length)
      .map((preset, index) => {
        const slotLabel = getTaskPresetShortcutLabel(index);
        if (!slotLabel) {
          return null;
        }
        return {
          label: i18n.t("shell:keyboardShortcutsDrawer.run", { value1: preset.label }),
          description:
            i18n.t("shell:keyboardShortcutsDrawer.launchThisPresetDirectlyReorderPresetsIn"),
          sequences: [["Ctrl", slotLabel]],
        } satisfies ShortcutItem;
      })
      .filter((item): item is ShortcutItem => item != null);

    if (assignedItems.length > 0) {
      return assignedItems;
    }

    return [
      {
        label: i18n.t("shell:keyboardShortcutsDrawer.presetShortcutSlots"),
        description:
          i18n.t("shell:keyboardShortcutsDrawer.theFirstNinePresetsInSettings"),
        sequences: [["Ctrl", "1-9"]],
      },
    ];
  }, [taskPresets, i18n.language]);
  const buildShellShortcutItem = (
    args: Pick<ShortcutItem, "label" | "description"> & {
      actionId:
        | "navigation.home"
        | "view.toggle-workspace-sidebar"
        | "view.toggle-changes-panel"
        | "view.show-explorer"
        | "view.show-information"
        | "view.show-scripts"
        | "view.show-lens"
        | "view.toggle-editor"
        | "view.toggle-terminal";
    },
  ): ShortcutItem => {
    const sequences = buildAppShortcutSequences({
      actionId: args.actionId,
      modifierLabel,
      shortcutKeys: normalizedAppShortcutKeys,
    });
    const isDisabled =
      sequences.length === 1 && sequences[0]?.[0] === i18n.t("shell:keyboardShortcutsDrawer.disabled");

    return {
      label: args.label,
      description: isDisabled
        ? i18n.t("shell:keyboardShortcutsDrawer.disabledInSettingsCommandPalette", { value1: args.description })
        : args.description,
      sequences,
      sequenceJoiner: isDisabled ? "or" : "then",
    };
  };

  const sections = useMemo<ShortcutSection[]>(
    () => [
      {
        title: i18n.t("shell:keyboardShortcutsDrawer.issues"),
        description:
          i18n.t("shell:keyboardShortcutsDrawer.createConversationsAndMoveAroundTheCurrent"),
        shortcuts: [
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.selectWorkspace"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.jumpToTheFirstNineVisibleWorkspaces"),
            sequences: [[modifierLabel, "Shift", "1-9"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.newTask"),
            description: i18n.t("shell:keyboardShortcutsDrawer.startAFreshTaskInTheSelected"),
            sequences: [[modifierLabel, "N"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.closeTabTask"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.closeTheActivePaneTabWithoutArchiving"),
            sequences: [[modifierLabel, "W"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.nextTask"),
            description: i18n.t("shell:keyboardShortcutsDrawer.moveSelectionToTheNextTask"),
            sequences: [
              [modifierLabel, "Shift", "J"],
              [modifierLabel, "Shift", "ArrowDown"],
            ],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.previousTask"),
            description: i18n.t("shell:keyboardShortcutsDrawer.moveSelectionToThePreviousTask"),
            sequences: [
              [modifierLabel, "Shift", "K"],
              [modifierLabel, "Shift", "ArrowUp"],
            ],
          },
        ],
      },
      {
        title: i18n.t("shell:keyboardShortcutsDrawer.presets"),
        description: i18n.t("shell:keyboardShortcutsDrawer.launchThePresetBarWithoutLeavingThe"),
        shortcuts: presetShortcutItems,
      },
      {
        title: i18n.t("shell:keyboardShortcutsDrawer.panels"),
        description: i18n.t("shell:keyboardShortcutsDrawer.controlTheShellLayoutWithoutLeavingThe"),
        shortcuts: [
          buildShellShortcutItem({
            actionId: "view.toggle-workspace-sidebar",
            label: i18n.t("shell:keyboardShortcutsDrawer.toggleWorkspaceSidebar"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.collapseOrExpandTheLeftRepositoryAnd"),
          }),
          buildShellShortcutItem({
            actionId: "view.toggle-changes-panel",
            label: i18n.t("shell:keyboardShortcutsDrawer.sourceControlPanel"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.showOrHideTheSourceControlOverlay"),
          }),
          buildShellShortcutItem({
            actionId: "view.show-explorer",
            label: i18n.t("shell:keyboardShortcutsDrawer.openExplorerPanel"),
            description: i18n.t("shell:keyboardShortcutsDrawer.openTheExplorerOverlayOnTheRight"),
          }),
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.searchInFiles"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.openTheExplorerSearchUIAndSearch"),
            sequences: [[modifierLabel, "Shift", "F"]],
          },
          buildShellShortcutItem({
            actionId: "view.show-information",
            label: i18n.t("shell:keyboardShortcutsDrawer.toggleInformationPanel"),
            description: i18n.t("shell:keyboardShortcutsDrawer.showOrHideTheWorkspaceInformationPanel"),
          }),
          buildShellShortcutItem({
            actionId: "view.show-scripts",
            label: i18n.t("shell:keyboardShortcutsDrawer.open", { value1: WORKSPACE_TOOLS_PRESENTATION.label }),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.openLongRunningProcessesOneShotCommandsLifecycleTriggers"),
          }),
          buildShellShortcutItem({
            actionId: "view.show-lens",
            label: i18n.t("shell:keyboardShortcutsDrawer.openLensTab"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.focusTheLatestEmbeddedBrowserTabOr"),
          }),
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.visualComment"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.toggleLensVisualCommentModeWhileThe"),
            sequences: visualCommentShortcutSequences,
          },
          buildShellShortcutItem({
            actionId: "view.toggle-editor",
            label: i18n.t("shell:keyboardShortcutsDrawer.focusEditor"),
            description: i18n.t("shell:keyboardShortcutsDrawer.focusTheActiveEditorTab"),
          }),
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.splitPaneRight"),
            description: i18n.t("shell:keyboardShortcutsDrawer.moveTheActiveTabIntoANew"),
            sequences: [[modifierLabel, "\\"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.splitPaneDown"),
            description: i18n.t("shell:keyboardShortcutsDrawer.moveTheActiveTabIntoANew2"),
            sequences: [[modifierLabel, "Shift", "\\"]],
          },
          buildShellShortcutItem({
            actionId: "view.toggle-terminal",
            label: i18n.t("shell:keyboardShortcutsDrawer.toggleTerminal"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.focusTheTerminalPaneOrReturnTo"),
          }),
        ],
      },
      {
        title: i18n.t("shell:keyboardShortcutsDrawer.actions"),
        description: i18n.t("shell:keyboardShortcutsDrawer.commonTaskAndEditorCommands"),
        shortcuts: [
          buildShellShortcutItem({
            actionId: "navigation.home",
            label: i18n.t("shell:keyboardShortcutsDrawer.goHome"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.clearTheActiveTaskSelectionAndReturn"),
          }),
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.focusPromptComposer"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.moveFocusBackToTheChatPrompt"),
            sequences: [
              [modifierLabel, "L"],
              [modifierLabel, "J"],
            ],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.openModelSelector"),
            description: i18n.t("shell:keyboardShortcutsDrawer.openThePromptModelPickerFromThe"),
            sequences: [["Alt", "P"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.quickOpenFile"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.searchTheActiveWorkspaceFilesAndOpen"),
            sequences: [[modifierLabel, "P"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.openCommandPalette"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.openTheGlobalStaveCommandLauncherFor"),
            sequences: [[modifierLabel, "Shift", "P"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.stageComment"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.moveTheCurrentComposerTextIntoThe"),
            sequences: promptCommentShortcutSequences,
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.togglePlanMode"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.switchTheActivePromptBetweenNormalAnd"),
            sequences: [["Shift", "Tab"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.dialogPrimaryAction"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.runSaveCreateOpenConfirmInTheActiveDialogUse"),
            sequences: [["Enter"], [modifierLabel, "Enter"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.saveFile"),
            description: i18n.t("shell:keyboardShortcutsDrawer.saveTheActiveEditorTab"),
            sequences: [[modifierLabel, "S"]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.stopActiveTurn"),
            description:
              i18n.t("shell:keyboardShortcutsDrawer.abortTheCurrentTaskRunWhileFocus"),
            sequences: [["Esc"]],
          },
        ],
      },
      {
        title: i18n.t("shell:keyboardShortcutsDrawer.models"),
        description:
          i18n.t("shell:keyboardShortcutsDrawer.jumpDirectlyToTheModelsYouMapped"),
        shortcuts: modelShortcutItems,
      },
      {
        title: i18n.t("shell:keyboardShortcutsDrawer.help"),
        description: i18n.t("shell:keyboardShortcutsDrawer.surfaceTheGuideItselfWhenYouNeed"),
        shortcuts: [
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.openSettings"),
            description: i18n.t("shell:keyboardShortcutsDrawer.openTheMainStaveSettingsDialog"),
            sequences: [[modifierLabel, ","]],
          },
          {
            label: i18n.t("shell:keyboardShortcutsDrawer.openShortcutGuide"),
            description: i18n.t("shell:keyboardShortcutsDrawer.showThisPanelFromAnywhereOutsideText"),
            sequences: [[modifierLabel, "/"]],
          },
        ],
      },
    ],
    [
      modelShortcutItems,
      modifierLabel,
      normalizedAppShortcutKeys,
      promptCommentShortcutSequences,
      presetShortcutItems,
      visualCommentShortcutSequences,
      i18n.language,
    ],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedSearchQuery) {
      return sections;
    }
    return sections.flatMap((section) => {
      const sectionMatches = `${section.title} ${section.description}`
        .toLowerCase()
        .includes(normalizedSearchQuery);
      const shortcuts = sectionMatches
        ? section.shortcuts
        : section.shortcuts.filter((shortcut) =>
            `${shortcut.label} ${shortcut.description} ${shortcut.sequences
              .flat()
              .join(" ")}`
              .toLowerCase()
              .includes(normalizedSearchQuery),
          );
      return shortcuts.length > 0 ? [{ ...section, shortcuts }] : [];
    });
  }, [normalizedSearchQuery, sections]);
  const visibleShortcutCount = useMemo(
    () =>
      filteredSections.reduce(
        (count, section) => count + section.shortcuts.length,
        0,
      ),
    [filteredSections],
  );

  if (!open) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="up">
      <DrawerContent className={sx(shortcutsDrawerStyles.content)}>
        <div className={sx(shortcutsDrawerStyles.frame)}>
          <DrawerHeader className={sx(shortcutsDrawerStyles.header)}>
            <div className={sx(shortcutsDrawerStyles.headerRow)}>
              <div className={sx(shortcutsDrawerStyles.headerTitleGroup)}>
                <Keyboard className={sx(shortcutsDrawerStyles.headerIcon)} />
                <div className={sx(shortcutsDrawerStyles.headerText)}>
                  <DrawerTitle className={sx(shortcutsDrawerStyles.title)}>
                    {i18n.t("shell:keyboardShortcutsDrawer.keyboardReference")}
                  </DrawerTitle>
                  <DrawerDescription
                    className={sx(shortcutsDrawerStyles.description)}
                  >
                    {i18n.t("shell:keyboardShortcutsDrawer.searchEveryActiveStaveShortcutAndCustom")}
                  </DrawerDescription>
                </div>
              </div>
              <div className={sx(shortcutsDrawerStyles.searchGroup)}>
                <div className={sx(shortcutsDrawerStyles.searchField)}>
                  <Search
                    className={sx(shortcutsDrawerStyles.searchIcon)}
                    aria-hidden="true"
                  />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={i18n.t("shell:keyboardShortcutsDrawer.findAnActionOrKey")}
                    aria-label={i18n.t("shell:keyboardShortcutsDrawer.searchKeyboardShortcuts")}
                    xstyle={shortcutsDrawerStyles.searchInput}
                  />
                  {searchQuery ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      xstyle={shortcutsDrawerStyles.clearButton}
                      aria-label={i18n.t("shell:keyboardShortcutsDrawer.clearShortcutSearch")}
                      onClick={() => setSearchQuery("")}
                    >
                      <X className={sx(shortcutsDrawerStyles.clearIcon)} />
                    </Button>
                  ) : null}
                </div>
                <span className={sx(shortcutsDrawerStyles.shownCount)}>{i18n.t("shell:keyboardShortcutsDrawer.shownCount", { count: visibleShortcutCount })}</span>
              </div>
            </div>
          </DrawerHeader>
          <div className={sx(shortcutsDrawerStyles.grid)}>
            {filteredSections.length > 0 ? (
              filteredSections.map((section) => (
                <section
                  key={section.title}
                  className={sx(shortcutsDrawerStyles.section)}
                >
                  <header className={sx(shortcutsDrawerStyles.sectionHeader)}>
                    <div className={sx(shortcutsDrawerStyles.sectionHeaderRow)}>
                      <h2 className={sx(shortcutsDrawerStyles.sectionTitle)}>
                        {section.title}
                      </h2>
                      <span className={sx(shortcutsDrawerStyles.sectionCount)}>
                        {section.shortcuts.length}
                      </span>
                    </div>
                    <p className={sx(shortcutsDrawerStyles.sectionDescription)}>
                      {section.description}
                    </p>
                  </header>
                  <div className={sx(shortcutsDrawerStyles.sectionList)}>
                    {section.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.label}
                        className={sx(
                          shortcutsDrawerStyles.shortcutRow,
                          transition.colors,
                        )}
                      >
                        <div className={sx(shortcutsDrawerStyles.shortcutText)}>
                          <p className={sx(shortcutsDrawerStyles.shortcutLabel)}>
                            {shortcut.label}
                          </p>
                          <p
                            className={sx(
                              shortcutsDrawerStyles.shortcutDescription,
                            )}
                          >
                            {shortcut.description}
                          </p>
                        </div>
                        <ShortcutKeys
                          sequences={shortcut.sequences}
                          sequenceJoiner={shortcut.sequenceJoiner}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className={sx(shortcutsDrawerStyles.emptyState)}>
                <p className={sx(shortcutsDrawerStyles.emptyTitle)}>{i18n.t("shell:keyboardShortcutsDrawer.noMatches", { query: searchQuery.trim() })}</p>
                <p className={sx(shortcutsDrawerStyles.emptyHint)}>
                  {i18n.t("shell:keyboardShortcutsDrawer.tryAnActionNamePanelOrKey")}
                </p>
              </div>
            )}
          </div>
          <DrawerFooter className={sx(shortcutsDrawerStyles.footer)}>
            <p className={sx(shortcutsDrawerStyles.footerNote)}>{i18n.t("shell:keyboardShortcutsDrawer.deviceBindings", { modifier: modifierLabel })}</p>
            <DrawerClose render={<Button variant="outline" />}>
              {i18n.t("shell:keyboardShortcutsDrawer.close")}
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
