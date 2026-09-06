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
import { sx } from "@/components/ads/utils/stylex";
import {
  entryHasAdvancedValues,
  type ScriptEditorEntry,
  type ScriptEntryFieldIssues,
} from "@/lib/workspace-scripts/editor";
import type { ScriptKind } from "@/lib/workspace-scripts/types";
import { entryFormStyles } from "./script-entry-form-fields.styles";

function FieldError(props: { message?: string }) {
  if (!props.message) {
    return null;
  }
  return (
    <span className={sx(entryFormStyles.fieldError)}>{props.message}</span>
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
    <div className={sx(entryFormStyles.root)}>
      <label className={sx(entryFormStyles.field)}>
        <span className={sx(entryFormStyles.fieldLabel)}>Label</span>
        <Input
          value={props.entry.label}
          onChange={(event) => props.onFieldChange("label", event.target.value)}
          placeholder="Shown in the GUI"
        />
      </label>

      <label className={sx(entryFormStyles.field)}>
        <span className={sx(entryFormStyles.fieldLabel)}>Commands</span>
        <Textarea
          value={props.entry.commandsText}
          onChange={(event) =>
            props.onFieldChange("commandsText", event.target.value)
          }
          xstyle={[
            entryFormStyles.commands,
            Boolean(issues.commands) && entryFormStyles.invalidControl,
          ]}
          placeholder={"bun install\nbun run dev"}
          aria-invalid={Boolean(issues.commands)}
        />
        {issues.commands ? (
          <FieldError message={issues.commands} />
        ) : (
          <span className={sx(entryFormStyles.hint)}>
            One shell command per line.
          </span>
        )}
      </label>

      {props.kind === "service" ? (
        <div className={sx(entryFormStyles.switchRow)}>
          <Switch
            checked={props.entry.restartOnRun}
            onCheckedChange={(checked) =>
              props.onFieldChange("restartOnRun", checked)
            }
          />
          <span className={sx(entryFormStyles.switchLabel)}>
            Restart on run
          </span>
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          xstyle={entryFormStyles.advancedToggle}
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? "Hide advanced" : "Advanced"}
        </Button>
      </div>

      {advancedOpen ? (
        <div className={sx(entryFormStyles.advanced)}>
          <label className={sx(entryFormStyles.field)}>
            <span className={sx(entryFormStyles.fieldLabel)}>ID</span>
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
                xstyle={Boolean(issues.id) && entryFormStyles.invalidControl}
              />
            ) : (
              <div className={sx(entryFormStyles.idDisplayRow)}>
                <span
                  className={sx(
                    entryFormStyles.idDisplay,
                    props.entry.id.trim()
                      ? entryFormStyles.idDisplaySet
                      : entryFormStyles.idDisplayEmpty,
                  )}
                >
                  {props.entry.id.trim() || "Generated from the label"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  xstyle={entryFormStyles.idEditButton}
                  onClick={() => setIdEditing(true)}
                >
                  Edit
                </Button>
              </div>
            )}
            <FieldError message={issues.id} />
          </label>

          <label className={sx(entryFormStyles.field)}>
            <span className={sx(entryFormStyles.fieldLabel)}>Description</span>
            <Input
              value={props.entry.description}
              onChange={(event) =>
                props.onFieldChange("description", event.target.value)
              }
              placeholder="Short summary of what this execution does"
            />
          </label>

          <div className={sx(entryFormStyles.grid)}>
            <label className={sx(entryFormStyles.field)}>
              <span className={sx(entryFormStyles.fieldLabel)}>
                Environment
              </span>
              <Select
                value={props.entry.target}
                onValueChange={(value) => props.onFieldChange("target", value)}
              >
                <SelectTrigger
                  className={sx(
                    entryFormStyles.triggerFull,
                    Boolean(issues.target) && entryFormStyles.invalidControl,
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
            <label className={sx(entryFormStyles.field)}>
              <span className={sx(entryFormStyles.fieldLabel)}>
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
                xstyle={
                  Boolean(issues.timeoutMs) && entryFormStyles.invalidControl
                }
              />
              <FieldError message={issues.timeoutMs} />
            </label>
          </div>

          <div className={sx(entryFormStyles.toggleGroup)}>
            <div className={sx(entryFormStyles.switchRow)}>
              <Switch
                checked={props.entry.enabled}
                onCheckedChange={(checked) =>
                  props.onFieldChange("enabled", checked)
                }
              />
              <span className={sx(entryFormStyles.switchLabel)}>Enabled</span>
            </div>
            {props.kind === "service" ? (
              <>
                <div className={sx(entryFormStyles.switchRow)}>
                  <Switch
                    checked={props.entry.orbitEnabled}
                    onCheckedChange={(checked) =>
                      props.onFieldChange("orbitEnabled", checked)
                    }
                  />
                  <span className={sx(entryFormStyles.switchLabel)}>
                    Use Orbit
                  </span>
                </div>
                <div className={sx(entryFormStyles.switchRow)}>
                  <Switch
                    checked={props.entry.orbitNoTls}
                    disabled={!props.entry.orbitEnabled}
                    onCheckedChange={(checked) =>
                      props.onFieldChange("orbitNoTls", checked)
                    }
                  />
                  <span className={sx(entryFormStyles.switchLabel)}>
                    Plain HTTP
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {props.kind === "service" && props.entry.orbitEnabled ? (
            <div className={sx(entryFormStyles.grid)}>
              <label className={sx(entryFormStyles.field)}>
                <span className={sx(entryFormStyles.fieldLabel)}>
                  Orbit Name
                </span>
                <Input
                  value={props.entry.orbitName}
                  onChange={(event) =>
                    props.onFieldChange("orbitName", event.target.value)
                  }
                  placeholder="Optional base host name override"
                />
                <span className={sx(entryFormStyles.hint)}>
                  Optional `portless --name` override. Orbit processes must use
                  the workspace environment.
                </span>
              </label>
              <label className={sx(entryFormStyles.field)}>
                <span className={sx(entryFormStyles.fieldLabel)}>
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
                  xstyle={
                    Boolean(issues.orbitProxyPort) &&
                    entryFormStyles.invalidControl
                  }
                />
                {issues.orbitProxyPort ? (
                  <FieldError message={issues.orbitProxyPort} />
                ) : (
                  <span className={sx(entryFormStyles.hint)}>
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
