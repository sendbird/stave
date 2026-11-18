import { Tooltip } from "@/components/aui/components/Tooltip";
import { useId, useState, type KeyboardEvent } from "react";
import { Eraser } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatList } from "@/i18n/format";
import { Button } from "@/components/ui";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { IconTile, iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { Kbd } from "@/components/aui/components/Kbd";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx, type StyleXValue } from "@/components/aui/utils/stylex";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { normalizeTarsClearScopes, type TarsClearRecord, type TarsClearScope, type TarsClearSource } from "@/lib/tars/clearing";
import type { TarsSuggestionsState } from "./use-tars-suggestions";
import { tarsPublishCardKey } from "./TarsPublishCard";
import { TarsRecordDetail, TarsRecordList, TarsRecordRow } from "./TarsRecord";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";
import { tarsClearStyles as clearStyles } from "./tars-clear.styles";

/**
 * What a clear of each scope would hide now, as the view counts it; `work` is
 * the unfinished work a Work reset would cancel, and `kept` the unfinished
 * work it would leave as it is (taken over, paused or publishing).
 */
export type TarsClearCounts = Record<TarsClearScope, number> & { kept: number };

/** What one clear did, in a list: "12 messages, 3 ended work items and 2 unfinished work items cancelled". */
function describeHidden(record: TarsClearRecord) {
  const parts = [
    record.hiddenMessages ? i18n.t("shell:tars.clear.hidden.conversation", { count: record.hiddenMessages }) : null,
    record.done?.length ? i18n.t("shell:tars.clear.hidden.done", { count: record.done.length }) : null,
    record.outputs?.length ? i18n.t("shell:tars.clear.hidden.outputs", { count: record.outputs.length }) : null,
    record.work?.cancelled.length ? i18n.t("shell:tars.clear.hidden.workStopped", { count: record.work.cancelled.length }) : null,
    record.work?.kept.length ? i18n.t("shell:tars.clear.hidden.workKept", { count: record.work.kept.length }) : null,
  ].filter((part): part is string => part !== null);
  // A confirmed proposal that found nothing left still closes, and says so.
  return parts.length ? formatList(parts) : i18n.t("shell:tars.clear.record.nothing");
}

/**
 * One saved clear as a record: what it hid, whether it came from Tars's card,
 * and Undo (Restore for the conversation) while it holds. An undone clear
 * stays as a record that says it was restored.
 */
export function TarsClearRecordLine({ record, busy, error, onUndo }: { record: TarsClearRecord; busy?: boolean; error?: string | null; onUndo?: () => void }) {
  const { t } = useTranslation(["shell"]);
  const undone = record.status === "undone";
  const conversation = record.scopes.includes("conversation");
  const refused = record.work?.kept.filter((entry) => entry.reason === "refused").length ?? 0;
  return <TarsRecordRow state={undone ? "skipped" : "applied"} icon={Eraser} data-tars-clear-record={record.requestId} data-tars-clear-status={record.status}
    data-tars-clear-scopes={record.scopes.join(",")}
    lead={t(undone ? "shell:tars.clear.record.undone" : "shell:tars.clear.record.applied")} subject={describeHidden(record)}
    status={record.proposal ? t("shell:tars.clear.record.fromTars") : undefined}
    detail={error ? <TarsRecordDetail role="alert">{error}</TarsRecordDetail>
      : record.work && !undone ? <TarsRecordDetail>
        {record.work.cancelled.length ? <span data-tars-clear-cancelled-stays="">{t("shell:tars.clear.record.cancelledStays")}</span> : null}
        {refused ? <span data-tars-clear-refused="">{record.work.cancelled.length ? " " : null}{t("shell:tars.clear.record.refused", { count: refused })}</span> : null}
      </TarsRecordDetail> : null}
    actions={!undone && onUndo ? <Button variant="ghost" size="2xs" disabled={busy} data-tars-clear-undo={record.requestId} onClick={onUndo}>
      {t(conversation ? "shell:tars.clear.restore" : "shell:tars.clear.undo")}</Button> : null} />;
}

/**
 * Tars's proposal to clear, waiting for the user. It says what each scope
 * would hide now and what always stays; Clear (Enter) applies it through the
 * same path as the buttons, Not now (Esc) leaves everything as it is. Like
 * every confirmation card it leads with the effect and its main action is the
 * primary button. Hiding keeps Enter and the neutral tone; cancelling
 * unfinished work requires an explicit click and uses the danger tone.
 */
export function TarsClearCard({ id, scopes, counts, busy = false, error, onConfirm, onDecline }: {
  id: string;
  scopes: readonly TarsClearScope[];
  counts: TarsClearCounts;
  busy?: boolean;
  error?: string | null;
  onConfirm: (source: TarsClearSource) => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const titleId = useId();
  const hintId = useId();
  // As the host applies them: a Work reset also hides Done and Outputs, so its card lists them.
  const shown = normalizeTarsClearScopes(scopes);
  const nothing = shown.every((scope) => counts[scope] === 0);
  const work = shown.includes("work");
  // Cancelling work cannot be undone: the confirmation takes the danger tone and leaves Enter to the explicit click.
  const stopsWork = work && counts.work > 0;
  // With nothing left, confirming still closes the proposal through the host, so it never waits forever behind a dead button.
  const confirmClear = (source: TarsClearSource) => { if (!busy && !(stopsWork && source === "key")) onConfirm(source); };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const action = tarsPublishCardKey(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "decline") onDecline(); else confirmClear("key");
  };
  return <section role="group" tabIndex={-1} aria-labelledby={titleId} aria-describedby={hintId} aria-busy={busy || undefined}
    className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown} data-tars-clear-card={id} data-tars-clear-scopes={scopes.join(",")}>
    <div className={sx(styles.confirmHeader)}>
      <IconTile size="sm" xstyle={styles.icon}><Eraser aria-hidden size={iconTileGlyphSizes.sm} /></IconTile>
      <div className={sx(styles.heading)}>
        <p id={titleId} className={sx(styles.title)}>{t("shell:tars.clear.card.title")}</p>
      </div>
    </div>
    <p className={sx(styles.effect)} data-tars-clear-effect="">{t(stopsWork ? "shell:tars.clear.card.subtitleWork" : "shell:tars.clear.card.subtitle")}</p>
    <dl className={sx(agentSurface.well, styles.rows)} aria-label={t("shell:tars.clear.card.details")}>
      {shown.map((scope) => <div key={scope} className={sx(styles.row)} data-tars-clear-row={scope}>
        <dt className={sx(styles.rowLabel)}>{t(`shell:tars.clear.scope.${scope}`)}</dt>
        <dd className={sx(styles.rowValue)}>{t(`shell:tars.clear.hidden.${scope}`, { count: counts[scope] })}</dd>
      </div>)}
      {work && counts.kept > 0 ? <div className={sx(styles.row)} data-tars-clear-row="kept">
        <dt className={sx(styles.rowLabel)}>{t("shell:tars.clear.card.keptLabel")}</dt>
        <dd className={sx(styles.rowValue)}>{t("shell:tars.clear.hidden.workKept", { count: counts.kept })}</dd>
      </div> : null}
    </dl>
    <p className={sx(styles.detail)}>{t(work ? "shell:tars.clear.card.keptWork" : "shell:tars.clear.card.kept")}</p>
    {nothing ? <p className={sx(styles.detail)} data-tars-clear-nothing="">{t("shell:tars.clear.card.nothing")}</p> : null}
    <div className={sx(styles.footer)}>
      <VisuallyHidden id={hintId}>{t("shell:tars.clear.card.keysHint")}</VisuallyHidden>
      <div className={sx(styles.footerActions)}>
        <Button type="button" size="2xs" variant="ghost" aria-keyshortcuts="Escape" disabled={busy} data-tars-clear-decline="" onClick={onDecline}>
          {t("shell:tars.clear.card.decline")}<span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.escKey")}</Kbd></span>
        </Button>
        <AuiButton type="button" size="xs" variant="primary" tone={stopsWork ? "danger" : "neutral"} aria-keyshortcuts={stopsWork ? undefined : "Enter"} disabled={busy}
          data-tars-clear-confirm={nothing ? "empty" : ""} data-tars-decision-tone={stopsWork ? "danger" : "neutral"} onClick={() => confirmClear("click")}>
          {t(nothing ? "shell:tars.clear.card.closeEmpty" : stopsWork ? "shell:tars.clear.card.confirmWork" : "shell:tars.clear.card.confirm")}
          {stopsWork ? null : <span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.enterKey")}</Kbd></span>}
        </AuiButton>
      </div>
    </div>
    {error ? <p className={sx(styles.error)} role="alert">{error}</p> : null}
  </section>;
}

/** A settled proposal's record in place of its card. */
export function TarsClearProposalRecord({ record, busy, error, onUndo }: { record: TarsClearRecord; busy?: boolean; error?: string | null; onUndo?: () => void }) {
  return <TarsRecordList><TarsClearRecordLine record={record} busy={busy} error={error} onUndo={onUndo} /></TarsRecordList>;
}

/**
 * The header's Clear: one confirmation that says what leaves the view and what
 * stays, then the clear. "Also reset Work" adds the Work panel: it says how
 * much unfinished work is cancelled (its runs stop), how many ended cards
 * leave and what is kept, before anything is applied. Disabled while there is
 * nothing to clear or reset.
 */
export function TarsClearConversationButton({ count, work, busy, error, onClear }: {
  count: number;
  /** What a Work reset would do now; absent where the bridge cannot reset Work. */
  work?: { stop: number; ended: number; kept: number };
  busy: boolean;
  error?: string | null;
  onClear: (includeWork: boolean) => Promise<boolean>;
}) {
  const { t } = useTranslation(["shell"]);
  const [open, setOpen] = useState(false);
  const [includeWork, setIncludeWork] = useState(false);
  const label = t("shell:tars.clear.conversation.button");
  const workable = Boolean(work && (work.stop > 0 || work.ended > 0));
  const resetting = includeWork && workable;
  const close = () => { setOpen(false); setIncludeWork(false); };
  return <>
    <Tooltip content={label}><Button variant="ghost" size="icon-sm" disabled={busy || (count === 0 && !workable)} focusableWhenDisabled aria-label={label} data-tars-clear-conversation="" onClick={() => setOpen(true)}><Eraser /></Button></Tooltip>
    <ConfirmDialog open={open} loading={busy} defaultFocus={resetting ? "cancel" : "confirm"} title={t("shell:tars.clear.conversation.title")}
      description={t(resetting ? "shell:tars.clear.conversation.descriptionWork" : "shell:tars.clear.conversation.description", { count })} confirmLabel={t(resetting ? "shell:tars.clear.conversation.confirmWork" : "shell:tars.clear.conversation.confirm")}
      cancelLabel={t("shell:tars.clear.card.decline")} onCancel={close}
      onConfirm={() => { void onClear(resetting).then((ok) => { if (ok) close(); }); }}>
      {workable && work ? <div className={sx(clearStyles.work)} data-tars-clear-work="">
        <Checkbox checked={includeWork} onCheckedChange={(checked) => setIncludeWork(checked === true)} disabled={busy} label={t("shell:tars.clear.conversation.work.label")}
          data-tars-clear-include-work="" />
        {includeWork ? <ul className={sx(clearStyles.workList)} data-tars-clear-work-plan="">
          {work.stop > 0 ? <li data-tars-clear-work-stop={work.stop}>{t("shell:tars.clear.conversation.work.stop", { count: work.stop })}</li> : null}
          {work.ended > 0 ? <li data-tars-clear-work-ended={work.ended}>{t("shell:tars.clear.conversation.work.ended", { count: work.ended })}</li> : null}
          {work.kept > 0 ? <li data-tars-clear-work-kept={work.kept}>{t("shell:tars.clear.conversation.work.kept", { count: work.kept })}</li> : null}
          {work.stop > 0 ? <li>{t("shell:tars.clear.conversation.work.irreversible")}</li> : null}
        </ul> : null}
      </div> : null}
      {/* A clear that did not go through keeps the dialog open with the reason, so Clear can be pressed again. */}
      {error ? <p className={sx(styles.error)} role="alert">{error}</p> : null}
    </ConfirmDialog>
  </>;
}

/**
 * Suggested requests above the composer, as Tars's model wrote them. A press
 * puts its words in the message box and focuses it; nothing is sent until the
 * user sends it. While the model writes, and when it wrote none or could not,
 * one quiet line says so in the chips' place; no other words stand in for them.
 */
export function TarsSuggestionChips({ state, onPick, onRetry, xstyle }: { state: TarsSuggestionsState; onPick: (text: string) => void; onRetry?: () => void; xstyle?: StyleXValue }) {
  const { t } = useTranslation(["shell"]);
  if (state.status === "off") return null;
  if (state.status !== "ready" || !state.items.length) {
    const note = state.status === "loading" ? t("shell:tars.suggestions.generating") : state.status === "ready" ? t("shell:tars.suggestions.empty")
      : state.reason === "noSettings" ? t("shell:tars.suggestions.noSettings") : t("shell:tars.suggestions.failed");
    const retry = state.status === "failed" && state.reason !== "noSettings" && onRetry;
    return <div className={sx(clearStyles.chipStatus, xstyle)} data-tars-suggestions-status={state.status === "failed" ? state.reason : state.status}>
      <p role="status" aria-live="polite" className={sx(clearStyles.chipStatusText)}>{note}</p>
      {retry ? <Button type="button" variant="ghost" size="2xs" onClick={retry}>{t("shell:tars.suggestions.retry")}</Button> : null}
    </div>;
  }
  return <ul className={sx(clearStyles.chips, xstyle)} aria-label={t("shell:tars.suggestions.label")} data-tars-suggestions={state.items.length} data-tars-suggestions-model={state.model}>
    {state.items.map((item, index) => <li key={`${index}:${item.prompt}`} className={sx(clearStyles.chipItem)}>
      <Button type="button" variant="secondary" size="xs" xstyle={clearStyles.chipButton} title={item.prompt} data-tars-suggestion={index} onClick={() => onPick(item.prompt)}>
        {/* i18n-ignore: model-written chip text */}
        <span className={sx(clearStyles.chipLabel)}>{item.label}</span>
      </Button>
    </li>)}
  </ul>;
}
