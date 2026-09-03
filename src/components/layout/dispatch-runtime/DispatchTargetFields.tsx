import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";

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
      className="grid gap-4"
      aria-labelledby={`${idPrefix}-target-heading`}
    >
      <h3 id={`${idPrefix}-target-heading`} className="text-sm font-semibold">
        Where it runs
      </h3>
      <div className="grid gap-2">
        <label
          htmlFor={`${idPrefix}-project`}
          className="text-xs font-medium text-muted-foreground"
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
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {props.projectPath || "No registered project available"}
        </p>
      </div>
      <div className="grid gap-2">
        <label
          htmlFor={`${idPrefix}-workspace-strategy`}
          className="text-xs font-medium text-muted-foreground"
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
        <div className="grid gap-2">
          <label
            htmlFor={`${idPrefix}-branch`}
            className="text-xs font-medium text-muted-foreground"
          >
            Branch name
          </label>
          <Input
            id={`${idPrefix}-branch`}
            value={props.branchName}
            onChange={(event) => props.onBranchNameChange(event.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Based on the selected project&apos;s remote default branch.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          <label
            htmlFor={`${idPrefix}-existing-workspace`}
            className="text-xs font-medium text-muted-foreground"
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
