import { Fragment, useMemo } from "react";
import { Keyboard } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, Kbd, KbdGroup, KbdSeparator } from "@/components/ui";

interface KeyboardShortcutsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  label: string;
  description: string;
  sequences: string[][];
}

interface ShortcutSection {
  title: string;
  description: string;
  shortcuts: ShortcutItem[];
}

function ShortcutKeys({ sequences }: Pick<ShortcutItem, "sequences">) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sequences.map((sequence, sequenceIndex) => (
        <Fragment key={sequence.join("-")}>
          {sequenceIndex > 0 ? <span className="text-xs text-muted-foreground">or</span> : null}
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

export function KeyboardShortcutsDrawer({ open, onOpenChange }: KeyboardShortcutsDrawerProps) {
  if (!open) {
    return null;
  }

  const modifierLabel = useMemo(
    () => (
      typeof navigator !== "undefined" && /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "Cmd"
        : "Ctrl"
    ),
    [],
  );

  const sections = useMemo<ShortcutSection[]>(
    () => [
      {
        title: "Tasks",
        description: "Create, switch, and jump between conversations.",
        shortcuts: [
          {
            label: "New task",
            description: "Start a fresh task in the selected workspace.",
            sequences: [[modifierLabel, "N"]],
          },
          {
            label: "Close tab / task",
            description: "Close the active editor tab, or archive the task if no tabs are open.",
            sequences: [[modifierLabel, "W"]],
          },
          {
            label: "Next task",
            description: "Move selection to the next task.",
            sequences: [[modifierLabel, "Shift", "J"], [modifierLabel, "Shift", "ArrowDown"]],
          },
          {
            label: "Previous task",
            description: "Move selection to the previous task.",
            sequences: [[modifierLabel, "Shift", "K"], [modifierLabel, "Shift", "ArrowUp"]],
          },
          {
            label: "Quick jump",
            description: "Jump straight to active tasks 1 through 0.",
            sequences: [[modifierLabel, "1-0"]],
          },
        ],
      },
      {
        title: "Panels",
        description: "Control the shell layout without leaving the keyboard.",
        shortcuts: [
          {
            label: "Toggle side panel",
            description: "Show or hide the explorer and changes panel.",
            sequences: [[modifierLabel, "B"]],
          },
          {
            label: "Toggle editor",
            description: "Show or hide the editor panel.",
            sequences: [[modifierLabel, "E"]],
          },
          {
            label: "Toggle terminal",
            description: "Dock or hide the terminal panel.",
            sequences: [[modifierLabel, "`"]],
          },
        ],
      },
      {
        title: "Actions",
        description: "Common task and editor commands.",
        shortcuts: [
          {
            label: "Save file",
            description: "Save the active editor tab.",
            sequences: [[modifierLabel, "S"]],
          },
          {
            label: "Switch provider",
            description: "Flip the current task between Claude and Codex.",
            sequences: [[modifierLabel, "Shift", "P"]],
          },
          {
            label: "Stop active turn",
            description: "Abort the current task run.",
            sequences: [["Esc"]],
          },
        ],
      },
      {
        title: "Help",
        description: "Surface the guide itself when you need it.",
        shortcuts: [
          {
            label: "Open shortcut guide",
            description: "Show this panel from anywhere outside text inputs.",
            sequences: [[modifierLabel, "/"]],
          },
        ],
      },
    ],
    [modifierLabel],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="top">
      <DrawerContent className="border-border/80 bg-card/95 shadow-2xl supports-backdrop-filter:backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-col">
          <DrawerHeader className="gap-3 border-b border-border/70 px-5 pb-5 pt-5 text-left md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-foreground">
                  <Keyboard />
                </div>
                <div className="min-w-0">
                  <DrawerTitle className="text-lg font-semibold">Keyboard Shortcuts</DrawerTitle>
                  <DrawerDescription>
                    The current shell shortcuts available in Stave.
                  </DrawerDescription>
                </div>
              </div>
              <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                {modifierLabel} on this device
              </Badge>
            </div>
          </DrawerHeader>
          <div className="grid gap-4 overflow-y-auto px-5 py-5 md:grid-cols-2 md:px-6 xl:grid-cols-4">
            {sections.map((section) => (
              <Card key={section.title} className="border-border/70 bg-background/75 shadow-sm">
                <CardHeader className="gap-1.5 pb-3">
                  <CardTitle className="text-sm font-semibold">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {section.shortcuts.map((shortcut) => (
                    <div key={shortcut.label} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium text-foreground">{shortcut.label}</p>
                        <p className="text-xs text-muted-foreground">{shortcut.description}</p>
                      </div>
                      <ShortcutKeys sequences={shortcut.sequences} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <DrawerFooter className="border-t border-border/70 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <p className="text-sm text-muted-foreground">
              Task quick jump works on the active task list, and the guide shortcut is ignored while typing in inputs.
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
