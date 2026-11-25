import { useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import { AgentStepList } from "./AgentStepList";
import { TurnTraceTimeline } from "@/components/session/TurnTraceTimeline";
import type { TurnTrace, TurnTraceKind } from "@/components/session/turn-trace.utils";
import type { AgentProgress, AgentStep } from "@/lib/agent-progress";

function stepKind(step: AgentStep): Exclude<TurnTraceKind, "turn"> {
  if (step.kind === "subagent") return "agent";
  return step.kind === "tool" ? "tool" : "model";
}

/** Each step uses its own observed interval. Neither the agent's lifetime nor
 * neighbouring steps can tell us how long an untimed step ran. */
function progressTrace(progress: AgentProgress, nowMs: number): TurnTrace {
  const trace: TurnTrace = { spans: [], unreported: [], slowestId: null, nowMs: null, usage: {} };
  for (const step of progress.steps) {
    const { startedAt, durationMs } = step;
    const running = progress.state === "working" && step.status === "running";
    const label = step.status === "running" ? step.doing : step.done;
    const base = { id: step.id, kind: stepKind(step), label };
    const measured = durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0;
    const endMs = startedAt !== undefined && measured ? startedAt + durationMs : undefined;
    if (startedAt === undefined || !Number.isFinite(startedAt) || (running ? nowMs < startedAt : endMs === undefined)) {
      trace.unreported.push({ ...base, detail: measured ? formatDuration(durationMs, { tenths: true }) : undefined });
      continue;
    }
    if (running) trace.nowMs = nowMs;
    trace.spans.push({
      ...base,
      parentId: null,
      startMs: startedAt,
      endMs: running ? null : endMs ?? null,
      status: running ? "running" : step.status === "error" ? "error" : "ok",
    });
  }
  return trace;
}

export function AgentProgressTimeline({ progress, nowMs, onOpenChild }: {
  progress: AgentProgress;
  nowMs: number;
  onOpenChild?: (step: AgentStep) => void;
}) {
  const { i18n } = useTranslation();
  const trace = useMemo(() => progressTrace(progress, nowMs), [progress, nowMs, i18n.language]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? progress.steps.find((step) => step.id === selectedId) : undefined;
  return (
    <>
      <TurnTraceTimeline trace={trace} scope="agent" selectedSpan={selected?.id ?? null}
        onSelectSpan={(id) => setSelectedId((previous) => previous === id ? null : id)} />
      {selected && <AgentStepList steps={[selected]} onOpenChild={onOpenChild} />}
    </>
  );
}
