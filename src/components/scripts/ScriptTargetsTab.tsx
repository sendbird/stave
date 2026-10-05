import { i18n, useTranslation, Trans } from "@/i18n";
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
  const { t: tI18n } = useTranslation(["scripts"]);
  const definedIds = new Set(
    props.targets.map((target) => target.id.trim()).filter(Boolean),
  );
  const overridableBuiltins = [
    { id: DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE, label: tI18n("scripts:scriptTargetsTab.workspace") },
    { id: DEFAULT_SCRIPT_TARGET_IDS.REPOSITORY, label: tI18n("scripts:scriptTargetsTab.repository") },
  ].filter((builtin) => !definedIds.has(builtin.id));

  return (
    <div className={sx(targetsTabStyles.root)}>
      <div className={sx(targetsTabStyles.header)}>
        <div className={sx(targetsTabStyles.headerText)}>
          <p className={sx(targetsTabStyles.title)}>{tI18n("scripts:scriptTargetsTab.executionEnvironments")}</p>
          <p className={sx(targetsTabStyles.description)}>
          <Trans t={tI18n} i18nKey="scripts:scriptTargetsTab.targetGuidance" values={{}} components={{ code: <span className={sx(targetsTabStyles.mono)} /> }} />
        </p>
        </div>
        <Button
          type="button"
          size="sm"
          xstyle={targetsTabStyles.addButton}
          onClick={props.onAdd}
        >
          <Plus className={sx(targetsTabStyles.buttonIcon)} />
          {tI18n("scripts:scriptTargetsTab.addTarget")}</Button>
      </div>

      {overridableBuiltins.length > 0 ? (
        <div className={sx(targetsTabStyles.overrideRow)}>
          <span className={sx(targetsTabStyles.overrideLabel)}>
            {tI18n("scripts:scriptTargetsTab.overrideBuiltIn")}</span>
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
            <EmptyTitle>{tI18n("scripts:scriptTargetsTab.noCustomEnvironments")}</EmptyTitle>
            <EmptyDescription>
              {tI18n("scripts:scriptTargetsTab.commandsAndProcessesUseTheBuiltIn")}</EmptyDescription>
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
                      {target.label.trim() || id || tI18n("scripts:scriptTargetsTab.targetValue", { value1: index + 1 })}
                    </span>
                    {usage > 0 ? (
                      <Badge
                        variant="secondary"
                        className={sx(targetsTabStyles.usageBadge)}
                      >
          {tI18n("scripts:scriptTargetsTab.entryCount", { count: usage })}
        </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={sx(targetsTabStyles.usageBadge)}
                      >
                        {tI18n("scripts:scriptTargetsTab.unused")}</Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    xstyle={targetsTabStyles.deleteButton}
                    onClick={() => props.onRemove(index)}
                    aria-label={tI18n("scripts:scriptTargetsTab.deleteTarget")}
                    title={
                      usage > 0
                        ? tI18n("scripts:scriptTargetsTab.referencedByValueCommandSOrProcess", { usage: usage })
                        : tI18n("scripts:scriptTargetsTab.deleteEnvironment")
                    }
                  >
                    <Trash2 className={sx(targetsTabStyles.buttonIcon)} />
                  </Button>
                </div>

                <div className={sx(targetsTabStyles.fieldGrid)}>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>{tI18n("scripts:scriptTargetsTab.id")}</span>
                    <Input
                      value={target.id}
                      onChange={(event) =>
                        props.onFieldChange(index, "id", event.target.value)
                      }
                      placeholder={("api" /* i18n-ignore: execution target identifier example */)}
                      xstyle={targetsTabStyles.monoInput}
                    />
                    <span className={sx(targetsTabStyles.hint)}>
                      {tI18n("scripts:scriptTargetsTab.renamingUpdatesCommandsAndProcessesThatReference")}</span>
                  </label>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>
                      {tI18n("scripts:scriptTargetsTab.label")}</span>
                    <Input
                      value={target.label}
                      onChange={(event) =>
                        props.onFieldChange(index, "label", event.target.value)
                      }
                      placeholder={tI18n("scripts:scriptTargetsTab.shownInTheTargetPicker")}
                    />
                  </label>
                </div>

                <div className={sx(targetsTabStyles.fieldGrid)}>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>
                      {tI18n("scripts:scriptTargetsTab.workingDirectory")}</span>
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
                          {tI18n("scripts:scriptTargetsTab.workspaceRoot")}</SelectItem>
                        <SelectItem value="project">{tI18n("scripts:scriptTargetsTab.repositoryRoot")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className={sx(targetsTabStyles.field)}>
                    <span className={sx(targetsTabStyles.fieldLabel)}>
                      {tI18n("scripts:scriptTargetsTab.shell")}</span>
                    <Input
                      value={target.shell}
                      onChange={(event) =>
                        props.onFieldChange(index, "shell", event.target.value)
                      }
                      placeholder={tI18n("scripts:scriptTargetsTab.defaultLoginShell")}
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
          {tI18n("scripts:scriptTargetsTab.injectedEnvironmentVariables")}</p>
        <p className={sx(targetsTabStyles.injectedDescription)}>
          {tI18n("scripts:scriptTargetsTab.staveSetsTheseAutomaticallyForEveryExecution")}</p>
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
          <Trans t={tI18n} i18nKey="scripts:scriptTargetsTab.localOverrideGuidance" values={{}} components={{ code: <span className={sx(targetsTabStyles.mono)} />, emphasis: <span className={sx(targetsTabStyles.emphasis)} /> }} />
        </p>
    </div>
  );
}
