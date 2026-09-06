/**
 * The sidebar's collapse control, alone in a module.
 *
 * It moved out of `AppShell.tsx` for the reason `PageHeader` and `Topbar` did —
 * that file is the legacy aggregate and the source-structure guard holds it
 * where it is — and because this is the one part of the rail that is routinely
 * rendered OUTSIDE it: in an `AppShell` chrome band, in a mobile bar an app owns
 * above its own content. Its ownership claim (`useClaimShellChromeSidebarTrigger`)
 * belongs next to it, not in the 1,400-line file it toggles.
 */
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type * as React from "react";

import { controlHeights, controlSquares } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { cx, sx } from "../utils/stylex";
import { shellStyles as styles } from "./AppShell.shell.styles";
import {
  useClaimShellChromeSidebarTrigger,
  useOptionalSidebarLayout,
  useSidebar,
} from "./sidebar-context";

export type SidebarTriggerProps = Omit<
  React.ComponentProps<"button">,
  "size"
> & {
  /**
   * Control size when the trigger lives outside the Sidebar's own layout
   * context, such as the leading edge of a workspace Topbar. When omitted,
   * the trigger follows the nearest Sidebar density as before.
   */
  size?: "xs" | "sm" | "md";
};

export function SidebarTrigger({
  "aria-label": ariaLabel,
  children,
  className,
  onClick,
  size,
  type = "button",
  ...props
}: SidebarTriggerProps) {
  const sidebar = useSidebar();
  // A trigger in one of AppShell's chrome bands is THE collapse control for
  // the frame, so it takes the job from the rail's own header trigger rather
  // than sitting 40px away from it. No-op anywhere else — see
  // `ShellChromeContext`.
  useClaimShellChromeSidebarTrigger();
  const sidebarLayout = useOptionalSidebarLayout();
  const expanded = sidebar.isMobile ? sidebar.openMobile : sidebar.open;
  const dir = sidebarLayout?.dir ?? sidebar.dir;
  const Icon = expanded
    ? sidebarLayout?.side === "right"
      ? PanelRightClose
      : PanelLeftClose
    : sidebarLayout?.side === "right"
      ? PanelRightOpen
      : PanelLeftOpen;

  const label = ariaLabel ?? (expanded ? "Collapse sidebar" : "Expand sidebar");
  // The trigger sits in the header row next to nav-shaped content, so it takes
  // the rail's own row height instead of a fixed 36px: at `density="compact"`
  // a 36px bordered square next to 32px rows read as a foreign control.
  const resolvedSize =
    size ?? (sidebarLayout?.density === "compact" ? "sm" : "md");
  const square = controlSquares[resolvedSize];
  const height = controlHeights[resolvedSize];

  return (
    <button
      {...props}
      data-ads-control-icon-button="true"
      aria-label={label}
      aria-controls={sidebar.sidebarId}
      aria-expanded={expanded}
      className={cx(
        sx(
          styles.sidebarTrigger,
          height,
          square,
          focusRing.ring,
          sidebarLayout?.collapsed && styles.sidebarTriggerCollapsed,
        ),
        className,
      )}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          sidebar.toggleSidebar();
        }
      }}
      // Icon-only control: the panel glyph is the recognized affordance
      // (a panel-toggle idiom), so no visible label — the hover title and aria-label
      // carry the meaning instead.
      title={props.title ?? label}
      type={type}
    >
      {children ?? (
        <Icon
          aria-hidden
          className={sx(dir === "rtl" && styles.sidebarTriggerIconRtl)}
          size={resolvedSize === "xs" ? 14 : 16}
        />
      )}
    </button>
  );
}

