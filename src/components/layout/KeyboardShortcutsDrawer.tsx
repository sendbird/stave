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
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";
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
  return (
    <div className={sx(shortcutsDrawerStyles.keys)}>
      {sequences.map((sequence, sequenceIndex) => (
        <Fragment key={sequence.join("-")}>
          {sequenceIndex > 0 ? (
            <span className={sx(shortcutsDrawerStyles.keysJoiner)}>
              {sequenceJoiner}
            </span>
          ) : null}
          <KbdGroup aria-label={`Keyboard shortcut ${sequence.join(" ")}`}>
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
          : [["Disabled"]],
    [modifierLabel, normalizedPromptCommentShortcut],
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
            : [["Disabled"]],
    [modifierLabel, normalizedVisualCommentShortcut],
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
        ? ` at ${effortLabel} effort`
        : " with the current effort setting";
      return {
        label: `Select ${details.modelLabel}`,
        description: `Switch the active task to ${details.providerLabel} and use ${details.modelLabel}${effortDescription}. Customize this slot in Settings → Command Palette.`,
        sequences: [["Alt", slotLabel]],
      } satisfies ShortcutItem;
    }).filter((item): item is ShortcutItem => item != null);

    if (assignedItems.length > 0) {
      return assignedItems;
    }

    return [
      {
        label: "Model shortcut slots",
        description:
          "Assign Alt+1..0 in Settings → Command Palette to jump directly to specific prompt models.",
        sequences: [["Alt", "1-0"]],
      },
    ];
  }, [normalizedModelShortcutEfforts, normalizedModelShortcutKeys]);
  const presetShortcutItems = useMemo<ShortcutItem[]>(() => {
    const assignedItems = taskPresets
      .slice(0, TASK_PRESET_SHORTCUT_SLOT_LABELS.length)
      .map((preset, index) => {
        const slotLabel = getTaskPresetShortcutLabel(index);
        if (!slotLabel) {
          return null;
        }
        return {
          label: `Run ${preset.label}`,
          description:
            "Launch this preset directly. Reorder presets in Settings → Presets to change Ctrl+1..9.",
          sequences: [["Ctrl", slotLabel]],
        } satisfies ShortcutItem;
      })
      .filter((item): item is ShortcutItem => item != null);

    if (assignedItems.length > 0) {
      return assignedItems;
    }

    return [
      {
        label: "Preset shortcut slots",
        description:
          "The first nine presets in Settings → Presets respond to Ctrl+1..9 in list order.",
        sequences: [["Ctrl", "1-9"]],
      },
    ];
  }, [taskPresets]);
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
      sequences.length === 1 && sequences[0]?.[0] === "Disabled";

    return {
      label: args.label,
      description: isDisabled
        ? `${args.description} Disabled in Settings -> Command Palette.`
        : args.description,
      sequences,
      sequenceJoiner: isDisabled ? "or" : "then",
    };
  };

  const sections = useMemo<ShortcutSection[]>(
    () => [
      {
        title: "Tasks",
        description:
          "Create conversations and move around the current workspace.",
        shortcuts: [
          {
            label: "Select workspace",
            description:
              "Jump to the first nine visible workspaces in the sidebar, from top to bottom.",
            sequences: [[modifierLabel, "Shift", "1-9"]],
          },
          {
            label: "New task",
            description: "Start a fresh task in the selected workspace.",
            sequences: [[modifierLabel, "N"]],
          },
          {
            label: "Close tab / task",
            description:
              "Close the active pane tab without archiving its task.",
            sequences: [[modifierLabel, "W"]],
          },
          {
            label: "Next task",
            description: "Move selection to the next task.",
            sequences: [
              [modifierLabel, "Shift", "J"],
              [modifierLabel, "Shift", "ArrowDown"],
            ],
          },
          {
            label: "Previous task",
            description: "Move selection to the previous task.",
            sequences: [
              [modifierLabel, "Shift", "K"],
              [modifierLabel, "Shift", "ArrowUp"],
            ],
          },
        ],
      },
      {
        title: "Presets",
        description: "Launch the preset bar without leaving the keyboard.",
        shortcuts: presetShortcutItems,
      },
      {
        title: "Panels",
        description: "Control the shell layout without leaving the keyboard.",
        shortcuts: [
          buildShellShortcutItem({
            actionId: "view.toggle-workspace-sidebar",
            label: "Toggle workspace sidebar",
            description:
              "Collapse or expand the left project and workspace list.",
          }),
          buildShellShortcutItem({
            actionId: "view.toggle-changes-panel",
            label: "Source control panel",
            description:
              "Show or hide the source control overlay on the right rail.",
          }),
          buildShellShortcutItem({
            actionId: "view.show-explorer",
            label: "Open explorer panel",
            description: "Open the explorer overlay on the right rail.",
          }),
          {
            label: "Search in files",
            description:
              "Open the explorer search UI and search file contents, including pasted multiline code blocks.",
            sequences: [[modifierLabel, "Shift", "F"]],
          },
          buildShellShortcutItem({
            actionId: "view.show-information",
            label: "Toggle information panel",
            description: "Show or hide the workspace information panel.",
          }),
          buildShellShortcutItem({
            actionId: "view.show-scripts",
            label: `Open ${WORKSPACE_TOOLS_LABEL}`,
            description:
              "Open long-running processes, one-shot commands, lifecycle triggers, and recent runs.",
          }),
          buildShellShortcutItem({
            actionId: "view.show-lens",
            label: "Open Lens tab",
            description:
              "Focus the latest embedded browser tab, or create one.",
          }),
          {
            label: "Visual comment",
            description:
              "Toggle Lens visual comment mode while the Lens panel is available.",
            sequences: visualCommentShortcutSequences,
          },
          buildShellShortcutItem({
            actionId: "view.toggle-editor",
            label: "Focus editor",
            description: "Focus the active editor tab.",
          }),
          {
            label: "Split pane right",
            description: "Move the active tab into a new pane on the right.",
            sequences: [[modifierLabel, "\\"]],
          },
          {
            label: "Split pane down",
            description: "Move the active tab into a new pane below.",
            sequences: [[modifierLabel, "Shift", "\\"]],
          },
          buildShellShortcutItem({
            actionId: "view.toggle-terminal",
            label: "Toggle terminal",
            description:
              "Focus the terminal pane, or return to the previous tab.",
          }),
        ],
      },
      {
        title: "Actions",
        description: "Common task and editor commands.",
        shortcuts: [
          buildShellShortcutItem({
            actionId: "navigation.home",
            label: "Go home",
            description:
              "Clear the active task selection and return to the project overview.",
          }),
          {
            label: "Focus prompt composer",
            description:
              "Move focus back to the chat prompt when the composer is not already focused.",
            sequences: [
              [modifierLabel, "L"],
              [modifierLabel, "J"],
            ],
          },
          {
            label: "Open model selector",
            description: "Open the prompt model picker from the keyboard.",
            sequences: [["Alt", "P"]],
          },
          {
            label: "Quick open file",
            description:
              "Search the active workspace files and open a file in the editor.",
            sequences: [[modifierLabel, "P"]],
          },
          {
            label: "Open command palette",
            description:
              "Open the global Stave command launcher for IDE actions and settings.",
            sequences: [[modifierLabel, "Shift", "P"]],
          },
          {
            label: "Stage comment",
            description:
              "Move the current composer text into the Comment strip instead of sending it.",
            sequences: promptCommentShortcutSequences,
          },
          {
            label: "Toggle plan mode",
            description:
              "Switch the active prompt between normal and plan mode from anywhere in the app.",
            sequences: [["Shift", "Tab"]],
          },
          {
            label: "Toggle Advisor",
            description:
              "Arm or disarm this task's Advisor. While a turn is waiting on the Advisor, this also skips it and lets the turn continue.",
            sequences: [["Alt", "A"]],
          },
          {
            label: "Open Advisor picker",
            description:
              "Choose which provider, model, and effort advises this task.",
            sequences: [["Alt", "Shift", "A"]],
          },
          {
            label: "Toggle Worker mode",
            description:
              "Arm or disarm this task's worker. The primary keeps planning and reviewing; the worker implements.",
            sequences: [["Alt", "W"]],
          },
          {
            label: "Open Worker picker",
            description:
              "Choose the worker preset, model, and reasoning effort for this task.",
            sequences: [["Alt", "Shift", "W"]],
          },
          {
            label: "Dialog primary action",
            description:
              "Run Save/Create/Open/Confirm in the active dialog. Use modifier+Enter in multiline fields.",
            sequences: [["Enter"], [modifierLabel, "Enter"]],
          },
          {
            label: "Save file",
            description: "Save the active editor tab.",
            sequences: [[modifierLabel, "S"]],
          },
          {
            label: "Stop active turn",
            description:
              "Abort the current task run while focus is in the task pane.",
            sequences: [["Esc"]],
          },
        ],
      },
      {
        title: "Models",
        description:
          "Jump directly to the models you mapped for the prompt composer.",
        shortcuts: modelShortcutItems,
      },
      {
        title: "Help",
        description: "Surface the guide itself when you need it.",
        shortcuts: [
          {
            label: "Open settings",
            description: "Open the main Stave settings dialog.",
            sequences: [[modifierLabel, ","]],
          },
          {
            label: "Open shortcut guide",
            description: "Show this panel from anywhere outside text inputs.",
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
                    Keyboard reference
                  </DrawerTitle>
                  <DrawerDescription
                    className={sx(shortcutsDrawerStyles.description)}
                  >
                    Search every active Stave shortcut and custom binding.
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
                    placeholder="Find an action or key…"
                    aria-label="Search keyboard shortcuts"
                    xstyle={shortcutsDrawerStyles.searchInput}
                  />
                  {searchQuery ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      xstyle={shortcutsDrawerStyles.clearButton}
                      aria-label="Clear shortcut search"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className={sx(shortcutsDrawerStyles.clearIcon)} />
                    </Button>
                  ) : null}
                </div>
                <span className={sx(shortcutsDrawerStyles.shownCount)}>
                  {visibleShortcutCount} shown
                </span>
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
                <p className={sx(shortcutsDrawerStyles.emptyTitle)}>
                  No shortcut matches “{searchQuery.trim()}”
                </p>
                <p className={sx(shortcutsDrawerStyles.emptyHint)}>
                  Try an action name, panel, or key combination.
                </p>
              </div>
            )}
          </div>
          <DrawerFooter className={sx(shortcutsDrawerStyles.footer)}>
            <p className={sx(shortcutsDrawerStyles.footerNote)}>
              Showing {modifierLabel} bindings for this device. Customize shell,
              model, and preset shortcuts from Settings → Command Palette.
            </p>
            <DrawerClose render={<Button variant="outline" />}>
              Close
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
