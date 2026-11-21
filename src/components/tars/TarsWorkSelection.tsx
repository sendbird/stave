import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button, ContextChip, ContextChipRemoveButton, contextChipStyles } from "@/components/ui";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsResponsibility } from "@/lib/tars/types";
import type { TarsWorkTarget } from "@/lib/tars/selected-work";
import { useTarsContinuationBranch } from "./use-tars-continuation-branch";
import { tarsSelectionStyles as styles } from "./tars-selection.styles";

/** Use the shortest repository suffix that distinguishes same-title work. */
function repositoryLabel(row: TarsResponsibility, rows: readonly TarsResponsibility[]) {
  const parts = row.repositoryPath.split(/[\\/]/).filter(Boolean);
  const peers = rows.filter((peer) => peer.title === row.title && peer.repositoryPath !== row.repositoryPath);
  for (let length = 1; length < parts.length; length++) {
    const suffix = parts.slice(-length).join("/");
    if (!peers.some((peer) => peer.repositoryPath.split(/[\\/]/).filter(Boolean).slice(-length).join("/") === suffix)) return suffix;
  }
  return parts.join("/") || row.repositoryPath;
}

/** Display metadata never replaces the host-owned routing ID. */
export function TarsWorkSelection({ rows, target, onSelect, onOpen, disabled }: {
  rows: readonly TarsResponsibility[];
  target?: TarsWorkTarget;
  onSelect: (target: TarsWorkTarget | undefined) => void;
  onOpen?: (id: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation(["shell"]);
  const row = target ? rows.find((item) => item.id === target.responsibilityId) : undefined;
  const branch = useTarsContinuationBranch(row);
  if (!target) return null;
  const title = row?.title ?? t("shell:tars.selection.unavailableLabel");
  const twins = row ? rows.filter((peer) => peer.title === row.title && peer.repositoryPath === row.repositoryPath).map((peer) => peer.id).sort() : [];
  const repository = row ? repositoryLabel(row, rows) : "";
  const state = row ? t(`shell:tars.states.${row.state}`) : t("shell:tars.selection.clearUnavailable");
  const identity = twins.length > 1 ? t("shell:tars.selection.numberedRepository", { repository, number: twins.indexOf(row!.id) + 1 }) : repository;
  const workDetails = row
    ? t("shell:tars.selection.details", { title, state, repository: row.repositoryPath, id: row.id })
    : t("shell:tars.selection.unavailable", { id: target.responsibilityId });
  const details = branch ? `${workDetails} · ${branch}` : workDetails;
  const label = <span className={sx(styles.copy)}>
    <span className={sx(contextChipStyles.label)} data-tars-target-title="">{title}</span>
    <span className={sx(contextChipStyles.label, styles.identity)} data-tars-target-identity="">{row ? [state, identity, branch].filter(Boolean).join(" · ") : state}</span>
  </span>;
  return <div className={sx(styles.root)} data-tars-work-selection="">
    <ContextChip icon={MessagesSquare} compact className={sx(styles.target)} data-tars-target-chip="">
      <Tooltip content={<span className={sx(styles.details)}>{details}</span>}>
        {row && onOpen ? <Button type="button" variant="ghost" size="xs"
          aria-label={t("shell:tars.selection.openResult", { title })} aria-description={details}
          onClick={() => onOpen(row.id)} xstyle={[contextChipStyles.openButton, styles.open]} data-tars-target-open="">
          {label}<ArrowUpRight aria-hidden className={sx(styles.openIcon)} />
        </Button> : <span tabIndex={0} aria-label={details} className={sx(styles.open, focusRing.ring)}>{label}</span>}
      </Tooltip>
      <Tooltip content={t("shell:tars.selection.clear")}>
        <ContextChipRemoveButton disabled={disabled} label={t("shell:tars.selection.clear")}
          onClick={() => onSelect(undefined)} />
      </Tooltip>
    </ContextChip>
  </div>;
}
