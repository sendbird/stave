import { Rocket } from "lucide-react";
import { Button } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sx } from "@/components/ads/utils/stylex";
import { kickoffStyles } from "@/components/layout/kickoff-dialog.styles";
import type { AgentConfig } from "@/lib/agents/schema";
import { AgentAvatar } from "@/components/agents/AgentAvatar";

const ME = "me";

/** Start now on the source screen; the dialog owns the start itself. */
export interface KickoffStartNowProps {
  canStart: boolean;
  busy: boolean;
  /** Where and how it runs, or why it cannot start yet. */
  hint: string | null;
  onStart: () => void;
}

/**
 * "Who" on the source phase: run the work yourself, or hand it to a saved
 * agent. With an agent, "Start now" starts the work right away through the
 * same start as the review screen's Create, next to the deliberate
 * "Resolve source" / "Skip AI" prepare step.
 */
export function KickoffSourceWho(props: {
  agents: readonly AgentConfig[];
  who: "me" | "agent";
  agentId: string | null;
  onWhoChange: (who: "me" | "agent") => void;
  onAgentChange: (agentId: string) => void;
  startNow: KickoffStartNowProps;
  disabled?: boolean;
}) {
  const agent = props.agents.find((candidate) => candidate.id === props.agentId) ?? null;
  return (
    <div className={sx(kickoffStyles.field)}>
      <p className={sx(kickoffStyles.label)}>Who</p>
      <Select
        value={props.who === "agent" && agent ? agent.id : ME}
        disabled={props.disabled}
        onValueChange={(value) => {
          if (value === ME) {
            props.onWhoChange("me");
            return;
          }
          props.onWhoChange("agent");
          props.onAgentChange(String(value));
        }}
      >
        <SelectTrigger className={sx(kickoffStyles.fullWidth)} aria-label="Who does the work">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ME}>Me</SelectItem>
          {props.agents.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              <span className={sx(kickoffStyles.whoOption)}>
                <AgentAvatar agent={candidate} size="xs" aria-label={null} />
                {candidate.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.who === "agent" && agent ? (
        <div className={sx(kickoffStyles.startNow)}>
          <div className={sx(kickoffStyles.startNowRow)}>
            <Button
              type="button"
              variant="outline"
              disabled={!props.startNow.canStart}
              onClick={props.startNow.onStart}
            >
              <Rocket className={sx(kickoffStyles.buttonIcon)} />
              {props.startNow.busy ? "Starting…" : "Start now"}
            </Button>
          </div>
          {props.startNow.hint ? (
            <p className={sx(kickoffStyles.hint)}>{props.startNow.hint}</p>
          ) : null}
        </div>
      ) : (
        <p className={sx(kickoffStyles.hint)}>
          Prepare the workspace and its first task, or pick an agent to start work now.
        </p>
      )}
    </div>
  );
}
