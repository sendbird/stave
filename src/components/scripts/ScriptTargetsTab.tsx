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
import { cn } from "@/lib/utils";

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Execution environments
          </p>
          <p className="text-xs text-muted-foreground">
            Reusable working directory, shell, and environment presets for
            commands and processes. The built-in{" "}
            <span className="font-mono">workspace</span> and{" "}
            <span className="font-mono">project</span> targets run in the
            corresponding root; define a target with the same id here to
            override it.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={props.onAdd}
        >
          <Plus className="size-3.5" />
          Add target
        </Button>
      </div>

      {overridableBuiltins.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            Override built-in:
          </span>
          {overridableBuiltins.map((builtin) => (
            <Button
              key={builtin.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => props.onAddOverride(builtin.id)}
            >
              <Plus className="size-3.5" />
              {builtin.label}
            </Button>
          ))}
        </div>
      ) : null}

      {props.targets.length === 0 ? (
        <Empty className="border border-dashed border-border/70 bg-muted/15">
          <EmptyHeader>
            <EmptyMedia>
              <Plus className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No custom environments</EmptyTitle>
            <EmptyDescription>
              Commands and processes use the built-in workspace and project
              environments until you add one here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2.5">
          {props.targets.map((target, index) => {
            const id = target.id.trim();
            const usage = id ? (props.usageCountById[id] ?? 0) : 0;
            return (
              <div
                key={index}
                className="space-y-3 rounded-lg border border-border/70 bg-card/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {target.label.trim() || id || `Target ${index + 1}`}
                    </span>
                    {usage > 0 ? (
                      <Badge
                        variant="secondary"
                        className="rounded-sm px-2 py-0 text-[10px]"
                      >
                        {usage} entr{usage === 1 ? "y" : "ies"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="rounded-sm px-2 py-0 text-[10px]"
                      >
                        Unused
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => props.onRemove(index)}
                    aria-label="Delete target"
                    title={
                      usage > 0
                        ? `Referenced by ${usage} command(s) or process(es)`
                        : "Delete environment"
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-foreground">
                      ID
                    </span>
                    <Input
                      value={target.id}
                      onChange={(event) =>
                        props.onFieldChange(index, "id", event.target.value)
                      }
                      placeholder="api"
                      className="font-mono text-xs"
                    />
                    <span className="block text-[11px] text-muted-foreground">
                      Renaming updates commands and processes that reference
                      this environment.
                    </span>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-foreground">
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-foreground">
                      Working directory
                    </span>
                    <Select
                      value={target.cwd}
                      onValueChange={(value) =>
                        props.onCwdChange(index, value as ScriptTargetScope)
                      }
                    >
                      <SelectTrigger className="w-full">
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
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-foreground">
                      Shell
                    </span>
                    <Input
                      value={target.shell}
                      onChange={(event) =>
                        props.onFieldChange(index, "shell", event.target.value)
                      }
                      placeholder="Default login shell"
                      className="font-mono text-xs"
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

      <div
        className={cn(
          "rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5",
        )}
      >
        <p className="text-[11px] font-medium text-foreground">
          Injected environment variables
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Stave sets these automatically for every execution; reference them in
          commands or environment values.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ENV_VAR_REFERENCE.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="rounded-sm px-1.5 py-0 font-mono text-[10px]"
            >
              {name}
            </Badge>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        Per-developer overrides live in{" "}
        <span className="font-mono">.stave/scripts.local.json</span> and are
        edited as a file; entries sourced from it are marked{" "}
        <span className="font-medium">Local</span> in the panel.
      </p>
    </div>
  );
}
