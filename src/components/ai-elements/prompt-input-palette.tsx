import { i18n, useTranslation } from "@/i18n";
import {
  FolderOpen,
  Globe2,
  Info,
  Sparkles,
  Target,
  UserRound,
  Zap,
} from "lucide-react";
import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui";
import type { CommandPaletteProviderNote } from "@/lib/commands";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import type { TaskMentionOption } from "@/lib/task-context/attached-task-context";
import { isAssignPaletteEntry } from "@/components/session/assign-palette-entry";
import { sx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import type { ModelSelectorOption } from "./model-selector";
import type { PromptInputPaletteState } from "./prompt-input-palette-state";
import type { PromptInputPaletteSelection } from "./prompt-input-palette-selection";
import { PromptInputMentionPaletteGroups } from "./prompt-input-palette-mentions";

function renderSkillScopeIcon(scope: SkillCatalogEntry["scope"]) {
  if (scope === "local") {
    return <FolderOpen className={sx(promptInputStyles.scopeIcon)} />;
  }
  if (scope === "user") {
    return <UserRound className={sx(promptInputStyles.scopeIcon)} />;
  }
  return <Globe2 className={sx(promptInputStyles.scopeIcon)} />;
}

/**
 * The open palette's list and footer: empty states, the `@`, `$`, `!` and `/`
 * groups, and the hint under the list. Rendered inside the composer's palette
 * popover.
 */
export function PromptInputPaletteMenu(args: {
  palette: PromptInputPaletteState;
  selection: PromptInputPaletteSelection;
  selectedModel: ModelSelectorOption;
  taskMentionOptions?: readonly TaskMentionOption[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
}) {
  useTranslation();
  const {
    palette,
    selection,
    selectedModel,
    taskMentionOptions,
    commandPaletteProviderNote,
  } = args;
  const {
    commandListRef,
    activePalette,
    paletteValue,
    paletteMacros,
    filteredCommandItems,
    filteredSkillItems,
    filteredMacroItems,
    filteredWorkspaceInformationItems,
    selectedWorkspaceInformationIndex,
    indexedMacroItems,
    staveCommandItems,
    providerCommandItems,
    localSkillItems,
    userSkillItems,
    globalSkillItems,
    setSelectedCommandIndex,
    setSelectedSkillIndex,
    setSelectedMacroIndex,
  } = palette;
  const {
    rememberActivePaletteTokenSelection,
    applyCommandSelection,
    applySkillSelection,
    applyMacroSelection,
  } = selection;
  return (
    <Command
      shouldFilter={false}
      value={paletteValue}
      onValueChange={() => {}}
      className={sx(promptInputStyles.commandRoot)}
    >
      <CommandList
        ref={commandListRef}
        className={sx(promptInputStyles.commandList)}
      >
        {activePalette === "info" &&
        filteredWorkspaceInformationItems.length === 0 ? (
          <CommandEmpty>
            {taskMentionOptions && taskMentionOptions.length > 0
              ? i18n.t("composer:promptInput.composerCard7")
              : i18n.t("composer:promptInput.composerCard8")}
          </CommandEmpty>
        ) : activePalette === "skill" &&
          filteredSkillItems.length === 0 ? (
          <CommandEmpty>{i18n.t("composer:promptInput.composerCard9")}</CommandEmpty>
        ) : activePalette === "macro" &&
          filteredMacroItems.length === 0 ? (
          <CommandEmpty>
            {paletteMacros.length > 0
              ? i18n.t("composer:promptInput.composerCard10")
              : i18n.t("composer:promptInput.composerCard11")}
          </CommandEmpty>
        ) : activePalette === "command" &&
          filteredCommandItems.length === 0 ? (
          <CommandEmpty>{i18n.t("composer:promptInput.composerCard12")}</CommandEmpty>
        ) : (
          <>
            <PromptInputMentionPaletteGroups
              palette={palette}
              selection={selection}
            />
            {activePalette === "skill" &&
            localSkillItems.length > 0 ? (
              <CommandGroup heading={i18n.t("composer:promptInput.heading4")}>
                {localSkillItems.map(({ item, index }) => (
                  <CommandItem
                    key={item.id}
                    value={item.slug}
                    className={sx(promptInputStyles.itemTall)}
                    data-palette-index={index}
                    onMouseEnter={() => setSelectedSkillIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      rememberActivePaletteTokenSelection();
                    }}
                    onSelect={() => applySkillSelection(item)}
                  >
                    <div className={sx(promptInputStyles.iconWrap)}>
                      {renderSkillScopeIcon(item.scope)}
                    </div>
                    <div className={sx(promptInputStyles.flex1Min)}>
                      <div className={sx(promptInputStyles.rowCenterMin)}>
                        <span className={sx(promptInputStyles.truncMedium)}>
                          {item.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className={sx(promptInputStyles.badgeUpperShrink)}
                        >
                          {item.provider === "shared"
                            ? i18n.t("composer:promptInput.copy8")
                            : item.provider === "claude-code"
                              ? "Claude"
                              : "Codex"}
                        </Badge>
                      </div>
                      <p
                        className={sx(promptInputStyles.itemDescClamp)}
                        title={item.description}
                      >
                        {item.description}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {activePalette === "skill" &&
            userSkillItems.length > 0 ? (
              <CommandGroup heading={i18n.t("composer:promptInput.heading5")}>
                {userSkillItems.map(({ item, index }) => (
                  <CommandItem
                    key={item.id}
                    value={item.slug}
                    className={sx(promptInputStyles.itemTall)}
                    data-palette-index={index}
                    onMouseEnter={() => setSelectedSkillIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      rememberActivePaletteTokenSelection();
                    }}
                    onSelect={() => applySkillSelection(item)}
                  >
                    <div className={sx(promptInputStyles.iconWrap)}>
                      {renderSkillScopeIcon(item.scope)}
                    </div>
                    <div className={sx(promptInputStyles.flex1Min)}>
                      <div className={sx(promptInputStyles.rowCenterMin)}>
                        <span className={sx(promptInputStyles.truncMedium)}>
                          {item.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={sx(promptInputStyles.badgeUpperShrink)}
                        >
                          {item.provider === "shared"
                            ? i18n.t("composer:promptInput.copy9")
                            : item.provider === "claude-code"
                              ? "Claude"
                              : "Codex"}
                        </Badge>
                      </div>
                      <p
                        className={sx(promptInputStyles.itemDescClamp)}
                        title={item.description}
                      >
                        {item.description}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {activePalette === "skill" &&
            globalSkillItems.length > 0 ? (
              <CommandGroup heading={i18n.t("composer:promptInput.heading6")}>
                {globalSkillItems.map(({ item, index }) => (
                  <CommandItem
                    key={item.id}
                    value={item.slug}
                    className={sx(promptInputStyles.itemTall)}
                    data-palette-index={index}
                    onMouseEnter={() => setSelectedSkillIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      rememberActivePaletteTokenSelection();
                    }}
                    onSelect={() => applySkillSelection(item)}
                  >
                    <div className={sx(promptInputStyles.iconWrap)}>
                      {renderSkillScopeIcon(item.scope)}
                    </div>
                    <div className={sx(promptInputStyles.flex1Min)}>
                      <div className={sx(promptInputStyles.rowCenterMin)}>
                        <span className={sx(promptInputStyles.truncMedium)}>
                          {item.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={sx(promptInputStyles.badgeUpperShrink)}
                        >
                          {item.provider === "shared"
                            ? i18n.t("composer:promptInput.copy10")
                            : item.provider === "claude-code"
                              ? "Claude"
                              : "Codex"}
                        </Badge>
                      </div>
                      <p
                        className={sx(promptInputStyles.itemDescClamp)}
                        title={item.description}
                      >
                        {item.description}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {activePalette === "macro" &&
            indexedMacroItems.length > 0 ? (
              <CommandGroup
                heading={i18n.t("composer:promptInput.heading7")}
              >
                {indexedMacroItems.map(({ item, index }) => (
                  <CommandItem
                    key={item.id}
                    value={item.slug}
                    className={sx(promptInputStyles.itemTall)}
                    data-palette-index={index}
                    onMouseEnter={() => setSelectedMacroIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      rememberActivePaletteTokenSelection();
                    }}
                    onSelect={() => applyMacroSelection(item)}
                  >
                    <div className={sx(promptInputStyles.iconWrap)}>
                      {isAssignPaletteEntry(item) ? (
                        <Target className={sx(promptInputStyles.iconMuted)} />
                      ) : (
                        <Zap className={sx(promptInputStyles.iconMuted)} />
                      )}
                    </div>
                    <div className={sx(promptInputStyles.flex1Min)}>
                      <div className={sx(promptInputStyles.rowCenterMin)}>
                        <span className={sx(promptInputStyles.truncMedium)}>
                          {item.label}
                        </span>
                        <Badge
                          variant="outline"
                          className={sx(promptInputStyles.badgeMonoShrink)}
                        >
                          !{item.slug}
                        </Badge>
                      </div>
                      <p
                        className={sx(promptInputStyles.itemDescClamp)}
                        title={item.description ?? item.body}
                      >
                        {item.description || item.body}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {activePalette === "command" &&
            staveCommandItems.length > 0 ? (
              <CommandGroup heading={i18n.t("composer:promptInput.staveCommands")}>
                {staveCommandItems.map(({ item, index }) => (
                  <CommandItem
                    key={item.id}
                    value={item.command}
                    className={sx(promptInputStyles.itemStandard)}
                    data-palette-index={index}
                    onMouseEnter={() => setSelectedCommandIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      rememberActivePaletteTokenSelection();
                    }}
                    onSelect={() => applyCommandSelection(item)}
                  >
                    <div className={sx(promptInputStyles.flex1Min)}>
                      <div className={sx(promptInputStyles.rowCenter)}>
                        <span className={sx(promptInputStyles.fontMedium)}>
                          {item.command}
                        </span>
                        <Badge
                          variant="outline"
                          className={sx(promptInputStyles.badgeUpper)}
                        >
                          {i18n.t("composer:promptInput.staveBadge")}
                        </Badge>
                      </div>
                      <p className={sx(promptInputStyles.itemDesc)}>
                        {item.description}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {activePalette === "command" &&
            providerCommandItems.length > 0 ? (
              <CommandGroup
                heading={
                  selectedModel.providerId === "claude-code"
                    ? i18n.t("composer:promptInput.heading8")
                    : selectedModel.providerId === "codex"
                      ? i18n.t("composer:promptInput.heading9")
                      : i18n.t("composer:promptInput.heading10")
                }
              >
                {providerCommandItems.map(({ item, index }) => (
                  <CommandItem
                    key={item.id}
                    value={item.command}
                    className={sx(promptInputStyles.itemStandard)}
                    data-palette-index={index}
                    onMouseEnter={() =>
                      setSelectedCommandIndex(index)
                    }
                    onMouseDown={(event) => {
                      event.preventDefault();
                      rememberActivePaletteTokenSelection();
                    }}
                    onSelect={() => applyCommandSelection(item)}
                  >
                    <div className={sx(promptInputStyles.flex1Min)}>
                      <div className={sx(promptInputStyles.rowCenter)}>
                        <span className={sx(promptInputStyles.fontMedium)}>
                          {item.command}
                        </span>
                        <Badge
                          variant="outline"
                          className={sx(promptInputStyles.badgeUpper)}
                        >
                          {selectedModel.providerId === "claude-code"
                            ? "Claude"
                            : selectedModel.providerId === "codex"
                              ? "Codex"
                              : i18n.t("composer:promptInput.copy11")}
                        </Badge>
                      </div>
                      <p className={sx(promptInputStyles.itemDesc)}>
                        {item.description}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </>
        )}
      </CommandList>
      {activePalette === "info" ? (
        <div className={sx(promptInputStyles.paletteFooter)}>
          <p className={sx(promptInputStyles.paletteFooterTitle)}>
            <Info className={sx(promptInputStyles.icon35)} />
            {filteredWorkspaceInformationItems[
              selectedWorkspaceInformationIndex
            ]?.kind === "task"
              ? i18n.t("composer:promptInput.composerCard13")
              : filteredWorkspaceInformationItems[
                    selectedWorkspaceInformationIndex
                  ]?.kind === "document"
                ? i18n.t("composer:promptInput.documentPaletteHint")
                : i18n.t("composer:promptInput.composerCard14")}
          </p>
          <p className={sx(promptInputStyles.mt2)}>
            {i18n.t("composer:promptInput.composerCard15")}</p>
        </div>
      ) : activePalette === "skill" ? (
        <div className={sx(promptInputStyles.paletteFooter)}>
          <p className={sx(promptInputStyles.paletteFooterTitle)}>
            <Sparkles className={sx(promptInputStyles.icon35)} />
            {i18n.t("composer:promptInput.composerCard16")}</p>
          <p className={sx(promptInputStyles.mt2)}>
            {i18n.t("composer:promptInput.composerCard17")}</p>
        </div>
      ) : activePalette === "macro" ? (
        <div className={sx(promptInputStyles.paletteFooter)}>
          <p className={sx(promptInputStyles.paletteFooterTitle)}>
            <Zap className={sx(promptInputStyles.icon35)} />
            {i18n.t("composer:promptInput.composerCard18")}</p>
          <p className={sx(promptInputStyles.mt2)}>
            {i18n.t("composer:promptInput.composerCard19")}</p>
        </div>
      ) : activePalette === "command" ? (
        <div className={sx(promptInputStyles.paletteFooter)}>
          <p className={sx(promptInputStyles.paletteFooterTitlePlain)}>
            {i18n.t("composer:promptInput.composerCard20")}</p>
          {commandPaletteProviderNote ? (
            <>
              <p className={sx(promptInputStyles.mt2Title)}>
                {commandPaletteProviderNote.title}
              </p>
              <p className={sx(promptInputStyles.mt1Pre)}>
                {commandPaletteProviderNote.description}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </Command>
  );
}
