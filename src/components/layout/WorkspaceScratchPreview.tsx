import { ImageLightbox } from "@/components/ui/image-lightbox";
import { EditorHtmlPreview } from "./editor-html-preview";
import { EditorMarkdownPreview } from "./editor-markdown-preview";
import { scratchArtifactKind } from "@/lib/workspace-scratch";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  File,
  FileImage,
  FileJson,
  FileText,
  Maximize2,
  Paperclip,
  ScrollText,
  SquareArrowOutUpRight,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { formatFileSize, WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES } from "@/lib/fs/file-preview-limits";
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
  | { status: "loading" | "deferred" }
  | { status: "image"; dataUrl: string }
  /** `tailOfBytes`: only the end of a file this large is shown. */
  | { status: "text"; content: string; tailOfBytes: number | null; nextOffset?: number }
  | { status: "too-large" }
  | { status: "unsupported" }
  | { status: "error" };

function previewText(content: string, kind: ScratchPreviewKind, truncated: boolean) {
  if (kind === "json") return truncated ? content : formatScratchJson(content);
  // A log written through `tee` keeps its colour codes; show the text.
  return stripAnsiControlSequences(content);
}

type TextReadResult = { ok: true; content: string; tailOfBytes: number | null; nextOffset?: number } | { ok: false; tooLarge: boolean };

/**
 * Reads at most the last 256 KB of a text file (`fs:read-scratch-tail`), so a
 * growing log costs one small read per refresh. Without that bridge (older
 * hosts, fixtures) it falls back to reading the whole file within the
 * editor's preview limit.
 */
async function readScratchText(rootPath: string, filePath: string, offset?: number, whole = false): Promise<TextReadResult> {
  const fs = window.api?.fs;
  if (fs?.readScratchTail) {
    const result = await fs.readScratchTail({ rootPath, filePath, offset, wholeHtml: whole });
    if (!result.ok) return { ok: false, tooLarge: false };
    return { ok: true, content: result.content, nextOffset: result.nextOffset, tailOfBytes: offset === undefined && result.truncated ? result.sizeBytes : null };
  }
  const result = await fs?.readFile?.({ rootPath, filePath });
  if (!result?.ok) return { ok: false, tooLarge: Boolean(result?.tooLarge) };
  return { ok: true, content: result.content, tailOfBytes: null };
}

export function ScratchFilePreview(props: {
  rootPath: string;
  file: WorkspaceScratchFile;
  onOpenInEditor?: (filePath: string) => void;
  onAttach?: (filePath: string) => void;
}) {
  const { t } = useTranslation(["workspace"]);
  const { rootPath, file } = props;
  const kind = scratchPreviewKind(file.path);
  const artifactKind = scratchArtifactKind(file.path);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [offset, setOffset] = useState(0);
  const [loadHtml, setLoadHtml] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
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
    const largeHtml = artifactKind === "html" && file.sizeBytes > WORKSPACE_SCRATCH_TAIL_BYTES;
    if (largeHtml && (!loadHtml || file.sizeBytes > WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES)) {
      setState({ status: file.sizeBytes > WORKSPACE_HTML_FILE_PREVIEW_MAX_BYTES ? "too-large" : "deferred" });
      return;
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
      void readScratchText(rootPath, file.path, artifactKind === "markdown" ? offset : undefined, largeHtml)
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setState({
              status: "text",
              nextOffset: result.nextOffset,
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
  }, [rootPath, file.path, file.mtimeMs, file.sizeBytes, kind, offset, loadHtml, artifactKind]);

  // A log stays pinned to its end while the reader is there; scrolling up
  // to read earlier lines stops the follow until they scroll back down.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || kind !== "log" || state.status !== "text") return;
    if (followEndRef.current) element.scrollTop = element.scrollHeight;
  }, [kind, state]);

  const Icon = SCRATCH_PREVIEW_ICONS[kind];
  const name = scratchDisplayName(file.path);
  const openInEditor = () => props.onOpenInEditor?.(file.path);

  return (
    <section ref={sectionRef} className={sx(styles.preview)} aria-label={t("workspaceScratchPanel.previewLabel", { name })}>
      <div className={sx(styles.previewHeader)}>
        <Icon aria-hidden className={sx(styles.rowIcon)} />
        <span className={sx(styles.previewTitle)} title={file.path}>
          {name}
        </span>
        <Tooltip content={t("workspaceScratchPanel.expand")}>
          <Button variant="quiet" size="xs" iconOnly aria-label={t("workspaceScratchPanel.expand")} onClick={() => {
            if (kind === "image") setImageOpen(true);
            else if (document.fullscreenElement === sectionRef.current) void document.exitFullscreen();
            else void sectionRef.current?.requestFullscreen();
          }}><Maximize2 /></Button>
        </Tooltip>
        {props.onAttach && <Tooltip content={t("workspaceScratchPanel.attachToMessage")}>
          <Button
            size="xs"
            variant="quiet"
            iconOnly
            aria-label={t("workspaceScratchPanel.attachToMessage")}
            onClick={() => props.onAttach?.(file.path)}
          >
            <Paperclip />
          </Button>
        </Tooltip>}
        {props.onOpenInEditor && <Tooltip content={t("workspaceScratchPanel.openInEditor")}>
          <Button
            size="xs"
            variant="quiet"
            iconOnly
            aria-label={t("workspaceScratchPanel.openInEditor")}
            onClick={openInEditor}
          >
            <SquareArrowOutUpRight />
          </Button>
        </Tooltip>}
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
          <>
            <Button layout="host" onClick={() => setImageOpen(true)} aria-label={t("workspaceScratchPanel.expand")}>
              <img className={sx(styles.previewImage)} src={state.dataUrl} alt={name} />
            </Button>
            {imageOpen && <ImageLightbox open imageSrc={state.dataUrl} alt={name} onClose={() => setImageOpen(false)} />}
          </>
        ) : state.status === "text" && state.tailOfBytes === null && artifactKind === "html" ? (
          <EditorHtmlPreview content={state.content} frameTitle={name} networkPolicy="blocked" />
        ) : state.status === "text" && state.tailOfBytes === null && artifactKind === "markdown" ? (
          <EditorMarkdownPreview content={state.content} fontSize={14} variant="embedded" />
        ) : state.status === "text" ? (
          <pre className={sx(styles.previewText)}>{state.content}</pre>
        ) : state.status === "deferred" ? (
          <Button onClick={() => setLoadHtml(true)}>{t("workspaceScratchPanel.loadHtml", { size: formatFileSize(file.sizeBytes) })}</Button>
        ) : state.status === "loading" ? null : (
          <div className={sx(styles.previewNotice)}>
            <span>
              {state.status === "too-large"
                ? t("workspaceScratchPanel.tooLargeToPreview", { size: formatFileSize(file.sizeBytes) })
                : state.status === "unsupported"
                  ? t("workspaceScratchPanel.noPreview")
                  : t("workspaceScratchPanel.previewFailed")}
            </span>
            {props.onOpenInEditor && <Button size="sm" variant="outlined" onClick={openInEditor}>
              {t("workspaceScratchPanel.openInEditor")}
            </Button>}
          </div>
        )}
      </div>
      {state.status === "text" && state.nextOffset !== undefined && (
        <Button onClick={() => { setOffset(state.nextOffset!); scrollRef.current?.scrollTo(0, 0); }}>
          {t("workspaceScratchPanel.nextPage")}
        </Button>
      )}
      {offset > 0 && <Button onClick={() => setOffset(0)}>{t("workspaceScratchPanel.firstPage")}</Button>}
    </section>
  );
}
