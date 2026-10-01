import { Dialog } from "@/components/ads/components/Dialog";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  agentIsDeletable,
  type AgentReference,
  type AgentReferences,
} from "@/lib/agents/agent-references";
import type { AgentConfig } from "@/lib/agents/schema";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { agentStyles } from "./agents.styles";

const REFERENCE_KIND_LABELS = {
  "workflow-stage": "Workflow stage",
  project: "Project",
  task: "Task",
} as const;

function ReferenceList(props: { title: string; references: readonly AgentReference[] }) {
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
 * Confirms deleting a custom agent. Lists where it is used: playbook stages
 * and projects block deletion (delete would leave a dangling reference —
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
  const deletable = agentIsDeletable(props.references);
  const hasSoft = props.references.soft.length > 0;
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      width={deletable && !hasSoft ? "sm" : "md"}
      title={`Delete ${props.agent.name}?`}
      description={
        deletable
          ? "This removes the saved agent. Past work keeps its own copy, so its history still shows the name."
          : "This agent is still used. Archive it instead, or remove it from the places below first."
      }
      footer={
        deletable ? (
          <>
            <Button size="sm" variant="quiet" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              tone="danger"
              onClick={() => {
                props.onDelete();
                props.onOpenChange(false);
              }}
            >
              Delete agent
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="quiet" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                props.onArchive();
                props.onOpenChange(false);
              }}
            >
              Archive instead
            </Button>
          </>
        )
      }
    >
      <ReferenceList title="Used by" references={props.references.blocking} />
      <ReferenceList title="Running or waiting" references={props.references.soft} />
    </Dialog>
  );
}
