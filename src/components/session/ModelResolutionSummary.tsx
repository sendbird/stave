import { sx } from "../ads/utils/stylex";
import { resultStyles as styles } from "./result-review.styles";
import type {
  AutoRoutingModelResolution,
  ProviderId,
} from "@/lib/providers/provider.types";
import { getTurnModelInfoParts } from "@/lib/providers/turn-model-info";
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
}

/**
 * `Claude Code · Claude Fable 5.1 · High`. The effort rides beside the model
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
  return [toProviderLabel(actual.providerId), parts.name, ...parts.details]
    .filter(Boolean)
    .join(" · ");
}

/** Recorded model facts only; callers may reuse this in live or saved runs. */
export function ModelResolutionSummary(props: {
  actual: ActualRunModel | null;
  resolution?: AutoRoutingModelResolution;
}) {
  if (!props.actual && !props.resolution) {
    return (
      <p className={sx(styles.caption)}>Actual model has not been reported</p>
    );
  }
  const actualLabel = props.actual ? formatActualRunModel(props.actual) : null;

  return (
    <dl className={sx(styles.modelFacts)}>
      <dt className={sx(styles.muted)}>Run model</dt>
      <dd className={sx(styles.modelValue)} title={actualLabel ?? undefined}>
        {actualLabel ?? "Not reported"}
      </dd>
      {props.resolution ? (
        <>
          <dt className={sx(styles.muted)}>Routed target</dt>
          <dd
            className={sx(styles.modelValue)}
            title={`${toProviderLabel(props.resolution.selectedProviderId)} · ${props.resolution.selectedModel}`}
          >
            {toProviderLabel(props.resolution.selectedProviderId)} ·{" "}
            {props.resolution.selectedModel}
          </dd>
          <dt className={sx(styles.muted)}>Source</dt>
          <dd className={sx(styles.modelSource)}>
            {toSourceLabel(props.resolution.source)}
          </dd>
          <dt className={sx(styles.muted)}>Reason</dt>
          <dd className={sx(styles.modelReason)}>
            {props.resolution.rationale}
          </dd>
        </>
      ) : null}
    </dl>
  );
}
