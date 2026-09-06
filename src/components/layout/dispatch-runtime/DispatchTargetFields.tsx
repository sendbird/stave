import { sx } from "@/components/ads/utils/stylex";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { dispatchFieldStyles } from "./dispatch-runtime.styles";

export type DispatchWorkspaceStrategy = "new" | "existing";

export interface DispatchProjectOption {
  projectPath: string;
  projectName: string;
}

export interface DispatchWorkspaceOption {
  id: string;
  name: string;
}

export interface DispatchTargetFieldsProps {
  /** Namespaces every DOM id so two dispatch surfaces can coexist on screen. */
  idPrefix: string;
  projects: readonly DispatchProjectOption[];
  /** Workspaces of the selected project, resolved by the caller. */
  workspaces: readonly DispatchWorkspaceOption[];
  projectPath: string;
  onProjectPathChange: (projectPath: string) => void;
  workspaceStrategy: DispatchWorkspaceStrategy;
  onWorkspaceStrategyChange: (strategy: DispatchWorkspaceStrategy) => void;
  workspaceId: string;
  onWorkspaceIdChange: (workspaceId: string) => void;
  branchName: string;
  onBranchNameChange: (branchName: string) => void;
}

/** The "Where it runs" controls: project, workspace strategy, and branch. */
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
      <div className={sx(dispatchFieldStyles.field)}>
        <label
          htmlFor={`${idPrefix}-project`}
          className={sx(dispatchFieldStyles.fieldLabel)}
        >
          Stave project
        </label>
        <Select
          value={props.projectPath}
          onValueChange={props.onProjectPathChange}
        >
          <SelectTrigger id={`${idPrefix}-project`}>
            <SelectValue placeholder="Choose a project" />
          </SelectTrigger>
          <SelectContent>
            {props.projects.map((project) => (
              <SelectItem key={project.projectPath} value={project.projectPath}>
                {project.projectName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className={sx(dispatchFieldStyles.monoPath)}>
          {props.projectPath || "No registered project available"}
        </p>
      </div>
      <div className={sx(dispatchFieldStyles.field)}>
        <label
          htmlFor={`${idPrefix}-workspace-strategy`}
          className={sx(dispatchFieldStyles.fieldLabel)}
        >
          Workspace
        </label>
        <Select
          value={props.workspaceStrategy}
          onValueChange={(value) =>
            props.onWorkspaceStrategyChange(value as DispatchWorkspaceStrategy)
          }
        >
          <SelectTrigger id={`${idPrefix}-workspace-strategy`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Create a new workspace</SelectItem>
            <SelectItem value="existing">Use an existing workspace</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {props.workspaceStrategy === "new" ? (
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
            Based on the selected project&apos;s remote default branch.
          </p>
        </div>
      ) : (
        <div className={sx(dispatchFieldStyles.field)}>
          <label
            htmlFor={`${idPrefix}-existing-workspace`}
            className={sx(dispatchFieldStyles.fieldLabel)}
          >
            Existing workspace
          </label>
          <Select
            value={props.workspaceId}
            onValueChange={props.onWorkspaceIdChange}
          >
            <SelectTrigger id={`${idPrefix}-existing-workspace`}>
              <SelectValue placeholder="Choose a workspace" />
            </SelectTrigger>
            <SelectContent>
              {props.workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </section>
  );
}
