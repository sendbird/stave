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
  const [read, setRead] = useState<Record<string, AgentRunDetail>>({});
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const wanted = responsibilities.flatMap((row) => row.agentRunId && !fleetRuns[row.agentRunId] ? [`${row.agentRunId}@${row.revision}`] : []).join("|");
  useEffect(() => {
    const api = typeof window === "undefined" ? undefined : window.api?.agentRuns;
    if (!api || !wanted) return;
    for (const key of wanted.split("|")) {
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      const agentRunId = key.slice(0, key.lastIndexOf("@"));
      void api.get({ agentRunId }).then((response) => {
        if (mounted.current && response.ok && response.agentRun) setRead((current) => ({ ...current, [agentRunId]: response.agentRun! }));
      }, () => undefined);
    }
  }, [wanted]);
  return useMemo(() => ({ ...read, ...fleetRuns }), [fleetRuns, read]);
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
