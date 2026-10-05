import { i18n, useTranslation } from "@/i18n";
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
  if (source === "classifier_fallback") return i18n.t("session:modelResolutionSummary.toSourceLabel");
  return source === "classifier" ? i18n.t("session:modelResolutionSummary.toSourceLabel2") : i18n.t("session:modelResolutionSummary.toSourceLabel3");
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
    applied.codexFileAccess ? i18n.t("session:modelResolutionSummary.extraCopy94", { value1: applied.codexFileAccess }) : null,
    applied.codexApprovalPolicy ? i18n.t("session:modelResolutionSummary.extraCopy99", { value1: applied.codexApprovalPolicy }) : null,
    applied.claudePermissionMode ? i18n.t("session:modelResolutionSummary.extraCopy97", { value1: applied.claudePermissionMode }) : null,
    applied.cursorMode ? i18n.t("session:modelResolutionSummary.extraCopy97", { value1: applied.cursorMode }) : null,
    applied.cursorApprovalMode ? i18n.t("session:modelResolutionSummary.extraCopy99", { value1: applied.cursorApprovalMode }) : null,
    applied.kiroApprovalMode ? i18n.t("session:modelResolutionSummary.extraCopy99", { value1: applied.kiroApprovalMode }) : null,
    applied.codexNetworkAccess === undefined ? null : i18n.t("session:modelResolutionSummary.extraCopy100", { value1: i18n.t(applied.codexNetworkAccess ? "session:presentation.on" : "session:presentation.off") }),
    applied.claudeAllowDangerouslySkipPermissions === undefined ? null
      : i18n.t("session:modelResolutionSummary.extraCopy101", { value1: i18n.t(applied.claudeAllowDangerouslySkipPermissions ? "session:presentation.on" : "session:presentation.off") }),
    applied.claudeDisallowedTools?.length ? i18n.t("session:modelResolutionSummary.extraCopy102", { value1: applied.claudeDisallowedTools.join(", ") }) : null,
  ].filter(Boolean);
  return values.join(" · ") || i18n.t("session:modelResolutionSummary.formatAgentPermissions");
}

/** Recorded model facts only; callers may reuse this in live or saved runs. */
export function ModelResolutionSummary(props: {
  actual: ActualRunModel | null;
  resolution?: AutoRoutingModelResolution;
  agentProvenance?: AgentTurnProvenance;
  /** Hide run identity and a routed target that the surrounding header repeats. */
  showModelFacts?: boolean;
}) {
  useTranslation();
  const showModelFacts = props.showModelFacts !== false;
  if (!props.actual && !props.resolution && !props.agentProvenance) {
    return (
      <p className={sx(styles.caption)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary")}</p>
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
          <dt className={sx(styles.muted)}>{props.agentProvenance.role === "delegate" ? i18n.t("session:modelResolutionSummary.modelResolutionSummary2") : i18n.t("session:modelResolutionSummary.modelResolutionSummary3")}</dt>
          <dd className={sx(styles.modelValue)}>{props.agentProvenance.agentName}</dd>
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary4")}</dt>
          <dd className={sx(styles.modelValue)} title={props.agentProvenance.agentContentHash}>
            {props.agentProvenance.agentContentHash.slice(0, 12)}
          </dd>
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary5")}</dt>
          <dd className={sx(styles.modelReason)}>
            {props.agentProvenance.permission.source === "delegation-policy" ? i18n.t("session:modelResolutionSummary.modelResolutionSummary6")
              : props.agentProvenance.permission.source === "agent-ceiling" ? i18n.t("session:modelResolutionSummary.modelResolutionSummary7")
              : props.agentProvenance.permission.source === "agent-autonomy" ? i18n.t("session:modelResolutionSummary.modelResolutionSummary8") : i18n.t("session:modelResolutionSummary.modelResolutionSummary9")}
            {props.agentProvenance.permission.source === "agent-ceiling"
              ? ` · ${props.agentProvenance.permission.agentLimit}` : null}
            {props.agentProvenance.permission.support === "instructed" ? i18n.t("session:modelResolutionSummary.modelResolutionSummary10") : ""}
          </dd>
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary11")}</dt>
          <dd className={sx(styles.modelReason)}>
            {props.agentProvenance.instructions.status === "configured" ? i18n.t("session:modelResolutionSummary.modelResolutionSummary12")
              : props.agentProvenance.instructions.status === "retained-session" ? i18n.t("session:modelResolutionSummary.modelResolutionSummary13")
              : i18n.t("session:modelResolutionSummary.modelResolutionSummary14")}
          </dd>
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary15")}</dt>
          <dd className={sx(styles.modelReason)}>{formatAgentPermissions(props.agentProvenance)}</dd>
          {props.agentProvenance.effort && props.agentProvenance.effort !== props.actual?.modelInfo?.effort ? (
            <>
              <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary16")}</dt>
              <dd className={sx(styles.modelValue)}>{props.agentProvenance.effort}</dd>
            </>
          ) : null}
        </>
      ) : null}
      {showModelFacts ? (
        <>
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary17")}</dt>
          <dd
            className={sx(styles.modelValue)}
            title={actualLabel ?? undefined}
          >
            {actualLabel ?? i18n.t("session:modelResolutionSummary.modelResolutionSummary18")}
          </dd>
        </>
      ) : null}
      {props.actual?.modelExecution ? (
        <>
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary19")}</dt>
          <dd className={sx(styles.modelValue)}>{toHumanModelName({ model: props.actual.modelExecution.requestedModel })}</dd>
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary20")}</dt>
          <dd className={sx(styles.modelReason)}>{props.actual.modelExecution.reason}</dd>
        </>
      ) : null}
      {props.resolution ? (
        <>
          {showRoutedTarget ? (
            <>
              <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary21")}</dt>
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
              <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary22")}</dt>
              <dd className={sx(styles.modelSource)}>
                {[props.resolution.taskClass, props.resolution.stance]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </>
          ) : null}
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary23")}</dt>
          <dd className={sx(styles.modelSource)}>
            {toSourceLabel(props.resolution.source)}
          </dd>
          {props.resolution.ruleReason ? (
            <>
              <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary24")}</dt>
              <dd className={sx(styles.modelReason)}>
                {props.resolution.ruleReason}
              </dd>
            </>
          ) : null}
          <dt className={sx(styles.muted)}>{i18n.t("session:modelResolutionSummary.modelResolutionSummary25")}</dt>
          <dd className={sx(styles.modelReason)}>
            {props.resolution.rationale}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
