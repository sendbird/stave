import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip as AdsTooltip } from "@/components/ads/components/Tooltip";
import { FileText, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { Attachment } from "@/types/chat";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import { TaskContextDraftChip } from "@/components/task-context-draft-chip";
import {
  DocumentContextChip,
  openAttachedDocument,
} from "@/components/document-context-chip";
import type { DocumentContextAttachment } from "@/lib/documents/attached-document-context";
import type { TaskContextAttachment } from "@/lib/task-context/attached-task-context";
import { openAttachedTask } from "@/components/open-attached-task";
import { sx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * The draft's attachment row: reference chips (Information, tasks,
 * documents), attached files and pasted images, each removable.
 */
export function PromptInputAttachmentsRow(args: {
  currentAttachmentCount: number;
  workspaceInformationAttachments: readonly Extract<
    Attachment,
    { kind: "workspace-information" }
  >[];
  taskContextAttachments: readonly TaskContextAttachment[];
  documentContextAttachments: readonly DocumentContextAttachment[];
  attachedFilePaths: string[];
  standaloneImageAttachments: readonly Extract<Attachment, { kind: "image" }>[];
  attachments?: Attachment[];
  interactionsDisabled: boolean;
  minimal: boolean;
  onAttachmentsChange: PromptInputProps["onAttachmentsChange"];
  onAttachFilesChange: PromptInputProps["onAttachFilesChange"];
  onOpenAttachedFile: PromptInputProps["onOpenAttachedFile"];
  setImagePreviewSrc: (preview: { dataUrl: string; label: string }) => void;
}) {
  useTranslation();
  const {
    currentAttachmentCount,
    workspaceInformationAttachments,
    taskContextAttachments,
    documentContextAttachments,
    attachedFilePaths,
    standaloneImageAttachments,
    attachments,
    interactionsDisabled,
    minimal,
    onAttachmentsChange,
    onAttachFilesChange,
    onOpenAttachedFile,
    setImagePreviewSrc,
  } = args;
  return (
    <div
      role="group"
      aria-label={i18n.t("composer:promptInput.ariaLabel15")}
      className={sx(promptInputStyles.attachmentsRow)}
    >
      <span className={sx(promptInputStyles.attachmentsCount)}>
        <Paperclip className={sx(promptInputStyles.icon3)} aria-hidden="true" />
        {currentAttachmentCount} {i18n.t("composer:promptInput.composerCard24")}</span>
      {workspaceInformationAttachments.map((attachment) => (
        <WorkspaceInformationReferenceChip
          key={attachment.id}
          reference={attachment.reference}
          disabled={interactionsDisabled}
          compact={minimal}
          onRemove={() =>
            onAttachmentsChange?.({
              attachments: (attachments ?? []).filter(
                (candidate) =>
                  !(
                    candidate.kind === "workspace-information" &&
                    candidate.id === attachment.id
                  ),
              ),
            })
          }
        />
      ))}
      {taskContextAttachments.map((attachment) => (
        <TaskContextDraftChip
          key={attachment.id}
          attachment={attachment}
          disabled={interactionsDisabled}
          compact={minimal}
          onOpen={() =>
            void openAttachedTask({
              taskId: attachment.taskId,
              workspaceId: attachment.workspaceId,
            })
          }
          onScopeChange={(scope) =>
            onAttachmentsChange?.({
              attachments: (attachments ?? []).map((candidate) =>
                candidate.kind === "task-context" &&
                candidate.id === attachment.id
                  ? { ...candidate, scope }
                  : candidate,
              ),
            })
          }
          onRemove={() =>
            onAttachmentsChange?.({
              attachments: (attachments ?? []).filter(
                (candidate) =>
                  !(
                    candidate.kind === "task-context" &&
                    candidate.id === attachment.id
                  ),
              ),
            })
          }
        />
      ))}
      {documentContextAttachments.map((attachment) => (
        <DocumentContextChip
          key={attachment.id}
          title={attachment.title}
          workspaceName={attachment.workspaceName}
          revision={attachment.revision}
          disabled={interactionsDisabled}
          compact={minimal}
          onOpen={() => openAttachedDocument(attachment)}
          onRemove={() =>
            onAttachmentsChange?.({
              attachments: (attachments ?? []).filter(
                (candidate) =>
                  !(
                    candidate.kind === "document-context" &&
                    candidate.id === attachment.id
                  ),
              ),
            })
          }
        />
      ))}
      {attachedFilePaths.map((filePath) => (
        <div
          key={filePath}
          className={sx(
            promptInputStyles.fileChip,
            minimal
              ? promptInputStyles.fileChipMinimal
              : promptInputStyles.fileChipDefault,
          )}
        >
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={interactionsDisabled || !onOpenAttachedFile}
            aria-label={i18n.t("composer:promptInput.ariaLabel16", { value1: filePath })}
            title={i18n.t("composer:promptInput.title6")}
            className={sx(promptInputStyles.fileOpenButton)}
            onClick={() => void onOpenAttachedFile?.({ filePath })}
          >
            <FileText
              className={sx(promptInputStyles.icon35Shrink)}
              aria-hidden="true"
            />
            <span className={sx(promptInputStyles.truncMedium)}>{filePath}</span>
          </Button>
          <AdsTooltip content={i18n.t("composer:promptInput.title7")}>
            <Button
              type="button"
              size="xs"
              iconOnly
              variant="ghost"
              disabled={interactionsDisabled}
              aria-label={i18n.t("composer:promptInput.ariaLabel17", { value1: filePath })}
              onClick={() =>
                onAttachFilesChange({
                  filePaths: attachedFilePaths.filter(
                    (p) => p !== filePath,
                  ),
                })
              }
              xstyle={promptInputStyles.fileRemoveButton}
            >
              <X />
            </Button>
          </AdsTooltip>
        </div>
      ))}
      {standaloneImageAttachments.map((img) => (
        <div
          key={img.id}
          className={sx(
            promptInputStyles.imageChip,
            minimal
              ? promptInputStyles.imageChipMinimal
              : promptInputStyles.imageChipDefault,
          )}
        >
          <AdsButton layout="host"
            type="button"
            disabled={interactionsDisabled}
            aria-label={i18n.t("composer:promptInput.ariaLabel18", { value1: img.label })}
            title={i18n.t("composer:promptInput.title8")}
            xstyle={promptInputStyles.imagePreviewButton}
            onClick={() =>
              setImagePreviewSrc({
                dataUrl: img.dataUrl,
                label: img.label,
              })
            }
          >
            <img
              src={img.dataUrl}
              alt={img.label}
              className={sx(promptInputStyles.imagePreview)}
            />
          </AdsButton>
          <AdsTooltip content={i18n.t("composer:promptInput.title9")}>
            <Button
              type="button"
              size="xs"
              iconOnly
              variant="floating"
              disabled={interactionsDisabled}
              aria-label={i18n.t("composer:promptInput.ariaLabel19", { value1: img.label })}
              onClick={() =>
                onAttachmentsChange?.({
                  attachments: (attachments ?? []).filter(
                    (a) => !(a.kind === "image" && a.id === img.id),
                  ),
                })
              }
              xstyle={promptInputStyles.imageRemoveButton}
            >
              <X />
            </Button>
          </AdsTooltip>
        </div>
      ))}
    </div>
  );
}
