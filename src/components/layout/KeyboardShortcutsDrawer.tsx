import { Fragment, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { Keyboard } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Kbd,
  KbdGroup,
  KbdSeparator,
} from "@/components/ui";
import {
  describeModelShortcutKey,
  MODEL_SHORTCUT_SLOT_LABELS,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import {
  buildAppShortcutSequences,
  normalizeAppShortcutKeys,
} from "@/lib/app-shortcuts";
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
    <div className="flex flex-wrap items-center gap-2">
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
  const modifierLabel = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "Cmd"
        : "Ctrl",
    [],
  );
  const [storedModelShortcutKeys, storedAppShortcutKeys, taskPresets] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.settings.modelShortcutKeys,
            state.settings.appShortcutKeys,
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
  const modelShortcutItems = useMemo<ShortcutItem[]>(() => {
    const assignedItems = MODEL_SHORTCUT_SLOT_LABELS.map((slotLabel, index) => {
      const details = describeModelShortcutKey({
        shortcutKey: normalizedModelShortcutKeys[index] ?? "",
      });
      if (!details) {
        return null;
      }
      return {
        label: `Select ${details.modelLabel}`,
        description: `Switch the active task to ${details.providerLabel} and use ${details.modelLabel}. Customize this slot in Settings → Command Palette.`,
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
  }, [normalizedModelShortcutKeys]);
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
        | "navigation.open-stave-muse"
        | "view.toggle-workspace-sidebar"
        | "view.toggle-changes-panel"
        | "view.show-explorer"
        | "view.show-information"
        | "view.show-scripts"
        | "view.show-lens"
        | "view.toggle-editor"
        | "view.toggle-terminal"
        | "view.toggle-zen-mode";
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

  if (!open) {
    return null;
  }

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
              "Close the active editor tab, or archive the task if no tabs are open.",
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
            label: "Open scripts panel",
            description:
              "Open the workspace scripts runtime, hooks, and services panel.",
          }),
          buildShellShortcutItem({
            actionId: "view.show-lens",
            label: "Open Lens panel",
            description:
              "Open the embedded browser for preview, inspection, and picking.",
          }),
          buildShellShortcutItem({
            actionId: "view.toggle-editor",
            label: "Toggle editor",
            description: "Show or hide the editor panel.",
          }),
          buildShellShortcutItem({
            actionId: "view.toggle-terminal",
            label: "Toggle terminal",
            description: "Dock or hide the terminal panel.",
          }),
          buildShellShortcutItem({
            actionId: "view.toggle-zen-mode",
            label: "Toggle Zen mode",
            description:
              "Hide surrounding workspace chrome and suppress thinking details to focus on chat and results.",
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
          buildShellShortcutItem({
            actionId: "navigation.open-stave-muse",
            label: "Open Stave Muse",
            description: "Open the global Muse widget for app-wide workflows.",
          }),
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
            label: "Toggle plan mode",
            description:
              "Switch the active prompt between normal and plan mode from anywhere in the app.",
            sequences: [["Shift", "Tab"]],
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
      presetShortcutItems,
    ],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="top">
      <DrawerContent className="overflow-hidden border-border/80 bg-card/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl data-[vaul-drawer-direction=top]:mb-0 data-[vaul-drawer-direction=top]:h-dvh data-[vaul-drawer-direction=top]:max-h-dvh data-[vaul-drawer-direction=top]:rounded-b-none data-[vaul-drawer-direction=top]:border-b-0">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <DrawerHeader className="shrink-0 gap-0 border-b border-border/70 px-5 pb-5 pt-5 !text-left md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-foreground">
                  <Keyboard className="size-5" />
                </div>
                <div className="min-w-0 text-left">
                  <DrawerTitle className="truncate text-lg font-semibold leading-tight">
                    Keyboard Shortcuts
                  </DrawerTitle>
                  <DrawerDescription className="mt-0.5 truncate">
                    The current shell shortcuts available in Stave.
                  </DrawerDescription>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="hidden shrink-0 sm:inline-flex"
              >
                {modifierLabel} on this device
              </Badge>
            </div>
          </DrawerHeader>
          <div
            data-vaul-no-drag
            className="grid min-h-0 flex-1 auto-rows-max content-start items-start gap-4 overflow-y-auto overscroll-contain px-5 py-5 md:grid-cols-2 md:px-6 xl:grid-cols-4"
          >
            {sections.map((section) => (
              <Card
                key={section.title}
                className="self-start border-border/70 bg-background/75 shadow-sm"
              >
                <CardHeader className="gap-1.5 pb-3">
                  <CardTitle className="text-sm font-semibold">
                    {section.title}
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {section.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.label}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-3"
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium text-foreground">
                          {shortcut.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {shortcut.description}
                        </p>
                      </div>
                      <ShortcutKeys
                        sequences={shortcut.sequences}
                        sequenceJoiner={shortcut.sequenceJoiner}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <DrawerFooter className="mt-0 shrink-0 border-t border-border/70 px-5 py-4 md:flex-row md:items-start md:justify-between md:px-6">
            <p className="max-w-4xl text-sm text-muted-foreground">
              Workspace quick jump follows the sidebar's top-to-bottom order.
              Quick open and the shortcut guide are ignored while typing in
              inputs, and command palette, plan mode, model selector, model
              shortcuts, and shell chords stay globally available.
            </p>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
