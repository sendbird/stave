import * as stylex from "@stylexjs/stylex";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, X } from "lucide-react";
import { Badge } from "@/components/aui/components/Badge";
import { Button } from "@/components/aui/components/Button";
import { EmptyState } from "@/components/aui/components/EmptyState";
import { StatusDot } from "@/components/aui/components/StatusDot";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { GlobalPageHeader } from "@/components/system/GlobalPageHeader";
import { I18N_NAMESPACES, i18n, useTranslation, type I18nKey } from "@/i18n";
import { formatDuration, formatTokenCount } from "@/i18n/format";
import {
  collectExternalSessionProjects,
  groupExternalSessions,
  type ExternalSessionGroup,
  type ExternalSessionRow,
} from "@/lib/external-sessions/external-session-groups";
import type {
  ExternalAction,
  ExternalActionVerb,
  ExternalAgent,
  ExternalAgentStatus,
  ExternalSessionsSnapshot,
  ExternalSessionSource,
  ExternalSessionStatus,
} from "@/lib/external-sessions/external-sessions";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { useExternalActivityStore } from "@/store/external-activity-store";

const ACTION_KEYS = {
  read: ["shell:externalActivity.action.read", "shell:externalActivity.action.readAny"],
  edit: ["shell:externalActivity.action.edit", "shell:externalActivity.action.editAny"],
  write: ["shell:externalActivity.action.write", "shell:externalActivity.action.writeAny"],
  run: ["shell:externalActivity.action.run", "shell:externalActivity.action.runAny"],
  search: ["shell:externalActivity.action.search", "shell:externalActivity.action.searchAny"],
  find: ["shell:externalActivity.action.find", "shell:externalActivity.action.findAny"],
  list: ["shell:externalActivity.action.list", "shell:externalActivity.action.listAny"],
  fetch: ["shell:externalActivity.action.fetch", "shell:externalActivity.action.fetchAny"],
  webSearch: ["shell:externalActivity.action.webSearch", "shell:externalActivity.action.webSearchAny"],
  agent: ["shell:externalActivity.action.agent", "shell:externalActivity.action.agentAny"],
  plan: ["shell:externalActivity.action.plan", "shell:externalActivity.action.planAny"],
  skill: ["shell:externalActivity.action.skill", "shell:externalActivity.action.skillAny"],
  message: ["shell:externalActivity.action.message", "shell:externalActivity.action.messageAny"],
  tool: ["shell:externalActivity.action.tool", "shell:externalActivity.action.toolAny"],
} as const satisfies Record<ExternalActionVerb, readonly [I18nKey, I18nKey]>;

const SESSION_STATUS_KEYS = {
  working: "shell:externalActivity.status.working",
  waiting: "shell:externalActivity.status.waiting",
  idle: "shell:externalActivity.status.idle",
} as const satisfies Record<ExternalSessionStatus, I18nKey>;

const AGENT_STATUS_KEYS = {
  running: "shell:externalActivity.agentStatus.running",
  finished: "shell:externalActivity.agentStatus.finished",
  failed: "shell:externalActivity.agentStatus.failed",
  stopped: "shell:externalActivity.agentStatus.stopped",
  idle: "shell:externalActivity.agentStatus.idle",
} as const satisfies Record<ExternalAgentStatus, I18nKey>;

const SOURCE_KEYS = {
  "claude-code": "shell:externalActivity.source.claudeCode",
  codex: "shell:externalActivity.source.codex",
} as const satisfies Record<ExternalSessionSource, I18nKey>;

/** The words for what a session or agent is doing, in the display language. */
export function describeExternalAction(action: ExternalAction): string {
  const [withTarget, withoutTarget] = ACTION_KEYS[action.verb];
  const values = { target: action.target ?? "", tool: action.tool ?? "" };
  return action.target ? i18n.t(withTarget, values) : i18n.t(withoutTarget, values);
}

function SessionStatusDot({ status }: { status: ExternalSessionStatus }) {
  const label = i18n.t(SESSION_STATUS_KEYS[status]);
  if (status === "working") return <StatusDot status="running" label={label} size="sm" />;
  return <StatusDot tone={status === "waiting" ? "warning" : "muted"} label={label} size="sm" />;
}

function AgentStatusDot({ status }: { status: ExternalAgentStatus }) {
  const label = i18n.t(AGENT_STATUS_KEYS[status]);
  switch (status) {
    case "running":
      return <StatusDot status="running" label={label} size="sm" />;
    case "finished":
      return <StatusDot status="ready" label={label} size="sm" />;
    case "failed":
      return <StatusDot status="error" label={label} size="sm" />;
    case "stopped":
      return <StatusDot status="canceled" label={label} size="sm" />;
    default:
      return <StatusDot tone="muted" label={label} size="sm" />;
  }
}

/** The page's clock: elapsed times advance with it even while no transcript is written. */
const NowContext = createContext(0);
const CLOCK_MS = 15_000;

/** Elapsed since it started: up to now while it runs, its run length once it stopped. */
function Elapsed({ startedAt, lastAt, running }: { startedAt?: number; lastAt: number; running: boolean }) {
  const now = useContext(NowContext);
  if (startedAt === undefined) return null;
  const span = (running ? Math.max(now, lastAt) : lastAt) - startedAt;
  return <span title={i18n.t("shell:externalActivity.elapsed")}>{formatDuration(span, { units: 1 })}</span>;
}

function Stats({ steps, contextTokens, children }: { steps: number; contextTokens?: number; children?: ReactNode}) {
  return (
    <p className={sx(styles.stats)}>
      {children}
      <span>{i18n.t("shell:externalActivity.steps", { count: steps })}</span>
      {contextTokens ? <span>{i18n.t("shell:externalActivity.context", { tokens: formatTokenCount(contextTokens) })}</span> : null}
    </p>
  );
}

function AgentCard({ agent }: { agent: ExternalAgent}) {
  return (
    <li className={sx(styles.agent)} data-external-agent={agent.id}>
      <div className={sx(styles.row)}>
        <Badge size="sm" variant="outlined">{agent.agentType}</Badge>
        <AgentStatusDot status={agent.status} />
      </div>
      <p className={sx(styles.agentTitle)}>{agent.description}</p>
      {agent.action ? <p className={sx(styles.action)}>{describeExternalAction(agent.action)}</p> : null}
      <Stats steps={agent.steps} contextTokens={agent.contextTokens}>
        <Elapsed startedAt={agent.startedAt} lastAt={agent.lastAt} running={agent.status === "running"} />
      </Stats>
    </li>
  );
}

function SessionCard({ row }: { row: ExternalSessionRow}) {
  const { session, place } = row;
  const title = session.title ?? i18n.t("shell:externalActivity.untitled");
  const running = session.agents.filter((agent) => agent.status === "running").length;
  return (
    <li className={sx(styles.session)} data-external-session={session.id}>
      <div className={sx(styles.row)}>
        <Badge size="sm">{i18n.t(SOURCE_KEYS[session.source])}</Badge>
        <h4 className={sx(styles.sessionTitle)} title={title}>{title}</h4>
        <SessionStatusDot status={session.status} />
      </div>
      {session.branch || place?.workspaceName ? (
        <p className={sx(styles.where)}>
          {place?.workspaceName && place.workspaceName !== session.branch ? <span>{place.workspaceName}</span> : null}
          {session.branch ? <span className={sx(styles.branch)}>{session.branch}</span> : null}
        </p>
      ) : null}
      {session.action ? <p className={sx(styles.action)}>{describeExternalAction(session.action)}</p> : null}
      <Stats steps={session.steps} contextTokens={session.contextTokens}>
        <Elapsed startedAt={session.startedAt} lastAt={session.lastAt} running={session.status === "working"} />
        {session.agents.length > 0 ? (
          <span>{i18n.t("shell:externalActivity.agentsRunning", { running, count: session.agents.length })}</span>
        ) : null}
      </Stats>
      {session.agents.length > 0 ? (
        <ul className={sx(styles.agents)} aria-label={i18n.t("shell:externalActivity.agentsLabel", { name: title })}>
          {session.agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
        </ul>
      ) : null}
    </li>
  );
}

function SessionGroup({ group }: { group: ExternalSessionGroup}) {
  const label = group.label || i18n.t("shell:externalActivity.unknownFolder");
  return (
    <section className={sx(styles.group)} aria-label={i18n.t("shell:externalActivity.sessionsLabel", { name: label })}>
      <div className={sx(styles.groupHead)}>
        <h3 className={sx(styles.groupTitle)}>{label}</h3>
        {group.path ? <span className={sx(styles.path)} title={group.path}>{group.path}</span> : null}
      </div>
      <ul className={sx(styles.sessions)}>
        {group.rows.map((row) => <SessionCard key={`${row.session.source}:${row.session.id}`} row={row} />)}
      </ul>
    </section>
  );
}

export function openExternalActivitySetting() {
  window.dispatchEvent(new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "general" } }));
}

/**
 * Claude Code and Codex sessions running outside Stave, grouped by the Stave
 * project their folder belongs to. Read-only.
 */
export function ActivityView(props: { snapshot?: ExternalSessionsSnapshot; enabled?: boolean } = {}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const storedEnabled = useAppStore((state) => state.settings.externalActivityEnabled);
  const enabled = props.enabled ?? storedEnabled;
  const updateSettings = useAppStore((state) => state.updateSettings);
  const close = useAppStore((state) => state.closeActivity);
  const recentRepositories = useAppStore((state) => state.recentRepositories);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const repositoryName = useAppStore((state) => state.repositoryName);
  const workspaces = useAppStore((state) => state.workspaces);
  const workspacePathById = useAppStore((state) => state.workspacePathById);
  const storedSnapshot = useExternalActivityStore((state) => state.snapshot);
  const snapshot = props.snapshot ?? storedSnapshot;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  const groups = useMemo(() => {
    const projects = collectExternalSessionProjects({
      recentRepositories,
      current: repositoryPath ? { repositoryPath, repositoryName: repositoryName ?? repositoryPath, workspaces, workspacePathById } : null,
    });
    return groupExternalSessions(snapshot.sessions, projects);
  }, [snapshot.sessions, recentRepositories, repositoryPath, repositoryName, workspaces, workspacePathById]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const content = () => {
    if (!enabled) {
      return (
        <EmptyState
          icon={<Activity />}
          title={t("shell:externalActivity.offTitle")}
          description={t("shell:externalActivity.offDescription")}
          action={
            <div className={sx(styles.row)}>
              <Button size="sm" variant="primary" onClick={() => updateSettings({ patch: { externalActivityEnabled: true } })}>
                {t("shell:externalActivity.turnOn")}
              </Button>
              <Button size="sm" variant="quiet" onClick={openExternalActivitySetting}>{t("shell:externalActivity.openSetting")}</Button>
            </div>
          }
        />
      );
    }
    if (snapshot.state !== "live") return <p role="status" className={sx(styles.note)}>{t("shell:externalActivity.loading")}</p>;
    return (
      <>
        <div className={sx(styles.summary)}>
          <h2 className={sx(styles.summaryTitle)} role="status">
            {snapshot.runningCount > 0
              ? t("shell:externalActivity.running", { count: snapshot.runningCount })
              : t("shell:externalActivity.nothingRunning")}
          </h2>
          <p className={sx(styles.note)}>{t("shell:externalActivity.summary")}</p>
        </div>
        {groups.length === 0 ? (
          <EmptyState icon={<Activity />} title={t("shell:externalActivity.emptyTitle")} description={t("shell:externalActivity.emptyDescription")} />
        ) : (
          groups.map((group) => <SessionGroup key={group.key} group={group} />)
        )}
      </>
    );
  };

  return (
    <div className={sx(styles.scroll)}>
      <main className={sx(styles.page)} aria-label={t("shell:externalActivity.title")} data-external-activity="">
        <GlobalPageHeader
          title={t("shell:externalActivity.title")}
          description={t("shell:externalActivity.description")}
          actions={
            <Tooltip content={t("shell:externalActivity.close")}>
              <Button variant="quiet" size="sm" aria-label={t("shell:externalActivity.close")} onClick={close}><X /></Button>
            </Tooltip>
          }
        />
        <NowContext.Provider value={now}>{content()}</NowContext.Provider>
      </main>
    </div>
  );
}

const styles = stylex.create({
  scroll: { flex: "1 1 auto", blockSize: "100%", minBlockSize: 0, minInlineSize: 0, overflowY: "auto", backgroundColor: vars["--aui-color-canvas"] },
  page: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-24"], maxInlineSize: "76rem", marginInline: "auto",
    paddingBlock: vars["--aui-space-24"], paddingInline: { default: vars["--aui-space-24"], "@media (max-width: 700px)": vars["--aui-space-12"] },
  },
  note: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-normal"] },
  summary: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"] },
  summaryTitle: { margin: 0, fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"], color: vars["--aui-color-text"] },
  group: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minInlineSize: 0 },
  groupHead: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: vars["--aui-space-8"], minInlineSize: 0 },
  groupTitle: { margin: 0, fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-semibold"], color: vars["--aui-color-text"] },
  path: {
    minInlineSize: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"],
  },
  sessions: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  session: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minInlineSize: 0, padding: vars["--aui-space-16"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"], backgroundColor: vars["--aui-color-surface"],
  },
  row: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], minInlineSize: 0, flexWrap: "wrap" },
  sessionTitle: {
    flex: "1 1 12rem", minInlineSize: 0, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"], color: vars["--aui-color-text"],
  },
  where: {
    display: "flex", flexWrap: "wrap", gap: vars["--aui-space-12"], margin: 0, minInlineSize: 0,
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"],
  },
  branch: { fontFamily: vars["--aui-font-mono"], overflowWrap: "anywhere" },
  action: {
    margin: 0, minInlineSize: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-caption"],
  },
  stats: {
    display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-4"], margin: 0,
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontVariantNumeric: "tabular-nums",
  },
  agents: {
    listStyle: "none", margin: 0, padding: 0, display: "grid", gap: vars["--aui-space-8"],
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))",
  },
  agent: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minInlineSize: 0, padding: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-panel"], backgroundColor: vars["--aui-color-surface-tint"],
  },
  agentTitle: {
    margin: 0, minInlineSize: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-medium"], color: vars["--aui-color-text"],
  },
});
