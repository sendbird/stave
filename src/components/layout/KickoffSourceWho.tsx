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
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAssignAgent } from "@/components/agents/useAssignAgent";
import { PROVIDER_LABELS } from "@/lib/agents/provider-labels";

const ME = "me";

/**
 * "Who" on the source phase: run the work yourself, or hand it to a saved
 * agent. With an agent, a quick "Start now" runs `agents.assign` directly from
 * the source text and offers to open the task it made, next to the deliberate
 * "Resolve source" / "Skip AI" prepare step.
 */
export function KickoffSourceWho(props: {
  /** Same routing inputs as the Review phase, so both show one route. */
  preferredProviderId: ProviderId;
  choice: "auto" | ProviderId;
  agents: readonly AgentConfig[];
  who: "me" | "agent";
  agentId: string | null;
  onWhoChange: (who: "me" | "agent") => void;
  onAgentChange: (agentId: string) => void;
  sourceText: string;
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
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.who === "agent" && agent ? (
        <KickoffStartNow
          agent={agent}
          sourceText={props.sourceText}
          preferredProviderId={props.preferredProviderId}
          choice={props.choice}
        />
      ) : (
        <p className={sx(kickoffStyles.hint)}>
          Prepare the workspace and its first task, or pick an agent to start work now.
        </p>
      )}
    </div>
  );
}

function KickoffStartNow(props: {
  agent: AgentConfig;
  sourceText: string;
  preferredProviderId: ProviderId;
  choice: "auto" | ProviderId;
}) {
  const assign = useAssignAgent(props.agent, {
    preferredProviderId: props.preferredProviderId,
    choice: props.choice,
  });
  const canStart = !assign.blocked && !assign.busy && props.sourceText.trim().length > 0;
  return (
    <div className={sx(kickoffStyles.startNow)}>
      <div className={sx(kickoffStyles.startNowRow)}>
        <Button
          type="button"
          variant="outline"
          disabled={!canStart}
          onClick={() => void assign.submit(props.sourceText)}
        >
          <Rocket className={sx(kickoffStyles.buttonIcon)} />
          {assign.busy ? "Starting…" : "Start now"}
        </Button>
        {assign.started?.taskId ? (
          <Button type="button" variant="ghost" onClick={() => void assign.openTask()}>
            Open task
          </Button>
        ) : null}
      </div>
      <p className={sx(kickoffStyles.hint)}>
        {assign.message ??
          assign.blocked ??
          `${PROVIDER_LABELS[assign.route.providerId] ?? assign.route.providerId} · ${assign.route.model ?? "default model"} — starts a task now without the workspace preview.`}
      </p>
    </div>
  );
}
