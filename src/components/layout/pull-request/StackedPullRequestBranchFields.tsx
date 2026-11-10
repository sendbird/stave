import { Checkbox } from "@/components/aui/components/Checkbox";
import { i18n, useTranslation } from "@/i18n";
import { FIELD_LABEL_CLASS, PullRequestBranchFields } from "./create-pr-dialog-panels";

export interface BranchFields {
  currentBranch?: string;
  defaultBranch: string;
  targetBranch: string;
  options: string[];
  loading: boolean;
  onTargetBranchChange: (branch: string) => void;
  stacked?: boolean;
  onStackedChange?: (enabled: boolean) => void;
  parentNumber?: number;
  parentLoading?: boolean;
}


export function StackedPullRequestBranchFields({ branch, disabled }: { branch: BranchFields; disabled: boolean }) {
  useTranslation();
  return <>
    <Checkbox
      checked={branch.stacked ?? false}
      disabled={disabled}
      onCheckedChange={(checked) => branch.onStackedChange?.(checked)}
      label={i18n.t("sourceControl:prStack.create")}
      description={i18n.t("sourceControl:prStack.createHint")}
    />
    <PullRequestBranchFields
      currentBranch={branch.currentBranch}
      defaultBranch={branch.defaultBranch}
      disabled={disabled}
      loading={branch.loading}
      targetBranch={branch.targetBranch}
      targetBranchOptions={branch.options}
      onTargetBranchChange={branch.onTargetBranchChange}
    />
    {branch.stacked ? <p className={FIELD_LABEL_CLASS} role="status">
      {branch.parentLoading ? i18n.t("sourceControl:topBarOpenPR.loading")
        : branch.parentNumber ? i18n.t("sourceControl:prStack.parentReady", { number: branch.parentNumber, branch: branch.targetBranch })
          : i18n.t("sourceControl:prStack.parentRequired")}
    </p> : null}
  </>;
}
