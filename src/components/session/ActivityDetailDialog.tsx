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
  live: "Live turn",
  saved: "Saved transcript",
  provider: "Provider history",
};

function ActivityEntryRow(props: {
  entry: ActivityLogEntry;
  initiallyOpen: boolean;
  searching: boolean;
}) {
  const [open, setOpen] = useState(props.initiallyOpen);
  return (
    <details
      className={sx(s.entry)}
      open={props.searching || open}
      onToggle={event => {
        if (!props.searching) setOpen(event.currentTarget.open);
      }}
    >
      <summary className={sx(s.summary)}><span>{props.entry.title}{props.entry.model ? ` · ${props.entry.model} (reported)` : ""}</span><span className={sx(s.source)}>{SOURCE_LABEL[props.entry.source]}</span></summary>
      <TraceOutput text={props.entry.text} />
      {props.entry.truncated ? <p className={sx(s.meta)}>This entry is truncated.</p> : null}
    </details>
  );
}

export function ActivityDetailDialog(props: {
  selection: ActivityDetailSelection;
  taskId: string;
  workspaceId?: string;
  projectPath?: string;
  graph?: WorkGraph | null;
  onClose: () => void;
  onAction?: (action: DelegationActionId, exchange: DelegationExchange) => void;
  renderExtraActions?: (exchange: DelegationExchange) => ReactNode;
  statusNoteFor?: (exchange: DelegationExchange) => string | undefined;
  onShowInConversation?: (id: string) => void;
}) {
  const { selection } = props;
  const node = selection.nodeKey ? props.graph?.nodesByKey[selection.nodeKey] : undefined;
  const exchange = node ? fromWorkGraphNode(node, props.graph) : selection.exchange;
  const childTaskId = exchange?.ref.childTaskId;
  const childWorkspaceId = useAppStore(state => childTaskId
    ? exchange?.ref.childWorkspaceId ?? state.taskWorkspaceIdById[childTaskId]
    : undefined);
  const childStreamConnected = useAppStore(state => Boolean(
    childTaskId &&
    childWorkspaceId &&
    (state.activeWorkspaceId === childWorkspaceId || state.workspaceRuntimeCacheById[childWorkspaceId]),
  ));
  const messages = useAppStore(state => {
    return selectActivityMessages({
      state,
      parentTaskId: props.taskId,
      childTaskId,
      childWorkspaceId: exchange?.ref.childWorkspaceId,
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
    for (const message of childTaskId ? messages : parentMessages) map.set(message.id, message);
    return [...map.values()];
  }, [childTaskId, messages, parentMessages, saved]);
  const tool = allMessages.flatMap(message => message.parts).find(part => part.type === "tool_use" && part.toolUseId === toolUseId);
  const agentId = node?.agentId ?? exchange?.ref.agentId ?? (tool?.type === "tool_use" ? tool.agentId : undefined);
  const provider = exchange?.identity.providerId ?? props.graph?.providerId;
  const cursor = provider ? sessions?.[provider] : undefined;
  const sessionId = typeof cursor === "string" ? cursor : cursor?.nativeSessionId;
  const live = exchange ? ["running", "queued"].includes(exchange.outcome.status) : tool?.type === "tool_use" && ["input-streaming", "input-available"].includes(tool.state);
  const canReadProviderHistory = !childTaskId && Boolean(
    agentId &&
    sessionId &&
    props.projectPath &&
    (provider === "codex" || provider === "claude-code"),
  );
  const targetKey = childTaskId
    ? `child:${childWorkspaceId ?? "unknown"}:${childTaskId}`
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
    const workspaceId = childTaskId ? childWorkspaceId : props.workspaceId;
    if (!workspaceId) return;
    setSavedLoading(true);
    void (async () => {
      const collected = new Map<string, ChatMessage>();
      for (let pageOffset = 0; pageOffset <= (childTaskId ? offset : 0); pageOffset += 100) {
        const page = await loadTaskMessagesPage({ workspaceId, taskId: childTaskId ?? props.taskId, limit: 100, offset: pageOffset, preserveStreaming: true });
        if (cancelled) return;
        for (const message of [...page.messages].reverse()) collected.set(message.id, message);
        if (childTaskId) setSavedNextOffset(page.hasMoreOlder ? pageOffset + page.limit : undefined);
        if (!page.hasMoreOlder) break;
      }
      if (!cancelled) setSaved([...collected.values()].reverse());
    })().catch(error => { if (!cancelled) setError(String(error)); })
      .finally(() => { if (!cancelled) setSavedLoading(false); });
    return () => { cancelled = true; };
  }, [childTaskId, childWorkspaceId, props.workspaceId, props.taskId, offset, savedRefresh]);

  useEffect(() => {
    if (!canReadProviderHistory || !agentId || !sessionId || !props.projectPath || (provider !== "codex" && provider !== "claude-code")) return;
    let cancelled = false;
    const read = window.api?.provider?.readAgentHistory;
    if (!read) { setError("Agent history is unavailable in this runtime."); return; }
    setLoading(true);
    void (async () => {
      const collected = new Map<string, AgentHistoryEntry>();
      for (let pageOffset = 0; pageOffset <= offset; pageOffset += 100) {
        const result = await read({ providerId: provider, sessionId, agentId, cwd: props.projectPath!, offset: pageOffset, limit: 100, ...(binary ? { codexBinaryPath: binary } : {}) });
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
  }, [agentId, sessionId, provider, props.projectPath, binary, offset, historyRefresh, canReadProviderHistory]);

  useEffect(() => {
    if (!live || !canReadProviderHistory || loading) return;
    const timer = window.setTimeout(() => setHistoryRefresh(value => value + 1), 4000);
    return () => window.clearTimeout(timer);
  }, [live, canReadProviderHistory, loading, historyRefresh]);

  const { currentEntries, providerEntries } = useMemo<{
    currentEntries: ActivityLogEntry[];
    providerEntries: ActivityLogEntry[];
  }>(() => {
    if (childTaskId) {
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
      title: `Progress ${index + 1}`,
      text,
      source: live ? "live" as const : "saved" as const,
    }));
    return {
      currentEntries: mergeActivityEntries(localEntries, progress),
      providerEntries: providerEntriesToActivityEntries(history),
    };
  }, [agentId, childTaskId, exchange?.id, exchange?.outcome.progress, history, live, messages, parentMessages, saved, tool, toolUseId]);
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
      ? "Running"
      : "Recorded";
  const sourceLabel = childTaskId
    ? live
      ? childStreamConnected
        ? "Live child task stream"
        : "Saved child transcript · reconnecting"
      : "Child task transcript"
    : canReadProviderHistory
      ? live
        ? "Provider agent history · refreshes every 4 seconds"
        : "Provider agent history"
      : currentEntries.some(entry => entry.source === "live")
        ? "Live parent-turn events"
        : live
          ? "Waiting for turn events"
          : "Captured turn events";
  const emptyMessage = live
    ? childTaskId
      ? childStreamConnected
        ? "Waiting for the child task’s first event."
        : "No live child events are connected yet. Saved activity remains available."
      : canReadProviderHistory
        ? "Waiting for provider agent events."
        : "No per-agent events have been reported yet. Live status remains available in the activity tree."
    : "No event history was retained for this run. The assignment and returned result remain available below.";
  const nextOffset = childTaskId ? savedNextOffset : historyResponse?.nextOffset;

  return <Dialog open onOpenChange={open => { if (!open) props.onClose(); }}>
    <DialogContent xstyle={s.dialog}>
      <DialogHeader><DialogTitle>{selection.title}</DialogTitle><DialogDescription>Assignment, activity and results for this execution.</DialogDescription></DialogHeader>
      <div className={sx(s.actions)}>
        <Button size="sm" variant="outline" disabled={loading || savedLoading} onClick={() => { setSavedRefresh(value => value + 1); setHistoryRefresh(value => value + 1); }}>Refresh</Button>
        {toolUseId && props.onShowInConversation ? <Button size="sm" variant="ghost" onClick={() => { props.onShowInConversation?.(toolUseId); props.onClose(); }}>Show in conversation</Button> : null}
      </div>
      <div className={sx(s.body)}>
        <section className={sx(s.activitySection)} aria-label={live ? "Live activity" : "Activity"}>
          <div className={sx(s.activityHeader)}>
            <div className={sx(s.activityHeading)}>
              <h3 className={sx(s.heading)}>{live ? "Live activity" : "Activity"}</h3>
              <p className={sx(s.statusLine)} role="status">{statusLabel} · {sourceLabel}</p>
            </div>
            {!following && live ? <Button size="sm" variant="ghost" onClick={() => setFollowing(true)}>Follow latest</Button> : null}
          </div>
          <Input aria-label="Search execution log" placeholder="Search loaded events" value={query} onChange={event => { setQuery(event.target.value); if (event.target.value) setFollowing(false); }} />
          {loading || savedLoading ? <p role="status" className={sx(s.meta)}>Loading saved activity…</p> : null}
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
              <summary className={sx(s.historySummary)}>Provider history · {filteredProviderEntries.length}</summary>
              {filteredProviderEntries.map(entry => <ActivityEntryRow key={entry.id} entry={entry} initiallyOpen={false} searching={Boolean(query)} />)}
            </details> : null}
            {filteredCurrentEntries.length > 0 && filteredProviderEntries.length > 0 ? <p className={sx(s.groupLabel)}>Current turn events</p> : null}
            {filteredCurrentEntries.map((entry, index) => <ActivityEntryRow key={entry.id} entry={entry} initiallyOpen={!query && index === filteredCurrentEntries.length - 1} searching={Boolean(query)} />)}
          </div>
          {nextOffset !== undefined ? <Button variant="outline" disabled={loading || savedLoading} onClick={() => setOffset(nextOffset)}>Load older events</Button> : null}
          <p className={sx(s.meta)}>{childTaskId ? "The live child transcript is merged with saved history; matching events appear once." : historyResponse?.detail ?? "Only events reported by this runtime are shown."}</p>
        </section>
        {exchange ? <ExchangeDetail exchange={exchange} nowMs={Date.now()} onAction={props.onAction} extraActions={props.renderExtraActions?.(exchange)} statusNote={props.statusNoteFor?.(exchange)} /> : null}
        {historyResponse?.model || historyResponse?.effort ? <p className={sx(s.meta)}>Thread configuration (may differ from execution): {historyResponse.model ?? "Model not reported"} · {historyResponse.effort ?? "Effort not reported"}. Current or last saved settings, not per-turn execution telemetry.</p> : null}
        {selection.detail ? <TraceOutput text={selection.detail} /> : null}
        {tool?.type === "tool_use" ? <section className={sx(s.section)}><h3 className={sx(s.heading)}>Call details</h3><p className={sx(s.subheading)}>Original input</p><TraceOutput text={tool.input} /><p className={sx(s.subheading)}>Result · {tool.state}</p><TraceOutput text={tool.output ?? "No result reported yet."} /></section> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
