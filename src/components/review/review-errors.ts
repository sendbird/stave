import { i18n } from "@/i18n";
import { ReviewReadError } from "./useReviewData";

/** A failed Review read in words; never the empty state. */
export function describeReviewReadError(error: unknown): string {
  if (!(error instanceof ReviewReadError)) return i18n.t("review:errors.failed");
  switch (error.reason) {
    case "no-workspace":
      return i18n.t("review:errors.noWorkspace");
    case "no-stage-start":
      return i18n.t("review:errors.noStageStart");
    case "unavailable":
      return i18n.t("review:errors.unavailable");
    case "outside":
      return i18n.t("review:errors.outside");
    case "changed":
      return i18n.t("review:errors.changed");
    case "too-large":
      return i18n.t("review:errors.tooLarge");
    case "failed":
      return error.detail ? i18n.t("review:errors.failedWithDetail", { detail: error.detail }) : i18n.t("review:errors.failed");
  }
}
