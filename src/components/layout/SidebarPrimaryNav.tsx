import { Tooltip as AuiTooltip } from "@/components/aui/components/Tooltip";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { CountBadge } from "@/components/system/CountBadge";
import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useMemo } from "react";
import { Bot, Gauge, LayoutGrid } from "lucide-react";
import { TarsMark } from "@/components/tars/TarsMark";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { transition } from "@/components/aui/recipes/transition";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { collectAgentsWithWork } from "@/lib/agents/agent-work";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import {
  useAgentAssignmentsStore,
  useAgentAssignmentsSync,
} from "@/store/agent-assignments-store";
import { useFleetAttentionStore } from "@/store/fleet-attention-store";
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
  useTranslation();
  useAgentAssignmentsSync();
  const byTaskId = useAgentAssignmentsStore((state) => state.byTaskId);
  const attentionItems = useFleetAttentionStore((state) => state.snapshot.items);
  const currentFailureTaskIds = useMemo(() => new Set(attentionItems.filter((item) => item.kind === "run-failed").map((item) => item.taskId!)), [attentionItems]);
  const attentionKindByTaskId = useMemo(() => Object.fromEntries(
    [...attentionItems].reverse().filter((item) => item.taskId).map((item) => [item.taskId!, item.kind]),
  ), [attentionItems]);
  // The selector returns a string, so a streamed token that changes no task's
  // status leaves it equal and the sidebar does not re-render.
  const key = useAppStore(
    useCallback(
      (state: AppState) =>
        JSON.stringify(
          collectAgentsWithWork({
            byTaskId,
            attentionKindByTaskId,
            currentFailureTaskIds,
            tasks: state.tasks,
            messagesByTask: state.messagesByTask,
            activeTurnIdsByTask: state.activeTurnIdsByTask,
            providerTurnActivityByTask: state.providerTurnActivityByTask,
            limit: MAX_LISTED_AGENTS,
          }),
        ),
      [byTaskId, attentionKindByTaskId, currentFailureTaskIds],
    ),
  );
  return useMemo(() => JSON.parse(key) as ReturnType<typeof collectAgentsWithWork>, [key]);
}

/**
 * The sidebar's top navigation: Fleet View, Agents with the agents at work and
 * what waits for you, then AI usage (whose tabs include Agent performance).
 */
export function SidebarPrimaryNav(props: { showFleetView: boolean }) {
  useTranslation();
  const fleetShortcut = useShortcutHint("navigation.fleet-view");
  const agentsShortcut = useShortcutHint("navigation.agents");
  const usageShortcut = useShortcutHint("navigation.usage");
  const showAgents = useAppStore((state) => state.settings.sidebarShowAgents);
  const showAiUsage = useAppStore((state) => state.settings.sidebarShowAiUsage);
  const surface = useAppStore((state) => state.activeAppSurface.kind);
  const openFleetView = useAppStore((state) => state.openFleetView);
  const openTars = useAppStore((state) => state.openTars);
  const openAgents = useAppStore((state) => state.openAgents);
  const openUsage = useAppStore((state) => state.openUsage);
  const selectAgent = useAgentsViewStore((state) => state.selectAgent);
  const selectedAgentId = useAgentsViewStore((state) => state.selectedAgentId);
  const agentsWithWork = useAgentsWithWork();
  return (
    <>
      <AuiButton layout="host" type="button" onClick={openTars}
        aria-current={surface === "tars" ? "page" : undefined}
        xstyle={[repositorySidebarStyles.navButton, transition.colors,
          surface === "tars" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle]}>
        <TarsMark className={sx(repositorySidebarStyles.iconMd)} />
        <span className={sx(styles.label)}>{i18n.t("shell:tars.title")}</span>
      </AuiButton>
      {props.showFleetView ? (
        <AuiTooltip content={i18n.t("shell:sidebarPrimaryNav.fleetView")} shortcut={fleetShortcut}><AuiButton
          layout="host"
          type="button"
          onClick={() => openFleetView()}
          aria-label={i18n.t("shell:sidebarPrimaryNav.openFleetView")}
          aria-current={surface === "fleet-view" ? "page" : undefined}
          xstyle={[
            repositorySidebarStyles.navButton,
            transition.colors,
            surface === "fleet-view" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
          ]}
        >
          <LayoutGrid className={sx(repositorySidebarStyles.iconMd)} />
          {i18n.t("shell:sidebarPrimaryNav.fleetView")}
        </AuiButton></AuiTooltip>
      ) : null}
      {showAgents ? (
        <>
          <AuiTooltip content={i18n.t("shell:sidebarPrimaryNav.agents")} shortcut={agentsShortcut}><AuiButton
            layout="host"
            type="button"
            onClick={() => openAgents()}
            aria-label={agentsWithWork.total > 0 ? i18n.t("shell:sidebarPrimaryNav.agentsAtWork", { value1: agentsWithWork.total }) : i18n.t("shell:sidebarPrimaryNav.agents")}
            aria-current={surface === "agents" ? "page" : undefined}
            xstyle={[
              repositorySidebarStyles.navButton,
              transition.colors,
              surface === "agents" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
            ]}
          >
            <Bot className={sx(repositorySidebarStyles.iconMd)} />
            <span className={sx(styles.label)}>{i18n.t("shell:sidebarPrimaryNav.agents")}</span>
            {agentsWithWork.total > 0 ? (
              <CountBadge count={agentsWithWork.total} tone={agentsWithWork.agents.some((agent) => agent.needsYou) ? "warning" : "neutral"} />
            ) : null}
          </AuiButton></AuiTooltip>
          {agentsWithWork.agents.map((agent) => (
            <AuiButton
              key={agent.agentConfigId}
              layout="host"
              type="button"
              onClick={() => {
                selectAgent(agent.agentConfigId);
                openAgents();
              }}
              aria-label={i18n.t("shell:sidebarPrimaryNav.agent", { value1: agent.agentName, value2: agent.needsYou ? i18n.t("shell:sidebarPrimaryNav.needYou", { value1: agent.count }) : i18n.t("shell:sidebarPrimaryNav.atWork", { value1: agent.count }) })}
              aria-current={surface === "agents" && selectedAgentId === agent.agentConfigId ? "true" : undefined}
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
              {agent.count > 0 ? <CountBadge count={agent.count} tone={agent.needsYou ? "warning" : "neutral"} /> : null}
            </AuiButton>
          ))}
        </>
      ) : null}
      {showAiUsage ? (
        <AuiTooltip content={i18n.t("shell:sidebarPrimaryNav.aIUsage")} shortcut={usageShortcut}><AuiButton layout="host" type="button" onClick={() => openUsage()} aria-label={i18n.t("shell:sidebarPrimaryNav.aIUsage")}
          aria-current={surface === "usage" ? "page" : undefined}
          xstyle={[repositorySidebarStyles.navButton, transition.colors,
            surface === "usage" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle]}>
          <Gauge className={sx(repositorySidebarStyles.iconMd)} /><span className={sx(styles.label)}>{i18n.t("shell:sidebarPrimaryNav.aIUsage")}</span>
        </AuiButton></AuiTooltip>
      ) : null}
    </>
  );
}

/** The collapsed sidebar's rail: Fleet View, Agents and AI usage, with a dot when an agent needs you. */
export function SidebarPrimaryNavCollapsed(props: { showFleetView: boolean }) {
  useTranslation();
  const fleetShortcut = useShortcutHint("navigation.fleet-view");
  const agentsShortcut = useShortcutHint("navigation.agents");
  const usageShortcut = useShortcutHint("navigation.usage");
  const showAgents = useAppStore((state) => state.settings.sidebarShowAgents);
  const showAiUsage = useAppStore((state) => state.settings.sidebarShowAiUsage);
  const surface = useAppStore((state) => state.activeAppSurface.kind);
  const openFleetView = useAppStore((state) => state.openFleetView);
  const openTars = useAppStore((state) => state.openTars);
  const openAgents = useAppStore((state) => state.openAgents);
  const openUsage = useAppStore((state) => state.openUsage);
  const agentsWithWork = useAgentsWithWork();
  const agentsNeedYou = agentsWithWork.agents.some((agent) => agent.needsYou);
  const railButton = (active: boolean) => [
    repositorySidebarStyles.collapsedButton,
    styles.railButton,
    active ? repositorySidebarStyles.collapsedButtonActive : repositorySidebarStyles.collapsedButtonIdle,
  ];
  return (
    <>
      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm"
        xstyle={railButton(surface === "tars")} onClick={openTars}
        aria-label={i18n.t("shell:tars.title")} aria-current={surface === "tars" ? "page" : undefined} />}>
        <TarsMark className={sx(repositorySidebarStyles.iconMd)} />
      </TooltipTrigger><TooltipContent side="right">{i18n.t("shell:tars.title")}</TooltipContent></Tooltip>
      {props.showFleetView ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="sm" xstyle={railButton(surface === "fleet-view")} onClick={() => openFleetView()} aria-label={i18n.t("shell:sidebarPrimaryNav.openFleetView")} aria-current={surface === "fleet-view" ? "page" : undefined} />
            }
          >
            <LayoutGrid className={sx(repositorySidebarStyles.iconMd)} />
          </TooltipTrigger>
          <TooltipContent side="right">{i18n.t("shell:sidebarPrimaryNav.fleetView")}{fleetShortcut}</TooltipContent>
        </Tooltip>
      ) : null}
      {showAgents ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                xstyle={railButton(surface === "agents")}
                aria-current={surface === "agents" ? "page" : undefined}
                onClick={() => openAgents()}
                aria-label={agentsWithWork.total > 0 ? i18n.t("shell:sidebarPrimaryNav.agentsAtWork", { value1: agentsWithWork.total }) : i18n.t("shell:sidebarPrimaryNav.agents")}
              />
            }
          >
            <Bot className={sx(repositorySidebarStyles.iconMd)} />
            {agentsNeedYou ? <span aria-hidden className={sx(styles.railDot)} /> : null}
          </TooltipTrigger>
          <TooltipContent side="right">
            {agentsWithWork.total > 0 ? i18n.t("shell:sidebarPrimaryNav.agentsAtWork2", { value1: agentsWithWork.total }) : i18n.t("shell:sidebarPrimaryNav.agents")}
            {agentsShortcut}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {showAiUsage ? (
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" xstyle={railButton(surface === "usage")}
          onClick={() => openUsage()} aria-label={i18n.t("shell:sidebarPrimaryNav.aIUsage")} aria-current={surface === "usage" ? "page" : undefined} />}><Gauge className={sx(repositorySidebarStyles.iconMd)} /></TooltipTrigger>
          <TooltipContent side="right">{i18n.t("shell:sidebarPrimaryNav.aIUsage")}{usageShortcut}</TooltipContent></Tooltip>
      ) : null}
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
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-warning"],
    boxShadow: `0 0 0 2px ${vars["--aui-color-canvas"]}`,
  },
  label: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start" },
  childRow: { height: 28, paddingInlineStart: vars["--aui-space-24"], fontSize: vars["--aui-font-size-caption"] },
});
