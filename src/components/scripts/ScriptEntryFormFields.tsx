import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/components/ui";
import {
  entryHasAdvancedValues,
  type ScriptEditorEntry,
  type ScriptEntryFieldIssues,
} from "@/lib/workspace-scripts/editor";
import type { ScriptKind } from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";

function FieldError(props: { message?: string }) {
  if (!props.message) {
    return null;
  }
  return (
    <span className="block text-[11px] text-destructive">{props.message}</span>
  );
}

export function ScriptEntryFormFields(props: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  targetOptions: Array<{ id: string; label: string }>;
  issues?: ScriptEntryFieldIssues;
  onFieldChange: (
    field: keyof ScriptEditorEntry,
    value: string | boolean,
  ) => void;
}) {
  const issues = props.issues ?? {};
  const hasAdvancedIssues = Boolean(
    issues.id || issues.target || issues.timeoutMs || issues.orbitProxyPort,
  );
  const [advancedOpen, setAdvancedOpen] = useState(
    () => entryHasAdvancedValues(props.entry, props.kind) || hasAdvancedIssues,
  );
  const [idEditing, setIdEditing] = useState(false);

  useEffect(() => {
    if (hasAdvancedIssues || entryHasAdvancedValues(props.entry, props.kind)) {
      setAdvancedOpen(true);
    }
  }, [hasAdvancedIssues, props.entry, props.kind]);

  return (
    <div className="space-y-3">
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Label</span>
        <Input
          value={props.entry.label}
          onChange={(event) => props.onFieldChange("label", event.target.value)}
          placeholder="Shown in the GUI"
        />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Commands</span>
        <Textarea
          value={props.entry.commandsText}
          onChange={(event) =>
            props.onFieldChange("commandsText", event.target.value)
          }
          className={cn("min-h-28", issues.commands && "border-destructive")}
          placeholder={"bun install\nbun run dev"}
          aria-invalid={Boolean(issues.commands)}
        />
        {issues.commands ? (
          <FieldError message={issues.commands} />
        ) : (
          <span className="block text-[11px] text-muted-foreground">
            One shell command per line.
          </span>
        )}
      </label>

      {props.kind === "service" ? (
        <div className="flex items-center gap-2">
          <Switch
            checked={props.entry.restartOnRun}
            onCheckedChange={(checked) =>
              props.onFieldChange("restartOnRun", checked)
            }
          />
          <span className="text-xs text-foreground">Restart on run</span>
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? "Hide advanced" : "Advanced"}
        </Button>
      </div>

      {advancedOpen ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">ID</span>
            {idEditing ? (
              <Input
                value={props.entry.id}
                onChange={(event) =>
                  props.onFieldChange("id", event.target.value)
                }
                placeholder={
                  props.kind === "service" ? "dev-server" : "bootstrap"
                }
                aria-invalid={Boolean(issues.id)}
                className={cn(issues.id && "border-destructive")}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-xs",
                    props.entry.id.trim()
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {props.entry.id.trim() || "Generated from the label"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setIdEditing(true)}
                >
                  Edit
                </Button>
              </div>
            )}
            <FieldError message={issues.id} />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              Description
            </span>
            <Input
              value={props.entry.description}
              onChange={(event) =>
                props.onFieldChange("description", event.target.value)
              }
              placeholder="Short summary of what this execution does"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">
                Environment
              </span>
              <Select
                value={props.entry.target}
                onValueChange={(value) => props.onFieldChange("target", value)}
              >
                <SelectTrigger
                  className={cn(
                    "w-full",
                    issues.target && "border-destructive",
                  )}
                >
                  <SelectValue placeholder="Select an environment" />
                </SelectTrigger>
                <SelectContent>
                  {props.targetOptions.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={issues.target} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">
                Timeout (ms)
              </span>
              <Input
                value={props.entry.timeoutMs}
                onChange={(event) =>
                  props.onFieldChange("timeoutMs", event.target.value)
                }
                inputMode="numeric"
                placeholder="Optional"
                aria-invalid={Boolean(issues.timeoutMs)}
                className={cn(issues.timeoutMs && "border-destructive")}
              />
              <FieldError message={issues.timeoutMs} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Switch
                checked={props.entry.enabled}
                onCheckedChange={(checked) =>
                  props.onFieldChange("enabled", checked)
                }
              />
              <span className="text-xs text-foreground">Enabled</span>
            </div>
            {props.kind === "service" ? (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={props.entry.orbitEnabled}
                    onCheckedChange={(checked) =>
                      props.onFieldChange("orbitEnabled", checked)
                    }
                  />
                  <span className="text-xs text-foreground">Use Orbit</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={props.entry.orbitNoTls}
                    disabled={!props.entry.orbitEnabled}
                    onCheckedChange={(checked) =>
                      props.onFieldChange("orbitNoTls", checked)
                    }
                  />
                  <span className="text-xs text-foreground">Plain HTTP</span>
                </div>
              </>
            ) : null}
          </div>

          {props.kind === "service" && props.entry.orbitEnabled ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-foreground">
                  Orbit Name
                </span>
                <Input
                  value={props.entry.orbitName}
                  onChange={(event) =>
                    props.onFieldChange("orbitName", event.target.value)
                  }
                  placeholder="Optional base host name override"
                />
                <span className="block text-[11px] text-muted-foreground">
                  Optional `portless --name` override. Orbit processes must use
                  the workspace environment.
                </span>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-foreground">
                  Orbit Proxy Port
                </span>
                <Input
                  value={props.entry.orbitProxyPort}
                  onChange={(event) =>
                    props.onFieldChange("orbitProxyPort", event.target.value)
                  }
                  inputMode="numeric"
                  placeholder="Optional"
                  aria-invalid={Boolean(issues.orbitProxyPort)}
                  className={cn(issues.orbitProxyPort && "border-destructive")}
                />
                {issues.orbitProxyPort ? (
                  <FieldError message={issues.orbitProxyPort} />
                ) : (
                  <span className="block text-[11px] text-muted-foreground">
                    Optional portless proxy port override.
                  </span>
                )}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
