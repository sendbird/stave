import { useTranslation } from "@/i18n";
import { formatCost, formatDuration } from "@/i18n/format";
import { Wrench } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  AGENT_FLEET_WORK_STATE,
  canResolveAgentFleetAgent,
  countAgentFleetChildren,
  describeAgentFleetTask,
  hasAgentFleetNumbers,
  hasAgentFleetTime,
  isAgentFleetStatusMuted,
  moveAgentFleetFocus,
  resolveAgentFleetOpen,
  rollupAgentFleetCost,
  sizeAgentFleetCard,
  splitAgentFleetTools,
  summarizeAgentFleet,
  type AgentFleetAgent,
  type AgentFleetCardSize,
  type AgentFleetStatus,
  type AgentFleetTool,
} from "./AgentFleet.model";
import { agentFleetRingStyles, agentFleetStyles as styles } from "./AgentFleet.styles";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { DurationTimer } from "./DurationTimer";
import { EmptyState } from "./EmptyState";
import { LoadingSurface } from "./LoadingSurface";
import { StateMark } from "./StateMark";
import { WORK_STATE } from "./state-vocabulary";

export * from "./AgentFleet.model";

export interface AgentFleetProps extends XstyleProp {
  /** Main agents, in the order the list shows them. */
  agents: readonly AgentFleetAgent[];
  /** The main agent whose tree is open (controlled); null for none. */
  open?: string | null;
  /** The uncontrolled starting value. Defaults to the first agent. */
  defaultOpen?: string | null;
  onOpenChange?: (id: string | null) => void;
  /** A subagent card was chosen. */
  onSelect?: (agent: AgentFleetAgent) => void;
  /** A subagent's resolve shortcut was pressed. */
  onResolve?: (agent: AgentFleetAgent) => void;
  /** Header actions of the open tree, e.g. a button that opens the agent's task. */
  renderTreeActions?: (agent: AgentFleetAgent) => ReactNode;
  /** A tool's icon; a generic tool glyph stands in for a tool it returns nothing for. */
  renderToolIcon?: (tool: AgentFleetTool) => ReactNode;
  /** A fixed time for every running clock (tests, docs); clocks tick each second without it. */
  now?: number;
  formatCost?: (amount: number) => string;
  /** The heading. Defaults to "Agents". */
  title?: string;
  /** Replaces the totals line. */
  summary?: ReactNode;
  className?: string;
}

const defaultFormatCost = (amount: number) => formatCost(amount, "USD");

/**
 * A fleet of agents as main agents with their subagent trees. Main agents are
 * a list of fixed-height cards; opening one shows its subagents as a tree
 * beside the list when the fleet is wide enough, or under the card when it is
 * not. A subagent with recorded steps opens them in a small window. Status is
 * always written out; color and glyph only repeat it.
 *
 * Cards take one of two fixed heights: two lines, or three when there are
 * numbers (cost, running time, subagents) to show. A status change swaps the
 * words inside a card and never moves the cards below by more than that step.
 * On a wide fleet the tree stops at a reading width and the rest stays empty.
 *
 * Keyboard: the list is one tab stop (roving focus). ↑/↓ move between main
 * cards, Home/End jump, Enter/Space opens or folds the focused card, Tab goes
 * on into the open tree, Esc in the tree returns to its card, and Esc closes
 * the steps window back to the subagent that opened it.
 */
export function AgentFleet({
  agents,
  open: openProp,
  defaultOpen,
  onOpenChange,
  onSelect,
  onResolve,
  renderTreeActions,
  renderToolIcon,
  now,
  formatCost: formatCostProp = defaultFormatCost,
  title,
  summary,
  xstyle,
  className,
}: AgentFleetProps) {
  const { t } = useTranslation(["ui"]);
  const baseId = useId();
  const headingId = `${baseId}-heading`;

  // Uncontrolled: the first agent opens until the user chooses, and the
  // choice is pinned to an id so a reordered list does not move the tree.
  const [chosen, setChosen] = useState<string | null | undefined>(defaultOpen);
  const firstId = agents[0]?.id ?? null;
  useEffect(() => {
    if (openProp === undefined && chosen === undefined && firstId !== null) {
      setChosen(firstId);
    }
  }, [chosen, firstId, openProp]);
  const requested = openProp !== undefined ? openProp : chosen === undefined ? firstId : chosen;
  const openId = resolveAgentFleetOpen(agents, requested);
  const setOpen = useCallback(
    (id: string | null) => {
      if (openProp === undefined) setChosen(id);
      onOpenChange?.(id);
    },
    [onOpenChange, openProp],
  );

  // Roving focus over the main cards.
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openIndex = openId === null ? -1 : agents.findIndex((agent) => agent.id === openId);
  const [focusIndex, setFocusIndex] = useState(Math.max(0, openIndex));
  const tabIndexOwner = Math.min(focusIndex, Math.max(0, agents.length - 1));
  const onCardKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = moveAgentFleetFocus(event.key, index, agents.length);
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    cardRefs.current[next]?.focus();
  };

  // One steps window at a time; closing returns focus to the card that opened it.
  const [stepsOf, setStepsOf] = useState<AgentFleetAgent | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const totals = summarizeAgentFleet(agents);

  return (
    <section
      aria-labelledby={headingId}
      data-agent-fleet="true"
      className={cx(sx(styles.root, xstyle), className)}
    >
      <div className={sx(styles.topBar)}>
        <h2 id={headingId} className={sx(styles.title)}>
          {title ?? t("ui:agentFleet.title")}
        </h2>
        <p aria-live="polite" className={sx(styles.totals)} data-agent-fleet-totals="true">
          {summary ?? (
            <>
              <span>{t("ui:agentFleet.totals.agents", { count: totals.agents })}</span>
              <span>{t("ui:agentFleet.totals.running", { count: totals.running })}</span>
              <span className={sx(totals.waiting > 0 && styles.totalsAttention)}>
                {t("ui:agentFleet.totals.needsYou", { count: totals.waiting })}
              </span>
              {totals.cost !== null ? (
                <span>{t("ui:agentFleet.totals.cost", { cost: formatCostProp(totals.cost) })}</span>
              ) : null}
            </>
          )}
        </p>
      </div>
      {agents.length === 0 ? (
        <EmptyState
          variant="plain"
          headingLevel={3}
          title={t("ui:agentFleet.empty.title")}
          description={t("ui:agentFleet.empty.description")}
        />
      ) : (
        <div
          role="list"
          aria-labelledby={headingId}
          className={sx(styles.body)}
          // The wide layout gives each card its own grid row (see the styles).
          style={{ "--agent-fleet-rows": String(agents.length) } as CSSProperties}
        >
          {agents.map((agent, index) => {
            const isOpen = agent.id === openId;
            const panelId = `${baseId}-tree-${index}`;
            return (
              <div key={agent.id} role="listitem" className={sx(styles.item)}>
                <MainAgentCard
                  agent={agent}
                  idBase={`${baseId}-card-${index}`}
                  isOpen={isOpen}
                  panelId={panelId}
                  tabIndex={index === tabIndexOwner ? 0 : -1}
                  now={now}
                  formatCost={formatCostProp}
                  renderToolIcon={renderToolIcon}
                  buttonRef={(element) => {
                    cardRefs.current[index] = element;
                  }}
                  onFocus={() => setFocusIndex(index)}
                  onKeyDown={(event) => onCardKeyDown(event, index)}
                  onToggle={() => setOpen(isOpen ? null : agent.id)}
                />
                {isOpen ? (
                  <SubagentTreePanel
                    agent={agent}
                    id={panelId}
                    now={now}
                    formatCost={formatCostProp}
                    actions={renderTreeActions?.(agent)}
                    onReturnFocus={() => {
                      setFocusIndex(index);
                      cardRefs.current[index]?.focus();
                    }}
                    onSelect={(child, trigger) => {
                      onSelect?.(child);
                      if (child.steps && child.steps.length > 0) {
                        returnFocusRef.current = trigger;
                        setStepsOf(child);
                      }
                    }}
                    onResolve={onResolve}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <StepsWindow
        agent={stepsOf}
        returnFocusRef={returnFocusRef}
        onClose={() => setStepsOf(null)}
      />
    </section>
  );
}

function useStatusLabel() {
  const { t } = useTranslation(["ui"]);
  return (agent: Pick<AgentFleetAgent, "status" | "statusLabel">) =>
    agent.statusLabel ??
    (agent.status === "done"
      ? t("ui:agentFleet.status.done")
      : WORK_STATE[AGENT_FLEET_WORK_STATE[agent.status]].label);
}

function AgentStatus(props: { status: AgentFleetStatus; label: string; id?: string }) {
  return (
    <span id={props.id} className={sx(styles.status)}>
      <StateMark state={AGENT_FLEET_WORK_STATE[props.status]} showLabel label={props.label} size="xs" />
    </span>
  );
}

/** The running time: ticking while running, the measured span once settled. */
function AgentTime(props: { agent: AgentFleetAgent; now?: number }) {
  const { t } = useTranslation(["ui"]);
  const { agent } = props;
  const label = t("ui:agentFleet.runningTime");
  if (!hasAgentFleetTime(agent)) return null;
  if (agent.status === "running" && agent.startedAt !== undefined) {
    return <DurationTimer startedAt={agent.startedAt} now={props.now} label={label} xstyle={styles.metaTimer} />;
  }
  return <DurationTimer startedAt={0} now={Math.max(0, agent.elapsedMs ?? 0)} label={label} xstyle={styles.metaTimer} />;
}

/** Pieces of a numbers line, separated by a middle dot only between pieces. */
function MetaLine(props: { id?: string; children: ReactNode[] }) {
  const pieces = props.children.filter((piece) => piece !== null && piece !== undefined && piece !== false);
  return (
    <span id={props.id} className={sx(styles.meta)}>
      {pieces.map((piece, index) => (
        <span key={index} className={sx(styles.row)}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {piece}
        </span>
      ))}
    </span>
  );
}

/**
 * The agent's latest tools as icons, three at most and then "+N". The group
 * is one image named with every tool, so a screen reader hears the names the
 * icons stand for; each icon also names its tool on hover.
 */
function ToolTiles(props: {
  id?: string;
  tools: readonly AgentFleetTool[] | undefined;
  renderToolIcon?: (tool: AgentFleetTool) => ReactNode;
}) {
  const { t } = useTranslation(["ui"]);
  const { shown, more } = splitAgentFleetTools(props.tools);
  if (shown.length === 0) return null;
  return (
    <span
      id={props.id}
      role="img"
      aria-label={t("ui:agentFleet.tools", {
        tools: (props.tools ?? []).map((tool) => tool.name).join(", "),
      })}
      className={sx(styles.tools)}
      data-agent-fleet-tools="true"
    >
      {shown.map((tool, index) => (
        <span
          key={`${tool.id}-${index}`}
          aria-hidden="true"
          title={tool.name}
          className={sx(styles.toolTile)}
          data-agent-fleet-tool={tool.id}
        >
          <span data-ads-control-icon-slot="true" className={sx(styles.toolIcon)}>
            {props.renderToolIcon?.(tool) ?? <Wrench />}
          </span>
        </span>
      ))}
      {more > 0 ? (
        <span aria-hidden="true" className={sx(styles.toolTile, styles.toolMore)}>
          {t("ui:agentFleet.moreTools", { count: more })}
        </span>
      ) : null}
    </span>
  );
}

function MainAgentCard(props: {
  agent: AgentFleetAgent;
  idBase: string;
  isOpen: boolean;
  panelId: string;
  tabIndex: number;
  now?: number;
  formatCost: (amount: number) => string;
  renderToolIcon?: (tool: AgentFleetTool) => ReactNode;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation(["ui"]);
  const statusLabel = useStatusLabel();
  const { agent } = props;
  const cost = rollupAgentFleetCost(agent);
  const counts = agent.children ? countAgentFleetChildren(agent.children) : null;
  const task = describeAgentFleetTask(agent);
  const hasTools = (agent.tools?.length ?? 0) > 0;
  const hasNumbers = hasAgentFleetNumbers(agent);
  const size = sizeAgentFleetCard(agent, "main");
  const nameId = `${props.idBase}-name`;
  const statusId = `${props.idBase}-status`;
  const toolsId = `${props.idBase}-tools`;
  const taskId = `${props.idBase}-task`;
  const metaId = `${props.idBase}-meta`;
  const describedBy = [
    statusId,
    hasTools ? toolsId : null,
    task ? taskId : null,
    hasNumbers ? metaId : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Button
      layout="host"
      type="button"
      ref={props.buttonRef}
      tabIndex={props.tabIndex}
      aria-labelledby={nameId}
      aria-describedby={describedBy}
      aria-expanded={props.isOpen}
      aria-controls={props.isOpen ? props.panelId : undefined}
      data-agent-fleet-card={agent.id}
      data-status={agent.status}
      data-size={size}
      xstyle={[
        styles.card,
        size === "compact" ? styles.cardCompact : styles.cardFull,
        props.isOpen && styles.cardOpen,
        focusRing.ringInset,
        transition.colors,
      ]}
      onFocus={props.onFocus}
      onKeyDown={props.onKeyDown}
      onClick={props.onToggle}
    >
      <span className={sx(styles.row)}>
        <span aria-hidden="true" className={sx(styles.avatar, agentFleetRingStyles[agent.status])}>
          {agent.avatar}
        </span>
        <span id={nameId} className={sx(styles.name)}>
          {agent.name}
        </span>
        {agent.model ? <span className={sx(styles.model)}>{agent.model}</span> : null}
        <AgentStatus id={statusId} status={agent.status} label={statusLabel(agent)} />
      </span>
      <span className={sx(styles.row, styles.lineRow)}>
        <ToolTiles id={toolsId} tools={agent.tools} renderToolIcon={props.renderToolIcon} />
        {task ? (
          <span id={taskId} className={sx(styles.task)} title={task}>
            {task}
          </span>
        ) : null}
      </span>
      {hasNumbers ? (
        <MetaLine id={metaId}>
          {[
            cost !== null ? <span key="cost">{props.formatCost(cost)}</span> : null,
            hasAgentFleetTime(agent) ? <AgentTime key="time" agent={agent} now={props.now} /> : null,
            counts && counts.total > 0 ? (
              <span key="children">{t("ui:agentFleet.subagents", { count: counts.total })}</span>
            ) : null,
            counts && counts.waiting > 0 ? (
              <span key="waiting" className={sx(styles.metaAttention)}>
                {t("ui:agentFleet.needYou", { count: counts.waiting })}
              </span>
            ) : null,
          ]}
        </MetaLine>
      ) : null}
    </Button>
  );
}

function SubagentTreePanel(props: {
  agent: AgentFleetAgent;
  id: string;
  now?: number;
  formatCost: (amount: number) => string;
  actions: ReactNode;
  /** Esc inside the tree: focus goes back to the card that opened it. */
  onReturnFocus: () => void;
  onSelect: (agent: AgentFleetAgent, trigger: HTMLElement) => void;
  onResolve?: (agent: AgentFleetAgent) => void;
}) {
  const { t } = useTranslation(["ui"]);
  const { agent } = props;
  const children = agent.children ?? [];
  const counts = countAgentFleetChildren(children);
  const label = t("ui:agentFleet.treeLabel", { name: agent.name });
  let body: ReactNode;
  if (children.length === 0 && agent.childrenLoading) {
    body = <LoadingSurface size="sm" label={t("ui:agentFleet.loadingSubagents")} />;
  } else if (children.length === 0 && agent.childrenError) {
    body = (
      <p role="alert" className={sx(styles.notice, styles.noticeError)}>
        {t("ui:agentFleet.subagentsFailed", { error: agent.childrenError })}
      </p>
    );
  } else if (children.length === 0) {
    body = <p className={sx(styles.notice)}>{t("ui:agentFleet.noSubagents")}</p>;
  } else {
    body = (
      <>
        {agent.childrenError ? (
          <p role="alert" className={sx(styles.notice, styles.noticeError)}>
            {t("ui:agentFleet.subagentsFailed", { error: agent.childrenError })}
          </p>
        ) : null}
        <SubagentList
          agents={children}
          now={props.now}
          formatCost={props.formatCost}
          onSelect={props.onSelect}
          onResolve={props.onResolve}
        />
      </>
    );
  }
  return (
    <section
      id={props.id}
      role="region"
      aria-label={label}
      aria-busy={agent.childrenLoading ? true : undefined}
      data-agent-fleet-tree={agent.id}
      className={sx(styles.panel)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        props.onReturnFocus();
      }}
    >
      <div className={sx(styles.panelHeader)}>
        <h3 className={sx(styles.panelTitle)}>{label}</h3>
        {children.length > 0 ? (
          <span className={sx(styles.panelSummary)}>
            {[
              t("ui:agentFleet.subagents", { count: counts.total }),
              counts.running > 0 ? t("ui:agentFleet.totals.running", { count: counts.running }) : null,
              counts.waiting > 0 ? t("ui:agentFleet.needYou", { count: counts.waiting }) : null,
              counts.failed > 0 ? t("ui:agentFleet.failedCount", { count: counts.failed }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        {props.actions ? <div className={sx(styles.panelActions)}>{props.actions}</div> : null}
      </div>
      {body}
    </section>
  );
}

function SubagentList(props: {
  agents: readonly AgentFleetAgent[];
  now?: number;
  formatCost: (amount: number) => string;
  onSelect: (agent: AgentFleetAgent, trigger: HTMLElement) => void;
  onResolve?: (agent: AgentFleetAgent) => void;
  nested?: boolean;
}) {
  return (
    <ul className={sx(styles.tree, props.nested && styles.subChildren)}>
      {props.agents.map((agent, index) => {
        const muted = isAgentFleetStatusMuted(agent.status);
        const last = index === props.agents.length - 1;
        const size = sizeAgentFleetCard(agent, "subagent");
        const compact = size === "compact";
        return (
          <li key={agent.id} className={sx(styles.treeItem)} data-agent-fleet-subagent={agent.id}>
            <span
              aria-hidden="true"
              className={sx(
                styles.connectorTrunk,
                last && (compact ? styles.connectorTrunkLastCompact : styles.connectorTrunkLastFull),
                muted && styles.connectorMuted,
              )}
            />
            <span
              aria-hidden="true"
              className={sx(
                styles.connectorBranch,
                compact ? styles.connectorBranchCompact : styles.connectorBranchFull,
                muted && styles.connectorMuted,
              )}
            />
            <SubagentCard
              agent={agent}
              size={size}
              now={props.now}
              formatCost={props.formatCost}
              onSelect={props.onSelect}
              onResolve={props.onResolve}
            />
            {agent.children && agent.children.length > 0 ? (
              <SubagentList {...props} agents={agent.children} nested />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function SubagentCard(props: {
  agent: AgentFleetAgent;
  size: AgentFleetCardSize;
  now?: number;
  formatCost: (amount: number) => string;
  onSelect: (agent: AgentFleetAgent, trigger: HTMLElement) => void;
  onResolve?: (agent: AgentFleetAgent) => void;
}) {
  const statusLabel = useStatusLabel();
  const idBase = useId();
  const { agent } = props;
  const cost = rollupAgentFleetCost(agent);
  const muted = isAgentFleetStatusMuted(agent.status);
  // The task line goes when it only repeats the name, the numbers line when
  // there are none; the card keeps one of its two fixed heights either way.
  const task = describeAgentFleetTask(agent);
  const hasNumbers = cost !== null || hasAgentFleetTime(agent);
  const nameId = `${idBase}-name`;
  const statusId = `${idBase}-status`;
  const taskId = `${idBase}-task`;
  const metaId = `${idBase}-meta`;
  const describedBy = [statusId, task ? taskId : null, hasNumbers ? metaId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={sx(
        styles.subCard,
        props.size === "compact" ? styles.subCardCompact : styles.subCardFull,
        muted && styles.subCardMuted,
      )}
      data-status={agent.status}
      data-size={props.size}
    >
      <Button
        layout="host"
        type="button"
        aria-labelledby={nameId}
        aria-describedby={describedBy}
        aria-haspopup={agent.steps && agent.steps.length > 0 ? "dialog" : undefined}
        xstyle={[styles.subPrimary, focusRing.ringInset, transition.colors]}
        onClick={(event) => props.onSelect(agent, event.currentTarget)}
      >
        <span className={sx(styles.row)}>
          <span id={nameId} className={sx(styles.subName)}>
            {agent.name}
          </span>
          <AgentStatus id={statusId} status={agent.status} label={statusLabel(agent)} />
        </span>
        {task ? (
          <span id={taskId} className={sx(styles.task)} title={task}>
            {task}
          </span>
        ) : null}
        {hasNumbers ? (
          <MetaLine id={metaId}>
            {[
              cost !== null ? <span key="cost">{props.formatCost(cost)}</span> : null,
              hasAgentFleetTime(agent) ? <AgentTime key="time" agent={agent} now={props.now} /> : null,
            ]}
          </MetaLine>
        ) : null}
      </Button>
      {canResolveAgentFleetAgent(agent) && props.onResolve ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          xstyle={styles.subResolve}
          // "Answer" names the action; the subagent's name says whose.
          aria-describedby={nameId}
          onClick={() => props.onResolve?.(agent)}
        >
          {agent.resolveLabel}
        </Button>
      ) : null}
    </div>
  );
}

function StepsWindow(props: {
  agent: AgentFleetAgent | null;
  returnFocusRef: { current: HTMLElement | null };
  onClose: () => void;
}) {
  const { t } = useTranslation(["ui"]);
  const statusLabel = useStatusLabel();
  // Kept while the window animates closed, so its content does not blank out.
  const [shown, setShown] = useState<AgentFleetAgent | null>(props.agent);
  if (props.agent && props.agent !== shown) setShown(props.agent);
  const agent = props.agent ?? shown;
  return (
    <Dialog.Root
      open={props.agent !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup width="sm" finalFocus={props.returnFocusRef} data-agent-fleet-steps="true">
          <Dialog.Header>
            <Dialog.HeaderContent>
              <Dialog.Title>{agent ? t("ui:agentFleet.stepsTitle", { name: agent.name }) : null}</Dialog.Title>
              {agent ? <Dialog.Description>{statusLabel(agent)}</Dialog.Description> : null}
            </Dialog.HeaderContent>
            <Dialog.CloseButton aria-label={t("ui:agentFleet.closeSteps")} />
          </Dialog.Header>
          <Dialog.Body>
            {agent?.status === "waiting" && agent.ask ? (
              <p className={sx(styles.dialogText)}>{agent.ask}</p>
            ) : null}
            {agent?.status === "failed" && agent.error ? (
              <p className={sx(styles.dialogText, styles.dialogError)}>{agent.error}</p>
            ) : null}
            <ol className={sx(styles.steps)}>
              {(agent?.steps ?? []).map((step) => (
                <li key={step.id} className={sx(styles.step)}>
                  <span className={sx(styles.stepTitle)}>{step.title}</span>
                  {step.status ? (
                    <StateMark
                      state={AGENT_FLEET_WORK_STATE[step.status]}
                      showLabel
                      size="xs"
                      label={statusLabel({ status: step.status })}
                    />
                  ) : (
                    <span />
                  )}
                  {step.tool || step.tookMs !== undefined ? (
                    <span className={sx(styles.stepMeta)}>
                      {[step.tool, step.tookMs !== undefined ? formatDuration(step.tookMs) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </Dialog.Body>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
