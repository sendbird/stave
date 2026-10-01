import type { ModelExecution } from "@/lib/providers/model-execution";
import type { AgentTurnProvenance } from "@/lib/agents/turn-provenance";
import { sx } from "../ads/utils/stylex";
import { resultStyles as styles } from "./result-review.styles";
import type {
  AutoRoutingModelResolution,
  ProviderId,
} from "@/lib/providers/provider.types";
import { getTurnModelInfoParts } from "@/lib/providers/turn-model-info";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import type { TurnModelInfo } from "@/types/chat";

const PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>([
  "claude-code",
  "codex",
  "cursor",
  "kiro",
]);

function toProviderLabel(providerId: string) {
  if (providerId === "claude-code") return "Claude Code";
  if (providerId === "codex") return "Codex";
  if (providerId === "cursor") return "Cursor";
  if (providerId === "kiro") return "Kiro";
  return providerId;
}

function toSourceLabel(source: AutoRoutingModelResolution["source"]) {
  if (source === "classifier_fallback") return "Classifier fallback";
  return source === "classifier" ? "Classifier" : "Heuristic";
}

export interface ActualRunModel {
  providerId: string;
  model: string;
  /** Effort / fast-mode the run was dispatched with, when the record kept it. */
  modelInfo?: TurnModelInfo;
  modelExecution?: ModelExecution;
}

/**
 * `Claude Fable 5.1 · High`. The effort rides beside the model
 * because the two are chosen together in the composer; a run record that
 * names only the model hides half of what was asked of it.
 */
export function formatActualRunModel(actual: ActualRunModel) {
  const providerId = PROVIDER_IDS.has(actual.providerId)
    ? (actual.providerId as ProviderId)
    : null;
  const parts = providerId
    ? getTurnModelInfoParts({
        providerId,
        model: actual.model,
        modelInfo: actual.modelInfo,
      })
    : { name: actual.model, details: [] as string[] };
  // A catalog name already says which provider ran it; the provider label
  // only leads when the model is unknown to the catalog.
  const named = providerId !== null && parts.name !== actual.model;
  return [named ? null : toProviderLabel(actual.providerId), parts.name, ...parts.details]
    .filter(Boolean)
    .join(" · ");
}

function formatAgentPermissions(provenance: AgentTurnProvenance) {
  const applied = provenance.permission.applied;
  const values = [
    applied.codexFileAccess ? `Files: ${applied.codexFileAccess}` : null,
    applied.codexApprovalPolicy ? `Approval: ${applied.codexApprovalPolicy}` : null,
    applied.claudePermissionMode ? `Mode: ${applied.claudePermissionMode}` : null,
    applied.cursorMode ? `Mode: ${applied.cursorMode}` : null,
    applied.cursorApprovalMode ? `Approval: ${applied.cursorApprovalMode}` : null,
    applied.kiroApprovalMode ? `Approval: ${applied.kiroApprovalMode}` : null,
    applied.codexNetworkAccess === undefined ? null : `Network: ${applied.codexNetworkAccess ? "on" : "off"}`,
    applied.claudeAllowDangerouslySkipPermissions === undefined ? null
      : `Skip approvals: ${applied.claudeAllowDangerouslySkipPermissions ? "on" : "off"}`,
    applied.claudeDisallowedTools?.length ? `Denied tools: ${applied.claudeDisallowedTools.join(", ")}` : null,
  ].filter(Boolean);
  return values.join(" · ") || "Provider defaults; values not reported";
}

/** Recorded model facts only; callers may reuse this in live or saved runs. */
export function ModelResolutionSummary(props: {
  actual: ActualRunModel | null;
  resolution?: AutoRoutingModelResolution;
  agentProvenance?: AgentTurnProvenance;
  /** Hide run identity and a routed target that the surrounding header repeats. */
  showModelFacts?: boolean;
}) {
  const showModelFacts = props.showModelFacts !== false;
  if (!props.actual && !props.resolution && !props.agentProvenance) {
    return (
      <p className={sx(styles.caption)}>Actual model has not been reported</p>
    );
  }
  const actualLabel = props.actual ? formatActualRunModel(props.actual) : null;
  const showRoutedTarget = Boolean(
    props.resolution &&
    (showModelFacts ||
      (props.actual &&
        (props.actual.providerId !== props.resolution.selectedProviderId ||
          props.actual.model !== props.resolution.selectedModel))),
  );

  return (
    <dl className={sx(styles.modelFacts)}>
      {props.agentProvenance ? (
        <>
          <dt className={sx(styles.muted)}>{props.agentProvenance.role === "delegate" ? "Delegated Agent" : "Assigned main Agent"}</dt>
          <dd className={sx(styles.modelValue)}>{props.agentProvenance.agentName}</dd>
          <dt className={sx(styles.muted)}>Agent version</dt>
          <dd className={sx(styles.modelValue)} title={props.agentProvenance.agentContentHash}>
            {props.agentProvenance.agentContentHash.slice(0, 12)}
          </dd>
          <dt className={sx(styles.muted)}>Permission source</dt>
          <dd className={sx(styles.modelReason)}>
            {props.agentProvenance.permission.source === "delegation-policy" ? "Delegation policy"
              : props.agentProvenance.permission.source === "agent-ceiling" ? "Agent ceiling"
              : props.agentProvenance.permission.source === "agent-autonomy" ? "Agent autonomy" : "User settings"}
            {props.agentProvenance.permission.source === "agent-ceiling"
              ? ` · ${props.agentProvenance.permission.agentLimit}` : null}
            {props.agentProvenance.permission.support === "instructed" ? " · Asked in instructions" : ""}
          </dd>
          <dt className={sx(styles.muted)}>Agent instructions</dt>
          <dd className={sx(styles.modelReason)}>
            {props.agentProvenance.instructions.status === "configured" ? "Configured; delivery not confirmed"
              : props.agentProvenance.instructions.status === "retained-session" ? "Already delivered to this session"
              : "Delivered"}
          </dd>
          <dt className={sx(styles.muted)}>Configured permissions</dt>
          <dd className={sx(styles.modelReason)}>{formatAgentPermissions(props.agentProvenance)}</dd>
          {props.agentProvenance.effort && props.agentProvenance.effort !== props.actual?.modelInfo?.effort ? (
            <>
              <dt className={sx(styles.muted)}>Requested effort</dt>
              <dd className={sx(styles.modelValue)}>{props.agentProvenance.effort}</dd>
            </>
          ) : null}
        </>
      ) : null}
      {showModelFacts ? (
        <>
          <dt className={sx(styles.muted)}>Run model</dt>
          <dd
            className={sx(styles.modelValue)}
            title={actualLabel ?? undefined}
          >
            {actualLabel ?? "Not reported"}
          </dd>
        </>
      ) : null}
      {props.actual?.modelExecution ? (
        <>
          <dt className={sx(styles.muted)}>Requested model</dt>
          <dd className={sx(styles.modelValue)}>{toHumanModelName({ model: props.actual.modelExecution.requestedModel })}</dd>
          <dt className={sx(styles.muted)}>Model change</dt>
          <dd className={sx(styles.modelReason)}>{props.actual.modelExecution.reason}</dd>
        </>
      ) : null}
      {props.resolution ? (
        <>
          {showRoutedTarget ? (
            <>
              <dt className={sx(styles.muted)}>Routed target</dt>
              <dd
                className={sx(styles.modelValue)}
                title={`${toProviderLabel(props.resolution.selectedProviderId)} · ${props.resolution.selectedModel}`}
              >
                {toHumanModelName({ model: props.resolution.selectedModel }) ||
                  `${toProviderLabel(props.resolution.selectedProviderId)} · ${props.resolution.selectedModel}`}
              </dd>
            </>
          ) : null}
          {props.resolution.taskClass ? (
            <>
              <dt className={sx(styles.muted)}>Task</dt>
              <dd className={sx(styles.modelSource)}>
                {[props.resolution.taskClass, props.resolution.stance]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </>
          ) : null}
          <dt className={sx(styles.muted)}>Source</dt>
          <dd className={sx(styles.modelSource)}>
            {toSourceLabel(props.resolution.source)}
          </dd>
          {props.resolution.ruleReason ? (
            <>
              <dt className={sx(styles.muted)}>Rule</dt>
              <dd className={sx(styles.modelReason)}>
                {props.resolution.ruleReason}
              </dd>
            </>
          ) : null}
          <dt className={sx(styles.muted)}>Signals</dt>
          <dd className={sx(styles.modelReason)}>
            {props.resolution.rationale}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
