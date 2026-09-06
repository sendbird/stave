import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowUpDown, CornerDownLeft, Pin, PinOff } from "lucide-react";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
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
import {
  buildCommandPaletteGroups,
  recordRecentCommandPaletteAction,
  searchCommandPaletteGroups,
  toggleCommandPalettePinnedAction,
  type CommandPaletteRuntimeContext,
} from "@/components/layout/command-palette-registry";
import { useAppStore } from "@/store/app.store";
import { commandPaletteStyles } from "./global-command-palette.styles";

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
      className={sx(commandPaletteStyles.dialog)}
    >
      <Command
        key={args.open ? "open" : "closed"}
        className={sx(commandPaletteStyles.frame)}
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
        <CommandList className={sx(commandPaletteStyles.list)}>
          <CommandEmpty className={sx(commandPaletteStyles.empty)}>
            <p className={sx(commandPaletteStyles.emptyTitle)}>
              {query.trim()
                ? `No command matches “${query.trim()}”`
                : "No commands available in this context"}
            </p>
            <p className={sx(commandPaletteStyles.emptyHint)}>
              {query.trim()
                ? "Try an action, destination, task, workspace, or a shorter phrase."
                : "Open a project or task to make its contextual commands available."}
            </p>
          </CommandEmpty>
          {visibleSections.map((section) => (
            <CommandGroup
              key={section.key}
              heading={section.title}
              className={sx(commandPaletteStyles.group)}
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
                    className={sx(commandPaletteStyles.item)}
                  >
                    {action.providerIcon ? (
                      <div className={sx(commandPaletteStyles.itemIconBox)}>
                        <ModelIcon
                          providerId={action.providerIcon}
                          className={sx(commandPaletteStyles.itemIcon)}
                        />
                      </div>
                    ) : Icon ? (
                      <div
                        className={sx(
                          commandPaletteStyles.itemIconBox,
                          commandPaletteStyles.itemIconBoxMuted,
                        )}
                      >
                        <Icon className={sx(commandPaletteStyles.itemIcon)} />
                      </div>
                    ) : null}
                    <div className={sx(commandPaletteStyles.itemBody)}>
                      <div className={sx(commandPaletteStyles.itemTitleRow)}>
                        <span className={sx(commandPaletteStyles.itemTitle)}>
                          {action.title}
                        </span>
                        {action.source === "contributed" ? (
                          <Badge
                            variant="outline"
                            className={sx(commandPaletteStyles.extBadge)}
                          >
                            Ext
                          </Badge>
                        ) : null}
                        {action.contextLabel ? (
                          <Badge
                            variant="secondary"
                            className={sx(commandPaletteStyles.contextBadge)}
                          >
                            {action.contextLabel}
                          </Badge>
                        ) : null}
                      </div>
                      {action.subtitle ? (
                        <p className={sx(commandPaletteStyles.itemSubtitle)}>
                          {action.subtitle}
                        </p>
                      ) : null}
                    </div>
                    {action.shortcut ? (
                      <CommandShortcut
                        className={sx(commandPaletteStyles.itemShortcut)}
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
        <div className={sx(commandPaletteStyles.footer)}>
          <span className={sx(commandPaletteStyles.footerGroup)}>
            <span className={sx(commandPaletteStyles.footerHint)}>
              <ArrowUpDown
                className={sx(commandPaletteStyles.footerIcon)}
                aria-hidden="true"
              />
              Navigate
            </span>
            <span className={sx(commandPaletteStyles.footerHint)}>
              <CornerDownLeft
                className={sx(commandPaletteStyles.footerIcon)}
                aria-hidden="true"
              />
              Run
            </span>
          </span>
          <span className={sx(commandPaletteStyles.footerGroupTight)}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              xstyle={commandPaletteStyles.pinButton}
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
                <PinOff
                  className={sx(commandPaletteStyles.footerIcon)}
                  aria-hidden="true"
                />
              ) : (
                <Pin
                  className={sx(commandPaletteStyles.footerIcon)}
                  aria-hidden="true"
                />
              )}
              <span className={sx(commandPaletteStyles.pinLabel)}>
                {selectedActionIsPinned ? "Unpin" : "Pin"}
              </span>
              <kbd
                className={sx(commandPaletteStyles.pinKeyHint)}
                aria-hidden="true"
              >
                Alt+P
              </kbd>
            </Button>
            <span className={sx(commandPaletteStyles.resultCount)}>
              {query.trim()
                ? `${resultCount} result${resultCount === 1 ? "" : "s"}`
                : `${actionCount} available`}
            </span>
          </span>
        </div>
        <VisuallyHidden role="status" aria-live="polite">
          {pinAnnouncement}
        </VisuallyHidden>
      </Command>
    </CommandDialog>
  );
}
