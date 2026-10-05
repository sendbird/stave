import { i18n, useTranslation } from "@/i18n";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { Input } from "@/components/ui";
import { dispatchFieldStyles } from "./dispatch-runtime.styles";

export type DispatchWorkspaceStrategy = "new" | "existing";

export interface DispatchRepositoryOption {
  repositoryPath: string;
  repositoryName: string;
}

export interface DispatchWorkspaceOption {
  id: string;
  name: string;
}

export interface DispatchTargetFieldsProps {
  /** Namespaces every DOM id so two dispatch surfaces can coexist on screen. */
  idPrefix: string;
  repositories: readonly DispatchRepositoryOption[];
  /** Workspaces of the selected repository, resolved by the caller. */
  workspaces: readonly DispatchWorkspaceOption[];
  repositoryPath: string;
  onRepositoryPathChange: (repositoryPath: string) => void;
  workspaceStrategy: DispatchWorkspaceStrategy;
  onWorkspaceStrategyChange: (strategy: DispatchWorkspaceStrategy) => void;
  workspaceId: string;
  onWorkspaceIdChange: (workspaceId: string) => void;
  branchName: string;
  onBranchNameChange: (branchName: string) => void;
  workspaceLabel: string;
  onWorkspaceLabelChange: (workspaceLabel: string) => void;
}

/** The "Where it runs" controls: repository, workspace strategy, and branch. */
export function DispatchTargetFields(props: DispatchTargetFieldsProps) {
  const { t: tI18n } = useTranslation(["kickoff"]);
  const { idPrefix } = props;
  return (
    <section
      className={sx(dispatchFieldStyles.section)}
      aria-labelledby={`${idPrefix}-target-heading`}
    >
      <h3 id={`${idPrefix}-target-heading`} className={sx(dispatchFieldStyles.sectionHeading)}>
        {tI18n("kickoff:dispatchTargetFields.whereItRuns")}</h3>
      <Select
        label={tI18n("kickoff:dispatchTargetFields.staveRepository")}
        value={props.repositoryPath}
        options={props.repositories.map((repository) => ({
          value: repository.repositoryPath,
          label: repository.repositoryName,
        }))}
        placeholder={tI18n("kickoff:dispatchTargetFields.chooseARepository")}
        onValueChange={(value) => {
          if (typeof value === "string") {
            props.onRepositoryPathChange(value);
          }
        }}
      />
      <p className={sx(dispatchFieldStyles.monoPath)}>
        {props.repositoryPath || tI18n("kickoff:dispatchTargetFields.noRegisteredRepositoryAvailable")}
      </p>
      <Select
        label={tI18n("kickoff:dispatchTargetFields.workspace")}
        value={props.workspaceStrategy}
        options={[
          { value: "new", label: tI18n("kickoff:dispatchTargetFields.createANewWorkspace") },
          { value: "existing", label: tI18n("kickoff:dispatchTargetFields.useAnExistingWorkspace") },
        ]}
        onValueChange={(value) => {
          if (value === "new" || value === "existing") {
            props.onWorkspaceStrategyChange(value);
          }
        }}
      />
      {props.workspaceStrategy === "new" ? (
        <>
          <div className={sx(dispatchFieldStyles.field)}>
            <label
              htmlFor={`${idPrefix}-branch`}
              className={sx(dispatchFieldStyles.fieldLabel)}
            >
              {tI18n("kickoff:dispatchTargetFields.branchName")}</label>
            <Input
              id={`${idPrefix}-branch`}
              value={props.branchName}
              onChange={(event) => props.onBranchNameChange(event.target.value)}
              autoComplete="off"
            />
            <p className={sx(dispatchFieldStyles.hint)}>
              {tI18n("kickoff:dispatchTargetFields.basedOnTheSelectedRepositoryAposS")}</p>
          </div>
          <div className={sx(dispatchFieldStyles.field)}>
            <label
              htmlFor={`${idPrefix}-label`}
              className={sx(dispatchFieldStyles.fieldLabel)}
            >
              {tI18n("kickoff:dispatchTargetFields.workspaceLabel")}</label>
            <Input
              id={`${idPrefix}-label`}
              value={props.workspaceLabel}
              onChange={(event) =>
                props.onWorkspaceLabelChange(event.target.value)
              }
              autoComplete="off"
            />
            <p className={sx(dispatchFieldStyles.hint)}>
              {tI18n("kickoff:dispatchTargetFields.shownInTheRepositoryWorkspaceListPrefilled")}</p>
          </div>
        </>
      ) : (
        <Select
          label={tI18n("kickoff:dispatchTargetFields.existingWorkspace")}
          value={props.workspaceId}
          options={props.workspaces.map((workspace) => ({
            value: workspace.id,
            label: workspace.name,
          }))}
          placeholder={tI18n("kickoff:dispatchTargetFields.chooseAWorkspace")}
          onValueChange={(value) => {
            if (typeof value === "string") {
              props.onWorkspaceIdChange(value);
            }
          }}
        />
      )}
    </section>
  );
}
