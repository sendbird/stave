import { i18n, useTranslation } from "@/i18n";
import { ArrowLeft, MessageCircleQuestion, RefreshCw } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { ToggleGroup } from "@/components/ads/components/ToggleGroup";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import type { I18nKey } from "@/i18n";
import type { ReviewScope, ReviewScopeKind, ReviewScopeLimit } from "@/lib/review/review-scope";
import type { ReviewData } from "./useReviewData";
import { reviewStyles as styles } from "./review.styles";

const SCOPE_LABEL_KEYS = {
  turn: "review:scope.turn",
  stage: "review:scope.stage",
  branch: "review:scope.branch",
  uncommitted: "review:scope.uncommitted",
} as const satisfies Record<ReviewScopeKind, I18nKey>;

const LIMIT_KEYS = {
  "reported-edits-only": "review:limits.reportedEditsOnly",
  "later-edits-merge": "review:limits.laterEditsMerge",
  "no-recorded-paths": "review:limits.noRecordedPaths",
  "paths-truncated": "review:limits.pathsTruncated",
} as const satisfies Record<ReviewScopeLimit, I18nKey>;

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : "");

/** What the scope compares, in one line: its base and the revision it reads now. */
function describeRevision(scope: ReviewScope, data: ReviewData | null): string {
  if (scope.kind === "turn") return i18n.t("review:revision.turn");
  if (!data) return i18n.t(SCOPE_LABEL_KEYS[scope.kind]);
  const values = { base: short(data.baseSha), head: short(data.headSha), ref: data.baseRef ?? "" };
  if (scope.kind === "stage") return i18n.t("review:revision.stage", values);
  if (scope.kind === "branch") return i18n.t("review:revision.branch", values);
  return i18n.t("review:revision.uncommitted", values);
}

export function ReviewScopeBar(props: {
  scope: ReviewScope;
  available: readonly ReviewScopeKind[];
  data: ReviewData | null;
  onScope: (kind: ReviewScopeKind) => void;
  onRefresh: () => void;
  /** Shows the task's conversation again; Review keeps its scope and read files. */
  onConversation: () => void;
  /** Opens the side question over Review; absent when the task's provider has none. */
  onSideQuestion?: () => void;
}) {
  useTranslation();
  const shortcut = useShortcutHint("task.toggle-review");
  const sideQuestionShortcut = useShortcutHint("view.side-question");
  return (
    <div className={sx(styles.scopeBar)}>
      <Tooltip content={i18n.t("review:mode.backToConversation")} shortcut={shortcut}>
        <Button variant="quiet" size="xs" data-testid="review-back-to-conversation" onClick={props.onConversation}>
          <ArrowLeft aria-hidden />
          {i18n.t("review:mode.conversation")}
        </Button>
      </Tooltip>
      <ToggleGroup
        aria-label={i18n.t("review:scope.label")}
        density="compact"
        value={[props.scope.kind]}
        items={props.available.map((kind) => ({ value: kind, label: i18n.t(SCOPE_LABEL_KEYS[kind]) }))}
        onValueChange={(next) => {
          const kind = next[0] as ReviewScopeKind | undefined;
          if (kind && kind !== props.scope.kind) props.onScope(kind);
        }}
      />
      <span className={sx(styles.scopeRevision)} data-testid="review-revision">{describeRevision(props.scope, props.data)}</span>
      <Button variant="quiet" size="xs" iconOnly aria-label={i18n.t("review:scope.refresh")} onClick={props.onRefresh}>
        <RefreshCw aria-hidden />
      </Button>
      {props.onSideQuestion ? (
        <Tooltip content={i18n.t("session:sideChat.hint")} shortcut={sideQuestionShortcut}>
          <Button variant="quiet" size="xs" data-testid="review-side-question" onClick={props.onSideQuestion}>
            <MessageCircleQuestion aria-hidden />
            {i18n.t("session:sideChat.title")}
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
}

/** What the scope cannot show, said where the files are listed. */
export function ReviewScopeLimits(props: { limits: readonly ReviewScopeLimit[] }) {
  useTranslation();
  if (!props.limits.length) return null;
  return (
    <ul className={sx(styles.limits)} aria-label={i18n.t("review:limits.label")}>
      {props.limits.map((limit) => <li key={limit}>{i18n.t(LIMIT_KEYS[limit])}</li>)}
    </ul>
  );
}
