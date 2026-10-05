import { i18n, useTranslation } from "@/i18n";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sx } from "@/components/ads/utils/stylex";
import { ExchangeDetail } from "@/components/delegation/ExchangeDetail";
import { fromWorkGraphNode, type DelegationExchange, type DelegationActionId } from "@/lib/delegation/exchange";
import { type AgentHistoryEntry, type AgentHistoryResponse } from "@/lib/providers/agent-history";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
import type { ChatMessage } from "@/types/chat";
import { useAppStore } from "@/store/app.store";
import { describeExchangeStatus } from "@/lib/delegation/format";
import { TraceOutput } from "./message/turn-event-rows";
import { activityDetailStyles as s } from "./activity-detail.styles";
import {
  mergeActivityEntries,
  messagesToActivityEntries,
  providerEntriesToActivityEntries,
  selectActivityMessages,
  type ActivityEntrySource,
  type ActivityLogEntry,
} from "./activity-detail.utils";

export interface ActivityDetailSelection {
  title: string;
  toolUseId?: string;
  nodeKey?: string;
  exchange?: DelegationExchange;
  detail?: string;
}
const EMPTY: ChatMessage[] = [];
const SOURCE_LABEL: Record<ActivityEntrySource, string> = {
  get live() { return i18n.t("session:activityDetailDialog.live"); },
  get saved() { return i18n.t("session:activityDetailDialog.saved"); },
  get provider() { return i18n.t("session:activityDetailDialog.provider"); },
};

function ActivityEntryRow(props: {
  entry: ActivityLogEntry;
  initiallyOpen: boolean;
  searching: boolean;
}) {
  useTranslation();
  const [open, setOpen] = useState(props.initiallyOpen);
  return (
    <details
      className={sx(s.entry)}
      open={props.searching || open}
      onToggle={event => {
        if (!props.searching) setOpen(event.currentTarget.open);
      }}
    >
      <summary className={sx(s.summary)}><span>{props.entry.title}{props.entry.model ? i18n.t("session:activityDetailDialog.activityEntryRow", { value1: props.entry.model }) : ""}</span><span className={sx(s.source)}>{SOURCE_LABEL[props.entry.source]}</span></summary>
      <TraceOutput text={props.entry.text} />
      {props.entry.truncated ? <p className={sx(s.meta)}>{i18n.t("session:activityDetailDialog.activityEntryRow2")}</p> : null}
    </details>
  );
}

export function ActivityDetailDialog(props: {
  selection: ActivityDetailSelection;
  taskId: string;
  workspaceId?: string;
  repositoryPath?: string;
  graph?: WorkGraph | null;
  onClose: () => void;
  onAction?: (action: DelegationActionId, exchange: DelegationExchange) => void;
  onRefresh?: () => void;
  renderExtraActions?: (exchange: DelegationExchange) => ReactNode;
  /** Shown first in the body, above the result, for surface-specific detail. */
  leadContent?: ReactNode;
  statusNoteFor?: (exchange: DelegationExchange) => string | undefined;
  onShowInConversation?: (id: string) => void;
}) {
  useTranslation();
  const { selection } = props;
  const node = selection.nodeKey ? props.graph?.nodesByKey[selection.nodeKey] : undefined;
  const exchange = node ? fromWorkGraphNode(node, props.graph) : selection.exchange;
  const delegatedTaskId = exchange?.ref.delegatedTaskId;
  const delegatedWorkspaceId = useAppStore(state => delegatedTaskId
    ? exchange?.ref.delegatedWorkspaceId ?? state.taskWorkspaceIdById[delegatedTaskId]
    : undefined);
  const childStreamConnected = useAppStore(state => Boolean(
    delegatedTaskId &&
    delegatedWorkspaceId &&
    (state.activeWorkspaceId === delegatedWorkspaceId || state.workspaceRuntimeCacheById[delegatedWorkspaceId]),
  ));
  const messages = useAppStore(state => {
    return selectActivityMessages({
      state,
      parentTaskId: props.taskId,
      delegatedTaskId,
      delegatedWorkspaceId: exchange?.ref.delegatedWorkspaceId,
    });
  });
  const parentMessages = useAppStore(state => state.messagesByTask[props.taskId] ?? EMPTY);
  const sessions = useAppStore(state => state.providerSessionByTask[props.taskId]);
  const binary = useAppStore(state => state.settings.codexBinaryPath);
  const toolUseId = selection.toolUseId ?? exchange?.ref.toolUseId;
  const [saved, setSaved] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<AgentHistoryEntry[]>([]);
  const [historyResponse, setHistoryResponse] = useState<AgentHistoryResponse | null>(null);
  const [savedNextOffset, setSavedNextOffset] = useState<number | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const logBody = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const allMessages = useMemo(() => {
    const map = new Map(saved.map(message => [message.id, message]));
    for (const message of delegatedTaskId ? messages : parentMessages) map.set(message.id, message);
    return [...map.values()];
  }, [delegatedTaskId, messages, parentMessages, saved]);
  const tool = allMessages.flatMap(message => message.parts).find(part => part.type === "tool_use" && part.toolUseId === toolUseId);
  const agentId = node?.agentId ?? exchange?.ref.agentId ?? (tool?.type === "tool_use" ? tool.agentId : undefined);
  const provider = exchange?.identity.providerId ?? props.graph?.providerId;
  const owner = allMessages.find(message => message.parts.some(part => part.type === "tool_use" && part.toolUseId === toolUseId));
  const accountProfileId = owner?.nativeAccountProfileId ?? "system-default";
  const cursor = provider ? getProviderSessionCursor({ sessions, providerId: provider, accountProfileId }) : null;
  const sessionId = owner?.nativeProviderSessionId ?? cursor?.nativeSessionId;
  const live = exchange ? ["running", "queued"].includes(exchange.outcome.status) : tool?.type === "tool_use" && ["input-streaming", "input-available"].includes(tool.state);
  const canReadProviderHistory = !delegatedTaskId && Boolean(
    agentId &&
    sessionId &&
    props.repositoryPath &&
    (provider === "codex" || provider === "claude-code"),
  );
  const targetKey = delegatedTaskId
    ? `child:${delegatedWorkspaceId ?? "unknown"}:${delegatedTaskId}`
    : `agent:${provider ?? "unknown"}:${agentId ?? toolUseId ?? selection.title}`;

  useEffect(() => {
    setSaved([]);
    setHistory([]);
    setHistoryResponse(null);
    setSavedNextOffset(undefined);
    setError("");
    setOffset(0);
    setQuery("");
    setFollowing(live);
  }, [targetKey]);

  useEffect(() => {
    let cancelled = false;
    const workspaceId = delegatedTaskId ? delegatedWorkspaceId : props.workspaceId;
    if (!workspaceId) return;
    setSavedLoading(true);
    void (async () => {
      const collected = new Map<string, ChatMessage>();
      for (let pageOffset = 0; pageOffset <= (delegatedTaskId ? offset : 0); pageOffset += 100) {
        const page = await loadTaskMessagesPage({ workspaceId, taskId: delegatedTaskId ?? props.taskId, limit: 100, offset: pageOffset, preserveStreaming: true });
        if (cancelled) return;
        for (const message of [...page.messages].reverse()) collected.set(message.id, message);
        if (delegatedTaskId) setSavedNextOffset(page.hasMoreOlder ? pageOffset + page.limit : undefined);
        if (!page.hasMoreOlder) break;
      }
      if (!cancelled) setSaved([...collected.values()].reverse());
    })().catch(error => { if (!cancelled) setError(String(error)); })
      .finally(() => { if (!cancelled) setSavedLoading(false); });
    return () => { cancelled = true; };
  }, [delegatedTaskId, delegatedWorkspaceId, props.workspaceId, props.taskId, offset, savedRefresh]);

  useEffect(() => {
    if (!canReadProviderHistory || !agentId || !sessionId || !props.repositoryPath || (provider !== "codex" && provider !== "claude-code")) return;
    let cancelled = false;
    const read = window.api?.provider?.readAgentHistory;
    if (!read) { setError(i18n.t("session:activityDetailDialog.extraCopy82")); return; }
    setLoading(true);
    void (async () => {
      const collected = new Map<string, AgentHistoryEntry>();
      for (let pageOffset = 0; pageOffset <= offset; pageOffset += 100) {
        const result = await read({ accountProfileId, providerId: provider, sessionId, agentId, cwd: props.repositoryPath!, offset: pageOffset, limit: 100, ...(binary ? { codexBinaryPath: binary } : {}) });
        if (cancelled) return;
        setHistoryResponse(result);
        setError(result.ok ? "" : result.detail);
        if (!result.ok) return;
        for (const entry of result.entries) collected.set(entry.id, entry);
        if (result.nextOffset === undefined) break;
      }
      if (!cancelled) setHistory([...collected.values()]);
    })().catch(error => { if (!cancelled) setError(String(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, sessionId, accountProfileId, provider, props.repositoryPath, binary, offset, historyRefresh, canReadProviderHistory]);

  useEffect(() => {
    if (!live || !canReadProviderHistory || loading) return;
    const timer = window.setTimeout(() => setHistoryRefresh(value => value + 1), 4000);
    return () => window.clearTimeout(timer);
  }, [live, canReadProviderHistory, loading, historyRefresh]);

  const { currentEntries, providerEntries } = useMemo<{
    currentEntries: ActivityLogEntry[];
    providerEntries: ActivityLogEntry[];
  }>(() => {
    if (delegatedTaskId) {
      return {
        currentEntries: mergeActivityEntries(
          messagesToActivityEntries(saved, "saved"),
          messagesToActivityEntries(messages, "live"),
        ),
        providerEntries: [],
      };
    }
    const nestedEntries = (
      sourceMessages: readonly ChatMessage[],
      source: Extract<ActivityEntrySource, "saved" | "live">,
    ) => sourceMessages.flatMap(message => message.parts.flatMap((part, index) => {
        if (part.type !== "tool_use" || part.toolUseId === toolUseId || !(agentId && part.ownerAgentId === agentId || toolUseId && part.parentToolUseId === toolUseId)) return [];
        return [{
          id: `${message.id}:${index}`,
          title: `${part.toolName} · ${part.state}`,
          text: [part.input, ...(part.progressMessages ?? []), part.output ?? ""].filter(Boolean).join("\n"),
          source,
        }];
      }));
    const localEntries = mergeActivityEntries(
      nestedEntries(saved, "saved"),
      nestedEntries(parentMessages, "live"),
    );
    const progress = [...new Set([
      ...(tool?.type === "tool_use" ? tool.progressMessages ?? [] : []),
      ...(exchange?.outcome.progress ?? []),
    ])].map((text, index) => ({
      id: `progress:${toolUseId ?? agentId ?? exchange?.id ?? "activity"}:${index}`,
      title: i18n.t("session:activityDetailDialog.title", { value1: index + 1 }),
      text,
      source: live ? "live" as const : "saved" as const,
    }));
    return {
      currentEntries: mergeActivityEntries(localEntries, progress),
      providerEntries: providerEntriesToActivityEntries(history),
    };
  }, [agentId, delegatedTaskId, exchange?.id, exchange?.outcome.progress, history, live, messages, parentMessages, saved, tool, toolUseId, i18n.language]);
  const entries = useMemo(
    () => [...providerEntries, ...currentEntries],
    [currentEntries, providerEntries],
  );
  useEffect(() => {
    if (following && logBody.current) logBody.current.scrollTop = logBody.current.scrollHeight;
  }, [entries, following]);
  const matchesQuery = (entry: ActivityLogEntry) => `${entry.title}\n${entry.text}`.toLowerCase().includes(query.toLowerCase());
  const filteredProviderEntries = providerEntries.filter(matchesQuery);
  const filteredCurrentEntries = currentEntries.filter(matchesQuery);
  const statusLabel = exchange
    ? describeExchangeStatus(exchange.outcome.status).label
    : live
      ? i18n.t("session:activityDetailDialog.statusLabel")
      : i18n.t("session:activityDetailDialog.statusLabel2");
  const sourceLabel = delegatedTaskId
    ? live
      ? childStreamConnected
        ? i18n.t("session:activityDetailDialog.sourceLabel")
        : i18n.t("session:activityDetailDialog.sourceLabel2")
      : i18n.t("session:activityDetailDialog.sourceLabel3")
    : canReadProviderHistory
      ? live
        ? i18n.t("session:activityDetailDialog.sourceLabel4")
        : i18n.t("session:activityDetailDialog.sourceLabel5")
      : currentEntries.some(entry => entry.source === "live")
        ? i18n.t("session:activityDetailDialog.sourceLabel6")
        : live
          ? i18n.t("session:activityDetailDialog.sourceLabel7")
          : i18n.t("session:activityDetailDialog.sourceLabel8");
  const emptyMessage = live
    ? delegatedTaskId
      ? childStreamConnected
        ? i18n.t("session:activityDetailDialog.emptyMessage")
        : i18n.t("session:activityDetailDialog.emptyMessage2")
      : canReadProviderHistory
        ? i18n.t("session:activityDetailDialog.emptyMessage3")
        : i18n.t("session:activityDetailDialog.emptyMessage4")
    : i18n.t("session:activityDetailDialog.emptyMessage5");
  const nextOffset = delegatedTaskId ? savedNextOffset : historyResponse?.nextOffset;

  const activityLog = (
        <section className={sx(s.activitySection)} aria-label={live ? i18n.t("session:activityDetailDialog.ariaLabel") : i18n.t("session:activityDetailDialog.ariaLabel2")}>
          <div className={sx(s.activityHeader)}>
            <div className={sx(s.activityHeading)}>
              <h3 className={sx(s.heading)}>{live ? i18n.t("session:activityDetailDialog.activityLog") : i18n.t("session:activityDetailDialog.activityLog2")}</h3>
              <p className={sx(s.statusLine)} role="status">{statusLabel} · {sourceLabel}</p>
            </div>
            {!following && live ? <Button size="sm" variant="ghost" onClick={() => setFollowing(true)}>{i18n.t("session:activityDetailDialog.activityLog3")}</Button> : null}
          </div>
          <Input aria-label={i18n.t("session:activityDetailDialog.ariaLabel3")} placeholder={i18n.t("session:activityDetailDialog.placeholder")} value={query} onChange={event => { setQuery(event.target.value); if (event.target.value) setFollowing(false); }} />
          {loading || savedLoading ? <p role="status" className={sx(s.meta)}>{i18n.t("session:activityDetailDialog.activityLog4")}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          <div
            className={sx(s.logViewport)}
            ref={logBody}
            onScroll={event => {
              const el = event.currentTarget;
              setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
            }}
          >
            {!loading && !savedLoading && !entries.length ? <p className={sx(s.empty)}>{emptyMessage}</p> : null}
            {filteredProviderEntries.length > 0 ? <details className={sx(s.historyGroup)} open={query ? true : undefined}>
              <summary className={sx(s.historySummary)}>{i18n.t("session:activityDetailDialog.sentence35", { value1: filteredProviderEntries.length })}</summary>
              {filteredProviderEntries.map(entry => <ActivityEntryRow key={entry.id} entry={entry} initiallyOpen={false} searching={Boolean(query)} />)}
            </details> : null}
            {filteredCurrentEntries.length > 0 && filteredProviderEntries.length > 0 ? <p className={sx(s.groupLabel)}>{i18n.t("session:activityDetailDialog.activityLog6")}</p> : null}
            {filteredCurrentEntries.map((entry, index) => <ActivityEntryRow key={entry.id} entry={entry} initiallyOpen={Boolean(live) && !query && index === filteredCurrentEntries.length - 1} searching={Boolean(query)} />)}
          </div>
          {nextOffset !== undefined ? <Button variant="outline" disabled={loading || savedLoading} onClick={() => setOffset(nextOffset)}>{i18n.t("session:activityDetailDialog.activityLog7")}</Button> : null}
          <p className={sx(s.meta)}>{delegatedTaskId ? i18n.t("session:activityDetailDialog.activityLog8") : historyResponse?.detail ?? i18n.t("session:activityDetailDialog.activityLog9")}</p>
        </section>
  );

  const exchangeDetail = exchange ? <ExchangeDetail exchange={toolUseId && props.onShowInConversation ? { ...exchange, actions: exchange.actions.filter(action => action.id !== "show-in-conversation") } : exchange} resultFirst={!live} nowMs={Date.now()} onAction={props.onAction} extraActions={props.renderExtraActions?.(exchange)} statusNote={props.statusNoteFor?.(exchange)} /> : null;

  return <Dialog open onOpenChange={open => { if (!open) props.onClose(); }}>
    <DialogContent xstyle={s.dialog}>
      <DialogHeader><DialogTitle>{selection.title}</DialogTitle><DialogDescription>{i18n.t("session:activityDetailDialog.activityDetailDialog")}</DialogDescription></DialogHeader>
      <div className={sx(s.actions)}>
        <Button size="sm" variant="outline" disabled={loading || savedLoading} onClick={() => { setSavedRefresh(value => value + 1); setHistoryRefresh(value => value + 1); props.onRefresh?.(); }}>{i18n.t("session:activityDetailDialog.activityDetailDialog2")}</Button>
        {toolUseId && props.onShowInConversation ? <Button size="sm" variant="ghost" onClick={() => { props.onShowInConversation?.(toolUseId); props.onClose(); }}>{i18n.t("session:activityDetailDialog.activityDetailDialog3")}</Button> : null}
      </div>
      <div className={sx(s.body)}>
        {props.leadContent}
        {!live ? exchangeDetail : null}
        {live ? activityLog : <details><summary className={sx(s.historySummary)}>{i18n.t("session:activityDetailDialog.activityDetailDialog4")}</summary>{activityLog}</details>}
        {live ? exchangeDetail : null}
        {historyResponse?.model || historyResponse?.effort ? <p className={sx(s.meta)}>{i18n.t("session:activityDetailDialog.sentence36", { value1: historyResponse.model ?? "Model not reported", value2: historyResponse.effort ?? "Effort not reported" })}</p> : null}
        {selection.detail ? <details><summary className={sx(s.historySummary)}>{i18n.t("session:activityDetailDialog.activityDetailDialog9")}</summary><TraceOutput text={selection.detail} /></details> : null}
        {tool?.type === "tool_use" ? <details className={sx(s.section)}><summary className={sx(s.historySummary)}>{i18n.t("session:activityDetailDialog.activityDetailDialog10")}</summary><p className={sx(s.subheading)}>{i18n.t("session:activityDetailDialog.activityDetailDialog11")}</p><TraceOutput text={tool.input} /><p className={sx(s.subheading)}>{i18n.t("session:activityDetailDialog.sentence37", { value1: tool.state })}</p><TraceOutput text={tool.output ?? i18n.t("session:activityDetailDialog.text")} /></details> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
