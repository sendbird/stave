import * as stylex from "@stylexjs/stylex";
import { useCallback, useMemo } from "react";
import { Bot, ChartNoAxesColumn, LayoutGrid } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { collectAgentsWithWork } from "@/lib/agents/agent-work";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import {
  useAgentAssignmentsStore,
  useAgentAssignmentsSync,
} from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { useAgentsViewStore } from "@/store/agents-view-store";

const MAX_LISTED_AGENTS = 5;

/**
 * The agents with work running or waiting on the user right now, up to five,
 * plus a total. Reads stored references only; the grouping is memoized here,
 * never returned from a zustand selector.
 */
function useAgentsWithWork() {
  useAgentAssignmentsSync();
  const byTaskId = useAgentAssignmentsStore((state) => state.byTaskId);
  // The selector returns a string, so a streamed token that changes no task's
  // status leaves it equal and the sidebar does not re-render.
  const key = useAppStore(
    useCallback(
      (state: AppState) =>
        JSON.stringify(
          collectAgentsWithWork({
            byTaskId,
            tasks: state.tasks,
            messagesByTask: state.messagesByTask,
            activeTurnIdsByTask: state.activeTurnIdsByTask,
            providerTurnActivityByTask: state.providerTurnActivityByTask,
            limit: MAX_LISTED_AGENTS,
          }),
        ),
      [byTaskId],
    ),
  );
  return useMemo(() => JSON.parse(key) as ReturnType<typeof collectAgentsWithWork>, [key]);
}

/**
 * The sidebar's top navigation: Fleet View, Agents with the agents at work and
 * what waits for you, then Results.
 */
export function SidebarPrimaryNav(props: { showFleetView: boolean }) {
  const surface = useAppStore((state) => state.activeAppSurface.kind);
  const openFleetView = useAppStore((state) => state.openFleetView);
  const openAgents = useAppStore((state) => state.openAgents);
  const openResults = useAppStore((state) => state.openResults);
  const selectAgent = useAgentsViewStore((state) => state.selectAgent);
  const selectedAgentId = useAgentsViewStore((state) => state.selectedAgentId);
  const agentsWithWork = useAgentsWithWork();
  return (
    <>
      {props.showFleetView ? (
        <AdsButton
          layout="host"
          type="button"
          onClick={() => openFleetView()}
          aria-label="open-fleet-view"
          xstyle={[
            repositorySidebarStyles.navButton,
            transition.colors,
            surface === "fleet-view" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
          ]}
        >
          <LayoutGrid className={sx(repositorySidebarStyles.iconMd)} />
          Fleet View
        </AdsButton>
      ) : null}
      <AdsButton
        layout="host"
        type="button"
        onClick={() => openAgents()}
        aria-label={agentsWithWork.total > 0 ? `Agents, ${agentsWithWork.total} at work` : "Agents"}
        xstyle={[
          repositorySidebarStyles.navButton,
          transition.colors,
          surface === "agents" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
        ]}
      >
        <Bot className={sx(repositorySidebarStyles.iconMd)} />
        <span className={sx(styles.label)}>Agents</span>
        {agentsWithWork.total > 0 ? (
          <span className={sx(styles.count)}>{agentsWithWork.total}</span>
        ) : null}
      </AdsButton>
      {agentsWithWork.agents.map((agent) => (
        <AdsButton
          key={agent.agentConfigId}
          layout="host"
          type="button"
          onClick={() => {
            selectAgent(agent.agentConfigId);
            openAgents();
          }}
          aria-label={`Agent ${agent.agentName}${agent.needsYou ? `, ${agent.count} need you` : `, ${agent.count} at work`}`}
          xstyle={[
            repositorySidebarStyles.navButton,
            styles.childRow,
            transition.colors,
            surface === "agents" && selectedAgentId === agent.agentConfigId ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
          ]}
        >
          <AgentAvatar
            agent={{ id: agent.agentConfigId, name: agent.agentName, appearance: agent.agentAppearance }}
            size="xs"
            status={agent.needsYou ? "needs-you" : "running"}
            aria-label={null}
          />
          <span className={sx(styles.label)}>{agent.agentName}</span>
          {agent.count > 0 ? <span className={sx(styles.count)}>{agent.count}</span> : null}
        </AdsButton>
      ))}
      <AdsButton
        layout="host"
        type="button"
        onClick={() => openResults()}
        aria-label="Results"
        xstyle={[
          repositorySidebarStyles.navButton,
          transition.colors,
          surface === "results" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
        ]}
      >
        <ChartNoAxesColumn className={sx(repositorySidebarStyles.iconMd)} />
        <span className={sx(styles.label)}>Results</span>
      </AdsButton>
    </>
  );
}

/** The collapsed sidebar's rail: Fleet View, Agents and Results, with a dot when an agent needs you. */
export function SidebarPrimaryNavCollapsed(props: { showFleetView: boolean }) {
  const surface = useAppStore((state) => state.activeAppSurface.kind);
  const openFleetView = useAppStore((state) => state.openFleetView);
  const openAgents = useAppStore((state) => state.openAgents);
  const openResults = useAppStore((state) => state.openResults);
  const agentsWithWork = useAgentsWithWork();
  const agentsNeedYou = agentsWithWork.agents.some((agent) => agent.needsYou);
  const railButton = (active: boolean) => [
    repositorySidebarStyles.collapsedButton,
    styles.railButton,
    active ? repositorySidebarStyles.collapsedButtonActive : repositorySidebarStyles.collapsedButtonIdle,
  ];
  return (
    <>
      {props.showFleetView ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="sm" xstyle={railButton(surface === "fleet-view")} onClick={() => openFleetView()} aria-label="open-fleet-view" />
            }
          >
            <LayoutGrid className={sx(repositorySidebarStyles.iconMd)} />
          </TooltipTrigger>
          <TooltipContent side="right">Fleet View</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              xstyle={railButton(surface === "agents")}
              onClick={() => openAgents()}
              aria-label={agentsWithWork.total > 0 ? `Agents, ${agentsWithWork.total} at work` : "Agents"}
            />
          }
        >
          <Bot className={sx(repositorySidebarStyles.iconMd)} />
          {agentsNeedYou ? <span aria-hidden className={sx(styles.railDot)} /> : null}
        </TooltipTrigger>
        <TooltipContent side="right">
          {agentsWithWork.total > 0 ? `Agents · ${agentsWithWork.total} at work` : "Agents"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="sm" xstyle={railButton(surface === "results")} onClick={() => openResults()} aria-label="Results" />
          }
        >
          <ChartNoAxesColumn className={sx(repositorySidebarStyles.iconMd)} />
        </TooltipTrigger>
        <TooltipContent side="right">Results</TooltipContent>
      </Tooltip>
    </>
  );
}

const styles = stylex.create({
  railButton: { position: "relative" },
  railDot: {
    position: "absolute",
    top: 5,
    insetInlineEnd: 5,
    width: 7,
    height: 7,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-warning"],
    boxShadow: `0 0 0 2px ${vars["--ads-color-canvas"]}`,
  },
  label: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start" },
  childRow: { height: 28, paddingInlineStart: vars["--ads-space-24"], fontSize: vars["--ads-font-size-caption"] },
  count: {
    flex: "0 0 auto",
    minWidth: 18,
    height: 18,
    paddingInline: 5,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "18px",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
});
