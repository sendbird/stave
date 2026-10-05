import { i18n, useTranslation } from "@/i18n";
import { createPortal } from "react-dom";
import * as stylex from "@stylexjs/stylex";
import { ScanSearch } from "lucide-react";
import { ActionButton } from "@/components/system/ActionButton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Loader,
} from "@/components/ui";
import { workbenchStyles as w } from "./lens-workbench.styles";

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
  isBlank?: boolean;
  onEnterAddress?: () => void;
  onOpenTools?: () => void;
  onRetry?: () => void;
}) {
  useTranslation();
  const { placeholderRef, chromeLayer, hasLensApi, isLoading, lastLoadError } =
    args;

  if (!hasLensApi) {
    return (
      <div {...stylex.props(w.previewHost)}>
        <Empty xstyle={w.runtimeEmpty}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScanSearch />
            </EmptyMedia>
            <EmptyTitle>{i18n.t("lens:lensPreviewSurface.lensNeedsTheDesktopRuntime")}</EmptyTitle>
            <EmptyDescription>
              {i18n.t("lens:lensPreviewSurface.openStaveOnYourDesktopToPreview")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div {...stylex.props(w.runtimeCopy)}>
              <p>
                {i18n.t("lens:lensPreviewSurface.yourRegularBrowserRemainsAvailableForResearch")}
              </p>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const statusChrome =
    isLoading || lastLoadError || args.isBlank ? (
      <>
        {args.isBlank && !isLoading && !lastLoadError ? (
          <section
            aria-label={i18n.t("lens:lensPreviewSurface.getStartedWithLens")}
            {...stylex.props(w.overlay)}
          >
            <div {...stylex.props(w.onboarding)}>
              <ScanSearch
                aria-hidden="true"
                {...stylex.props(w.onboardingIcon)}
              />
              <h2 {...stylex.props(w.onboardingTitle)}>
                {i18n.t("lens:lensPreviewSurface.seeThePageBringTheEvidence")}
              </h2>
              <p {...stylex.props(w.onboardingCopy)}>
                {i18n.t("lens:lensPreviewSurface.openADevelopmentPreviewOrAWeb")}
              </p>
              <div {...stylex.props(w.actions)}>
                {args.onEnterAddress ? (
                  <ActionButton weight="primary" onClick={args.onEnterAddress}>
                    {i18n.t("lens:lensPreviewSurface.enterAPageAddress")}
                  </ActionButton>
                ) : null}
                {args.onOpenTools ? (
                  <ActionButton onClick={args.onOpenTools}>
                    {i18n.t("lens:lensPreviewSurface.startADevServer")}
                  </ActionButton>
                ) : null}
              </div>
              <ul {...stylex.props(w.onboardingList)}>
                <li>
                  <strong {...stylex.props(w.strong)}>
                    {i18n.t("lens:lensPreviewSurface.inspectComment")}
                  </strong>{" "}
                  {i18n.t("lens:lensPreviewSurface.selectAnElementOrMarkAnArea")}
                </li>
                <li>
                  <strong {...stylex.props(w.strong)}>{i18n.t("lens:lensPreviewSurface.checkBehavior")}</strong>{" "}
                  {i18n.t("lens:lensPreviewSurface.useConsoleAndNetworkToInspectErrors")}
                </li>
                <li>
                  <strong {...stylex.props(w.strong)}>{i18n.t("lens:lensPreviewSurface.keepEvidence")}</strong>{" "}
                  {i18n.t("lens:lensPreviewSurface.captureAScreenshotOrDownloadPageAssets")}
                </li>
              </ul>
            </div>
          </section>
        ) : null}
        {isLoading ? (
          <div {...stylex.props(w.loading)}>
            <span {...stylex.props(w.loadingContent)}>
              <Loader aria-hidden size="xs" variant="scan" />
              {i18n.t("lens:lensPreviewSurface.loadingPage")}
            </span>
          </div>
        ) : null}
        {lastLoadError ? (
          <div role="alert" {...stylex.props(w.error)}>
            <p {...stylex.props(w.errorTitle)}>{i18n.t("lens:lensPreviewSurface.thePageCouldNotBeLoaded")}</p>
            <p {...stylex.props(w.onboardingCopy, w.breakWords)}>
              {lastLoadError}
            </p>
            <div {...stylex.props(w.actions)}>
              {args.onRetry ? (
                <ActionButton
                  size="xs"
                  disabled={isLoading}
                  onClick={args.onRetry}
                >
                  {i18n.t("lens:lensPreviewSurface.retryLoading")}
                </ActionButton>
              ) : null}
              {args.onEnterAddress ? (
                <ActionButton
                  size="xs"
                  weight="quiet"
                  onClick={args.onEnterAddress}
                >
                  {i18n.t("lens:lensPreviewSurface.checkTheAddress")}
                </ActionButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </>
    ) : null;

  return (
    <>
      <div
        ref={placeholderRef}
        data-lens-guest-placeholder=""
        {...stylex.props(w.guestPlaceholder)}
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
