import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Badge, Button, Input, Loader, Textarea, toast } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { i18n, useTranslation, type I18nKey } from "@/i18n";
import { formatList } from "@/i18n/format";
import {
  GITHUB_PR_MANAGE_LIMITS,
  normalizeGitHubReviewerHandle,
  type GitHubPrManageDetails,
  type GitHubPrReviewerCandidate,
} from "@/lib/github-pr-manage";
import { openPrStyles } from "../top-bar-open-pr.styles";
import { InlineNoticeBanner } from "./create-pr-dialog-panels";
import { planPullRequestEdit, type PullRequestEditSnapshot } from "./pull-request-manage-items";
import { describePullRequestManageFailure, requestPullRequestManage } from "./use-pull-request-manage";

const REVIEW_STATE_KEYS = {
  APPROVED: "sourceControl:prManage.editDialog.reviewState.approved",
  CHANGES_REQUESTED: "sourceControl:prManage.editDialog.reviewState.changesRequested",
  COMMENTED: "sourceControl:prManage.editDialog.reviewState.commented",
  DISMISSED: "sourceControl:prManage.editDialog.reviewState.dismissed",
  PENDING: "sourceControl:prManage.editDialog.reviewState.pending",
} as const satisfies Record<string, I18nKey>;
const reviewStateKey = (state: string) =>
  Object.hasOwn(REVIEW_STATE_KEYS, state) ? REVIEW_STATE_KEYS[state as keyof typeof REVIEW_STATE_KEYS] : null;

const SEARCH_DELAY_MS = 250;
const sameHandle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const snapshot = (details: GitHubPrManageDetails): PullRequestEditSnapshot => ({
  title: details.title,
  body: details.body,
  reviewers: details.reviewRequests.map((reviewer) => reviewer.handle),
});

/**
 * Edits one pull request's title, description and requested reviewers.
 *
 * It reads the pull request when it opens and again right before saving. Only
 * changed fields are sent; when the title or description changed on GitHub in
 * the meantime it warns first and keeps what was typed. A failed save keeps
 * the input and shows the reason inline. Mounted outside menus by its owner.
 */
export function PullRequestEditDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prUrl: string;
  cwd?: string;
  /** Runs after every save attempt that reached GitHub, so the owner re-reads the status. */
  onSaved?: () => void;
}) {
  const { t } = useTranslation("sourceControl");
  const { open, prUrl, cwd } = props;
  const [baseline, setBaseline] = useState<GitHubPrManageDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ title: string | null; body: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<GitHubPrReviewerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestionsUnavailable, setSuggestionsUnavailable] = useState(false);
  const savingRef = useRef(false);
  const loadIdRef = useRef(0);
  const searchIdRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadIdRef.current;
    setBaseline(null);
    setLoadError(null);
    setError(null);
    setConflict(null);
    const result = await requestPullRequestManage({ action: "details", prUrl, cwd });
    if (loadIdRef.current !== id) return;
    if (!result.ok || result.kind !== "details") {
      setLoadError(describePullRequestManageFailure(result.ok ? { reason: "invalid-response" } : result));
      return;
    }
    const next = snapshot(result.details);
    setBaseline(result.details);
    setTitle(next.title);
    setBody(next.body);
    setReviewers([...next.reviewers]);
  }, [prUrl, cwd]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    void load();
    return () => { loadIdRef.current += 1; };
  }, [open, load]);

  // Suggestions follow the search box; a failed read leaves typing a login as the way in.
  useEffect(() => {
    if (!open) return;
    const id = ++searchIdRef.current;
    const query = search.trim().replace(/^@/, "");
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await requestPullRequestManage({
        action: "reviewer-candidates", prUrl, cwd, ...(query ? { query: query.slice(0, GITHUB_PR_MANAGE_LIMITS.maxQueryChars) } : {}),
      });
      if (searchIdRef.current !== id) return;
      setSearching(false);
      const listed = result.ok && result.kind === "reviewer-candidates" ? result : null;
      setCandidates(listed?.candidates ?? []);
      setSuggestionsUnavailable(!listed || Boolean(listed.unavailable));
    }, query ? SEARCH_DELAY_MS : 0);
    return () => { clearTimeout(timer); searchIdRef.current += 1; };
  }, [open, prUrl, cwd, search]);

  const close = (next: boolean) => {
    if (savingRef.current) return;
    props.onOpenChange(next);
  };

  const addReviewer = (handle: string) => {
    setReviewers((current) => current.some((other) => sameHandle(other, handle)) ? current : [...current, handle]);
    setSearch("");
  };

  const typedHandle = normalizeGitHubReviewerHandle(search);
  const author = baseline?.authorLogin ?? "";
  const offered = candidates.filter((candidate) => !reviewers.some((handle) => sameHandle(handle, candidate.login)));
  const canRequestTyped = typedHandle !== null
    && !sameHandle(typedHandle, author)
    && !reviewers.some((handle) => sameHandle(handle, typedHandle))
    && !offered.some((candidate) => sameHandle(candidate.login, typedHandle));

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // Enter in the search box requests a reviewer; it must not submit the form.
    event.preventDefault();
    const match = typedHandle ? offered.find((candidate) => sameHandle(candidate.login, typedHandle)) : undefined;
    if (match) addReviewer(match.login);
    else if (canRequestTyped && typedHandle) addReviewer(typedHandle);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current || !baseline) return;
    if (!title.trim()) {
      setError(t("prManage.editDialog.titleRequired"));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    let reachedGitHub = false;
    try {
      const fresh = await requestPullRequestManage({ action: "details", prUrl, cwd });
      if (!fresh.ok || fresh.kind !== "details") {
        setError(describePullRequestManageFailure(fresh.ok ? { reason: "invalid-response" } : fresh));
        return;
      }
      const remote = snapshot(fresh.details);
      const plan = planPullRequestEdit({ baseline: snapshot(baseline), draft: { title, body, reviewers }, remote });
      // From here the dialog compares against what GitHub has now.
      setBaseline(fresh.details);
      setTitle(plan.draft.title);
      setBody(plan.draft.body);
      setReviewers(plan.draft.reviewers);
      if (plan.conflict.title || plan.conflict.body) {
        setConflict({ title: plan.conflict.title ? remote.title : null, body: plan.conflict.body });
        return;
      }
      setConflict(null);

      if (plan.edit) {
        reachedGitHub = true;
        const edited = await requestPullRequestManage({ action: "edit", prUrl, cwd, ...plan.edit });
        if (!edited.ok) {
          setError(describePullRequestManageFailure(edited));
          return;
        }
      }
      if (plan.reviewers.add.length || plan.reviewers.remove.length) {
        reachedGitHub = true;
        const requested = await requestPullRequestManage({ action: "reviewers", prUrl, cwd, ...plan.reviewers });
        if (!requested.ok) {
          const reason = describePullRequestManageFailure(requested);
          setError(plan.edit ? t("prManage.editDialog.reviewersNotSaved", { reason }) : reason);
          // Whatever did apply is the new starting point; the reviewers typed stay as they are.
          const saved = await requestPullRequestManage({ action: "details", prUrl, cwd });
          if (saved.ok && saved.kind === "details") setBaseline(saved.details);
          return;
        }
      }
      if (reachedGitHub) toast.success(t("prManage.toast.saved"));
      savingRef.current = false;
      props.onOpenChange(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
      // Re-read after every attempt that wrote: part of it may have applied.
      if (reachedGitHub) props.onSaved?.();
    }
  };

  const latestReviews = (baseline?.latestReviews ?? []).map((review) => {
    const stateKey = reviewStateKey(review.state);
    return t("prManage.editDialog.reviewEntry", {
      login: review.login,
      state: stateKey ? i18n.t(stateKey) : review.state.toLowerCase(),
    });
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent xstyle={openPrStyles.dialogSurface} showCloseButton={!saving} data-pr-edit-dialog="">
        <DialogHeader>
          <DialogTitle>
            {baseline ? t("prManage.editDialog.title", { number: baseline.number }) : t("prManage.editDialog.titleUnknown")}
          </DialogTitle>
          <DialogDescription>{t("prManage.editDialog.description")}</DialogDescription>
        </DialogHeader>

        {!baseline ? (
          loadError ? (
            <div className={sx(openPrStyles.field)}>
              <p className={sx(openPrStyles.fieldError)} role="alert">{loadError}</p>
              <div><Button type="button" size="sm" variant="secondary" onClick={() => void load()}>{t("prManage.editDialog.retry")}</Button></div>
            </div>
          ) : (
            <p className={sx(styles.status)} role="status">
              <Loader aria-hidden size="xs" variant="verify" />
              {t("prManage.editDialog.loading")}
            </p>
          )
        ) : (
          <form className={sx(openPrStyles.form)} onSubmit={(event) => void save(event)}>
            <div className={sx(openPrStyles.formBody, styles.scroll)}>
              {conflict ? (
                <InlineNoticeBanner
                  notice={{
                    tone: "warning",
                    title: t("prManage.editDialog.remoteChanged"),
                    description: [
                      conflict.title !== null ? t("prManage.editDialog.remoteTitle", { title: conflict.title }) : null,
                      conflict.body ? t("prManage.editDialog.remoteBody") : null,
                    ].filter(Boolean).join(" "),
                  }}
                />
              ) : null}

              <div className={sx(openPrStyles.field)}>
                <label className={sx(openPrStyles.settingLabel)} htmlFor="pr-edit-title">{t("prManage.editDialog.titleLabel")}</label>
                <Input
                  autoFocus
                  id="pr-edit-title"
                  xstyle={openPrStyles.textInput}
                  maxLength={GITHUB_PR_MANAGE_LIMITS.maxTitleChars}
                  value={title}
                  disabled={saving}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className={sx(openPrStyles.field)}>
                <label className={sx(openPrStyles.settingLabel)} htmlFor="pr-edit-body">{t("prManage.editDialog.bodyLabel")}</label>
                <Textarea
                  id="pr-edit-body"
                  xstyle={openPrStyles.bodyTextarea}
                  rows={8}
                  wrap="soft"
                  maxLength={GITHUB_PR_MANAGE_LIMITS.maxBodyChars}
                  value={body}
                  disabled={saving}
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>

              <div className={sx(openPrStyles.field)} role="group" aria-labelledby="pr-edit-reviewers-label">
                <span id="pr-edit-reviewers-label" className={sx(openPrStyles.settingLabel)}>{t("prManage.editDialog.reviewersLabel")}</span>
                {reviewers.length ? (
                  <ul className={sx(styles.chips)}>
                    {reviewers.map((handle) => (
                      <li key={handle} className={sx(styles.chip)} data-pr-reviewer={handle}>
                        <span className={sx(styles.chipText)}>@{handle}</span>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={saving}
                          aria-label={t("prManage.editDialog.removeReviewer", { handle })}
                          onClick={() => setReviewers((current) => current.filter((other) => other !== handle))}
                        >
                          <X aria-hidden className={sx(styles.chipIcon)} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={sx(openPrStyles.settingHint)}>{t("prManage.editDialog.noReviewers")}</p>
                )}
                {latestReviews.length ? (
                  <p className={sx(openPrStyles.settingHint)}>
                    {t("prManage.editDialog.latestReviews", { reviews: formatList(latestReviews, { style: "short", type: "unit" }) })}
                  </p>
                ) : null}

                <Input
                  type="search"
                  xstyle={openPrStyles.textInput}
                  aria-label={t("prManage.editDialog.searchLabel")}
                  placeholder={t("prManage.editDialog.searchPlaceholder")}
                  maxLength={GITHUB_PR_MANAGE_LIMITS.maxQueryChars}
                  autoComplete="off"
                  spellCheck={false}
                  value={search}
                  disabled={saving}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                />
                <ul className={sx(styles.candidates)} aria-label={t("prManage.editDialog.suggestionsLabel")} aria-busy={searching}>
                  {canRequestTyped && typedHandle ? (
                    <li>
                      <Button type="button" variant="ghost" layout="host" xstyle={styles.candidate} disabled={saving} data-pr-reviewer-typed={typedHandle} onClick={() => addReviewer(typedHandle)}>
                        <span className={sx(styles.candidateLogin)}>{t("prManage.editDialog.requestTyped", { handle: typedHandle })}</span>
                      </Button>
                    </li>
                  ) : null}
                  {offered.map((candidate) => (
                    <li key={candidate.login}>
                      <Button type="button" variant="ghost" layout="host" xstyle={styles.candidate} disabled={saving} data-pr-reviewer-candidate={candidate.login} onClick={() => addReviewer(candidate.login)}>
                        <span className={sx(styles.candidateLogin)}>@{candidate.login}</span>
                        {candidate.name ? <span className={sx(styles.candidateName)}>{candidate.name}</span> : null}
                        {candidate.suggested ? <Badge variant="outline">{t("prManage.editDialog.suggested")}</Badge> : null}
                      </Button>
                    </li>
                  ))}
                </ul>
                {searching ? (
                  <p className={sx(styles.status)} role="status">
                    <Loader aria-hidden size="xs" variant="verify" />
                    {t("prManage.editDialog.searching")}
                  </p>
                ) : suggestionsUnavailable ? (
                  <p className={sx(openPrStyles.settingHint)} role="status">{t("prManage.editDialog.suggestionsUnavailable")}</p>
                ) : !offered.length && !canRequestTyped && search.trim() ? (
                  <p className={sx(openPrStyles.settingHint)} role="status">{t("prManage.editDialog.noMatches")}</p>
                ) : null}
              </div>

              {error ? <p className={sx(openPrStyles.fieldError, styles.wrap)} role="alert">{error}</p> : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => close(false)}>{i18n.t("common:actions.cancel")}</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader aria-hidden size="xs" variant="persist" /> : null}
                {saving ? t("prManage.editDialog.saving") : conflict ? t("prManage.editDialog.overwrite") : t("prManage.editDialog.save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const styles = stylex.create({
  scroll: { minBlockSize: 0, overflowY: "auto", paddingInlineEnd: vars["--aui-space-4"] },
  status: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    margin: 0,
  },
  wrap: { margin: 0, overflowWrap: "anywhere" },
  chips: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-4"], listStyle: "none", margin: 0, minWidth: 0, padding: 0 },
  chip: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "inline-flex",
    gap: vars["--aui-space-2"],
    maxInlineSize: "100%",
    minWidth: 0,
    paddingInlineStart: vars["--aui-space-8"],
  },
  chipText: { fontSize: vars["--aui-font-size-caption"], minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chipIcon: { blockSize: vars["--aui-space-12"], flexShrink: 0, inlineSize: vars["--aui-space-12"] },
  candidates: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    listStyle: "none",
    margin: 0,
    maxBlockSize: "10rem",
    minWidth: 0,
    overflowY: "auto",
    padding: 0,
  },
  candidate: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    minBlockSize: vars["--aui-control-height-sm"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
    textAlign: "start",
  },
  candidateLogin: { flexShrink: 0, fontSize: vars["--aui-font-size-body"], fontWeight: vars["--aui-font-weight-medium"] },
  candidateName: {
    color: vars["--aui-color-text-muted"],
    flex: 1,
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
