import type { RefObject } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";

/**
 * The preview tab: the rectangle the guest page occupies, plus the pane-local
 * status chrome that shares it.
 *
 * Nothing here renders the page. The page is a `<webview>` in the window's
 * surface root, positioned over `placeholderRef` from outside this tree — which
 * is why the placeholder is measured and never painted into, and why the status
 * chrome needs an explicit layer: it overlaps a real page now, not an empty
 * div, and unlayered pane content paints beneath the guest plane.
 */
export function LensPreviewSurface(args: {
  placeholderRef: RefObject<HTMLDivElement | null>;
  hasLensApi: boolean;
  isLoading: boolean;
  lastLoadError: string | null;
}) {
  const { placeholderRef, hasLensApi, isLoading, lastLoadError } = args;

  if (!hasLensApi) {
    return (
      <div className="absolute inset-0 p-3">
        <Empty className="h-full justify-center rounded-xl border-border/70 bg-background/70 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScanSearch />
            </EmptyMedia>
            <EmptyTitle>Lens needs the desktop runtime</EmptyTitle>
            <EmptyDescription>
              {
                "The embedded browser is an Electron `<webview>` guest, so it is unavailable in browser-only mode."
              }
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Use `bun run dev:desktop` or a packaged desktop build to inspect
                pages, capture screenshots, and send element context to a task.
              </p>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div
        ref={placeholderRef}
        data-lens-native-view-placeholder=""
        className="absolute inset-0 min-h-0 overflow-hidden bg-background"
      />
      {isLoading ? (
        <div
          className={`pointer-events-none absolute left-3 top-3 rounded-md border border-border/70 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm ${UI_LAYER_CLASS.lensPaneChrome}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            Loading page
          </span>
        </div>
      ) : null}
      {lastLoadError ? (
        <div
          className={`absolute inset-x-3 bottom-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm ${UI_LAYER_CLASS.lensPaneChrome}`}
        >
          {lastLoadError}
        </div>
      ) : null}
    </>
  );
}
