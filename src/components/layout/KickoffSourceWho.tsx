import { useTranslation } from "@/i18n";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui";
import { KickoffWhoPicker } from "./KickoffWhoPicker";
import { sx } from "@/components/ads/utils/stylex";
import { kickoffStyles } from "@/components/layout/kickoff-dialog.styles";
import type { AgentConfig } from "@/lib/agents/schema";
import type { ReactNode } from "react";

/** Assign on the source screen; the dialog owns the start itself. */
export interface KickoffStartNowProps {
  canStart: boolean;
  busy: boolean;
  /** Where and how it runs, or why it cannot start yet. */
  hint: string | null;
  onStart: () => void;
}

/**
 * "Who" on the source phase: run the work yourself, or assign it to a saved
 * agent. With an agent, "Assign" starts the work right away through the
 * same start as the review screen's Assign, next to the deliberate
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
        <div className={sx(kickoffStyles.startNow)}>
          <div className={sx(kickoffStyles.startNowRow)}>
            <Button
              type="button"
              variant="outline"
              disabled={!props.startNow.canStart}
              onClick={props.startNow.onStart}
            >
              <Rocket className={sx(kickoffStyles.buttonIcon)} />
              {props.startNow.busy ? tI18n("kickoff:kickoffSourceWho.assigning") : tI18n("kickoff:kickoffSourceWho.assign")}
            </Button>
          </div>
          {props.startNow.hint ? (
            <p className={sx(kickoffStyles.hint)}>{props.startNow.hint}</p>
          ) : null}
        </div>
      ) : (
        <p className={sx(kickoffStyles.hint)}>
          {tI18n("kickoff:kickoffSourceWho.prepareTheWorkspaceAndItsFirstTask")}</p>
      )}
    </div>
  );
}
