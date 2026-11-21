import { tarsRunIds } from "@/lib/tars/continuation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { useAppStore } from "@/store/app.store";
import type { TarsResponsibility } from "@/lib/tars/types";

/**
 * Fleet's run details, plus the runs of Tars work Fleet no longer keeps (it
 * drops ended runs after a while), read once per responsibility revision so a
 * finished run's report and review stay available. Fleet's copy wins: it is
 * the one kept current.
 */
export function useTarsRunDetails(responsibilities: readonly TarsResponsibility[], fleetRuns: Readonly<Record<string, AgentRunDetail>>) {
  const [read, setRead] = useState<Record<string, { key: string; detail: AgentRunDetail }>>({});
  const pending = useRef(new Map<string, Promise<AgentRunDetail | null>>());
  const wanted = responsibilities.flatMap((row) => tarsRunIds(row).filter((id) => !fleetRuns[id]).map((id) => `${id}@${id === row.agentRunId ? row.revision : "ended"}`)).join("|");
  const keys = useMemo(() => wanted ? wanted.split("|") : [], [wanted]);
  useEffect(() => {
    const api = typeof window === "undefined" ? undefined : window.api?.agentRuns;
    if (!api) return;
    let active = true;
    const current = new Set(keys);
    for (const key of pending.current.keys()) if (!current.has(key)) pending.current.delete(key);
    for (const key of keys) {
      const agentRunId = key.slice(0, key.lastIndexOf("@"));
      let result = pending.current.get(key);
      if (!result) {
        result = api.get({ agentRunId }).then(response =>
          response.ok && response.agentRun?.agentRun.id === agentRunId ? response.agentRun : null, () => null);
        pending.current.set(key, result);
      }
      void result.then(detail => {
        if (active && detail) setRead(cache => cache[agentRunId]?.key === key ? cache : { ...cache, [agentRunId]: { key, detail } });
      });
    }
    return () => { active = false; };
  }, [keys]);
  return useMemo(() => {
    const details: Record<string, AgentRunDetail> = { ...fleetRuns };
    for (const key of keys) {
      const id = key.slice(0, key.lastIndexOf("@"));
      if (read[id]?.key === key) details[id] = read[id].detail;
    }
    return details;
  }, [fleetRuns, read, keys]);
}

/**
 * The execution workspace's folder, from the open repository or another
 * remembered one; null when this window does not know it.
 */
export function useTarsExecutionPath(row: Pick<TarsResponsibility, "executionWorkspaceId"> | undefined) {
  const workspaceId = row?.executionWorkspaceId ?? null;
  return useAppStore((state) => {
    if (!workspaceId) return null;
    return state.workspacePathById[workspaceId]
      ?? state.recentRepositories.find((repository) => repository.workspacePathById[workspaceId])?.workspacePathById[workspaceId] ?? null;
  });
}
