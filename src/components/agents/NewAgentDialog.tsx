import { useState } from "react";
import { Dialog } from "@/components/ads/components/Dialog";
import { Button } from "@/components/ads/components/Button";
import { TextField } from "@/components/ads/components/TextField";
import { sx } from "@/components/ads/utils/stylex";
import { blankCustomAgent, duplicateAgent } from "@/lib/agents/library";
import type { AgentConfig } from "@/lib/agents/schema";
import { describeAgent } from "@/lib/agents/agents-view";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { AgentAvatar } from "./AgentAvatar";
import { agentStyles } from "./agents.styles";

/**
 * "New agent": name it, then start from Blank or from a template (a built-in
 * or repository agent, the old Duplicate). Produces an unsaved draft — nothing
 * is stored until the editor saves it. The parent opens the editor with the
 * returned draft and clears it on cancel.
 */
export function NewAgentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: readonly AgentConfig[];
  takenIds: readonly string[];
  onCreate: (draft: AgentConfig) => void;
}) {
  const [name, setName] = useState("");
  const create = (draft: AgentConfig) => {
    props.onCreate(draft);
    setName("");
    props.onOpenChange(false);
  };
  const trimmed = name.trim();
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setName("");
        props.onOpenChange(open);
      }}
      width="md"
      title="New agent"
      description="Name it, then start blank or from a template. Nothing is saved until you save the editor."
    >
      <div className={sx(styles.empty, styles.emptyActions)} style={{ padding: 0 }}>
        <TextField
          size="sm"
          label="Name"
          value={name}
          placeholder="e.g. Docs writer"
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          size="sm"
          disabled={!trimmed}
          onClick={() => create(blankCustomAgent({ name: trimmed, takenIds: props.takenIds }))}
        >
          Start blank
        </Button>
      </div>
      <p className={sx(styles.listLabel, styles.listLabelFlush)}>From a template</p>
      <div className={sx(styles.templates)}>
        {props.templates.map((template) => (
          <Button
            key={template.id}
            layout="host"
            variant="quiet"
            press="none"
            xstyle={styles.template}
            disabled={!trimmed}
            onClick={() => {
              const copy = duplicateAgent(template, props.takenIds);
              create({ ...copy, name: trimmed, appearance: template.appearance });
            }}
          >
            <span className={sx(agentStyles.rowLead)}>
              <AgentAvatar agent={template} size="sm" aria-label={null} />
              <span className={sx(agentStyles.rowText)}>
                <span className={sx(styles.templateTitle)}>{template.name}</span>
                <span className={sx(styles.templateText)}>{describeAgent(template)}</span>
              </span>
            </span>
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
