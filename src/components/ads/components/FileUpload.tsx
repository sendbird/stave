import { i18n } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { UploadCloud } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { themeProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Attachment, type AttachmentStatus } from "./Attachment";
import { VisuallyHidden } from "./VisuallyHidden";

export type FileUploadStatus = "queued" | "uploading" | "uploaded" | "failed";

export type FileUploadItem = {
  /** Stable identity supplied by the upload owner. Falls back to file name. */
  id?: string;
  file: File;
  /** Human-readable failure reason shown by Attachment. */
  error?: React.ReactNode;
  /** Determinate progress from 0–100. Omit for indeterminate uploading. */
  progress?: number;
  status: FileUploadStatus;
};

/** The statuses whose word follows the file size; a failed row shows its error. */
type FileUploadMetaStatus = Exclude<FileUploadStatus, "failed">;

export type FileUploadProps = Omit<
  React.ComponentProps<"div">,
  "onChange" | "onDrop"
> & {
  accept?: string;
  /**
   * The compact row's trailing "Choose file" affordance. It is drawn inside
   * the picker button (not a second button), so it joins the button's
   * accessible name and Enter or Space on the row still opens the picker.
   */
  actionLabel?: React.ReactNode;
  /** Name of an uploading row's ✕. @default (name) => `Cancel upload of ${name}` */
  cancelLabel?: (name: string) => string;
  description?: React.ReactNode;
  disabled?: boolean;
  /** Failure text for a failed row with no `error`. @default "Upload failed" */
  errorLabel?: React.ReactNode;
  files?: File[];
  /** @default "Drag files here or browse" */
  label?: React.ReactNode;
  multiple?: boolean;
  /** Cancel intent for an uploading item. Network ownership stays with the caller. */
  onCancel?: (item: FileUploadItem) => void;
  onChange?: (files: File[]) => void;
  /** Remove intent for a queued, uploaded, or failed item. */
  onRemove?: (item: FileUploadItem) => void;
  /** Retry intent for a failed item. */
  onRetry?: (item: FileUploadItem) => void;
  /** Name of a row's ✕. @default (name) => `Remove ${name}` */
  removeLabel?: (name: string) => string;
  /** Label of a failed row's retry action. @default "Retry" */
  retryLabel?: string;
  /**
   * The word after the file size in each row's meta line. Pass only the ones
   * to replace. @default { queued: "Queued", uploading: "Uploading", uploaded: "Uploaded" }
   */
  statusLabels?: Partial<Record<FileUploadMetaStatus, string>>;
  /** Announcement when a row reaches `uploaded`. @default (name) => `${name} uploaded` */
  uploadedAnnouncement?: (name: string) => string;
  /** Name of an uploading row's progress bar. @default (name) => `Uploading ${name}` */
  uploadingLabel?: (name: string) => string;
  /** Controlled upload lifecycle rows. When omitted, selected files render as queued. */
  uploads?: readonly FileUploadItem[];
  /**
   * `dropzone` is the generous drag target for media/content workflows.
   * `compact` is the left-aligned row for dense forms and inspectors where a
   * centered empty surface would overstate one optional field.
   * @default "dropzone"
   */
  variant?: "compact" | "dropzone";
} & XstyleProp;

export function FileUpload({
  accept,
  actionLabel,
  cancelLabel = defaultCancelLabel,
  className,
  description,
  disabled = false,
  errorLabel = i18n.t("ui:fileUpload.uploadFailed"),
  files: controlledFiles,
  label = i18n.t("ui:fileUpload.label"),
  multiple = false,
  onCancel,
  onChange,
  onRemove,
  onRetry,
  removeLabel = defaultRemoveLabel,
  retryLabel = i18n.t("ui:agentRetry.retry"),
  statusLabels,
  uploadedAnnouncement = defaultUploadedAnnouncement,
  uploadingLabel = defaultUploadingLabel,
  uploads,
  variant = "dropzone",
  xstyle,
  ...props
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const [dragOver, setDragOver] = useState(false);
  const [internalFiles, setInternalFiles] = useState<File[]>([]);

  // Stable theme target: the picker button is the one element that paints a
  // surface and takes states; `variant` distinguishes the dropzone from the
  // compact row.
  const theme = themeProps("file-upload", { variant });

  const isControlled = controlledFiles !== undefined;
  const files = isControlled ? controlledFiles : internalFiles;
  const items: readonly FileUploadItem[] =
    uploads ?? files.map((file) => ({ file, status: "queued" as const }));

  const commit = useCallback(
    (next: File[]) => {
      if (!isControlled) {
        setInternalFiles(next);
      }
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) {
        return;
      }
      const list = Array.from(incoming);
      commit(multiple ? [...files, ...list] : list.slice(0, 1));
    },
    [commit, files, multiple],
  );

  const openPicker = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const removeAt = useCallback(
    (index: number) => {
      commit(files.filter((_, current) => current !== index));
    },
    [commit, files],
  );

  return (
    <div {...props} className={cx(sx(styles.root, xstyle), className)}>
      <button
        {...theme}
        aria-describedby={descriptionId}
        aria-disabled={disabled || undefined}
        className={cx(
          sx(
            styles.picker,
            variant === "dropzone" ? styles.dropzone : styles.compact,
            focusRing.ring,
            dragOver && styles.dragOver,
            disabled && styles.disabled,
          ),
          theme.className,
        )}
        disabled={disabled}
        onClick={openPicker}
        onDragLeave={(event) => {
          event.preventDefault();
          // The dropzone button has children (icon, label, description), so
          // `dragleave` bubbles from each of them as the pointer crosses
          // internal boundaries. Only clear once the pointer actually left
          // the dropzone.
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setDragOver(true);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (!disabled) {
            addFiles(event.dataTransfer.files);
          }
        }}
        type="button"
      >
        <UploadCloud
          aria-hidden
          className={sx(styles.uploadIcon)}
          size={variant === "compact" ? 18 : 24}
        />
        <span className={sx(styles.copy)}>
          <span className={sx(styles.label)}>{label}</span>
          {description ? (
            <span className={sx(styles.description)} id={descriptionId}>
              {description}
            </span>
          ) : null}
        </span>
        {actionLabel ? (
          <span className={sx(styles.action)}>{actionLabel}</span>
        ) : null}
      </button>
      <input
        accept={accept}
        className={sx(styles.input)}
        multiple={multiple}
        onChange={(event) => {
          addFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      {items.length > 0 ? (
        <ul className={sx(styles.list)} role="list">
          {items.map((item, index) => {
            const legacyItem = uploads == null;
            const attachmentStatus: AttachmentStatus =
              item.status === "uploading"
                ? "uploading"
                : item.status === "failed"
                  ? "error"
                  : "ready";
            const meta =
              item.status === "failed"
                ? item.error
                : `${formatBytes(item.file.size)} · ${
                    statusLabels?.[item.status] ??
                    defaultStatusLabel(item.status)
                  }`;
            const remove = legacyItem
              ? () => removeAt(index)
              : item.status === "uploading"
                ? onCancel
                  ? () => onCancel(item)
                  : undefined
                : onRemove
                  ? () => onRemove(item)
                  : undefined;

            return (
              <li
                className={sx(styles.item)}
                key={item.id ?? `${item.file.name}-${index}`}
              >
                <Attachment
                  errorLabel={errorLabel}
                  meta={meta}
                  name={item.file.name}
                  onRemove={remove}
                  onRetry={
                    item.status === "failed" && onRetry
                      ? () => onRetry(item)
                      : undefined
                  }
                  progress={item.progress}
                  removeLabel={
                    item.status === "uploading"
                      ? cancelLabel(item.file.name)
                      : removeLabel(item.file.name)
                  }
                  retryLabel={retryLabel}
                  status={attachmentStatus}
                  uploadingLabel={uploadingLabel(item.file.name)}
                />
                {item.status === "uploaded" ? (
                  <VisuallyHidden aria-live="polite" role="status">
                    {uploadedAnnouncement(item.file.name)}
                  </VisuallyHidden>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// The defaults read the host's translations; every one still has a prop so a
// caller can pass its own words.
const defaultStatusLabel = (status: FileUploadMetaStatus) =>
  i18n.t(`ui:fileUpload.status.${status}`);

const defaultCancelLabel = (name: string) =>
  i18n.t("ui:fileUpload.cancel", { name });
const defaultRemoveLabel = (name: string) =>
  i18n.t("ui:fileUpload.remove", { name });
const defaultUploadedAnnouncement = (name: string) =>
  i18n.t("ui:fileUpload.uploaded", { name });
const defaultUploadingLabel = (name: string) =>
  i18n.t("ui:fileUpload.uploading", { name });

const styles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--ads-space-12"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  picker: {
    appearance: "none",
    backgroundColor: {
      default: vars["--ads-color-surface"],
      "@media (hover: hover)": {
        default: vars["--ads-color-surface"],
        ":hover": `color-mix(in srgb, ${vars["--ads-color-surface"]}, ${vars["--ads-color-mix-ink"]} 6%)`,
      },
    },
    color: vars["--ads-color-text"],
    cursor: "pointer",
    display: "flex",
    fontFamily: vars["--ads-font-sans"],
    inlineSize: "100%",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "background-color, border-color",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  dropzone: {
    alignItems: "center",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "dashed",
    borderWidth: 2,
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    justifyContent: "center",
    minBlockSize: 132,
    paddingBlock: vars["--ads-space-24"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "center",
  },
  compact: {
    alignItems: "center",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    gap: vars["--ads-space-12"],
    justifyContent: "flex-start",
    minBlockSize: 44,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
  },
  dragOver: {
    backgroundColor: vars["--ads-color-accent-soft"],
    borderColor: vars["--ads-color-accent"],
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  uploadIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
  },
  copy: {
    display: "grid",
    flex: "1 1 auto",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  // Drawn with the outline button's chrome, but it is text inside the picker
  // button: the whole row is the one control.
  action: {
    alignItems: "center",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-12"],
    whiteSpace: "nowrap",
  },
  label: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  input: {
    blockSize: 1,
    clip: "rect(0 0 0 0)",
    inlineSize: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  list: {
    display: "grid",
    gap: vars["--ads-space-8"],
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  // `grid`, not `block`: `Attachment` is an inline-flex chip with
  // `inline-size: auto`, so in a block row it shrink-wrapped to its file name
  // and three files rendered at three widths with three remove positions. As
  // a grid item it stretches to the column, and the chip's copy slot grows to
  // carry remove to the row end. This list owns the row width.
  item: {
    display: "grid",
    minInlineSize: 0,
  },
});
