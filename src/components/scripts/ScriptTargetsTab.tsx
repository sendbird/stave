import { Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { ScriptEnvEditor } from "./ScriptEnvEditor";
import {
  DEFAULT_SCRIPT_TARGET_IDS,
  SCRIPT_ENV_VARS,
} from "@/lib/workspace-scripts/constants";
import type {
  ScriptEditorEnvRow,
  ScriptEditorTargetEntry,
} from "@/lib/workspace-scripts/editor";
import type { ScriptTargetScope } from "@/lib/workspace-scripts/types";
import { targetsTabStyles } from "./script-targets-tab.styles";

const ENV_VAR_REFERENCE = Object.values(SCRIPT_ENV_VARS);

export function ScriptTargetsTab(props: {
  targets: ScriptEditorTargetEntry[];
  usageCountById: Record<string, number>;
  onFieldChange: (
    index: number,
    field: "id" | "label" | "shell",
    value: string,
  ) => void;
  onCwdChange: (index: number, cwd: ScriptTargetScope) => void;
  onEnvChange: (index: number, rows: ScriptEditorEnvRow[]) => void;
  onAdd: () => void;
  onAddOverride: (id: string) => void;
  onRemove: (index: number) => void;
}) {
  const definedIds = new Set(
    props.targets.map((target) => target.id.trim()).filter(Boolean),
  );
  const overridableBuiltins = [
    { id: DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE, label: "Workspace" },
    { id: DEFAULT_SCRIPT_TARGET_IDS.PROJECT, label: "Project" },
  ].filter((builtin) => !definedIds.has(builtin.id));

  return (
    <div className={sx(targetsTabStyles.root)}>
      <div className={sx(targetsTabStyles.header)}>
        <div className={sx(targetsTabStyles.headerText)}>
          <p className={sx(targetsTabStyles.title)}>Execution environments</p>
          <p className={sx(targetsTabStyles.description)}>
            Reusable working directory, shell, and environment presets for
            commands and processes. The built-in{" "}
            <span className={sx(targetsTabStyles.mono)}>workspace</span> and{" "}
            <span className={sx(targetsTabStyles.mono)}>project</span> targets
            run in the corresponding root; define a target with the same id here
            to override it.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          xstyle={targetsTabStyles.addButton}
          onClick={props.onAdd}
        >
          <Plus className={sx(targetsTabStyles.buttonIcon)} />
          Add target
        </Button>
      </div>

      {overridableBuiltins.length > 0 ? (
        <div className={sx(targetsTabStyles.overrideRow)}>
          <span className={sx(targetsTabStyles.overrideLabel)}>
            Override built-in:
          </span>
          {overridableBuiltins.map((builtin) => (
            <Button
              key={builtin.id}
              type="button"
              variant="outline"
              size="sm"
              xstyle={targetsTabStyles.overrideButton}
              onClick={() => props.onAddOverride(builtin.id)}
            >
              <Plus className={sx(targetsTabStyles.buttonIcon)} />
              {builtin.label}
            </Button>
          ))}
        </div>
      ) : null}

      {props.targets.length === 0 ? (
        <Empty xstyle={targetsTabStyles.emptyState}>
          <EmptyHeader>
            <EmptyMedia>
              <Plus className={sx(targetsTabStyles.emptyIcon)} />
            </EmptyMedia>
            <EmptyTitle>No custom environments</EmptyTitle>
            <EmptyDescription>
              Commands and processes use the built-in workspace and project
              environments until you add one here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={sx(targetsTabStyles.list)}>
          {props.targets.map((target, index) => {
            const id = target.id.trim();
            const usage = id ? (props.usageCountById[id] ?? 0) : 0;
            return (
              <div key={index} className={sx(targetsTabStyles.card)}>
                <div className={sx(targetsTabStyles.cardHeader)}>
                  <div className={sx(targetsTabStyles.cardHeaderTitle)}>
                    <span className={sx(targetsTabStyles.cardTitle)}>
                      {target.label.trim() || id || `Target ${index + 1}`}
                    </span>
                    {usage > 0 ? (
                      <Badge
                        variant="secondary"
                        className={sx(targetsTabStyles.usageBadge)}
                      >
                        {usage} entr{usage === 1 ? "y" : "ies"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={sx(targetsTabStyles.usageBadge)}
                      >
                        Unused
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    xstyle={targetsTabStyles.deleteButton}
                    onClick={() => props.onRemove(index)}
                    aria-label="Delete target"
                    title={
                      usage > 0
                        ? `Referenced by ${usage} command(s) or process(es)`
                        : "Delete environment"
                    }
                  >
                    <Trash2 className={sx(targetsTabStyles.buttonIcon)} />
                  </Button>
                </div>

                <div className={sx(targetsTabStyles.fieldGrid)}>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>ID</span>
                    <Input
                      value={target.id}
                      onChange={(event) =>
                        props.onFieldChange(index, "id", event.target.value)
                      }
                      placeholder="api"
                      xstyle={targetsTabStyles.monoInput}
                    />
                    <span className={sx(targetsTabStyles.hint)}>
                      Renaming updates commands and processes that reference
                      this environment.
                    </span>
                  </label>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>
                      Label
                    </span>
                    <Input
                      value={target.label}
                      onChange={(event) =>
                        props.onFieldChange(index, "label", event.target.value)
                      }
                      placeholder="Shown in the Target picker"
                    />
                  </label>
                </div>

                <div className={sx(targetsTabStyles.fieldGrid)}>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>
                      Working directory
                    </span>
                    <Select
                      value={target.cwd}
                      onValueChange={(value) =>
                        props.onCwdChange(index, value as ScriptTargetScope)
                      }
                    >
                      <SelectTrigger
                        className={sx(targetsTabStyles.triggerFull)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="workspace">
                          Workspace root
                        </SelectItem>
                        <SelectItem value="project">Project root</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>
                      Shell
                    </span>
                    <Input
                      value={target.shell}
                      onChange={(event) =>
                        props.onFieldChange(index, "shell", event.target.value)
                      }
                      placeholder="Default login shell"
                      xstyle={targetsTabStyles.monoInput}
                    />
                  </label>
                </div>

                <ScriptEnvEditor
                  rows={target.envRows}
                  onChange={(rows) => props.onEnvChange(index, rows)}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className={sx(targetsTabStyles.injectedBox)}>
        <p className={sx(targetsTabStyles.injectedTitle)}>
          Injected environment variables
        </p>
        <p className={sx(targetsTabStyles.injectedDescription)}>
          Stave sets these automatically for every execution; reference them in
          commands or environment values.
        </p>
        <div className={sx(targetsTabStyles.injectedList)}>
          {ENV_VAR_REFERENCE.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className={sx(targetsTabStyles.varBadge)}
            >
              {name}
            </Badge>
          ))}
        </div>
      </div>

      <p className={sx(targetsTabStyles.footnote)}>
        Per-developer overrides live in{" "}
        <span className={sx(targetsTabStyles.mono)}>
          .stave/scripts.local.json
        </span>{" "}
        and are edited as a file; entries sourced from it are marked{" "}
        <span className={sx(targetsTabStyles.emphasis)}>Local</span> in the
        panel.
      </p>
    </div>
  );
}
