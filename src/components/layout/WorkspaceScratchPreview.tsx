import { EditorHtmlPreview } from "./editor-html-preview";
import { EditorMarkdownPreview } from "./editor-markdown-preview";
import { scratchArtifactKind } from "@/lib/workspace-scratch";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  File,
  FileImage,
  FileJson,
  FileText,
  Paperclip,
  ScrollText,
  SquareArrowOutUpRight,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { formatFileSize } from "@/lib/fs/file-preview-limits";
import { WORKSPACE_SCRATCH_TAIL_BYTES, type WorkspaceScratchFile } from "@/lib/workspace-scratch";
import { stripAnsiControlSequences } from "@/lib/workspace-scripts/ansi";
import {
  formatScratchJson,
  scratchDisplayName,
  scratchPreviewKind,
  type ScratchPreviewKind,
} from "@/lib/workspace-scratch-view";
import { scratchPanelStyles as styles } from "./workspace-scratch-panel.styles";

export const SCRATCH_PREVIEW_ICONS: Record<ScratchPreviewKind, LucideIcon> = {
  image: FileImage,
  json: FileJson,
  log: ScrollText,
  text: FileText,
  other: File,
};

/** A log follows its end while the reader is within this many pixels of it. */
const STICK_TO_BOTTOM_SLACK_PX = 24;

type PreviewState =
  | { status: "loading" }
  | { status: "image"; dataUrl: string }
  /** `tailOfBytes`: only the end of a file this large is shown. */
  | { status: "text"; content: string; tailOfBytes: number | null }
  | { status: "too-large" }
  | { status: "unsupported" }
  | { status: "error" };

function previewText(content: string, kind: ScratchPreviewKind, truncated: boolean) {
  if (kind === "json") return truncated ? content : formatScratchJson(content);
  // A log written through `tee` keeps its colour codes; show the text.
  return stripAnsiControlSequences(content);
}

type TextReadResult = { ok: true; content: string; tailOfBytes: number | null } | { ok: false; tooLarge: boolean };

/**
 * Reads at most the last 256 KB of a text file (`fs:read-scratch-tail`), so a
 * growing log costs one small read per refresh. Without that bridge (older
 * hosts, fixtures) it falls back to reading the whole file within the
 * editor's preview limit.
 */
async function readScratchText(rootPath: string, filePath: string): Promise<TextReadResult> {
  const fs = window.api?.fs;
  if (fs?.readScratchTail) {
    const result = await fs.readScratchTail({ rootPath, filePath });
    if (!result.ok) return { ok: false, tooLarge: false };
    return { ok: true, content: result.content, tailOfBytes: result.truncated ? result.sizeBytes : null };
  }
  const result = await fs?.readFile?.({ rootPath, filePath });
  if (!result?.ok) return { ok: false, tooLarge: Boolean(result?.tooLarge) };
  return { ok: true, content: result.content, tailOfBytes: null };
}

export function ScratchFilePreview(props: {
  rootPath: string;
  file: WorkspaceScratchFile;
  onOpenInEditor: (filePath: string) => void;
  onAttach: (filePath: string) => void;
}) {
  const { t } = useTranslation(["workspace"]);
  const { rootPath, file } = props;
  const kind = scratchPreviewKind(file.path);
  const artifactKind = scratchArtifactKind(file.path);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followEndRef = useRef(true);
  const shownPathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A new file starts blank; the same file written again keeps its old
    // content on screen until the new one arrives, so a growing log does not flash.
    if (shownPathRef.current !== file.path) {
      shownPathRef.current = file.path;
      followEndRef.current = true;
      setState({ status: "loading" });
    }
    if (kind === "other") {
      setState({ status: "unsupported" });
      return;
    }
    if (kind === "image") {
      void window.api?.fs?.readFileDataUrl?.({ rootPath, filePath: file.path })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setState({ status: "image", dataUrl: result.dataUrl });
          else setState({ status: result.tooLarge ? "too-large" : "error" });
        })
        .catch(() => !cancelled && setState({ status: "error" }));
    } else {
      void readScratchText(rootPath, file.path)
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setState({
              status: "text",
              content: previewText(result.content, kind, result.tailOfBytes !== null),
              tailOfBytes: result.tailOfBytes,
            });
          } else {
            setState({ status: result.tooLarge ? "too-large" : "error" });
          }
        })
        .catch(() => !cancelled && setState({ status: "error" }));
    }
    return () => {
      cancelled = true;
    };
  }, [rootPath, file.path, file.mtimeMs, file.sizeBytes, kind]);

  // A log stays pinned to its end while the reader is there; scrolling up
  // to read earlier lines stops the follow until they scroll back down.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || kind !== "log" || state.status !== "text") return;
    if (followEndRef.current) element.scrollTop = element.scrollHeight;
  }, [kind, state]);

  const Icon = SCRATCH_PREVIEW_ICONS[kind];
  const name = scratchDisplayName(file.path);
  const openInEditor = () => props.onOpenInEditor(file.path);

  return (
    <section className={sx(styles.preview)} aria-label={t("workspaceScratchPanel.previewLabel", { name })}>
      <div className={sx(styles.previewHeader)}>
        <Icon aria-hidden className={sx(styles.rowIcon)} />
        <span className={sx(styles.previewTitle)} title={file.path}>
          {name}
        </span>
        <Tooltip content={t("workspaceScratchPanel.attachToMessage")}>
          <Button
            size="xs"
            variant="quiet"
            iconOnly
            aria-label={t("workspaceScratchPanel.attachToMessage")}
            onClick={() => props.onAttach(file.path)}
          >
            <Paperclip />
          </Button>
        </Tooltip>
        <Tooltip content={t("workspaceScratchPanel.openInEditor")}>
          <Button
            size="xs"
            variant="quiet"
            iconOnly
            aria-label={t("workspaceScratchPanel.openInEditor")}
            onClick={openInEditor}
          >
            <SquareArrowOutUpRight />
          </Button>
        </Tooltip>
      </div>
      {state.status === "text" && state.tailOfBytes !== null ? (
        <p className={sx(styles.previewNote)} data-testid="scratch-preview-tail-note">
          {t("workspaceScratchPanel.showingTail", {
            size: formatFileSize(WORKSPACE_SCRATCH_TAIL_BYTES),
            total: formatFileSize(state.tailOfBytes),
          })}
        </p>
      ) : null}
      <div
        ref={scrollRef}
        className={sx(styles.previewBody)}
        data-testid="scratch-preview-body"
        onScroll={(event) => {
          const element = event.currentTarget;
          followEndRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <= STICK_TO_BOTTOM_SLACK_PX;
        }}
      >
        {state.status === "image" ? (
          <img className={sx(styles.previewImage)} src={state.dataUrl} alt={name} />
        ) : state.status === "text" && state.tailOfBytes === null && artifactKind === "html" ? (
          <EditorHtmlPreview content={state.content} frameTitle={name} networkPolicy="blocked" />
        ) : state.status === "text" && state.tailOfBytes === null && artifactKind === "markdown" ? (
          <EditorMarkdownPreview content={state.content} fontSize={14} variant="embedded" />
        ) : state.status === "text" ? (
          <pre className={sx(styles.previewText)}>{state.content}</pre>
        ) : state.status === "loading" ? null : (
          <div className={sx(styles.previewNotice)}>
            <span>
              {state.status === "too-large"
                ? t("workspaceScratchPanel.tooLargeToPreview", { size: formatFileSize(file.sizeBytes) })
                : state.status === "unsupported"
                  ? t("workspaceScratchPanel.noPreview")
                  : t("workspaceScratchPanel.previewFailed")}
            </span>
            <Button size="sm" variant="outlined" onClick={openInEditor}>
              {t("workspaceScratchPanel.openInEditor")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
