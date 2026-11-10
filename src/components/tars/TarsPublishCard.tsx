import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { GitPullRequestDraft } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button, Input } from "@/components/ui";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { ToggleGroup } from "@/components/aui/components/ToggleGroup";
import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/aui/components/Badge";
import { IconTile, iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { Kbd } from "@/components/aui/components/Kbd";
import { NativeSelect } from "@/components/aui/components/NativeSelect";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import {
  parseTarsCommitSubject, tarsDefaultCommitSubject, withTarsCommitType, TARS_COMMIT_TYPES, TARS_PUBLISH_COMMIT_MESSAGE_MAX_CHARS,
  TARS_PUBLISH_TITLE_MAX_CHARS, type TarsCommitType, type TarsPublishPreview, type TarsPublishSource,
} from "@/lib/tars/publication";
import { tarsPublishContinuesFrom } from "@/lib/tars/publish-model";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";
import { tarsPublishStyles as publishStyles } from "./tars-publish.styles";
import { TarsWorkChip } from "./TarsRecord";

export interface TarsPublishWords { commitMessage: string; title: string }

/** `loading` until the host read the workspace; `failed` when it could not. */
export type TarsPublishPreviewState = "loading" | "ready" | "failed";

export interface TarsPublishCardProps {
  /** The card's identity: the proposal's request id, or the click card's. */
  id: string;
  row: TarsResponsibility;
  preview: TarsPublishPreview | null;
  previewState: TarsPublishPreviewState;
  /** Words to start from, such as a retry repeating its last attempt; otherwise a Conventional Commit subject from the title. */
  initial?: TarsPublishWords | null;
  /** The confirmation is being sent; nothing can be pressed twice. */
  busy?: boolean;
  /** A translated failure of the last confirmation. */
  error?: string | null;
  /** A card the user opened takes focus on its commit message; a proposal never takes focus by itself. */
  autoFocus?: boolean;
  /** Shown under the description: the user's own rule that matched this proposal, when the host found one. */
  notice?: ReactNode;
  /** Absent: the card shows what it would publish without the button. */
  onPublish?: (words: TarsPublishWords, source: TarsPublishSource) => void;
  /** Decline and Esc: nothing is published. */
  onDecline: () => void;
}

/**
 * The card's keys, scoped to the card: Enter publishes from the card or one
 * of its text fields, Esc declines. A focused button, link, select or the
 * body keeps its own Enter, so Enter on Decline declines.
 */
export function tarsPublishCardKey(event: Pick<KeyboardEvent<HTMLElement>, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat" | "target"> & { nativeEvent?: { isComposing?: boolean } }):
  "publish" | "decline" | null {
  if (event.altKey || event.shiftKey || event.nativeEvent?.isComposing) return null;
  if (event.key === "Escape" && !event.ctrlKey && !event.metaKey) return "decline";
  if (event.key !== "Enter" || event.repeat) return null;
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (target?.closest?.("button, a, select, summary, textarea, [data-tars-publish-body]")) return null;
  return "publish";
}

/**
 * One confirmation to commit, push and open a draft pull request for one
 * completed responsibility. It says where the work goes (repository, base
 * and head branch, changed files), lets the user edit the commit message and
 * the pull request title, and shows the body the host built from the frozen
 * report. Enter publishes, Esc declines; there is no standing permission.
 */
export function TarsPublishCard({ id, row, preview, previewState, initial, busy = false, error, autoFocus = false, onPublish, onDecline, notice }: TarsPublishCardProps) {
  const { t } = useTranslation(["shell"]);
  const titleId = useId();
  const subtitleId = useId();
  const hintId = useId();
  const messageRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [commitMessage, setCommitMessage] = useState(() => initial?.commitMessage ?? tarsDefaultCommitSubject(row.title));
  const [title, setTitle] = useState(() => initial?.title ?? tarsDefaultCommitSubject(row.title));
  const [missing, setMissing] = useState(false);
  // The body reads as its rendered markdown by default; the raw text is one toggle away and is exactly what is sent.
  const [bodyView, setBodyView] = useState<"preview" | "raw">("preview");
  useEffect(() => { if (autoFocus) messageRef.current?.focus(); }, [autoFocus]);
  const reason = previewState === "ready" ? preview?.reason ?? null : null;
  const ready = previewState === "ready" && preview !== null && reason === null;
  const type = parseTarsCommitSubject(commitMessage)?.type ?? "";
  const continuesFrom = tarsPublishContinuesFrom(row);
  const publish = (source: TarsPublishSource) => {
    if (!ready || busy || !onPublish) return;
    const words = { commitMessage: commitMessage.trim(), title: title.replace(/\s+/g, " ").trim() };
    if (!words.commitMessage || !words.title) {
      setMissing(true);
      (words.commitMessage ? titleRef : messageRef).current?.focus();
      return;
    }
    if (missing) setMissing(false);
    onPublish(words, source);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const action = tarsPublishCardKey(event);
    if (!action) return;
    // Keeps the view's own Esc (closing the side view) and a field's Enter from acting on the same press.
    event.preventDefault();
    event.stopPropagation();
    if (action === "decline") onDecline(); else publish("key");
  };
  const changeType = (next: TarsCommitType) => {
    setCommitMessage((current) => withTarsCommitType(current, next));
    // The title follows when it carried the same type.
    setTitle((current) => parseTarsCommitSubject(current)?.type === type ? withTarsCommitType(current, next) : current);
  };
  const unknown = t("shell:tars.publish.card.unknown");
  const loadingText = previewState === "loading" ? t("shell:tars.publish.card.loading") : unknown;
  const rows = [
    { key: "repository", label: t("shell:tars.publish.card.rows.repository"), value: preview?.repository ?? loadingText, machine: true },
    { key: "base", label: t("shell:tars.publish.card.rows.base"), value: preview?.base ?? loadingText, machine: true },
    { key: "head", label: t("shell:tars.publish.card.rows.head"), value: preview?.head ?? loadingText, machine: true },
    { key: "changedFiles", label: t("shell:tars.publish.card.rows.changedFiles"),
      value: preview?.changedFiles != null ? t("shell:tars.publish.card.changedFiles", { count: preview.changedFiles }) : loadingText, machine: false },
    continuesFrom ? { key: "resume", label: t("shell:tars.publish.card.rows.resume"), value: t(`shell:tars.publish.card.resumeStep.${continuesFrom}`), machine: false } : null,
  ].filter((entry): entry is { key: string; label: string; value: string; machine: boolean } => Boolean(entry));
  const state = busy ? "busy" : previewState === "ready" ? (reason ? "ineligible" : "waiting") : previewState;
  return <section {...{ "data-tars-publish-card": id, "data-tars-publish-state": state, "data-tars-publish-responsibility": row.id }}
    role="group" tabIndex={-1} aria-labelledby={`${titleId} ${subtitleId}`} aria-describedby={hintId} aria-busy={busy || undefined}
    className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown} data-tars-decision-risk="irreversible">
    <div className={sx(styles.confirmHeader)}>
      <IconTile size="sm" tone="danger" xstyle={styles.icon}><GitPullRequestDraft aria-hidden size={iconTileGlyphSizes.sm} /></IconTile>
      <div className={sx(styles.heading)}>
        <p id={titleId} className={sx(styles.title)}>{t("shell:tars.publish.card.title")}</p>
        {/* The work, as the chip every decision card names it with. */}
        <div id={subtitleId} className={sx(styles.subtitle)}><TarsWorkChip title={row.title} responsibilityId={row.id} /></div>
      </div>
      {/* The buttons say the card waits; the tags say only what they do not: a draft, and that it can't be undone. */}
      <div className={sx(styles.tags)}>
        <Badge size="md" variant="outlined" data-tars-publish-draft-tag="">{t("shell:tars.publish.card.draftTag")}</Badge>
        <Badge size="md" tone="danger" variant="outlined" data-tars-decision-risk-tag="">{t("shell:tars.publish.card.risk")}</Badge>
      </div>
    </div>
    <p className={sx(styles.detail)}>{t("shell:tars.publish.card.description")}</p>
    {notice}
    <dl className={sx(agentSurface.well, styles.rows)} aria-label={t("shell:tars.publish.card.details")} data-tars-publish-rows={rows.map((entry) => entry.key).join(",")}>
      {rows.map((entry) => <div key={entry.key} className={sx(styles.row)} data-tars-publish-row={entry.key}>
        <dt className={sx(styles.rowLabel)}>{entry.label}</dt>
        <dd className={sx(styles.rowValue, entry.machine && publishStyles.machine)}>{entry.value}</dd>
      </div>)}
    </dl>
    {previewState === "failed" ? <p className={sx(styles.error)} role="alert" data-tars-publish-reason="previewFailed">{t("shell:tars.publish.card.previewFailed")}</p> : null}
    {reason ? <p className={sx(styles.error)} role="alert" data-tars-publish-reason={reason}>{t(`shell:tars.publish.reason.${reason}`)}</p> : null}
    {reason || previewState === "failed" ? null : <div className={sx(publishStyles.fields)}>
      <div className={sx(publishStyles.commitLine)}>
        <label className={sx(publishStyles.field, publishStyles.typeField)}>
          <span className={sx(publishStyles.label)}>{t("shell:tars.publish.card.rows.commitType")}</span>
          <NativeSelect controlOnly size="md" value={type} disabled={busy} data-tars-publish-type=""
            onChange={(event) => changeType(event.target.value as TarsCommitType)}
            options={[...(type ? [] : [{ value: "", label: "—" }]), ...TARS_COMMIT_TYPES.map((value) => ({ value, label: value }))]} />
        </label>
        <label className={sx(publishStyles.field, publishStyles.grow)}>
          <span className={sx(publishStyles.label)}>{t("shell:tars.publish.card.rows.commitMessage")}</span>
          <Input ref={messageRef} value={commitMessage} disabled={busy} maxLength={TARS_PUBLISH_COMMIT_MESSAGE_MAX_CHARS} spellCheck={false}
            aria-invalid={missing && !commitMessage.trim() ? true : undefined} data-tars-publish-message=""
            onChange={(event) => setCommitMessage(event.target.value)} />
        </label>
      </div>
      <label className={sx(publishStyles.field)}>
        <span className={sx(publishStyles.label)}>{t("shell:tars.publish.card.rows.title")}</span>
        <Input ref={titleRef} value={title} disabled={busy} maxLength={TARS_PUBLISH_TITLE_MAX_CHARS} spellCheck={false}
          aria-invalid={missing && !title.trim() ? true : undefined} data-tars-publish-title=""
          onChange={(event) => setTitle(event.target.value)} />
      </label>
      {missing ? <p className={sx(styles.error)} role="alert">{t("shell:tars.publish.card.required")}</p> : null}
      <div className={sx(publishStyles.field)}>
        <div className={sx(publishStyles.bodyHeader)}>
          <span id={`${titleId}-body`} className={sx(publishStyles.label)}>{t("shell:tars.publish.card.rows.body")}</span>
          {/* How to read the body; what is sent is the same text either way. */}
          <ToggleGroup density="compact" aria-label={t("shell:tars.publish.card.bodyView.label")} value={[bodyView]} data-tars-publish-body-toggle=""
            onValueChange={(next) => { const view = next[0]; if (view === "preview" || view === "raw") setBodyView(view); }}
            options={[{ value: "preview", label: t("shell:tars.publish.card.bodyView.preview") }, { value: "raw", label: t("shell:tars.publish.card.bodyView.raw") }]} />
        </div>
        {/* Focusable so a keyboard can scroll it; it keeps its own Enter. */}
        {previewState === "loading" || bodyView === "raw" || !preview
          ? <pre role="region" tabIndex={0} aria-labelledby={`${titleId}-body`} className={sx(publishStyles.body, publishStyles.bodyRaw, focusRing.ring)}
            data-tars-publish-body="" data-tars-publish-body-view="raw">
            {previewState === "loading" ? t("shell:tars.publish.card.loading") : preview?.body ?? ""}</pre>
          // The shared markdown renderer, as Tars's replies read; links in it are not workspace files.
          : <div role="region" tabIndex={0} aria-labelledby={`${titleId}-body`} className={sx(publishStyles.body, focusRing.ring)}
            data-tars-publish-body="" data-tars-publish-body-view="preview">
            <MessageResponse fileLinkContext="none">{preview.body}</MessageResponse></div>}
        <p className={sx(publishStyles.hint)}>{t("shell:tars.publish.card.bodyHint")}</p>
      </div>
    </div>}
    <div className={sx(styles.footer)}>
      <VisuallyHidden id={hintId}>{t("shell:tars.publish.card.keysHint")}</VisuallyHidden>
      <div className={sx(styles.footerActions)}>
        <Button type="button" size="2xs" variant="ghost" aria-keyshortcuts="Escape" disabled={busy} data-tars-publish-decline="" onClick={onDecline}>
          {t("shell:tars.publish.card.decline")}<span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.escKey")}</Kbd></span>
        </Button>
        {reason || previewState === "failed" || !onPublish ? null
          // The card's main action, so the primary button; it can't be undone, so it wears the danger tone. Enter on this card the user
          // opened is its only default, as before.
          : <AuiButton type="button" size="xs" variant="primary" tone="danger" aria-keyshortcuts="Enter" disabled={!ready || busy} data-tars-publish-confirm=""
            data-tars-decision-tone="danger" onClick={() => publish("click")}>
            {t("shell:tars.publish.card.publish")}<span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.enterKey")}</Kbd></span>
          </AuiButton>}
      </div>
    </div>
    {error ? <p className={sx(styles.error)} role="alert">{error}</p> : null}
  </section>;
}
