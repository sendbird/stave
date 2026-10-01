import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentConfig } from "@/lib/agents/schema";
import {
  MAX_AGENT_REVISIONS,
  diffAgentVersions,
  revisionRan,
  type AgentRevision,
} from "@/lib/agents/revisions";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { agentStyles } from "./agents.styles";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** One saved version: when it was replaced, which fields differ from now, whether it ran, and Restore. */
function RevisionRow(props: {
  revision: AgentRevision;
  current: AgentConfig;
  ran: boolean;
  onRestore: () => void;
}) {
  const changed = useMemo(
    () => diffAgentVersions(props.revision.agent, props.current).map((change) => change.label),
    [props.revision.agent, props.current],
  );
  return (
    <li className={sx(agentStyles.historyRow)}>
      <div className={sx(agentStyles.historyMain)}>
        <span className={sx(agentStyles.historyWhen)}>{formatWhen(props.revision.savedAt)}</span>
        <span className={sx(styles.hint)}>
          {changed.length === 0 ? "Same as now" : `Differs in ${changed.join(", ")}`}
        </span>
      </div>
      <div className={sx(agentStyles.historyMeta)}>
        {props.ran ? <span className={sx(styles.chip)}>Assigned</span> : null}
        <Button size="sm" variant="quiet" onClick={props.onRestore} disabled={changed.length === 0}>
          <RotateCcw aria-hidden />
          Restore
        </Button>
      </div>
    </li>
  );
}

/**
 * History: the earlier saves of a custom agent, newest first. Each row names
 * the fields that differ from the agent now and marks a version "Assigned" when a
 * recorded assignment used its exact content. Restore saves that version as
 * the current agent, so the replaced one joins history and nothing is lost.
 */
export function AgentHistory(props: {
  agent: AgentConfig;
  revisions: readonly AgentRevision[];
  /** Content hashes of the assignment rows, to mark versions that ran. */
  ranContentHashes: ReadonlySet<string>;
  onRestore: (agent: AgentConfig) => void;
}) {
  const currentRan = revisionRan({ agent: props.agent, ranContentHashes: props.ranContentHashes });
  if (props.revisions.length === 0) {
    return (
      <p className={sx(styles.hint)}>
        No earlier versions yet. Each save keeps the version it replaces, up to {MAX_AGENT_REVISIONS}.
      </p>
    );
  }
  return (
    <ul className={sx(agentStyles.runs)}>
      <li className={sx(agentStyles.historyRow)}>
        <div className={sx(agentStyles.historyMain)}>
          <span className={sx(agentStyles.historyWhen)}>Current</span>
        </div>
        <div className={sx(agentStyles.historyMeta)}>
          {currentRan ? <span className={sx(styles.chip)}>Assigned</span> : null}
        </div>
      </li>
      {props.revisions.map((revision) => (
        <RevisionRow
          key={revision.savedAt}
          revision={revision}
          current={props.agent}
          ran={revisionRan({ agent: revision.agent, ranContentHashes: props.ranContentHashes })}
          onRestore={() => props.onRestore(revision.agent)}
        />
      ))}
    </ul>
  );
}
