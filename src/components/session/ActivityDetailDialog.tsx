import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sx } from "@/components/ads/utils/stylex";
import { ExchangeDetail } from "@/components/delegation/ExchangeDetail";
import { fromWorkGraphNode, type DelegationExchange, type DelegationActionId } from "@/lib/delegation/exchange";
import { historyText, type AgentHistoryEntry, type AgentHistoryResponse } from "@/lib/providers/agent-history";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
import type { ChatMessage } from "@/types/chat";
import { useAppStore } from "@/store/app.store";
import { TraceOutput } from "./message/turn-event-rows";
import { activityDetailStyles as s } from "./activity-detail.styles";

export interface ActivityDetailSelection {
  title: string;
  toolUseId?: string;
  nodeKey?: string;
  exchange?: DelegationExchange;
  detail?: string;
}
const EMPTY: ChatMessage[] = [];

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
  const messages = useAppStore(state => state.messagesByTask[props.taskId] ?? EMPTY);
  const sessions = useAppStore(state => state.providerSessionByTask[props.taskId]);
  const binary = useAppStore(state => state.settings.codexBinaryPath);
  const node = selection.nodeKey ? props.graph?.nodesByKey[selection.nodeKey] : undefined;
  const exchange = node ? fromWorkGraphNode(node, props.graph) : selection.exchange;
  const toolUseId = selection.toolUseId ?? exchange?.ref.toolUseId;
  const [saved, setSaved] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<AgentHistoryEntry[]>([]);
  const [response, setResponse] = useState<AgentHistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const allMessages = useMemo(() => {
    const map = new Map(saved.map(message => [message.id, message]));
    for (const message of messages) map.set(message.id, message);
    return [...map.values()];
  }, [messages, saved]);
  const tool = allMessages.flatMap(message => message.parts).find(part => part.type === "tool_use" && part.toolUseId === toolUseId);
  const agentId = node?.agentId ?? exchange?.ref.agentId ?? (tool?.type === "tool_use" ? tool.agentId : undefined);
  const provider = exchange?.identity.providerId ?? props.graph?.providerId;
  const cursor = provider ? sessions?.[provider] : undefined;
  const sessionId = typeof cursor === "string" ? cursor : cursor?.nativeSessionId;
  const live = exchange ? ["running", "queued"].includes(exchange.outcome.status) : tool?.type === "tool_use" && ["input-streaming", "input-available"].includes(tool.state);
  const childTaskId = exchange?.ref.childTaskId;

  useEffect(() => {
    let cancelled = false;
    const workspaceId = exchange?.ref.childWorkspaceId ?? props.workspaceId;
    if (!workspaceId) return;
    setSavedLoading(true);
    void (async () => {
      const collected = new Map<string, ChatMessage>();
      for (let pageOffset = 0; pageOffset <= (childTaskId ? offset : 0); pageOffset += 100) {
        const page = await loadTaskMessagesPage({ workspaceId, taskId: childTaskId ?? props.taskId, limit: 100, offset: pageOffset, preserveStreaming: true });
        if (cancelled) return;
        for (const message of [...page.messages].reverse()) collected.set(message.id, message);
        if (childTaskId) setResponse({ ok: true, detail: "Saved child task conversation", entries: [], ...(page.hasMoreOlder ? { nextOffset: pageOffset + page.limit } : {}) });
        if (!page.hasMoreOlder) break;
      }
      if (!cancelled) setSaved([...collected.values()].reverse());
    })().catch(error => { if (!cancelled) setError(String(error)); })
      .finally(() => { if (!cancelled) setSavedLoading(false); });
    return () => { cancelled = true; };
  }, [childTaskId, exchange?.ref.childWorkspaceId, props.workspaceId, props.taskId, offset, refresh]);

  useEffect(() => {
    if (childTaskId || !agentId || !sessionId || !props.projectPath || (provider !== "codex" && provider !== "claude-code")) return;
    let cancelled = false;
    const read = window.api?.provider?.readAgentHistory;
    if (!read) { setError("Agent history is unavailable in this runtime."); return; }
    setLoading(true);
    void (async () => {
      const collected = new Map<string, AgentHistoryEntry>();
      for (let pageOffset = 0; pageOffset <= offset; pageOffset += 100) {
        const result = await read({ providerId: provider, sessionId, agentId, cwd: props.projectPath!, offset: pageOffset, limit: 100, ...(binary ? { codexBinaryPath: binary } : {}) });
        if (cancelled) return;
        setResponse(result);
        setError(result.ok ? "" : result.detail);
        if (!result.ok) return;
        for (const entry of result.entries) collected.set(entry.id, entry);
        if (result.nextOffset === undefined) break;
      }
      if (!cancelled) setHistory([...collected.values()]);
    })().catch(error => { if (!cancelled) setError(String(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, sessionId, provider, props.projectPath, binary, offset, refresh, childTaskId]);

  useEffect(() => {
    if (!live || loading || savedLoading || query) return;
    const timer = window.setTimeout(() => setRefresh(value => value + 1), 4000);
    return () => window.clearTimeout(timer);
  }, [live, loading, savedLoading, query, refresh]);

  const localEntries = useMemo<AgentHistoryEntry[]>(() => {
    if (childTaskId) return saved.flatMap(message => message.parts.map((part, index) => ({ id: `${message.id}:${index}`, title: `${message.role} · ${part.type}`, text: historyText(part.type === "text" || part.type === "thinking" ? part.text : part) })));
    return allMessages.flatMap(message => message.parts.flatMap((part, index) => {
      if (part.type !== "tool_use" || part.toolUseId === toolUseId || !(agentId && part.ownerAgentId === agentId || toolUseId && part.parentToolUseId === toolUseId)) return [];
      return [{ id: `${message.id}:${index}`, title: `${part.toolName} · ${part.state}`, text: `${part.input}\n${part.output ?? ""}` }];
    }));
  }, [allMessages, saved, childTaskId, toolUseId, agentId]);
  const entries = history.length ? history : localEntries;
  useEffect(() => {
    if (following && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [entries, following]);
  const filtered = entries.filter(entry => `${entry.title}\n${entry.text}`.toLowerCase().includes(query.toLowerCase()));

  return <Dialog open onOpenChange={open => { if (!open) props.onClose(); }}>
    <DialogContent xstyle={s.dialog}>
      <DialogHeader><DialogTitle>{selection.title}</DialogTitle><DialogDescription>Assignment, activity and results for this execution.</DialogDescription></DialogHeader>
      <div className={sx(s.actions)}>
        <Button size="sm" variant="outline" disabled={loading || savedLoading} onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
        {toolUseId && props.onShowInConversation ? <Button size="sm" variant="ghost" onClick={() => { props.onShowInConversation?.(toolUseId); props.onClose(); }}>Show in conversation</Button> : null}
        {!following && live ? <Button size="sm" variant="ghost" onClick={() => setFollowing(true)}>Follow latest activity</Button> : null}
      </div>
      <div className={sx(s.body)} ref={body} onScroll={event => { const el = event.currentTarget; setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}>
        {exchange ? <ExchangeDetail exchange={exchange} nowMs={Date.now()} onAction={props.onAction} extraActions={props.renderExtraActions?.(exchange)} statusNote={props.statusNoteFor?.(exchange)} /> : null}
        {response?.model || response?.effort ? <p className={sx(s.meta)}>Thread configuration (may differ from execution): {response.model ?? "Model not reported"} · {response.effort ?? "Effort not reported"}. Current or last saved settings, not per-turn execution telemetry.</p> : null}
        {selection.detail ? <TraceOutput text={selection.detail} /> : null}
        {tool?.type === "tool_use" ? <section className={sx(s.section)}><h3>Original input</h3><TraceOutput text={tool.input} /><h3>Result · {tool.state}</h3><TraceOutput text={tool.output ?? "No result reported yet."} />{tool.progressMessages?.map((text, i) => <TraceOutput key={i} text={text} />)}</section> : null}
        <section className={sx(s.section)}><h3>Execution log</h3>
          <Input aria-label="Search execution log" placeholder="Search loaded events" value={query} onChange={event => setQuery(event.target.value)} />
          {loading || savedLoading ? <p role="status">Loading saved activity…</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {!loading && !savedLoading && !entries.length ? <p className={sx(s.meta)}>No additional events are available. Older or unsupported runtimes may only retain the assignment and returned result.</p> : null}
          {filtered.map(entry => <details key={entry.id} className={sx(s.entry)} open={query ? true : undefined}><summary className={sx(s.summary)}>{entry.title}{entry.model ? ` · ${entry.model} (reported)` : ""}</summary><TraceOutput text={entry.text} />{entry.truncated ? <p className={sx(s.meta)}>This entry is truncated.</p> : null}</details>)}
          {response?.nextOffset !== undefined ? <Button variant="outline" disabled={loading || savedLoading} onClick={() => setOffset(response.nextOffset!)}>Load more events</Button> : null}
          <p className={sx(s.meta)}>{response?.detail ?? "Captured events only; unavailable history is not reconstructed."}</p>
        </section>
      </div>
    </DialogContent>
  </Dialog>;
}
