import { Fragment, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Keyboard, Search, X } from "lucide-react";
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
  Kbd,
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
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      {sequences.map((sequence, sequenceIndex) => (
        <Fragment key={sequence.join("-")}>
          {sequenceIndex > 0 ? (
            <span className="text-xs text-muted-foreground">
              {sequenceJoiner}
            </span>
          ) : null}
          <KbdGroup aria-label={`Keyboard shortcut ${sequence.join(" ")}`}>
            {sequence.map((part, partIndex) => (
              <Fragment key={`${part}-${partIndex}`}>
                {partIndex > 0 ? <KbdSeparator>+</KbdSeparator> : null}
                <Kbd>{part}</Kbd>
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
              "Open workspace commands, processes, lifecycle triggers, and recent runs.",
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
      <DrawerContent className="overflow-hidden border-border/80 bg-background data-[swipe-direction=up]:mb-0 data-[swipe-direction=up]:h-dvh data-[swipe-direction=up]:max-h-dvh data-[swipe-direction=up]:rounded-b-none data-[swipe-direction=up]:border-b-0">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <DrawerHeader className="shrink-0 gap-0 border-b border-border/65 bg-[linear-gradient(110deg,color-mix(in_oklch,var(--surface)_90%,var(--background)),var(--background))] px-5 py-4 !text-left md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <Keyboard className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 text-left">
                  <DrawerTitle className="font-heading truncate text-lg font-semibold leading-tight">
                    Keyboard reference
                  </DrawerTitle>
                  <DrawerDescription className="mt-0.5 truncate">
                    Search every active Stave shortcut and custom binding.
                  </DrawerDescription>
                </div>
              </div>
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:min-w-64">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Find an action or key…"
                    aria-label="Search keyboard shortcuts"
                    className="h-9 bg-background/55 pl-8 pr-8"
                  />
                  {searchQuery ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2"
                      aria-label="Clear shortcut search"
                      onClick={() => setSearchQuery("")}
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {visibleShortcutCount} shown
                </span>
              </div>
            </div>
          </DrawerHeader>
          <div className="grid min-h-0 flex-1 auto-rows-max content-start items-start gap-x-8 gap-y-7 overflow-y-auto overscroll-contain px-5 py-6 md:grid-cols-2 md:px-6 xl:grid-cols-3">
            {filteredSections.length > 0 ? (
              filteredSections.map((section) => (
                <section
                  key={section.title}
                  className="self-start border-t-2 border-primary/25"
                >
                  <header className="px-1 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-xs font-semibold tracking-[0.12em] text-foreground uppercase">
                        {section.title}
                      </h2>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {section.shortcuts.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {section.description}
                    </p>
                  </header>
                  <div className="border-b border-border/55">
                    {section.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.label}
                        className="flex flex-col gap-2 border-t border-border/55 px-1 py-3 transition-colors hover:bg-accent/12"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {shortcut.label}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
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
              <div className="col-span-full py-20 text-center">
                <p className="text-sm font-medium text-foreground">
                  No shortcut matches “{searchQuery.trim()}”
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try an action name, panel, or key combination.
                </p>
              </div>
            )}
          </div>
          <DrawerFooter className="mt-0 shrink-0 border-t border-border/70 px-5 py-4 md:flex-row md:items-start md:justify-between md:px-6">
            <p className="max-w-4xl text-xs leading-5 text-muted-foreground">
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
