import { getAgentDisplayName } from "@/lib/agents/display";
import { i18n, useTranslation } from "@/i18n";
import { Dialog } from "@/components/ads/components/Dialog";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  agentIsDeletable,
  type AgentReference,
  type AgentReferences,
} from "@/lib/agents/agent-references";
import type { AgentConfig } from "@/lib/agents/schema";
import { workflowStyles as styles } from "../workflows/workflows.styles";
import { agentStyles } from "./agents.styles";

const REFERENCE_KIND_LABELS = {
  get "workflow-stage"() { return i18n.t("agents:deleteAgentDialog.workflowStage"); },
  get task() { return i18n.t("agents:deleteAgentDialog.task"); },
} as const;

function ReferenceList(props: { title: string; references: readonly AgentReference[] }) {
  useTranslation();
  if (props.references.length === 0) return null;
  return (
    <section aria-label={props.title}>
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>{props.title}</h3>
      </div>
      <ul className={sx(agentStyles.refList)}>
        {props.references.map((reference) => (
          <li key={`${reference.kind}:${reference.ownerId}:${reference.detail ?? ""}`} className={sx(agentStyles.refItem)}>
            <span className={sx(agentStyles.refKind)}>{REFERENCE_KIND_LABELS[reference.kind]}</span>
            <span>
              {reference.label}
              {reference.detail ? ` · ${reference.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Confirms deleting a custom agent. Lists where it is used: another agent's
 * workflow stages block deletion (delete would leave a dangling reference —
 * archive instead); running or waiting tasks keep their own snapshot and only
 * show for context. Past assignments are untouched, so history still renders
 * the name.
 */
export function DeleteAgentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentConfig;
  references: AgentReferences;
  onDelete: () => void;
  onArchive: () => void;
}) {
  useTranslation();
  const deletable = agentIsDeletable(props.references);
  const hasSoft = props.references.soft.length > 0;
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      width={deletable && !hasSoft ? "sm" : "md"}
      title={i18n.t("agents:deleteAgentDialog.title", { value1: getAgentDisplayName(props.agent) })}
      description={
        deletable
          ? i18n.t("agents:deleteAgentDialog.description")
          : i18n.t("agents:deleteAgentDialog.description2")
      }
      footer={
        deletable ? (
          <>
            <Button size="sm" variant="quiet" onClick={() => props.onOpenChange(false)}>
              {i18n.t("agents:deleteAgentDialog.footer")}</Button>
            <Button
              size="sm"
              variant="primary"
              tone="danger"
              onClick={() => {
                props.onDelete();
                props.onOpenChange(false);
              }}
            >
              {i18n.t("agents:deleteAgentDialog.footer2")}</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="quiet" onClick={() => props.onOpenChange(false)}>
              {i18n.t("agents:deleteAgentDialog.footer3")}</Button>
            <Button
              size="sm"
              onClick={() => {
                props.onArchive();
                props.onOpenChange(false);
              }}
            >
              {i18n.t("agents:deleteAgentDialog.footer4")}</Button>
          </>
        )
      }
    >
      <ReferenceList title={i18n.t("agents:deleteAgentDialog.title2")} references={props.references.blocking} />
      <ReferenceList title={i18n.t("agents:deleteAgentDialog.title3")} references={props.references.soft} />
    </Dialog>
  );
}
