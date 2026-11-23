import {
  FILE_PREVIEW_CHUNK_BYTES,
  PDF_PREVIEW_MAX_BYTES,
  FilePreviewReadError,
  readPreviewRange,
  type FilePreviewReader,
} from "./file-preview-reader";

export async function readPdfPreview(reader: FilePreviewReader, signal: AbortSignal) {
  const first = await readPreviewRange(reader, { offset: 0, length: FILE_PREVIEW_CHUNK_BYTES });
  signal.throwIfAborted();
  if (first.size > PDF_PREVIEW_MAX_BYTES) {
    throw new FilePreviewReadError("pdf-too-large");
  }
  const data = new Uint8Array(first.size);
  data.set(first.bytes);
  for (let offset = first.bytes.length; offset < first.size; offset += FILE_PREVIEW_CHUNK_BYTES) {
    const { bytes } = await readPreviewRange(reader, {
      offset,
      length: FILE_PREVIEW_CHUNK_BYTES,
      revision: first.revision,
    });
    signal.throwIfAborted();
    data.set(bytes, offset);
  }
  return data;
}

export function createPdfPageObserver(viewport: HTMLElement) {
  const pages = new Map<Element, (near: boolean) => void>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      pages.get(entry.target)?.(entry.isIntersecting);
    }
  }, {
    root: viewport,
    rootMargin: "50% 0px",
  });

  return {
    observe(page: HTMLElement, setNear: (near: boolean) => void) {
      pages.set(page, setNear);
      observer.observe(page);
      return () => {
        pages.delete(page);
        observer.unobserve(page);
      };
    },
    disconnect() {
      pages.clear();
      observer.disconnect();
    },
  };
}
