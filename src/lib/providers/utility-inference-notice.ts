import type {
  UtilityInferenceFeature,
  UtilityInferenceMetadata,
} from "./utility-inference";
import { createUnavailableUtilityInferenceMetadata } from "./utility-inference";

export const UTILITY_INFERENCE_NOTICE_EVENT =
  "stave:utility-inference-notice";

export type UtilityInferenceNoticeDetail = {
  feature: UtilityInferenceFeature;
  ok: boolean;
  utility: UtilityInferenceMetadata;
};

const reportedNoticeKeys = new Set<string>();

export function reportUtilityInferenceOutcome(
  detail: UtilityInferenceNoticeDetail,
) {
  if (detail.ok && !detail.utility.degraded) {
    return;
  }
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  ) {
    return;
  }
  const noticeKey = [
    detail.feature,
    detail.ok ? "fallback" : "unavailable",
    detail.utility.providerId ?? "none",
  ].join(":");
  if (reportedNoticeKeys.has(noticeKey)) {
    return;
  }
  reportedNoticeKeys.add(noticeKey);
  window.dispatchEvent(
    new CustomEvent<UtilityInferenceNoticeDetail>(
      UTILITY_INFERENCE_NOTICE_EVENT,
      { detail },
    ),
  );
}

export function reportUtilityInferenceError(args: {
  feature: UtilityInferenceFeature;
  error: unknown;
}) {
  reportUtilityInferenceOutcome({
    feature: args.feature,
    ok: false,
    utility: createUnavailableUtilityInferenceMetadata(
      args.error instanceof Error ? args.error.message : String(args.error),
    ),
  });
}
