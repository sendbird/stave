import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowUpDown, CornerDownLeft, Pin, PinOff } from "lucide-react";
import {
  Badge,
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { cn } from "@/lib/utils";
import {
  buildCommandPaletteGroups,
  recordRecentCommandPaletteAction,
  searchCommandPaletteGroups,
  toggleCommandPalettePinnedAction,
  type CommandPaletteRuntimeContext,
} from "@/components/layout/command-palette-registry";
import { useAppStore } from "@/store/app.store";

interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: CommandPaletteRuntimeContext;
}

export function GlobalCommandPalette(args: GlobalCommandPaletteProps) {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [query, setQuery] = useState("");
  const [selectedActionId, setSelectedActionId] = useState("");
  const [pinAnnouncement, setPinAnnouncement] = useState("");
  const sections = useMemo(
    () => buildCommandPaletteGroups(args.runtimeContext),
    [args.runtimeContext],
  );
  const visibleSections = useMemo(
    () => searchCommandPaletteGroups({ groups: sections, query }),
    [query, sections],
  );
  const actionById = useMemo(
    () =>
      new Map(
        sections.flatMap((section) =>
          section.items.map((action) => [action.id, action] as const),
        ),
      ),
    [sections],
  );
  const selectedAction = actionById.get(selectedActionId);
  const selectedActionIsPinned = Boolean(
    selectedAction &&
    args.runtimeContext.preferences.pinnedIds.includes(selectedAction.id),
  );
  const selectedActionCanBePinned = Boolean(
    selectedAction && selectedAction.customizable !== false,
  );
  const actionCount = useMemo(
    () => sections.reduce((count, section) => count + section.items.length, 0),
    [sections],
  );
  const resultCount = useMemo(
    () =>
      visibleSections.reduce(
        (count, section) => count + section.items.length,
        0,
      ),
    [visibleSections],
  );

  useEffect(() => {
    if (args.open) {
      return;
    }
    setQuery("");
    setSelectedActionId("");
    setPinAnnouncement("");
  }, [args.open]);

  const toggleSelectedActionPin = useCallback(() => {
    if (!selectedAction || selectedAction.customizable === false) {
      return;
    }
    const next = toggleCommandPalettePinnedAction({
      commandId: selectedAction.id,
      hiddenIds: args.runtimeContext.preferences.hiddenIds,
      pinnedIds: args.runtimeContext.preferences.pinnedIds,
    });
    updateSettings({
      patch: {
        commandPaletteHiddenCommandIds: next.hiddenIds,
        commandPalettePinnedCommandIds: next.pinnedIds,
      },
    });
    setPinAnnouncement(
      `${selectedAction.title} ${next.isPinned ? "pinned" : "unpinned"}.`,
    );
  }, [
    args.runtimeContext.preferences.hiddenIds,
    args.runtimeContext.preferences.pinnedIds,
    selectedAction,
    updateSettings,
  ]);

  const handleCommandKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLocaleLowerCase() === "p"
      ) {
        event.preventDefault();
        toggleSelectedActionPin();
      }
    },
    [toggleSelectedActionPin],
  );

  return (
    <CommandDialog
      open={args.open}
      onOpenChange={args.onOpenChange}
      title="Command Palette"
      description="Run workspace commands, switch context, and open settings."
      className="max-w-[44rem]"
    >
      <Command
        key={args.open ? "open" : "closed"}
        className="flex h-[min(74vh,36rem)] min-h-0 flex-col"
        shouldFilter={false}
        loop
        value={selectedActionId}
        onValueChange={setSelectedActionId}
        onKeyDown={handleCommandKeyDown}
      >
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Find a command, task, workspace, or setting…"
        />
        <CommandList className="min-h-0 max-h-none flex-1 px-2 py-2">
          <CommandEmpty className="px-4 py-10 text-left">
            <p className="text-sm font-medium text-foreground">
              {query.trim()
                ? `No command matches “${query.trim()}”`
                : "No commands available in this context"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query.trim()
                ? "Try an action, destination, task, workspace, or a shorter phrase."
                : "Open a project or task to make its contextual commands available."}
            </p>
          </CommandEmpty>
          {visibleSections.map((section) => (
            <CommandGroup
              key={section.key}
              heading={section.title}
              className="py-1"
            >
              {section.items.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={action.id}
                    value={action.id}
                    onSelect={() => {
                      args.onOpenChange(false);
                      updateSettings({
                        patch: {
                          commandPaletteRecentCommandIds:
                            recordRecentCommandPaletteAction({
                              commandId: action.id,
                              recentIds:
                                args.runtimeContext.preferences.recentIds,
                            }),
                        },
                      });
                      void action.run();
                    }}
                    className="items-start gap-3 px-3 py-2.5"
                  >
                    {action.providerIcon ? (
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                        <ModelIcon
                          providerId={action.providerIcon}
                          className="size-4"
                        />
                      </div>
                    ) : Icon ? (
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                        <Icon className="size-4" />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {action.title}
                        </span>
                        {action.source === "contributed" ? (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] tracking-[0.12em] uppercase"
                          >
                            Ext
                          </Badge>
                        ) : null}
                        {action.contextLabel ? (
                          <Badge
                            variant="secondary"
                            className="h-4 px-1.5 text-[9px] font-medium tracking-normal"
                          >
                            {action.contextLabel}
                          </Badge>
                        ) : null}
                      </div>
                      {action.subtitle ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {action.subtitle}
                        </p>
                      ) : null}
                    </div>
                    {action.shortcut ? (
                      <CommandShortcut
                        className={cn(
                          "mt-0.5 whitespace-nowrap font-mono text-[10px] tracking-normal",
                        )}
                      >
                        {action.shortcut}
                      </CommandShortcut>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-border/60 px-3 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <ArrowUpDown className="size-3" aria-hidden="true" />
              Navigate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CornerDownLeft className="size-3" aria-hidden="true" />
              Run
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 max-w-56 gap-1.5 px-2 text-[11px] text-muted-foreground"
              disabled={!selectedActionCanBePinned}
              onClick={toggleSelectedActionPin}
              aria-keyshortcuts="Alt+P"
              aria-label={
                selectedAction
                  ? `${selectedActionIsPinned ? "Unpin" : "Pin"} ${selectedAction.title}`
                  : "Pin selected command"
              }
              title={
                selectedAction?.customizable === false
                  ? "Context-generated commands cannot be pinned"
                  : selectedAction
                    ? `${selectedActionIsPinned ? "Unpin" : "Pin"} selected command (Alt+P)`
                    : "Select a command to pin it"
              }
            >
              {selectedActionIsPinned ? (
                <PinOff className="size-3" aria-hidden="true" />
              ) : (
                <Pin className="size-3" aria-hidden="true" />
              )}
              <span className="truncate">
                {selectedActionIsPinned ? "Unpin" : "Pin"}
              </span>
              <kbd
                className="ml-0.5 font-mono text-[9px] text-muted-foreground/75"
                aria-hidden="true"
              >
                Alt+P
              </kbd>
            </Button>
            <span className="shrink-0 tabular-nums">
              {query.trim()
                ? `${resultCount} result${resultCount === 1 ? "" : "s"}`
                : `${actionCount} available`}
            </span>
          </span>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {pinAnnouncement}
        </span>
      </Command>
    </CommandDialog>
  );
}
