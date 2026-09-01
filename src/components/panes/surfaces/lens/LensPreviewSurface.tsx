import { createPortal } from "react-dom";
import { Loader2, ScanSearch } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";

/**
 * The preview tab: the rectangle the guest page occupies, plus the pane-local
 * status chrome that shares it.
 *
 * Nothing here renders the page. The page is a `<webview>` in the window's
 * surface root, positioned over `placeholderRef` from outside this tree — which
 * is why the placeholder is measured and never painted into.
 *
 * The status chrome is portalled into `chromeLayer`, a sibling of that guest,
 * rather than rendered here with a `z-index`. Dockview renders keep-alive
 * panels through `.dv-render-overlay`, which sets `isolation: isolate`,
 * `contain: layout paint` and a `transform` — three separate reasons it is a
 * stacking context — and carries `z-index: 1` itself. Any layer a panel claims
 * for its own chrome is scoped inside that context, so it cannot beat the guest
 * plane and the chrome is painted behind an opaque page instead: a failed load
 * shows no error, and a slow one shows no spinner.
 */
export function LensPreviewSurface(args: {
  placeholderRef: (element: HTMLDivElement | null) => void;
  chromeLayer: HTMLElement | null;
  hasLensApi: boolean;
  isLoading: boolean;
  lastLoadError: string | null;
}) {
  const { placeholderRef, chromeLayer, hasLensApi, isLoading, lastLoadError } =
    args;

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

  const statusChrome =
    isLoading || lastLoadError ? (
      <>
        {isLoading ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border/70 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Loading page
            </span>
          </div>
        ) : null}
        {lastLoadError ? (
          <div className="absolute inset-x-3 bottom-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm">
            {lastLoadError}
          </div>
        ) : null}
      </>
    ) : null;

  return (
    <>
      <div
        ref={placeholderRef}
        data-lens-guest-placeholder=""
        className="absolute inset-0 min-h-0 overflow-hidden bg-background"
      />
      {/*
        Before a guest exists there is no page to be hidden behind, so the same
        chrome renders in place — which is also the only way it is visible while
        the session is still opening. `isConnected` covers the window between a
        session ending and this panel being told: the layer is removed with its
        guest, and portalling into a detached node would drop the chrome for the
        rebuild it is meant to narrate.
      */}
      {statusChrome
        ? chromeLayer?.isConnected
          ? createPortal(statusChrome, chromeLayer)
          : statusChrome
        : null}
    </>
  );
}
