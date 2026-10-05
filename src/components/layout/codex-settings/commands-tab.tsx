import { I18N_NAMESPACES, Trans, useTranslation, type I18nKey } from "@/i18n";
import { Input } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { Search } from "lucide-react";
import {
  CODEX_CLI_SLASH_COMMANDS,
  getCodexSlashCommandCatalogDetail,
} from "@/lib/providers/codex-command-catalog";
import { codexStyles } from "../settings-dialog-codex-section.styles";
import { DenseSection, StatusPill } from "./shared";

const COMMAND_CATEGORY_LABEL_KEYS = {
  session: "settingsProviders:codexCommandsTab.categories.session",
  runtime: "settingsProviders:codexCommandsTab.categories.runtime",
  workspace: "settingsProviders:codexCommandsTab.categories.workspace",
  inspection: "settingsProviders:codexCommandsTab.categories.inspection",
  integrations: "settingsProviders:codexCommandsTab.categories.integrations",
} as const satisfies Record<string, I18nKey>;

type CommandsTabProps = {
  commandQuery: string;
  onCommandQueryChange: (value: string) => void;
};

export function CommandsTab({
  commandQuery,
  onCommandQueryChange,
}: CommandsTabProps) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const normalizedQuery = commandQuery.trim().toLowerCase();
  const filtered = CODEX_CLI_SLASH_COMMANDS.filter((command) => {
    if (!normalizedQuery) return true;
    const haystack = [
      command.command,
      command.name,
      command.description,
      command.argumentHint,
      command.availabilityNote,
      t(COMMAND_CATEGORY_LABEL_KEYS[command.category]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const groupedCommands = filtered.reduce<
    Array<{
      category: keyof typeof COMMAND_CATEGORY_LABEL_KEYS;
      items: typeof filtered;
    }>
  >((groups, command) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.category === command.category) {
      lastGroup.items.push(command);
      return groups;
    }
    groups.push({ category: command.category, items: [command] });
    return groups;
  }, []);
  return (
    <>
      <div className={sx(codexStyles.stack4)}>
        <DenseSection
          title={t("settingsProviders:codexCommandsTab.catalog.title")}
          description={t("settingsProviders:codexCommandsTab.catalog.description")}
        >
          <div className={sx(codexStyles.rowWrapCenterGap3)}>
            <div className={sx(codexStyles.searchWrap)}>
              <Search className={sx(codexStyles.searchIcon)} />
              <Input
                value={commandQuery}
                onChange={(event) => onCommandQueryChange(event.target.value)}
                placeholder={t("settingsProviders:codexCommandsTab.filterPlaceholder")}
                xstyle={codexStyles.searchInput}
              />
            </div>
            <StatusPill label={t("settingsProviders:codexCommandsTab.total", { total: CODEX_CLI_SLASH_COMMANDS.length })} />
          </div>

          <p className={sx(codexStyles.textSmMutedMt3)}>
            {getCodexSlashCommandCatalogDetail()}
          </p>
        </DenseSection>

        {groupedCommands.length === 0 ? (
          <DenseSection
            title={t("settingsProviders:codexCommandsTab.noMatches.title")}
            description={t("settingsProviders:codexCommandsTab.noMatches.description")}
          >
            <div className={sx(codexStyles.tileDashedCenteredSm)}>
              <Trans t={t} i18nKey="settingsProviders:codexCommandsTab.noMatches.detail" components={{ query: <span className={sx(codexStyles.fontMediumFg)}>{commandQuery}</span> }} />
            </div>
          </DenseSection>
        ) : (
          groupedCommands.map((group) => (
            <DenseSection
              key={`${group.category}:${group.items[0]?.command}`}
              title={t(COMMAND_CATEGORY_LABEL_KEYS[group.category])}
              description={t("settingsProviders:codexCommandsTab.commandCount", { count: group.items.length })}
            >
              <div className={sx(codexStyles.stack2)}>
                {group.items.map((command) => (
                  <div
                    key={command.command}
                    data-codex-command={command.command}
                    className={sx(codexStyles.bgTile50)}
                  >
                    <div className={sx(codexStyles.rowWrapCenterGap2)}>
                      <p className={sx(codexStyles.commandTitle)}>
                        {command.command}
                      </p>
                      {command.argumentHint ? (
                        <StatusPill label={command.argumentHint} />
                      ) : null}
                      {command.availabilityNote ? (
                        <StatusPill
                          label={command.availabilityNote}
                          tone="warning"
                        />
                      ) : null}
                    </div>
                    <p className={sx(codexStyles.textSmMutedMt1)}>
                      {command.description}
                    </p>
                  </div>
                ))}
              </div>
            </DenseSection>
          ))
        )}
      </div>
    </>
  );
}
