import { AgentProgressView } from "@/components/agent-progress/AgentProgressView";
import { i18n, useTranslation } from "@/i18n";
import type { AgentProgress, AgentStep } from "@/lib/agent-progress";
import { phraseToolAction } from "@/lib/agent-progress/tool-sentence";
import type { ExternalAgent, ExternalProgressEntry, ExternalSession } from "@/lib/external-sessions/external-sessions";

function toStep(entry: ExternalProgressEntry): AgentStep {
  const id = String(entry.id);
  if (entry.kind !== "tool") {
    return { id, kind: entry.kind, doing: entry.text, done: entry.text, text: entry.text, status: "done" };
  }
  const doing = phraseToolAction(entry.action, "doing");
  const done = phraseToolAction(entry.action, "done");
  if (entry.status === "called") {
    // A call without its result proves only what was observed.
    return { id, kind: "note", doing, done: doing, text: doing, status: "done" };
  }
  return { id, kind: "tool", doing, done, status: entry.status, startedAt: entry.startedAt, durationMs: entry.durationMs };
}

export function ExternalProgressPanel({ session, agent, onClose }: {
  session: ExternalSession;
  agent?: ExternalAgent;
  onClose: () => void;
}) {
  useTranslation();
  const row = agent ?? session;
  const state = row.status === "finished" ? "ready" : row.status === "running" ? "working" : row.status;
  const title = agent?.description || session.title || i18n.t("shell:externalActivity.untitled");
  const steps = row.recentProgress?.map(toStep) ?? [];
  const latest = row.recentProgress?.at(-1);
  const progress: AgentProgress = {
    id: JSON.stringify([session.source, session.id, agent?.id]),
    source: agent || session.subagent ? "external-subagent" : "external-session",
    readOnly: true,
    now: state === "working" && latest?.kind === "tool" && latest.status === "called" ? steps.at(-1) : undefined,
    title,
    kindLabel: agent?.agentType ?? i18n.t(session.source === "codex" ? "shell:externalActivity.source.codex" : "shell:externalActivity.source.claudeCode"),
    state,
    steps,
    facts: {
      providerId: session.source,
      model: agent ? undefined : session.model,
      startedAt: state === "working" ? row.startedAt : undefined,
      elapsedMs: state !== "working" && row.startedAt !== undefined ? Math.max(0, row.lastAt - row.startedAt) : undefined,
      steps: row.steps,
      contextTokens: row.contextTokens,
    },
  };
  return <AgentProgressView progress={progress} onClose={onClose} />;
}
