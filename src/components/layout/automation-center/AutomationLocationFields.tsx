import { useTranslation } from "@/i18n";
import { useId } from "react";
import { Banner } from "@/components/ads/components/Banner";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { SearchablePicker } from "@/components/layout/settings-searchable-picker";
import { formatAutomationTrustPolicy } from "@/lib/automation-presentation";
import type { AutomationUpsertInput } from "@/lib/automations";
import type { AutomationEnvironmentOption } from "./automation-center.utils";
import { editorStyles } from "./automation-editor.styles";
import {
  describeAutomationWorkspace,
  environmentForWorkspace,
  resolveAutomationLocation,
} from "./automation-location";
import { locationStyles as styles } from "./automation-location.styles";

/**
 * Where a schedule runs: a registered repository and one of its existing
 * workspaces, the Default workspace unless another is chosen. Both lists grow
 * with the user's repositories and worktrees, so both pickers search. The
 * summary repeats what a run gets: the directory it starts in, the branch it
 * is on and the permission mode it runs with.
 */
export function AutomationLocationFields(props: {
  draft: AutomationUpsertInput;
  environmentOptions: AutomationEnvironmentOption[];
  onDraftChange: (draft: AutomationUpsertInput) => void;
}) {
  const { t } = useTranslation(["automation"]);
  const repositoryLabelId = useId();
  const workspaceLabelId = useId();
  const { draft } = props;
  const location = resolveAutomationLocation(draft.environment, props.environmentOptions);
  const repository = location.repository;
  const chooseWorkspace = (workspaceId: string) => {
    const workspace = repository?.workspaces.find((candidate) => candidate.workspaceId === workspaceId);
    if (!repository || !workspace) return;
    props.onDraftChange({
      ...draft,
      environment: environmentForWorkspace(repository, workspace),
      // Information resources live in the workspace's Information panel.
      informationReferences:
        workspace.workspaceId === draft.environment.workspaceId ? draft.informationReferences : [],
    });
  };
  return (
    <>
      <div className={sx(styles.fields)}>
        <div className={sx(styles.field)}>
          <span id={repositoryLabelId} className={sx(editorStyles.formLabelText)}>
            {t("automation:location.repository")}
          </span>
          <SearchablePicker
            labelledBy={repositoryLabelId}
            value={repository?.value}
            fallbackLabel={draft.environment.label || undefined}
            placeholder={t("automation:automationEditor.selectARepository")}
            options={props.environmentOptions.map((option) => ({
              value: option.value,
              label: option.label,
              detail: option.repositoryPath,
              keywords: [option.repositoryPath],
            }))}
            onSelect={(value) => {
              const selected = props.environmentOptions.find((option) => option.value === value);
              const workspace = selected?.workspaces.find((candidate) => candidate.isDefault);
              if (!selected || !workspace) return;
              props.onDraftChange({
                ...draft,
                environment: environmentForWorkspace(selected, workspace),
                informationReferences: [],
              });
            }}
            searchPlaceholder={t("automation:location.searchRepositories")}
            emptyText={t("automation:location.noRepositoryMatches")}
            size="md"
            triggerXstyle={styles.picker}
          />
        </div>
        <div className={sx(styles.field)}>
          <span id={workspaceLabelId} className={sx(editorStyles.formLabelText)}>
            {t("automation:location.workspace")}
          </span>
          <SearchablePicker
            labelledBy={workspaceLabelId}
            value={location.workspace?.workspaceId}
            fallbackLabel={
              location.state === "missing" || location.state === "unknown"
                ? describeAutomationWorkspace(location)
                : undefined
            }
            placeholder={t("automation:location.chooseWorkspace")}
            options={(repository?.workspaces ?? []).map((workspace) => ({
              value: workspace.workspaceId,
              label: workspace.isDefault ? t("automation:location.defaultWorkspace") : workspace.name,
              detail: [workspace.branch, workspace.path].filter(Boolean).join(" · "),
              keywords: [workspace.name, workspace.branch ?? "", workspace.path],
            }))}
            onSelect={chooseWorkspace}
            searchPlaceholder={t("automation:location.searchWorkspaces")}
            emptyText={t("automation:location.noWorkspaceMatches")}
            disabled={!repository}
            size="md"
            triggerXstyle={styles.picker}
          />
        </div>
      </div>
      {location.state === "missing" ? (
        <Banner tone="warning" title={t("automation:location.workspaceMissingTitle")}>
          {t("automation:location.workspaceMissingInEditor")}
        </Banner>
      ) : null}
      {draft.environment.path ? (
        <dl className={sx(styles.summary)} aria-label={t("automation:location.summaryLabel")}>
          <dt className={sx(styles.term)}>{t("automation:location.path")}</dt>
          <dd className={sx(styles.value, styles.mono)}>{location.path}</dd>
          <dt className={sx(styles.term)}>{t("automation:location.branch")}</dt>
          <dd className={sx(styles.value, styles.mono)}>{location.branch ?? t("automation:location.branchUnknown")}</dd>
          <dt className={sx(styles.term)}>{t("automation:location.permission")}</dt>
          <dd className={sx(styles.value)}>{formatAutomationTrustPolicy(draft.trustPolicy)}</dd>
        </dl>
      ) : null}
    </>
  );
}

/**
 * A saved schedule whose workspace is gone: its runs fail before they start a
 * task, so the detail pane says so and offers the two ways out.
 */
export function AutomationWorkspaceMissingNotice(props: {
  workspaceName: string;
  busy: boolean;
  /** Absent when the repository's Default workspace is not known here. */
  onUseDefault?: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation(["automation"]);
  return (
    <Banner
      tone="warning"
      title={t("automation:location.workspaceMissingTitle")}
      action={
        <div className={sx(styles.noticeActions)}>
          {props.onUseDefault ? (
            <Button variant="outline" size="sm" disabled={props.busy} onClick={props.onUseDefault}>
              {t("automation:location.useDefaultWorkspace")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onEdit}>
            {t("automation:automationCenterView.edit")}
          </Button>
        </div>
      }
    >
      {props.workspaceName ? (
        <span className={sx(styles.mono)}>{props.workspaceName}</span>
      ) : null}
      {props.workspaceName ? " · " : null}
      {t("automation:location.workspaceMissingDetail")}
    </Banner>
  );
}
