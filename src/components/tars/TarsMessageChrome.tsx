import type { CSSProperties, ReactNode } from "react";
import { CircleStop, FileCode2, FileDiff, FileText, Image as ImageIcon, RotateCcw, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Attachment } from "@/components/aui/components/Attachment";
import { Banner } from "@/components/aui/components/Banner";
import { Button } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { TextShimmer } from "@/components/aui/components/TextShimmer";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { RelativeTime } from "@/components/system/RelativeTime";
import { formatFileSize } from "@/lib/fs/file-preview-limits";
import type { AttachmentContext } from "@/lib/providers/attachment-context";
import { tarsAttachmentSummary, type TarsAttachmentSummary, type TarsMessageView } from "@/lib/tars/conversation";
import { describeTarsMessageFailure } from "@/lib/tars/detail";
import { useAppStore } from "@/store/app.store";
import { TARS_TEXT_SIZE, tarsMessageStyles as styles } from "./tars-message.styles";

/**
 * The conversation's text size, from the chat font size setting the task chat
 * also reads. The conversation column sets it; status lines, failures, times
 * and file details are sized from it (`tars-message.styles`).
 */
export function useTarsTextScale(): CSSProperties {
  const size = useAppStore((state) => state.settings.messageFontSize);
  return { [TARS_TEXT_SIZE]: `${size}px` } as CSSProperties;
}

/**
 * When the message was sent, in the short relative form ("5m ago"), shown
 * only while its exchange is hovered or holds focus. It is a button, so the
 * keyboard reaches it and its card gives the full date and time.
 */
export function TarsMessageTime({ at, side }: { at: string; side: "start" | "end" }) {
  return <span className={sx(styles.time, side === "end" ? styles.timeEnd : styles.timeStart)} data-tars-message-time="">
    <RelativeTime past date={at} />
  </span>;
}

/** Code and structured text read as code; prose and logs as a document. */
const CODE_TYPES = /^(?:[cm]?[jt]sx?|py|rb|rs|go|java|kt|swift|sh|sql|css|scss|html?|xml|json|jsonl|ya?ml|toml|ini|svg)$/i;

function AttachmentIcon({ summary }: { summary: TarsAttachmentSummary }) {
  const Icon = summary.kind === "image" ? ImageIcon : /^(?:diff|patch)$/i.test(summary.type) ? FileDiff : CODE_TYPES.test(summary.type) ? FileCode2 : FileText;
  return <Icon aria-hidden="true" className={sx(styles.fileIcon)} />;
}

/** "1.2 KB · YAML": the size, then the file type or image format. */
function useAttachmentMeta() {
  const { t } = useTranslation(["shell"]);
  return (summary: TarsAttachmentSummary) => {
    const size = formatFileSize(summary.size);
    const type = (summary.kind === "image" ? summary.type.replace(/^image\//i, "") : summary.type).toUpperCase();
    return type ? t("shell:tars.conversation.attachments.meta", { size, type }) : size;
  };
}

/**
 * What came with a sent message, above its bubble on the user's side: a chip
 * per file with its type, name and size. The window holds summaries only, so
 * an image shows its format, not its pixels.
 */
export function TarsMessageAttachments({ attachments, workingChanges }: { attachments: readonly TarsAttachmentSummary[]; workingChanges: boolean }) {
  const { t } = useTranslation(["shell"]);
  const meta = useAttachmentMeta();
  return <>
    {attachments.length ? <ul className={sx(styles.fileList)} aria-label={t("shell:tars.conversation.attachments.sent")} data-tars-message-attachments="">
      {attachments.map((summary, index) => <li key={index} className={sx(styles.fileItem)} data-tars-attachment-kind={summary.kind}>
        <Attachment name={summary.name} meta={meta(summary)} icon={<AttachmentIcon summary={summary} />} xstyle={styles.chip} title={summary.name} />
      </li>)}
    </ul> : null}
    {workingChanges ? <Attachment name={t("shell:tars.conversation.workingChanges.badge")} icon={<FileDiff aria-hidden="true" className={sx(styles.fileIcon)} />}
      xstyle={styles.chip} data-tars-message-working-changes="" /> : null}
  </>;
}

/** The composer's picked files: the same chips, with a picked image's own pixels and a remove button each. */
export function TarsComposerAttachments({ parts, nameOf, onRemove }: {
  parts: readonly AttachmentContext[];
  nameOf: (part: AttachmentContext) => string;
  /** Absent while the composer is disabled: the files stay as they are. */
  onRemove?: (name: string) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const meta = useAttachmentMeta();
  if (!parts.length) return null;
  return <div role="group" aria-label={t("shell:tars.conversation.attachments.draft")} className={sx(styles.composerFiles)} data-tars-composer-attachments="">
    {parts.map((part) => {
      const name = nameOf(part);
      const summary = tarsAttachmentSummary(part);
      return <Attachment key={name} name={name} meta={meta(summary)} xstyle={styles.chip} title={name}
        icon={part.type === "image_context" ? <img src={part.dataUrl} alt="" className={sx(styles.thumbnail)} /> : <AttachmentIcon summary={summary} />}
        onRemove={onRemove ? () => onRemove(name) : undefined} removeLabel={t("shell:tars.conversation.attachments.remove", { name })} />;
    })}
  </div>;
}

/** The one control a message in progress has: cancel it, named and with a tooltip, since it is only a glyph. */
function CancelMessageButton({ state, busy, onCancel }: { state: "queued" | "reasoning"; busy: boolean; onCancel: () => void }) {
  const { t } = useTranslation(["shell"]);
  const label = t("shell:tars.conversation.cancel");
  return <Tooltip content={label}>
    <Button variant="quiet" size="2xs" iconOnly aria-label={label} disabled={busy} onClick={onCancel} data-tars-message-cancel="">
      {state === "reasoning" ? <CircleStop aria-hidden="true" className={sx(styles.cancelIcon)} /> : <X aria-hidden="true" className={sx(styles.cancelIcon)} />}
    </Button>
  </Tooltip>;
}

/**
 * Where Tars's reply will appear, what the message is doing instead: thinking
 * (the moving mark and a shimmer), waiting behind another message, or
 * cancelled. A message in progress can be cancelled from here.
 */
export function TarsMessageStatus({ state, busy, onCancel }: { state: "queued" | "reasoning" | "cancelled"; busy: boolean; onCancel: () => void }) {
  const { t } = useTranslation(["shell"]);
  const label = t(`shell:tars.conversation.states.${state}`);
  return <div className={sx(styles.status)} data-tars-message-state={state}>
    <StateMark state={state === "reasoning" ? "working" : state === "queued" ? "queued" : "stopped"} size="xs" motion={state === "reasoning" ? "moving" : "still"} />
    {/* The words are the status a screen reader hears when the message starts or stops thinking. */}
    <span role="status" className={sx(styles.statusLabel)}>{state === "reasoning" ? <TextShimmer>{label}</TextShimmer> : label}</span>
    {state === "cancelled" ? null : <CancelMessageButton state={state} busy={busy} onCancel={onCancel} />}
  </div>;
}

/**
 * A message Tars could not answer: the AUI notice in place of the reply, with
 * why, the fact that it will not run again by itself, and one way on. An
 * interruption (Stave stopped mid-answer) is a warning; anything else failed.
 */
export function TarsMessageFailure({ message, onResend }: { message: Pick<TarsMessageView, "error" | "errorCode" | "attachments">; onResend?: () => void }) {
  const { t } = useTranslation(["shell"]);
  const interrupted = message.errorCode === "interrupted";
  const reason = describeTarsMessageFailure(message);
  return <Banner.Root tone={interrupted ? "warning" : "danger"} role="status" xstyle={styles.notice} data-tars-message-state="failed"
    data-tars-message-failure={message.errorCode ?? "diagnostic"}>
    <Banner.Title xstyle={styles.noticeTitle}>{t(interrupted ? "shell:tars.conversation.failure.interruptedTitle" : "shell:tars.conversation.failure.title")}</Banner.Title>
    <Banner.Description xstyle={styles.noticeBody}>
      {reason ? <p className={sx(styles.noticeText)}>{reason}</p> : null}
      <p className={sx(styles.noticeText)}>{t(onResend ? "shell:tars.conversation.failure.hintWithResend" : "shell:tars.conversation.failedHint")}</p>
      {onResend && message.attachments?.length ? <p className={sx(styles.noticeText)}>{t("shell:tars.conversation.failure.reattach")}</p> : null}
    </Banner.Description>
    {onResend ? <Banner.Action><TarsNoticeAction icon={<RotateCcw aria-hidden="true" className={sx(styles.actionIcon)} />} onClick={onResend} data-tars-message-resend="">
      {t("shell:tars.conversation.failure.resend")}</TarsNoticeAction></Banner.Action> : null}
  </Banner.Root>;
}

function TarsNoticeAction({ icon, children, onClick, ...data }: { icon?: ReactNode; children: ReactNode; onClick: () => void } & Record<`data-${string}`, string>) {
  return <Button size="xs" variant="outlined" onClick={onClick} {...data}>{icon}{children}</Button>;
}

/**
 * A request that did not go through, at the end of the conversation beside the
 * composer: a send that failed keeps its words in the message box and Retry
 * sends them again as the same request; any other failure reads the
 * conversation again.
 */
export function TarsConversationError({ error, send, onRetry }: { error: string; send: boolean; onRetry: () => void }) {
  const { t } = useTranslation(["shell"]);
  return <Banner.Root tone="danger" xstyle={styles.notice} data-tars-conversation-error={send ? "send" : "request"}>
    <Banner.Title xstyle={styles.noticeTitle}>{send ? t("shell:tars.conversation.sendFailed.title") : error}</Banner.Title>
    {send ? <Banner.Description xstyle={styles.noticeBody}>
      <p className={sx(styles.noticeText)}>{error}</p>
      <p className={sx(styles.noticeText)}>{t("shell:tars.conversation.sendFailed.kept")}</p>
    </Banner.Description> : null}
    <Banner.Action><TarsNoticeAction icon={<RotateCcw aria-hidden="true" className={sx(styles.actionIcon)} />} onClick={onRetry}>{t("shell:tars.retry")}</TarsNoticeAction></Banner.Action>
  </Banner.Root>;
}
