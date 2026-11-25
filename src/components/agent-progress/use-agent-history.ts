import { useCallback, useEffect, useState } from "react";
import { mergeHistoryItems, type AgentHistoryItem } from "@/lib/agent-progress";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";

const PAGE_SIZE = 100;
/** How often a live subagent's saved transcript is read again. */
export const AGENT_HISTORY_POLL_MS = 4_000;

const NO_ITEMS: AgentHistoryItem[] = [];

export interface AgentHistoryRequestTarget {
  providerId: ProviderId | undefined;
  sessionId: string | undefined;
  agentId: string | undefined;
  cwd: string | undefined;
  accountProfileId: string;
}

/** Only Claude and Codex keep a readable per-agent transcript. */
export function canReadAgentHistory(target: AgentHistoryRequestTarget): target is AgentHistoryRequestTarget & {
  providerId: "claude-code" | "codex";
  sessionId: string;
  agentId: string;
  cwd: string;
} {
  return Boolean(
    target.agentId &&
    target.sessionId &&
    target.cwd &&
    (target.providerId === "claude-code" || target.providerId === "codex"),
  );
}

/**
 * A subagent's saved transcript from its provider, read page by page and
 * again every few seconds while it is live. Reads never resume or start an
 * agent (`provider.readAgentHistory`).
 */
export function useAgentHistory(target: AgentHistoryRequestTarget & { live: boolean; enabled: boolean }) {
  const binary = useAppStore((state) => state.settings.codexBinaryPath);
  const readable = target.enabled && canReadAgentHistory(target);
  const [items, setItems] = useState<AgentHistoryItem[]>(NO_ITEMS);
  const [model, setModel] = useState<string | undefined>();
  const [effort, setEffort] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [tick, setTick] = useState(0);
  const key = `${target.providerId}:${target.sessionId}:${target.agentId}:${target.cwd}`;

  useEffect(() => {
    setItems(NO_ITEMS);
    setModel(undefined);
    setEffort(undefined);
    setError(null);
    setPages(1);
    setHasMore(false);
  }, [key]);

  const { providerId, sessionId, agentId, cwd, accountProfileId } = target;
  useEffect(() => {
    const request = { providerId, sessionId, agentId, cwd, accountProfileId };
    if (!readable || !canReadAgentHistory(request)) return;
    const read = window.api?.provider?.readAgentHistory;
    if (!read) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const collected: AgentHistoryItem[][] = [];
      let more = false;
      for (let page = 0; page < pages; page += 1) {
        const result = await read({
          accountProfileId: request.accountProfileId,
          providerId: request.providerId,
          sessionId: request.sessionId,
          agentId: request.agentId,
          cwd: request.cwd,
          offset: page * PAGE_SIZE,
          limit: PAGE_SIZE,
          ...(binary ? { codexBinaryPath: binary } : {}),
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.detail);
          return;
        }
        collected.push(result.items ?? NO_ITEMS);
        if (result.model) setModel(result.model);
        if (result.effort) setEffort(result.effort);
        more = result.nextOffset !== undefined;
        if (!more) break;
      }
      setItems((current) => mergeHistoryItems(current, ...collected));
      setHasMore(more);
      setError(null);
    })()
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [readable, providerId, sessionId, agentId, cwd, accountProfileId, pages, tick, binary]);

  useEffect(() => {
    if (!readable || !target.live || loading) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), AGENT_HISTORY_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [readable, target.live, loading, tick]);

  const loadMore = useCallback(() => setPages((count) => count + 1), []);
  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { readable, items, model, effort, error, loading, hasMore, loadMore, refresh };
}
