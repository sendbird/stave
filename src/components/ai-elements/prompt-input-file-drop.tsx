import { useTranslation } from "@/i18n";
import { useState, type DragEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { Upload } from "lucide-react";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { localStack } from "@/lib/ui-layers.stylex";
import { dragCarriesFiles } from "@/lib/files/file-drop";
import { TASK_DRAG_MIME } from "@/lib/task-context/attached-task-context";
import { readDroppedTask } from "./prompt-input-mentions";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * The composer form's drop handling. A task row dragged from the sidebar
 * attaches as task context; files dragged from the operating system attach
 * the way a paste does (`attachTransfer`). Both show the drop outline while
 * over the form; files also show what the drop does. Capture-phase handlers
 * claim the drop before the editor would insert it as text.
 */
export function usePromptInputDrop(args: {
  onAttachTask?: PromptInputProps["onAttachTask"];
  /** False while the composer cannot take files (disabled, or no attachment owner). */
  acceptsFiles: boolean;
  attachTransfer: (transfer: Pick<DataTransfer, "items" | "files">) => boolean;
}) {
  const [taskDropActive, setTaskDropActive] = useState(false);
  const [fileDropActive, setFileDropActive] = useState(false);
  const formProps = {
    onDragOverCapture: (event: DragEvent<HTMLFormElement>) => {
      if (args.onAttachTask && event.dataTransfer.types.includes(TASK_DRAG_MIME)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setTaskDropActive(true);
        return;
      }
      if (!args.acceptsFiles || !dragCarriesFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setFileDropActive(true);
    },
    onDragLeave: (event: DragEvent<HTMLFormElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setTaskDropActive(false);
        setFileDropActive(false);
      }
    },
    onDropCapture: (event: DragEvent<HTMLFormElement>) => {
      setFileDropActive(false);
      setTaskDropActive(false);
      const task = args.onAttachTask ? readDroppedTask(event.dataTransfer) : null;
      if (task) {
        // The editor would otherwise insert the payload as text.
        event.preventDefault();
        event.stopPropagation();
        args.onAttachTask?.(task);
        return;
      }
      if (!args.acceptsFiles || !dragCarriesFiles(event.dataTransfer.types)) return;
      // Files attach the way a paste does; the editor and the page never open or insert them.
      event.preventDefault();
      event.stopPropagation();
      args.attachTransfer(event.dataTransfer);
    },
  };
  return { taskDropActive, fileDropActive, formProps };
}

/**
 * Says what a file drop on the composer does while files are dragged over
 * it. It covers the input card without moving any control: absolutely
 * placed inside the form, it takes no layout space and no pointer events, so
 * the drop still lands on the form. Drag and drop is pointer-only; the
 * attach button and paste stay the keyboard paths, so it is hidden from
 * assistive technology rather than announced on every drag.
 */
export function PromptInputFileDropOverlay() {
  const { t } = useTranslation(["composer"]);
  return (
    <div aria-hidden className={sx(styles.overlay)} data-composer-file-drop="">
      <Upload className={sx(styles.icon)} />
      <span className={sx(styles.title)}>{t("composer:fileDrop.title")}</span>
      <span className={sx(styles.hint)}>{t("composer:fileDrop.hint")}</span>
    </div>
  );
}

const styles = stylex.create({
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: localStack["--stave-stack-overlay"],
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: vars["--aui-space-8"],
    padding: vars["--aui-space-12"],
    borderRadius: "inherit",
    // The form's dashed drop outline sits inside its box, under this layer, so the layer draws it again.
    outlineColor: vars["--aui-color-accent"],
    outlineOffset: -2,
    outlineStyle: "dashed",
    outlineWidth: 2,
    // Opaque enough to put the draft behind the words, in the accent wash the outline already uses.
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-accent-soft"]} 92%, ${vars["--aui-color-surface"]})`,
    color: vars["--aui-color-text"],
    pointerEvents: "none",
    textAlign: "center",
  },
  icon: {
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-md"],
    blockSize: vars["--aui-control-icon-size-md"],
    color: vars["--aui-color-accent"],
  },
  title: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  hint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-tight"],
  },
});
