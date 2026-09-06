import { useCallback, useId, useMemo, useState } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { cx, sx } from "../utils/stylex";
import { shellStyles as styles } from "./AppShell.shell.styles";
import { ShellChromeContext, useOptionalSidebar } from "./sidebar-context";

/**
 * The workspace-grid contract lives apart from the Sidebar implementation so
 * AppShell navigation can evolve without growing the legacy aggregate module.
 */
export type AppShellContentLayout = "app" | "fill" | "scroll";

export type AppShellProps = React.ComponentProps<"div"> & {
  /**
   * Platform-owned application navigation rendered as the physical outer-left
   * rail. Keep service identity, organization/application switching, and
   * account utilities here; product navigation remains in `sidebar` and keeps
   * its own collapse state.
   */
  appRail?: React.ReactNode;
  /**
   * Optional contextual chrome inside the raised application frame. Global
   * organization/application switching belongs in `appRail`; product-owned
   * headers remain in `workspaceHeader`.
   */
  appHeader?: React.ReactNode;
  /**
   * How the scrolling main region treats its children. @default "scroll"
   *
   * - `"scroll"` — a padded, top-aligned stack that scrolls. Right for a page
   *   made of sections: a `PageHeader` above cards, a settings form, a report.
   * - `"fill"` — one flush, bounded region with no inset and no gap, sized to
   *   the shell rather than to its content. Reach for it when the app owns the
   *   work surface: a full-height `DataTable fillHeight`, a `Board`, or a
   *   docked `PeekPanel` needs a containing block with a definite height, and
   *   under `"scroll"` the row is content-sized, so `100%` inside it has
   *   nothing to resolve against and the surface collapses to its content.
   *
   * - `"app"` — `"fill"` geometry, and the shell stands its own `<main>` down.
   *   Use it when the shell hosts a whole application rather than a work
   *   surface — Atelier's platform shell hosting a sub-app. That application
   *   brings its own landmark, and two `<main>`s give a screen reader two
   *   "main" destinations to choose between.
   *
   * The child owns padding and scrolling in `"fill"` and `"app"`. Two nested
   * scrollers is the failure this avoids, so the region itself does not scroll.
   */
  contentLayout?: AppShellContentLayout;
  sidebar?: React.ReactNode;
  sidebarSide?: "left" | "right";
  /** Accessible bypass-link copy. @default "Skip to content" */
  skipLinkLabel?: string;
  /**
   * Workspace-level chrome above the scrollable main region. Prefer this name
   * for new code; compose with `Topbar` or another ADS header surface.
   */
  workspaceHeader?: React.ReactNode;
  /** @deprecated Use `workspaceHeader`. Kept as a backward-compatible alias. */
  topbar?: React.ReactNode;
};

export function AppShell({
  appHeader,
  appRail,
  children,
  className,
  contentLayout = "scroll",
  dir,
  sidebar,
  sidebarSide = "left",
  skipLinkLabel = "Skip to content",
  topbar,
  workspaceHeader,
  ...props
}: AppShellProps) {
  const sidebarContext = useOptionalSidebar();
  const contentDir = dir ?? sidebarContext?.dir;
  const generatedId = useId();
  const contentId = `${generatedId}-content`;
  const resolvedWorkspaceHeader = workspaceHeader ?? topbar;
  // The skip link still targets this region either way — `tabIndex={-1}` is
  // what makes it focusable, not the tag.
  const ContentRegion = contentLayout === "app" ? "div" : "main";
  const hasAppHeader = Boolean(appHeader);
  const hasAppRail = Boolean(appRail);
  const hasSidebar = Boolean(sidebar);
  const hasWorkspaceHeader = Boolean(resolvedWorkspaceHeader);
  const workspaceHeaderCount =
    Number(hasAppHeader) + Number(hasWorkspaceHeader);
  /*
   * Trigger ownership across the shell/sidebar seam. A `SidebarTrigger`
   * rendered in one of the chrome bands below claims the sidebar's collapse
   * control, and `Sidebar` then stands its own header trigger down instead of
   * shipping two buttons for one state (`useSidebarOwnsTrigger`).
   *
   * A count, not a flag, because the claim has to survive React's unmount
   * order: on a route change that swaps one chrome band for another, the new
   * trigger mounts before the old one's cleanup runs, and a boolean would end
   * up false with a trigger still on screen.
   *
   * Two providers, one context. The claim function is scoped to the header
   * slots, so only a trigger inside the shell's own chrome can take the control
   * — one rendered in `children`, in the app rail, or in a mobile bar an app
   * owns cannot. The claimed state is published to the whole shell, because the
   * `Sidebar` that has to read it sits in a sibling slot.
   */
  const [chromeTriggers, setChromeTriggers] = useState(0);
  const claimSidebarTrigger = useCallback(() => {
    setChromeTriggers((count) => count + 1);

    return () => setChromeTriggers((count) => count - 1);
  }, []);
  const sidebarTriggerClaimed = chromeTriggers > 0;
  const shellChrome = useMemo(
    () => ({ sidebarTriggerClaimed }),
    [sidebarTriggerClaimed],
  );
  const chromeSlotSurface = useMemo(
    () => ({ claimSidebarTrigger, sidebarTriggerClaimed }),
    [claimSidebarTrigger, sidebarTriggerClaimed],
  );
  const appRailSlot = hasAppRail ? (
    <div className={sx(styles.appRailSlot)} data-app-rail-slot="true">
      {appRail}
    </div>
  ) : null;
  const sidebarSlot = sidebar ? (
    <div className={sx(styles.sidebarSlot)}>{sidebar}</div>
  ) : null;

  return (
    <ShellChromeContext.Provider value={shellChrome}>
      <div
        {...props}
        // Grid auto-placement follows `direction`, which made the physical
        // `sidebarSide="right"` slot move left under RTL. Keep shell geometry
        // physical and restore the requested writing direction inside the
        // workspace; Sidebar already receives the provider direction itself.
        dir="ltr"
        className={cx(
          sx(
            styles.shell,
            hasAppRail && styles.shellWithAppRail,
            hasAppRail && styles.shellFramedChrome,
          ),
          className,
        )}
        data-app-rail={hasAppRail ? "true" : undefined}
        data-app-header={hasAppHeader ? "true" : undefined}
        data-sidebar-side={sidebar ? sidebarSide : undefined}
      >
        {/*
        A shell may put both application and product navigation before
        `<main>`, so without this a keyboard user tabs every rail again on each
        route change. First focusable thing in the shell, off-screen until
        focused (WCAG 2.4.1 bypass block). `<main>` takes `tabIndex={-1}`
        because a heading-less landmark is not focusable on its own, and a skip
        link that only scrolls leaves the tab order exactly where it was.
      */}
        <a
          className={sx(styles.skipLink, focusRing.ring)}
          dir={contentDir}
          href={`#${contentId}`}
        >
          {skipLinkLabel}
        </a>
        {appRailSlot}
        <div
          className={sx(
            styles.appFrame,
            styles.appFrameSurface,
            hasAppRail && styles.appFrameAfterRail,
            hasAppRail && styles.appFrameFramed,
            hasSidebar &&
              sidebarSide === "left" &&
              styles.appFrameWithSidebarLeft,
            hasSidebar &&
              sidebarSide === "right" &&
              styles.appFrameWithSidebarRight,
          )}
          data-app-frame="true"
        >
          {sidebarSide === "left" ? sidebarSlot : null}
          <div
            className={sx(
              styles.workspace,
              workspaceHeaderCount === 1 && styles.workspaceWithHeader,
              workspaceHeaderCount === 2 && styles.workspaceWithTwoHeaders,
            )}
            dir={contentDir}
          >
            <ShellChromeContext.Provider value={chromeSlotSurface}>
              {hasAppHeader ? (
                <div
                  className={sx(styles.appHeaderSlot)}
                  data-app-header-slot="true"
                >
                  {appHeader}
                </div>
              ) : null}
              {hasWorkspaceHeader ? (
                <div
                  className={sx(styles.workspaceHeaderSlot)}
                  data-workspace-header-slot="true"
                >
                  {resolvedWorkspaceHeader}
                </div>
              ) : null}
            </ShellChromeContext.Provider>
            <ContentRegion
              className={sx(
                styles.content,
                contentLayout !== "scroll" && styles.contentFill,
              )}
              id={contentId}
              tabIndex={-1}
            >
              {children}
            </ContentRegion>
          </div>
          {sidebarSide === "right" ? sidebarSlot : null}
        </div>
      </div>
    </ShellChromeContext.Provider>
  );
}

