import * as stylex from "@stylexjs/stylex";
import { i18n } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/components/ui";
import type { ConcretePrMergeMethod, RepoMergeSettings } from "../TopBarOpenPR.utils";
import { FIELD_LABEL_CLASS } from "./create-pr-dialog-panels";
import { openPrStyles } from "../top-bar-open-pr.styles";

export interface MergeFields {
  method: ConcretePrMergeMethod;
  autoMerge: boolean;
  /** Open the PR as a draft; a draft is never queued for auto-merge. */
  draft: boolean;
  repoSettings?: RepoMergeSettings;
  onMethodChange: (method: ConcretePrMergeMethod) => void;
  onAutoMergeChange: (enabled: boolean) => void;
  onDraftChange: (draft: boolean) => void;
}

/**
 * The Create PR dialog's merge settings: Draft, merge method and auto-merge.
 * A draft is never queued for auto-merge, so Draft turns the auto-merge
 * switch off and locks it while it is on.
 */
export function CreatePullRequestMergeSettings(props: { merge: MergeFields; busy: boolean }) {
  return (
    <div className={sx(openPrStyles.mergeCard)}>
      <p className={FIELD_LABEL_CLASS}>{i18n.t("sourceControl:createPullRequestDialog.mergeBehavior")}</p>

      <div className={sx(openPrStyles.settingRow)}>
        <div className={sx(openPrStyles.minWidthZero)}>
          <label
            className={sx(openPrStyles.settingLabel)}
            htmlFor="create-pr-draft"
          >
            {i18n.t("sourceControl:createPullRequestDialog.draft")}
          </label>
          <p className={sx(openPrStyles.settingHint)}>
            {i18n.t("sourceControl:createPullRequestDialog.draftHint")}
          </p>
        </div>
        <Switch
          id="create-pr-draft"
          // The label's `htmlFor` reaches the hidden input, not the switch a screen reader focuses.
          aria-label={i18n.t("sourceControl:createPullRequestDialog.draft")}
          className={sx(openPrStyles.autoMergeSwitch)}
          checked={props.merge.draft}
          onCheckedChange={props.merge.onDraftChange}
          disabled={props.busy}
        />
      </div>

      <div
        {...stylex.props(openPrStyles.divider)}
        aria-hidden="true"
      />

      <div className={sx(openPrStyles.settingRow)}>
        <div className={sx(openPrStyles.minWidthZero)}>
          <label
            className={sx(openPrStyles.settingLabel)}
            htmlFor="create-pr-merge-method"
          >
            {i18n.t("sourceControl:createPullRequestDialog.mergeMethod")}
          </label>
          <p className={sx(openPrStyles.settingHint)}>
            {i18n.t("sourceControl:createPullRequestDialog.usedWhenThePRIsMerged")}
          </p>
        </div>
        <Select
          value={props.merge.method}
          onValueChange={(value) =>
            props.merge.onMethodChange(value as ConcretePrMergeMethod)
          }
          disabled={props.busy}
        >
          <SelectTrigger
            id="create-pr-merge-method"
            className={sx(openPrStyles.mergeMethodTrigger)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="squash"
              disabled={
                props.merge.repoSettings?.squashMergeAllowed === false
              }
            >
              {i18n.t("sourceControl:createPullRequestDialog.squash")}
              {props.merge.repoSettings?.squashMergeAllowed === false
                ? i18n.t("sourceControl:createPullRequestDialog.notAllowed")
                : ""}
            </SelectItem>
            <SelectItem
              value="merge"
              disabled={
                props.merge.repoSettings?.mergeCommitAllowed === false
              }
            >
              {i18n.t("sourceControl:createPullRequestDialog.mergeCommit")}
              {props.merge.repoSettings?.mergeCommitAllowed === false
                ? i18n.t("sourceControl:createPullRequestDialog.notAllowed")
                : ""}
            </SelectItem>
            <SelectItem
              value="rebase"
              disabled={
                props.merge.repoSettings?.rebaseMergeAllowed === false
              }
            >
              {i18n.t("sourceControl:createPullRequestDialog.rebase")}
              {props.merge.repoSettings?.rebaseMergeAllowed === false
                ? i18n.t("sourceControl:createPullRequestDialog.notAllowed")
                : ""}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        {...stylex.props(openPrStyles.divider)}
        aria-hidden="true"
      />

      <div className={sx(openPrStyles.settingRow)}>
        <div className={sx(openPrStyles.minWidthZero)}>
          <label
            className={sx(openPrStyles.settingLabel)}
            htmlFor="create-pr-auto-merge"
          >
            {i18n.t("sourceControl:createPullRequestDialog.autoMerge")}
          </label>
          <p className={sx(openPrStyles.settingHint)}>
            {props.merge.repoSettings?.autoMergeAllowed === false
              ? i18n.t("sourceControl:createPullRequestDialog.disabledByRepositorySettings")
              : props.merge.draft
                ? i18n.t("sourceControl:createPullRequestDialog.autoMergeOffForDraft")
                : i18n.t("sourceControl:createPullRequestDialog.mergeAutomaticallyAfterRequiredChecksPass")}
          </p>
        </div>
        <Switch
          id="create-pr-auto-merge"
          aria-label={i18n.t("sourceControl:createPullRequestDialog.autoMerge")}
          className={sx(openPrStyles.autoMergeSwitch)}
          checked={props.merge.autoMerge && !props.merge.draft}
          onCheckedChange={props.merge.onAutoMergeChange}
          disabled={
            props.busy ||
            props.merge.draft ||
            props.merge.repoSettings?.autoMergeAllowed === false
          }
        />
      </div>
    </div>
  );
}
