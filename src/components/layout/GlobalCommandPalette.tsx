import { i18n, useTranslation } from "@/i18n";
import {
  useCallback,
  useEffect,
  useId,
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
  Kbd,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { listAllCustomThemes } from "@/lib/themes/apply";
import {
  buildCommandPaletteGroups,
  recordRecentCommandPaletteAction,
  searchCommandPaletteGroups,
  toggleCommandPalettePinnedAction,
  type CommandPaletteAction,
  type CommandPaletteRuntimeContext,
} from "@/components/layout/command-palette-registry";
import { useAppStore } from "@/store/app.store";
import {
  buildCommandPaletteLeaves,
  rankCommandPaletteLeaves,
  type CommandPaletteLeaf,
} from "./command-palette-leaves";
import {
  filterSectionsForTaskScope,
  openTaskSearchResult,
  renderTaskSearchGroup,
  taskSearchItemValue,
  usePaletteTaskSearch,
  type PaletteTaskScope,
} from "./command-palette-task-search";
import { commandPaletteStyles } from "./global-command-palette.styles";

const NO_LEAVES: readonly CommandPaletteLeaf[] = [];

interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: CommandPaletteRuntimeContext;
}

export function GlobalCommandPalette(args: GlobalCommandPaletteProps) {
  useTranslation();
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [query, setQuery] = useState("");
  const [selectedActionId, setSelectedActionId] = useState("");
  const scopeLabelId = useId();
  const [pinAnnouncement, setPinAnnouncement] = useState("");
  const [taskScope, setTaskScope] = useState<PaletteTaskScope>("workspace");
  const taskSearch = usePaletteTaskSearch({ query, enabled: args.open && taskScope === "all" });
  const sections = useMemo(
    () => buildCommandPaletteGroups(args.runtimeContext),
    [args.runtimeContext, i18n.language],
  );
  const visibleSections = useMemo(
    () => filterSectionsForTaskScope(searchCommandPaletteGroups({ groups: sections, query }), taskScope),
    [query, sections, taskScope],
  );
  // Options inside commands (a theme, an appearance mode, a repository to
  // start a task in). Built once per palette context, ranked per keystroke.
  const userCustomThemes = useAppStore((state) => state.settings.userCustomThemes);
  const themeMode = useAppStore((state) => state.settings.themeMode);
  const customThemeId = useAppStore((state) => state.settings.customThemeId);
  const { commands, repositories } = args.runtimeContext;
  const leaves = useMemo(
    () =>
      args.open
        ? buildCommandPaletteLeaves({
            themes: listAllCustomThemes({ userThemes: userCustomThemes }),
            activeThemeId: customThemeId,
            appearanceMode: themeMode,
            repositories,
            actions: {
              applyTheme: (themeId) => updateSettings({ patch: { customThemeId: themeId } }),
              setAppearanceMode: (mode) =>
                updateSettings({ patch: { themeMode: mode, customThemeId: null } }),
              newTaskInRepository: async (repository) => {
                if (!repository.isCurrent) {
                  await commands.openRepository(repository.repositoryPath);
                }
                commands.createTask();
              },
            },
          })
        : NO_LEAVES,
    [args.open, commands, customThemeId, i18n.language, repositories, themeMode, updateSettings, userCustomThemes],
  );
  const leafSuggestions = useMemo(
    () => rankCommandPaletteLeaves({ leaves, query }),
    [leaves, query],
  );
  const searchResultCount = taskSearch.status === "idle" ? 0 : taskSearch.results.length;
  // A fresh search across repositories starts on its best match.
  const firstSearchResult = taskSearch.status === "ready" ? taskSearch.results[0] : undefined;
  useEffect(() => {
    if (firstSearchResult) setSelectedActionId(taskSearchItemValue(firstSearchResult));
  }, [firstSearchResult]);
  const actionById = useMemo(
    () =>
      new Map(
        sections.flatMap((section) =>
          section.items.map((action) => [action.id, action] as const),
        ),
      ),
    [sections],
  );
  // Suggested options lead the list, so a query that brings one starts on it
  // (Enter runs it), the same way a fresh search across repositories does.
  const firstLeafId = leafSuggestions[0]?.id;
  useEffect(() => {
    if (firstLeafId) setSelectedActionId(firstLeafId);
  }, [firstLeafId]);
  const visibleActionIds = useMemo(
    () =>
      new Set(
        visibleSections.flatMap((section) =>
          section.items.map((action) => action.id),
        ),
      ),
    [visibleSections],
  );
  // Only a command on screen can be pinned; an option or a command the query
  // filtered away cannot.
  const selectedAction = visibleActionIds.has(selectedActionId)
    ? actionById.get(selectedActionId)
    : undefined;
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
      ) + searchResultCount + leafSuggestions.length,
    [leafSuggestions.length, searchResultCount, visibleSections],
  );

  useEffect(() => {
    if (args.open) {
      return;
    }
    setQuery("");
    setSelectedActionId("");
    setPinAnnouncement("");
    setTaskScope("workspace");
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
      i18n.t(next.isPinned ? "shell:globalCommandPalette.pinnedAnnouncement" : "shell:globalCommandPalette.unpinnedAnnouncement", { title: selectedAction.title }),
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

  const renderAction = (
    action: CommandPaletteAction,
    options: { recordRecent: boolean },
  ) => {
    const Icon = action.icon;
    return (
      <CommandItem
        key={action.id}
        value={action.id}
        onSelect={() => {
          args.onOpenChange(false);
          // Leaves are rebuilt per context, so only commands are remembered.
          if (options.recordRecent) {
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
          }
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
                {i18n.t("shell:globalCommandPalette.ext")}
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
          <CommandShortcut>{action.shortcut}</CommandShortcut>
        ) : null}
      </CommandItem>
    );
  };

  return (
    <CommandDialog
      open={args.open}
      onOpenChange={args.onOpenChange}
      title={i18n.t("shell:globalCommandPalette.commandPalette")}
      description={i18n.t("shell:globalCommandPalette.runWorkspaceCommandsSwitchContextAndOpen")}
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
          placeholder={i18n.t("shell:globalCommandPalette.findACommandTaskWorkspaceOrSetting")}
        />
        <div className={sx(commandPaletteStyles.scopeRow)}>
          <span id={scopeLabelId} className={sx(commandPaletteStyles.scopeLabel)}>
            {i18n.t("shell:taskSearch.scopeLabel")}
          </span>
          <div className={sx(commandPaletteStyles.scopeButtons)} role="group" aria-labelledby={scopeLabelId}>
            {(["workspace", "all"] as const).map((scope) => (
              <Button
                key={scope}
                type="button"
                size="sm"
                variant={taskScope === scope ? "secondary" : "ghost"}
                aria-pressed={taskScope === scope}
                data-task-scope={scope}
                // Keep typing in the search field while switching.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setTaskScope(scope)}
              >
                {scope === "workspace"
                  ? i18n.t("shell:taskSearch.scopeWorkspace")
                  : i18n.t("shell:taskSearch.scopeAll")}
              </Button>
            ))}
          </div>
        </div>
        <CommandList className={sx(commandPaletteStyles.list)}>
          {/*
            Gated on this palette's own result count. `Command.Empty` wraps Base
            UI's `Autocomplete.Empty`, whose emptiness is derived from the item
            collection IT filtered — and this palette runs `shouldFilter={false}`
            and filters into `visibleSections` itself, so that collection is not
            the thing on screen. Ungated it mounted an 80px padded block above
            every result list, which is the blank band that appeared between the
            query row and the first group.
          */}
          {visibleSections.length === 0 &&
          leafSuggestions.length === 0 &&
          taskScope === "workspace" ? (
            <CommandEmpty className={sx(commandPaletteStyles.empty)}>
              <p className={sx(commandPaletteStyles.emptyTitle)}>
                {query.trim()
                  ? i18n.t("shell:globalCommandPalette.noCommandMatches", { value1: query.trim() })
                  : i18n.t("shell:globalCommandPalette.noCommandsAvailableInThisContext")}
              </p>
              <p className={sx(commandPaletteStyles.emptyHint)}>
                {query.trim()
                  ? i18n.t("shell:globalCommandPalette.tryAnActionDestinationTaskWorkspaceOr")
                  : i18n.t("shell:globalCommandPalette.openARepositoryOrTaskToMake")}
              </p>
            </CommandEmpty>
          ) : null}
          {taskScope === "all"
            ? renderTaskSearchGroup({
                search: taskSearch,
                query,
                onOpen: (result) => {
                  args.onOpenChange(false);
                  openTaskSearchResult(result);
                },
              })
            : null}
          {leafSuggestions.length > 0 ? (
            <CommandGroup
              heading={i18n.t("shell:commandPaletteLeaves.section")}
              className={sx(commandPaletteStyles.group)}
            >
              {leafSuggestions.map((leaf) =>
                renderAction(leaf, { recordRecent: false }),
              )}
            </CommandGroup>
          ) : null}
          {visibleSections.map((section) => (
            <CommandGroup
              key={section.key}
              heading={section.title}
              className={sx(commandPaletteStyles.group)}
            >
              {section.items.map((action) =>
                renderAction(action, { recordRecent: true }),
              )}
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
              {i18n.t("shell:globalCommandPalette.navigate")}
            </span>
            <span className={sx(commandPaletteStyles.footerHint)}>
              <CornerDownLeft
                className={sx(commandPaletteStyles.footerIcon)}
                aria-hidden="true"
              />
              {i18n.t("shell:globalCommandPalette.run")}
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
                  ? `${selectedActionIsPinned ? i18n.t("shell:globalCommandPalette.unpin") : i18n.t("shell:globalCommandPalette.pin")} ${selectedAction.title}`
                  : i18n.t("shell:globalCommandPalette.pinSelectedCommand")
              }
              title={
                selectedAction?.customizable === false
                  ? i18n.t("shell:globalCommandPalette.contextGeneratedCommandsCannotBePinned")
                  : selectedAction
                    ? i18n.t("shell:globalCommandPalette.selectedCommandAltP", { value1: selectedActionIsPinned ? i18n.t("shell:globalCommandPalette.unpin") : i18n.t("shell:globalCommandPalette.pin") })
                    : i18n.t("shell:globalCommandPalette.selectACommandToPinIt")
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
                {selectedActionIsPinned ? i18n.t("shell:globalCommandPalette.unpin") : i18n.t("shell:globalCommandPalette.pin")}
              </span>
              <Kbd aria-hidden="true">Alt+P</Kbd>
            </Button>
            <span className={sx(commandPaletteStyles.resultCount)}>
              {query.trim()
                ? i18n.t("shell:globalCommandPalette.result", { count: resultCount })
                : i18n.t("shell:globalCommandPalette.available", { value1: actionCount })}
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
