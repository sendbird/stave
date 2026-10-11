import { useTranslation } from "@/i18n";
import { KickoffWhoPicker } from "./KickoffWhoPicker";
import { sx } from "@/components/ads/utils/stylex";
import { kickoffStyles } from "@/components/layout/kickoff-dialog.styles";
import type { AgentConfig } from "@/lib/agents/schema";
import type { ReactNode } from "react";

/**
 * "Who" on the source phase: run the work yourself, or assign it to a saved
 * agent. With an agent, the dialog footer's "Assign" starts the work right
 * away, beside the "Resolve source" / "Skip AI" prepare step; this field says
 * where and how that start runs, or why it cannot start yet.
 */
export function KickoffSourceWho(props: {
  agents: readonly AgentConfig[];
  who: "me" | "agent";
  agentId: string | null;
  onWhoChange: (who: "me" | "agent") => void;
  onAgentChange: (agentId: string) => void;
  /** Where and how Assign runs, or why it cannot start yet. */
  agentHint: string | null;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { t: tI18n } = useTranslation(["kickoff"]);
  const agent = props.agents.find((candidate) => candidate.id === props.agentId) ?? null;
  return (
    <div className={sx(kickoffStyles.field)}>
      <p className={sx(kickoffStyles.label)}>{tI18n("kickoff:kickoffSourceWho.who")}</p>
      <KickoffWhoPicker
        agents={props.agents}
        who={props.who}
        agentId={props.agentId}
        disabled={props.disabled}
        onWhoChange={props.onWhoChange}
        onAgentChange={props.onAgentChange}
        aria-label={tI18n("kickoff:kickoffSourceWho.whoDoesTheWork")}
      />
      {props.children}
      {props.who === "agent" && agent ? (
        props.agentHint ? <p className={sx(kickoffStyles.hint)}>{props.agentHint}</p> : null
      ) : (
        <p className={sx(kickoffStyles.hint)}>
          {tI18n("kickoff:kickoffSourceWho.prepareTheWorkspaceAndItsFirstTask")}</p>
      )}
    </div>
  );
}
