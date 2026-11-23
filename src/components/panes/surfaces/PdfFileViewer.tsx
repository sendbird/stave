import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getDocument, PDFWorker, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { Button } from "@/components/ui/button";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { FilePreviewReadError, type FilePreviewReader } from "@/lib/fs/file-preview-reader";
import { createPdfPageObserver, readPdfPreview } from "@/lib/fs/pdf-preview";
import { fileViewerStyles as styles } from "./read-only-file.styles";

const pdfAssets = import.meta.glob<string>([
  "/node_modules/pdfjs-dist/cmaps/*.bcmap",
  "/node_modules/pdfjs-dist/standard_fonts/Foxit*.pfb",
  "/node_modules/pdfjs-dist/wasm/{jbig2,openjpeg}.wasm",
], { eager: true, query: "?url", import: "default" });

const assetFolders = {
  cMapUrl: "cmaps",
  standardFontDataUrl: "standard_fonts",
  wasmUrl: "wasm",
} as const;

class BundledPdfData {
  async fetch({ kind, filename }: { kind: keyof typeof assetFolders; filename: string }) {
    const url = pdfAssets[`/node_modules/pdfjs-dist/${assetFolders[kind]}/${filename}`];
    if (!url) throw new Error("Unsupported PDF asset.");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Unable to load PDF asset.");
    return new Uint8Array(await response.arrayBuffer());
  }
}

type PageObserver = ReturnType<typeof createPdfPageObserver>;
type PageSize = { width: number; height: number };
const ACTUAL_SIZE = 96 / 72;
const MAX_CANVAS_EDGE = 4096;

function PdfPageCanvas({ page, scale }: { page: PDFPageProxy; scale: number }) {
  const { t } = useTranslation("panes");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const viewport = page.getViewport({ scale });
    const resolution = Math.min(window.devicePixelRatio || 1, 2, MAX_CANVAS_EDGE / Math.max(viewport.width, viewport.height));
    canvas.width = Math.max(1, Math.floor(viewport.width * resolution));
    canvas.height = Math.max(1, Math.floor(viewport.height * resolution));
    let task: RenderTask | undefined;
    let active = true;
    setFailed(false);
    // The previous zoom's render must cancel before this canvas can be reused.
    void Promise.resolve().then(async () => {
      if (!active) return;
      task = page.render({
        canvas,
        viewport,
        transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0],
      });
      await task.promise;
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      task?.cancel();
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    };
  }, [page, scale]);

  return <>
    <canvas ref={canvasRef} className={sx(styles.pdfCanvas, failed && styles.pdfCanvasFailed)} hidden={failed} aria-hidden="true" />
    {failed ? <span role="status">{t("fileViewer.pdfPageFailed")}</span> : null}
  </>;
}

function PdfPage({
  document, number, placeholder, fitWidth, pageObserver,
}: {
  document: PDFDocumentProxy;
  number: number;
  placeholder: PageSize;
  fitWidth: number | null;
  pageObserver: PageObserver;
}) {
  const { t } = useTranslation("panes");
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [page, setPage] = useState<PDFPageProxy>();
  const [size, setSize] = useState(placeholder);
  const [failed, setFailed] = useState(false);
  const scale = fitWidth === null ? ACTUAL_SIZE : fitWidth / size.width;

  useEffect(() => pageObserver.observe(host.current!, setNear), [pageObserver]);
  useEffect(() => {
    if (!near || page || failed) return;
    let active = true;
    void document.getPage(number).then((next) => {
      if (!active) return;
      setSize(next.getViewport({ scale: 1 }));
      setPage(next);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [document, failed, near, number, page]);

  return (
    <div ref={host} role="img" aria-label={t("fileViewer.pdfPage", { number: formatNumber(number) })}
      className={sx(styles.pdfPage)} data-testid="pdf-page"
      style={{
        "--stave-pdf-page-width": `${size.width * scale}px`,
        "--stave-pdf-page-height": `${size.height * scale}px`,
      } as CSSProperties}>
      {near && page ? <PdfPageCanvas page={page} scale={scale} /> : null}
      {failed ? <span>{t("fileViewer.pdfPageFailed")}</span> : null}
    </div>
  );
}

export default function PdfFileViewer({ reader }: { reader: FilePreviewReader }) {
  const { t } = useTranslation("panes");
  const [state, setState] = useState<{ document: PDFDocumentProxy; placeholder: PageSize }>();
  const [error, setError] = useState<
    "fileViewer.pdfTooLarge" | "fileViewer.changed" | "fileViewer.unavailable" | "fileViewer.pdfInvalid"
  >();
  const [reload, setReload] = useState(0);
  const [fit, setFit] = useState(true);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [pageObserver, setPageObserver] = useState<PageObserver>();

  useEffect(() => {
    const controller = new AbortController();
    let port: Worker | undefined;
    let worker: PDFWorker | undefined;
    let loading: ReturnType<typeof getDocument> | undefined;
    setState(undefined);
    setError(undefined);
    void (async () => {
      const data = await readPdfPreview(reader, controller.signal);
      port = new PdfWorker();
      worker = PDFWorker.create({ port });
      loading = getDocument({
        data, worker,
        enableXfa: false,
        useWorkerFetch: false,
        useSystemFonts: true,
        BinaryDataFactory: BundledPdfData,
      });
      const document = await loading.promise;
      const first = await document.getPage(1);
      if (!controller.signal.aborted) {
        setState({ document, placeholder: first.getViewport({ scale: 1 }) });
      }
    })().catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      const reason = failure instanceof FilePreviewReadError ? failure.reason : null;
      setError(reason === "pdf-too-large" ? "fileViewer.pdfTooLarge"
        : reason === "changed" ? "fileViewer.changed"
        : reason === "unavailable" ? "fileViewer.unavailable"
        : "fileViewer.pdfInvalid");
    });
    return () => {
      controller.abort();
      if (loading) {
        void loading.destroy().catch(() => undefined).finally(() => {
          worker?.destroy();
          port?.terminate();
        });
      } else {
        worker?.destroy();
        port?.terminate();
      }
    };
  }, [reader, reload]);

  useEffect(() => {
    if (!viewport || !pages.current) return;
    const container = pages.current;
    const pageVisibility = createPdfPageObserver(viewport);
    setPageObserver(pageVisibility);
    const measure = () => {
      const { paddingLeft, paddingRight } = getComputedStyle(container);
      setWidth(Math.max(1, viewport.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(container);
    measure();
    return () => {
      observer.disconnect();
      pageVisibility.disconnect();
    };
  }, [viewport]);

  return (
    <div className={sx(styles.root)} data-testid="pdf-file-viewer">
      <div className={sx(styles.toolbar)} data-testid="file-viewer-toolbar">
        <div className={sx(styles.controls)}>
          <Button size="sm" variant={fit ? "secondary" : "outline"} aria-pressed={fit} onClick={() => setFit(true)}>
            {t("fileViewer.fitWidth")}
          </Button>
          <Button size="sm" variant={!fit ? "secondary" : "outline"} aria-pressed={!fit} onClick={() => setFit(false)}>
            {t("fileViewer.actualSize")}
          </Button>
          {error ? <Button size="sm" variant="ghost" onClick={() => setReload((value) => value + 1)}>
            {t("fileViewer.reload")}
          </Button> : null}
        </div>
        {state ? <span className={sx(styles.caption)}>
          {t("fileViewer.pageCount", { count: state.document.numPages, pages: formatNumber(state.document.numPages) })}
        </span> : null}
      </div>
      <div ref={setViewport} className={sx(styles.viewport, styles.pdfViewport)} tabIndex={0} role="region"
        aria-label={t("fileViewer.pdfContent")}>
        {!state ? <div role="status" className={sx(styles.caption, styles.status)}>
          {t(error ?? "fileViewer.loading")}
        </div> : null}
        <div ref={pages} className={sx(styles.pdfPages)}>
          {pageObserver && width && state ? Array.from({ length: state.document.numPages }, (_, index) =>
            <PdfPage key={index} document={state.document} number={index + 1} placeholder={state.placeholder}
              fitWidth={fit ? width : null} pageObserver={pageObserver} />) : null}
        </div>
      </div>
    </div>
  );
}
