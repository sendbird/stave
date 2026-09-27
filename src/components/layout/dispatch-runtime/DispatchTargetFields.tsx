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
  const { idPrefix } = props;
  return (
    <section
      className={sx(dispatchFieldStyles.section)}
      aria-labelledby={`${idPrefix}-target-heading`}
    >
      <h3 id={`${idPrefix}-target-heading`} className={sx(dispatchFieldStyles.sectionHeading)}>
        Where it runs
      </h3>
      <Select
        label="Stave repository"
        value={props.repositoryPath}
        options={props.repositories.map((repository) => ({
          value: repository.repositoryPath,
          label: repository.repositoryName,
        }))}
        placeholder="Choose a repository"
        onValueChange={(value) => {
          if (typeof value === "string") {
            props.onRepositoryPathChange(value);
          }
        }}
      />
      <p className={sx(dispatchFieldStyles.monoPath)}>
        {props.repositoryPath || "No registered repository available"}
      </p>
      <Select
        label="Workspace"
        value={props.workspaceStrategy}
        options={[
          { value: "new", label: "Create a new workspace" },
          { value: "existing", label: "Use an existing workspace" },
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
              Branch name
            </label>
            <Input
              id={`${idPrefix}-branch`}
              value={props.branchName}
              onChange={(event) => props.onBranchNameChange(event.target.value)}
              autoComplete="off"
            />
            <p className={sx(dispatchFieldStyles.hint)}>
              Based on the selected repository&apos;s remote default branch.
            </p>
          </div>
          <div className={sx(dispatchFieldStyles.field)}>
            <label
              htmlFor={`${idPrefix}-label`}
              className={sx(dispatchFieldStyles.fieldLabel)}
            >
              Workspace label
            </label>
            <Input
              id={`${idPrefix}-label`}
              value={props.workspaceLabel}
              onChange={(event) =>
                props.onWorkspaceLabelChange(event.target.value)
              }
              autoComplete="off"
            />
            <p className={sx(dispatchFieldStyles.hint)}>
              Shown in the repository workspace list. Prefilled from the issue
              title.
            </p>
          </div>
        </>
      ) : (
        <Select
          label="Existing workspace"
          value={props.workspaceId}
          options={props.workspaces.map((workspace) => ({
            value: workspace.id,
            label: workspace.name,
          }))}
          placeholder="Choose a workspace"
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
