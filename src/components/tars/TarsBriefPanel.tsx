import { Tooltip } from "@/components/aui/components/Tooltip";
import { useId, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Button } from "@/components/ui";
import { raisedPanel } from "@/components/aui/recipes/raised-panel";
import { sx } from "@/components/aui/utils/stylex";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";
import { ClipboardCopyAnnouncement } from "@/components/system/ClipboardCopyAnnouncement";
import { useClipboardCopy } from "@/hooks/use-clipboard-copy";
import type { TarsBriefInstructionSource } from "@/lib/tars/brief";
import type { TarsResponsibility } from "@/lib/tars/types";
import { useTarsBrief, type TarsBriefLoader, type TarsBriefState } from "./use-tars-brief";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";

function CopyText({ text, label }: { text: string; label: string }) {
  const { status, copied, copy } = useClipboardCopy();
  return <>
    <Tooltip content={label}><Button variant="ghost" size="icon-2xs" aria-label={label} onClick={() => { void copy(text); }}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button></Tooltip>
    <ClipboardCopyAnnouncement status={status} />
  </>;
}

/** One saved text under its title, whole and copyable. */
function SavedText({ part, title, note, text, copyLabel }: { part: string; title: string; note: ReactNode; text: string; copyLabel: string }) {
  const id = useId();
  return <section className={sx(styles.section)} aria-labelledby={id} data-tars-brief-part={part}>
    <div className={sx(styles.textHead)}>
      <h3 id={id} className={sx(styles.sectionTitle)}>{title}</h3>
      <CopyText text={text} label={copyLabel} />
    </div>
    {note}
    <div className={sx(raisedPanel.panel, styles.savedText)} data-tars-brief-text={part}>{text}</div>
  </section>;
}

const STATUS_KEYS = {
  loading: "shell:tars.side.brief.status.loading", failed: "shell:tars.side.brief.status.failed", unavailable: "shell:tars.side.brief.status.unavailable",
} as const satisfies Record<Exclude<TarsBriefState["status"], "ready">, string>;

const INSTRUCTION_KEYS = {
  delegated: { title: "shell:tars.side.brief.instruction", hint: "shell:tars.side.brief.instructionHint" },
  assignment: { title: "shell:tars.side.brief.assignment", hint: "shell:tars.side.brief.assignmentHint" },
} as const satisfies Record<TarsBriefInstructionSource, { title: string; hint: string }>;

/**
 * What a responsibility was handed, readable before its run exists: the
 * user's message as sent, Tars's own instruction, the names of the files and
 * images it carries and the completion criteria.
 * Texts are shown whole as plain text. Work saved before the message was kept
 * says so instead of showing a guess. The criteria come from the snapshot, so
 * they show even while the saved texts load or after a failed read.
 */
export function TarsBriefPanel({ row, state, onRetry }: {
  row: Pick<TarsResponsibility, "id" | "acceptanceCriteria">; state: TarsBriefState; onRetry: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const requestId = useId();
  const attachmentsId = useId();
  const criteriaId = useId();
  const brief = state.status === "ready" ? state.brief : null;
  const request = brief?.request ?? null;
  // Each saved text is its own section on the section rhythm.
  return <div className={sx(styles.stack)} data-tars-brief={state.status}>
    {brief ? <>
      {request
        ? <SavedText part="request" title={t("shell:tars.side.brief.request")} text={request.text} copyLabel={t("shell:tars.side.brief.copyRequest")}
          note={<p className={sx(styles.meta)} data-tars-brief-sent={request.sentAt}>{request.answeredQuestion
            ? t("shell:tars.side.brief.answered", { time: formatDateTime(request.sentAt), question: request.answeredQuestion })
            : t("shell:tars.side.brief.sentAt", { time: formatDateTime(request.sentAt) })}</p>} />
        : <section className={sx(styles.section)} aria-labelledby={requestId} data-tars-brief-part="request">
          <h3 id={requestId} className={sx(styles.sectionTitle)}>{t("shell:tars.side.brief.request")}</h3>
          <p className={sx(agentRunStyles.callout, agentRunStyles.calloutNeutral)} role="note" data-tars-brief-missing="request">{t("shell:tars.side.brief.requestMissing")}</p>
        </section>}
      <SavedText part={`instruction-${brief.instruction.source}`} title={t(INSTRUCTION_KEYS[brief.instruction.source].title)} text={brief.instruction.text}
        copyLabel={t("shell:tars.side.brief.copyInstruction")} note={<p className={sx(styles.meta)}>{t(INSTRUCTION_KEYS[brief.instruction.source].hint)}</p>} />
      {brief.context ? <SavedText part="context" title={t("shell:tars.side.brief.context")} text={brief.context} copyLabel={t("shell:tars.side.brief.copyContext")}
        note={<p className={sx(styles.meta)}>{t("shell:tars.side.brief.contextHint")}</p>} /> : null}
      {brief.attachments?.length ? <section className={sx(styles.section)} aria-labelledby={attachmentsId} data-tars-brief-part="attachments">
        <h3 id={attachmentsId} className={sx(styles.sectionTitle)}>{t("shell:tars.side.brief.attachments", { count: brief.attachments.length })}</h3>
        <p className={sx(styles.meta)}>{t("shell:tars.side.brief.attachmentsHint")}</p>
        <ul className={sx(raisedPanel.panel, styles.panelList)}>
          {brief.attachments.map((attachment, index) => <li key={index} className={sx(raisedPanel.row, styles.criterionText)}
            data-tars-brief-attachment={attachment.kind}>{attachment.name}</li>)}
        </ul>
      </section> : null}
    </> : state.status !== "ready" ? <div className={sx(styles.row)} role={state.status === "failed" ? "alert" : "status"} data-tars-brief-status={state.status}>
      <p className={sx(styles.meta)}>{t(STATUS_KEYS[state.status])}</p>
      {state.status === "failed" ? <Button variant="secondary" size="xs" onClick={(event) => {
        // Retry goes away once the read settles; focus moves to the side view's heading first, so Esc and Tab still work from there.
        event.currentTarget.closest("[data-tars-side-view]")?.querySelector<HTMLElement>("h2[tabindex]")?.focus({ preventScroll: true });
        onRetry();
      }}>{t("shell:tars.retry")}</Button> : null}
    </div> : null}
    <section className={sx(styles.section)} aria-labelledby={criteriaId} data-tars-brief-part="criteria">
      <h3 id={criteriaId} className={sx(styles.sectionTitle)}>{t("shell:tars.side.brief.criteria", { count: row.acceptanceCriteria.length })}</h3>
      <ol className={sx(raisedPanel.panel, styles.panelList)}>
        {row.acceptanceCriteria.map((criterion, index) => <li key={index} className={sx(raisedPanel.row, styles.criterionText, styles.keepBreaks)} data-tars-brief-criterion="">{criterion}</li>)}
      </ol>
    </section>
  </div>;
}

/** The request view of the side view: reads the saved texts for the work it shows. */
export function TarsBriefView({ row, load }: { row: Pick<TarsResponsibility, "id" | "acceptanceCriteria">; load: TarsBriefLoader | undefined }) {
  const { state, retry } = useTarsBrief(row.id, load);
  return <TarsBriefPanel row={row} state={state} onRetry={retry} />;
}
