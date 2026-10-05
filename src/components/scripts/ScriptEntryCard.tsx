import { i18n, useTranslation } from "@/i18n";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { ScriptEntryFormFields } from "./ScriptEntryFormFields";
import { targetLabel } from "./scripts-manager-state";
import type {
  ScriptEditorEntry,
  ScriptEntryFieldIssues,
} from "@/lib/workspace-scripts/editor";
import { SCRIPT_TRIGGER_METADATA } from "@/lib/workspace-scripts/constants";
import type { ScriptKind, ScriptTrigger } from "@/lib/workspace-scripts/types";
import { entryCardStyles } from "./script-entry-card.styles";

export function ScriptEntryCard(props: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  index: number;
  totalCount: number;
  triggers: ScriptTrigger[];
  targetOptions: Array<{ id: string; label: string }>;
  issues: ScriptEntryFieldIssues;
  expanded: boolean;
  isRunning: boolean;
  onToggleExpand: () => void;
  onFieldChange: (
    field: keyof ScriptEditorEntry,
    value: string | boolean,
  ) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onOpenInRail: () => void;
}) {
  const { t: tI18n } = useTranslation(["scripts", "common"]);
  const title =
    props.entry.label.trim() ||
    props.entry.id.trim() ||
    tI18n(props.kind === "service" ? "scripts:scriptEntryCard.processTitle" : "scripts:scriptEntryCard.commandTitle", { number: props.index + 1 });
  const kindLabel = tI18n(props.kind === "service" ? "scripts:scriptEntryCard.process" : "scripts:scriptEntryCard.command");
  const moveUpDisabled = props.index === 0;
  const moveDownDisabled = props.index === props.totalCount - 1;
  const hasIssues = Object.keys(props.issues).length > 0;
  const metaParts = [
    targetLabel(props.entry.target, props.targetOptions),
    props.kind === "service" && props.entry.orbitEnabled ? tI18n("scripts:scriptEntryCard.orbit") : null,
    props.entry.enabled ? null : tI18n("common:status.disabled"),
  ].filter((part): part is string => Boolean(part));

  return (
    <div
      className={sx(
        entryCardStyles.root,
        hasIssues && !props.expanded && entryCardStyles.rootAttention,
      )}
    >
      <div className={sx(entryCardStyles.header)}>
        <AdsButton
          type="button"
          layout="host"
          xstyle={entryCardStyles.summaryButton}
          onClick={props.onToggleExpand}
          aria-expanded={props.expanded}
        >
          <span className={sx(entryCardStyles.chevron)}>
            {props.expanded ? (
              <ChevronDown className={sx(entryCardStyles.chevronIcon)} />
            ) : (
              <ChevronRight className={sx(entryCardStyles.chevronIcon)} />
            )}
          </span>
          <div className={sx(entryCardStyles.summaryBody)}>
            <div className={sx(entryCardStyles.titleRow)}>
              <span className={sx(entryCardStyles.title)}>{title}</span>
              {props.isRunning ? (
                <Badge
                  variant="secondary"
                  className={sx(entryCardStyles.runningBadge)}
                >
                  {tI18n("scripts:scriptEntryCard.running")}</Badge>
              ) : null}
              {hasIssues ? (
                <span className={sx(entryCardStyles.attention)}>
                  <AlertCircle className={sx(entryCardStyles.attentionIcon)} />
                  {tI18n("scripts:scriptEntryCard.needsAttention")}</span>
              ) : null}
            </div>
            {metaParts.length > 0 ? (
              <p className={sx(entryCardStyles.metaText)}>
                {metaParts.join(" · ")}
              </p>
            ) : null}
            {props.entry.description.trim() ? (
              <p className={sx(entryCardStyles.metaText)}>
                {props.entry.description.trim()}
              </p>
            ) : null}
            {props.triggers.length > 0 ? (
              <div className={sx(entryCardStyles.triggerRow)}>
                <span className={sx(entryCardStyles.triggerLabel)}>
                  {tI18n("scripts:scriptEntryCard.triggers")}</span>
                {props.triggers.map((trigger) => (
                  <Badge
                    key={trigger}
                    variant="outline"
                    className={sx(entryCardStyles.triggerBadge)}
                  >
                    {SCRIPT_TRIGGER_METADATA[trigger].label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </AdsButton>

        <div className={sx(entryCardStyles.actions)}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            xstyle={entryCardStyles.actionButtonTall}
            onClick={props.onOpenInRail}
          >
            {tI18n("scripts:scriptEntryCard.openInRail")}</Button>
          <Button
            variant="outline"
            size="icon"
            xstyle={entryCardStyles.iconButton}
            disabled={moveUpDisabled}
            onClick={props.onMove.bind(null, -1)}
            aria-label={tI18n("scripts:scriptEntryCard.moveUp")}
            title={tI18n("scripts:scriptEntryCard.moveUp")}
          >
            <ChevronDown className={sx(entryCardStyles.iconFlipped)} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            xstyle={entryCardStyles.iconButton}
            disabled={moveDownDisabled}
            onClick={props.onMove.bind(null, 1)}
            aria-label={tI18n("scripts:scriptEntryCard.moveDown")}
            title={tI18n("scripts:scriptEntryCard.moveDown")}
          >
            <ChevronDown className={sx(entryCardStyles.icon)} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            xstyle={entryCardStyles.iconButton}
            onClick={props.onDuplicate}
            aria-label={tI18n("scripts:scriptEntryCard.duplicateValue", { kindLabel: kindLabel })}
            title={tI18n("scripts:scriptEntryCard.duplicateValue", { kindLabel: kindLabel })}
          >
            <Copy className={sx(entryCardStyles.icon)} />
          </Button>
          <Button variant="outline" size="sm" onClick={props.onToggleExpand}>
            {props.expanded ? tI18n("scripts:scriptEntryCard.done") : tI18n("scripts:scriptEntryCard.edit")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            xstyle={entryCardStyles.destructiveButton}
            onClick={props.onRemove}
            aria-label={tI18n("scripts:scriptEntryCard.deleteValue", { kindLabel: kindLabel })}
            title={tI18n("scripts:scriptEntryCard.deleteValue", { kindLabel: kindLabel })}
          >
            <Trash2 className={sx(entryCardStyles.icon)} />
          </Button>
        </div>
      </div>

      {props.expanded ? (
        <div className={sx(entryCardStyles.body)}>
          <ScriptEntryFormFields
            entry={props.entry}
            kind={props.kind}
            targetOptions={props.targetOptions}
            issues={props.issues}
            onFieldChange={props.onFieldChange}
          />
        </div>
      ) : null}
    </div>
  );
}
