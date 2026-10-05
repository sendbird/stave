import { i18n, useTranslation } from "@/i18n";
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
  const { t: tI18n } = useTranslation(["scripts"]);
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
        <span className={sx(entryFormStyles.fieldLabel)}>{tI18n("scripts:scriptEntryFormFields.label")}</span>
        <Input
          value={props.entry.label}
          onChange={(event) => props.onFieldChange("label", event.target.value)}
          placeholder={tI18n("scripts:scriptEntryFormFields.shownInTheGui")}
        />
      </label>

      <label className={sx(entryFormStyles.field)}>
        <span className={sx(entryFormStyles.fieldLabel)}>{tI18n("scripts:scriptEntryFormFields.commands")}</span>
        <Textarea
          value={props.entry.commandsText}
          onChange={(event) =>
            props.onFieldChange("commandsText", event.target.value)
          }
          xstyle={[
            entryFormStyles.commands,
            Boolean(issues.commands) && entryFormStyles.invalidControl,
          ]}
          placeholder={("bun install\nbun run dev" /* i18n-ignore: shell command example */)}
          aria-invalid={Boolean(issues.commands)}
        />
        {issues.commands ? (
          <FieldError message={issues.commands} />
        ) : (
          <span className={sx(entryFormStyles.hint)}>
            {tI18n("scripts:scriptEntryFormFields.oneShellCommandPerLine")}</span>
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
            {tI18n("scripts:scriptEntryFormFields.restartOnRun")}</span>
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
          {advancedOpen ? tI18n("scripts:scriptEntryFormFields.hideAdvanced") : tI18n("scripts:scriptEntryFormFields.advanced")}
        </Button>
      </div>

      {advancedOpen ? (
        <div className={sx(entryFormStyles.advanced)}>
          <label className={sx(entryFormStyles.field)}>
            <span className={sx(entryFormStyles.fieldLabel)}>{tI18n("scripts:scriptEntryFormFields.id")}</span>
            {idEditing ? (
              <Input
                value={props.entry.id}
                onChange={(event) =>
                  props.onFieldChange("id", event.target.value)
                }
                placeholder={
                  props.kind === "service" ? "dev-server" : ("bootstrap" /* i18n-ignore: execution command identifier example */)
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
                  {props.entry.id.trim() || tI18n("scripts:scriptEntryFormFields.generatedFromTheLabel")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  xstyle={entryFormStyles.idEditButton}
                  onClick={() => setIdEditing(true)}
                >
                  {tI18n("scripts:scriptEntryFormFields.edit")}</Button>
              </div>
            )}
            <FieldError message={issues.id} />
          </label>

          <label className={sx(entryFormStyles.field)}>
            <span className={sx(entryFormStyles.fieldLabel)}>{tI18n("scripts:scriptEntryFormFields.description")}</span>
            <Input
              value={props.entry.description}
              onChange={(event) =>
                props.onFieldChange("description", event.target.value)
              }
              placeholder={tI18n("scripts:scriptEntryFormFields.shortSummaryOfWhatThisExecutionDoes")}
            />
          </label>

          <div className={sx(entryFormStyles.grid)}>
            <label className={sx(entryFormStyles.field)}>
              <span className={sx(entryFormStyles.fieldLabel)}>
                {tI18n("scripts:scriptEntryFormFields.environment")}</span>
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
                  <SelectValue placeholder={tI18n("scripts:scriptEntryFormFields.selectAnEnvironment")} />
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
                {tI18n("scripts:scriptEntryFormFields.timeoutMs")}</span>
              <Input
                value={props.entry.timeoutMs}
                onChange={(event) =>
                  props.onFieldChange("timeoutMs", event.target.value)
                }
                inputMode="numeric"
                placeholder={tI18n("scripts:scriptEntryFormFields.optional")}
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
              <span className={sx(entryFormStyles.switchLabel)}>{tI18n("scripts:scriptEntryFormFields.enabled")}</span>
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
                    {tI18n("scripts:scriptEntryFormFields.useOrbit")}</span>
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
                    {tI18n("scripts:scriptEntryFormFields.plainHttp")}</span>
                </div>
              </>
            ) : null}
          </div>

          {props.kind === "service" && props.entry.orbitEnabled ? (
            <div className={sx(entryFormStyles.grid)}>
              <label className={sx(entryFormStyles.field)}>
                <span className={sx(entryFormStyles.fieldLabel)}>
                  {tI18n("scripts:scriptEntryFormFields.orbitName")}</span>
                <Input
                  value={props.entry.orbitName}
                  onChange={(event) =>
                    props.onFieldChange("orbitName", event.target.value)
                  }
                  placeholder={tI18n("scripts:scriptEntryFormFields.optionalBaseHostNameOverride")}
                />
                <span className={sx(entryFormStyles.hint)}>
                  {tI18n("scripts:scriptEntryFormFields.optionalPortlessNameOverrideOrbitProcessesMust")}</span>
              </label>
              <label className={sx(entryFormStyles.field)}>
                <span className={sx(entryFormStyles.fieldLabel)}>
                  {tI18n("scripts:scriptEntryFormFields.orbitProxyPort")}</span>
                <Input
                  value={props.entry.orbitProxyPort}
                  onChange={(event) =>
                    props.onFieldChange("orbitProxyPort", event.target.value)
                  }
                  inputMode="numeric"
                  placeholder={tI18n("scripts:scriptEntryFormFields.optional")}
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
                    {tI18n("scripts:scriptEntryFormFields.optionalPortlessProxyPortOverride")}</span>
                )}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
