import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";
import { Select } from "@/components/ads/components/Select";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { describeAgent } from "@/lib/agents/agents-view";
import { listAgents } from "@/lib/agents/library";
import { isUsableAs } from "@/lib/agents/schema";
import { useAgentsUiStore, type AssignSheetRequest } from "@/store/agents-ui-store";
import { useAppStore } from "@/store/app.store";
import { AssignPanel } from "./AssignPanel";

export function AssignAgentSheetHost() {
  const request = useAgentsUiStore((state) => state.assignSheet);
  const close = useAgentsUiStore((state) => state.closeAssignSheet);
  if (!request) return null;
  return <AssignAgentSheet request={request} onClose={close} />;
}

/**
 * Assign to agent from anywhere: an issue, the new-task screen or the command
 * palette. Lists the custom and built-in agents usable as a main agent and
 * hands the request to the same Assign panel the Agents tab uses.
 */
export function AssignAgentSheet(props: { request: AssignSheetRequest; onClose: () => void }) {
  const custom = useAppStore((state) => state.settings.customAgents);
  const agents = useMemo(
    () => listAgents({ custom, activeOnly: true }).filter((agent) => isUsableAs(agent, "primary")),
    [custom],
  );
  const [agentId, setAgentId] = useState(
    () => agents.find((agent) => agent.id === props.request.agentConfigId)?.id ?? agents[0]?.id ?? null,
  );
  const agent = agents.find((candidate) => candidate.id === agentId) ?? null;
  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <SheetContent side="right" xstyle={styles.sheet}>
        <SheetHeader xstyle={styles.header}>
          <SheetTitle className={sx(styles.title)}>Assign to agent</SheetTitle>
          <SheetDescription className={sx(styles.subtitle)}>
            {props.request.source ? `${props.request.source} · ` : ""}The agent gets a task and starts on it.
          </SheetDescription>
        </SheetHeader>
        <div className={sx(styles.content)}>
          <Select
            size="sm"
            aria-label="Agent"
            value={agentId ?? ""}
            options={agents.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            onValueChange={(value) => setAgentId(String(value))}
          />
          {agent ? (
            <>
              <p className={sx(styles.subtitle)}>
                {agent.description} · {describeAgent(agent)}
              </p>
              <AssignPanel
                key={agent.id}
                agent={agent}
                initialText={props.request.assignment}
                // The panel offers Open task; the sheet stays so the user can use it.
              />
            </>
          ) : (
            <p className={sx(styles.subtitle)}>No agent can be assigned work. Turn on Main agent for one in Automations › Agents.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const styles = stylex.create({
  sheet: { gap: 0, padding: 0, width: "100%", "@media (min-width: 40rem)": { maxWidth: "32rem" } },
  header: {
    flexShrink: 0,
    paddingBlock: vars["--ads-space-16"],
    paddingInlineStart: vars["--ads-space-20"],
    paddingInlineEnd: "3rem",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  title: { margin: 0, fontSize: vars["--ads-font-size-heading"], fontWeight: vars["--ads-font-weight-semibold"] },
  subtitle: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-20"],
    overflowY: "auto",
    minHeight: 0,
  },
});
