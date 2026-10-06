import { useTranslation } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sx } from "@/components/ads/utils/stylex";
import { kickoffStyles } from "./kickoff-dialog.styles";

export type KickoffWorkspaceMode = "new-worktree" | "same-workspace";

export function KickoffWorkspaceChoice(props: {
  value: KickoffWorkspaceMode;
  onChange: (value: KickoffWorkspaceMode) => void;
  disabled: boolean;
  currentWorkspaceAvailable: boolean;
  branch: string;
}) {
  const { t } = useTranslation(["kickoff"]);
  return (
    <div className={sx(kickoffStyles.field)}>
      <label htmlFor="kickoff-workspace-mode" className={sx(kickoffStyles.label)}>
        {t("kickoff:kickoffDialog.where")}
      </label>
      <Select<KickoffWorkspaceMode> value={props.value} onValueChange={props.onChange} disabled={props.disabled}>
        <SelectTrigger id="kickoff-workspace-mode" className={sx(kickoffStyles.fullWidth)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new-worktree">{t("kickoff:kickoffDialog.newWorkspace")}</SelectItem>
          <SelectItem value="same-workspace" disabled={!props.currentWorkspaceAvailable}>
            {t("kickoff:kickoffDialog.currentWorkspace")}
          </SelectItem>
        </SelectContent>
      </Select>
      <p className={sx(kickoffStyles.hint)}>
        {props.value === "same-workspace"
          ? t("kickoff:kickoffDialog.currentWorkspaceHint", { branch: props.branch })
          : t("kickoff:kickoffDialog.newWorkspaceHint")}
      </p>
    </div>
  );
}
