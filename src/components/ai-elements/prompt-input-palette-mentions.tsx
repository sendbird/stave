import { i18n, useTranslation } from "@/i18n";
import { FileText, Info, MessagesSquare } from "lucide-react";
import { Badge, CommandGroup, CommandItem } from "@/components/ui";
import { sx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import { documentMentionKey } from "./prompt-input-mentions";
import type { PromptInputPaletteState } from "./prompt-input-palette-state";
import type { PromptInputPaletteSelection } from "./prompt-input-palette-selection";

/**
 * The `@` palette's groups: Information sections, tasks, documents from other
 * workspaces, and Information items.
 */
export function PromptInputMentionPaletteGroups(args: {
  palette: PromptInputPaletteState;
  selection: PromptInputPaletteSelection;
}) {
  useTranslation();
  const {
    activePalette,
    workspaceInformationSectionItems,
    taskMentionItems,
    documentMentionItems,
    workspaceInformationEntryItems,
    setSelectedWorkspaceInformationIndex,
  } = args.palette;
  const {
    rememberActivePaletteTokenSelection,
    applyMentionSelection,
    applyWorkspaceInformationSelection,
  } = args.selection;
  return (
    <>
      {activePalette === "info" &&
      workspaceInformationSectionItems.length > 0 ? (
        <CommandGroup heading={i18n.t("composer:promptInput.heading")}>
          {workspaceInformationSectionItems.map(
            ({ item, index }) => (
              <CommandItem
                key={item.reference.token}
                value={item.reference.token}
                className={sx(promptInputStyles.itemStandard)}
                data-palette-index={index}
                onMouseEnter={() =>
                  setSelectedWorkspaceInformationIndex(index)
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  rememberActivePaletteTokenSelection();
                }}
                onSelect={() =>
                  applyWorkspaceInformationSelection(item)
                }
              >
                <div className={sx(promptInputStyles.iconWrapPrimary)}>
                  <Info className={sx(promptInputStyles.icon4)} />
                </div>
                <div className={sx(promptInputStyles.flex1Min)}>
                  <div className={sx(promptInputStyles.rowCenter)}>
                    <span className={sx(promptInputStyles.fontMedium)}>
                      {item.title}
                    </span>
                    <Badge
                      variant="secondary"
                      className={sx(promptInputStyles.badgeUpper)}
                    >
                      {i18n.t("composer:promptInput.copy5")}</Badge>
                  </div>
                  <p className={sx(promptInputStyles.itemDesc)}>
                    {item.description}
                  </p>
                </div>
              </CommandItem>
            ),
          )}
        </CommandGroup>
      ) : null}
      {activePalette === "info" &&
      taskMentionItems.length > 0 ? (
        <CommandGroup heading={i18n.t("composer:promptInput.heading2")}>
          {taskMentionItems.map(({ item, index }) => (
            <CommandItem
              key={item.taskId}
              value={`@task:${item.taskId}`}
              className={sx(promptInputStyles.itemStandard)}
              data-palette-index={index}
              onMouseEnter={() =>
                setSelectedWorkspaceInformationIndex(index)
              }
              onMouseDown={(event) => {
                event.preventDefault();
                rememberActivePaletteTokenSelection();
              }}
              onSelect={() =>
                applyMentionSelection({
                  kind: "task",
                  key: `@task:${item.taskId}`,
                  option: item,
                })
              }
            >
              <div className={sx(promptInputStyles.iconWrapPrimary)}>
                <MessagesSquare className={sx(promptInputStyles.icon4)} />
              </div>
              <div className={sx(promptInputStyles.flex1Min)}>
                <div className={sx(promptInputStyles.rowCenter)}>
                  <span className={sx(promptInputStyles.fontMedium)}>
                    {item.title}
                  </span>
                </div>
                <p className={sx(promptInputStyles.itemDesc)}>
                  {i18n.t("composer:promptInput.copy6")}</p>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {activePalette === "info" &&
      documentMentionItems.length > 0 ? (
        <CommandGroup heading={i18n.t("composer:promptInput.documentsHeading")}>
          {documentMentionItems.map(({ item, index }) => (
            <CommandItem
              key={documentMentionKey(item)}
              value={documentMentionKey(item)}
              className={sx(promptInputStyles.itemStandard)}
              data-palette-index={index}
              onMouseEnter={() =>
                setSelectedWorkspaceInformationIndex(index)
              }
              onMouseDown={(event) => {
                event.preventDefault();
                rememberActivePaletteTokenSelection();
              }}
              onSelect={() =>
                applyMentionSelection({
                  kind: "document",
                  key: documentMentionKey(item),
                  option: item,
                })
              }
            >
              <div className={sx(promptInputStyles.iconWrapPrimary)}>
                <FileText className={sx(promptInputStyles.icon4)} />
              </div>
              <div className={sx(promptInputStyles.flex1Min)}>
                <div className={sx(promptInputStyles.rowCenter)}>
                  <span className={sx(promptInputStyles.fontMedium)}>
                    {item.title}
                  </span>
                </div>
                <p className={sx(promptInputStyles.itemDesc)}>
                  {item.workspaceDeleted
                    ? i18n.t("composer:promptInput.documentFromDeletedWorkspace", { workspace: item.workspaceName })
                    : i18n.t("composer:promptInput.documentFromWorkspace", { workspace: item.workspaceName })}
                </p>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {activePalette === "info" &&
      workspaceInformationEntryItems.length > 0 ? (
        <CommandGroup heading={i18n.t("composer:promptInput.heading3")}>
          {workspaceInformationEntryItems.map(
            ({ item, index }) => (
              <CommandItem
                key={item.reference.token}
                value={item.reference.token}
                className={sx(promptInputStyles.itemStandard)}
                data-palette-index={index}
                onMouseEnter={() =>
                  setSelectedWorkspaceInformationIndex(index)
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  rememberActivePaletteTokenSelection();
                }}
                onSelect={() =>
                  applyWorkspaceInformationSelection(item)
                }
              >
                <div className={sx(promptInputStyles.iconWrapPrimary)}>
                  <Info className={sx(promptInputStyles.icon4)} />
                </div>
                <div className={sx(promptInputStyles.flex1Min)}>
                  <div className={sx(promptInputStyles.rowCenter)}>
                    <span className={sx(promptInputStyles.fontMedium)}>
                      {item.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={sx(promptInputStyles.badgeUpper)}
                    >
                      {i18n.t("composer:promptInput.copy7")}</Badge>
                  </div>
                  <p className={sx(promptInputStyles.itemDesc)}>
                    {item.description}
                  </p>
                </div>
              </CommandItem>
            ),
          )}
        </CommandGroup>
      ) : null}
    </>
  );
}
