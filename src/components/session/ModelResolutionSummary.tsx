import { sx } from "../ads/utils/stylex";
import { resultStyles as styles } from "./result-review.styles";
import type { AutoRoutingModelResolution } from "@/lib/providers/provider.types";

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

/** Recorded model facts only; callers may reuse this in live or saved runs. */
export function ModelResolutionSummary(props: {
  actual: { providerId: string; model: string } | null;
  resolution?: AutoRoutingModelResolution;
}) {
  if (!props.actual && !props.resolution) {
    return (
      <p className={sx(styles.caption)}>Actual model has not been reported</p>
    );
  }

  return (
    <dl className={sx(styles.modelFacts)}>
      <dt className={sx(styles.muted)}>Run model</dt>
      <dd
        className={sx(styles.modelValue)}
        title={
          props.actual
            ? `${toProviderLabel(props.actual.providerId)} · ${props.actual.model}`
            : undefined
        }
      >
        {props.actual
          ? `${toProviderLabel(props.actual.providerId)} · ${props.actual.model}`
          : "Not reported"}
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
