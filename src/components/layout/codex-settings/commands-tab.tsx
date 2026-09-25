import { Input } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { Search } from "lucide-react";
import {
  CODEX_CLI_SLASH_COMMANDS,
  getCodexSlashCommandCatalogDetail,
} from "@/lib/providers/codex-command-catalog";
import { codexStyles } from "../settings-dialog-codex-section.styles";
import { DenseSection, StatusPill } from "./shared";

const COMMAND_CATEGORY_LABELS = {
  session: "Session control",
  runtime: "Runtime and behavior",
  workspace: "Workspace context",
  inspection: "Inspection and review",
  integrations: "Apps and plugins",
} as const;

type CommandsTabProps = {
  commandQuery: string;
  onCommandQueryChange: (value: string) => void;
};

export function CommandsTab({
  commandQuery,
  onCommandQueryChange,
}: CommandsTabProps) {
  const normalizedQuery = commandQuery.trim().toLowerCase();
  const filtered = CODEX_CLI_SLASH_COMMANDS.filter((command) => {
    if (!normalizedQuery) return true;
    const haystack = [
      command.command,
      command.name,
      command.description,
      command.argumentHint,
      command.availabilityNote,
      COMMAND_CATEGORY_LABELS[command.category],
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const groupedCommands = filtered.reduce<
    Array<{
      category: keyof typeof COMMAND_CATEGORY_LABELS;
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
          title="Slash command catalog"
          description="Bundled from the official Codex CLI slash-command guide so the popup stays useful even though App Server does not expose a live command-list RPC."
        >
          <div className={sx(codexStyles.rowWrapCenterGap3)}>
            <div className={sx(codexStyles.searchWrap)}>
              <Search className={sx(codexStyles.searchIcon)} />
              <Input
                value={commandQuery}
                onChange={(event) => onCommandQueryChange(event.target.value)}
                placeholder="Filter by command, behavior, or category"
                xstyle={codexStyles.searchInput}
              />
            </div>
            <StatusPill label={`${CODEX_CLI_SLASH_COMMANDS.length} total`} />
          </div>

          <p className={sx(codexStyles.textSmMutedMt3)}>
            {getCodexSlashCommandCatalogDetail()}
          </p>
        </DenseSection>

        {groupedCommands.length === 0 ? (
          <DenseSection
            title="No matches"
            description="Try a shorter query or clear the filter."
          >
            <div className={sx(codexStyles.tileDashedCenteredSm)}>
              No slash commands matched{" "}
              <span className={sx(codexStyles.fontMediumFg)}>
                {commandQuery}
              </span>
              .
            </div>
          </DenseSection>
        ) : (
          groupedCommands.map((group) => (
            <DenseSection
              key={`${group.category}:${group.items[0]?.command}`}
              title={COMMAND_CATEGORY_LABELS[group.category]}
              description={`${group.items.length} command${group.items.length === 1 ? "" : "s"}`}
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
