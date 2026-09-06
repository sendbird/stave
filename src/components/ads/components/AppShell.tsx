import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import type * as React from "react";

import {
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogRoot,
} from "../headless/dialog";
import {
  TooltipArrow,
  TooltipPortal,
  TooltipPositioner,
  TooltipPopup,
  TooltipRoot,
  TooltipTrigger,
} from "../headless/tooltip";
import {
  controlHeights,
  controlIconSizes,
  controlSquares,
} from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { cx, sx } from "../utils/stylex";
import {
  SidebarInput,
  SidebarRail,
  SidebarSearch,
  SidebarSeparator,
  type SidebarInputProps,
  type SidebarRailProps,
  type SidebarSearchProps,
  type SidebarSeparatorProps,
} from "./AppShell.SidebarSearch";
import {
  SidebarTrigger,
  type SidebarTriggerProps,
} from "./AppShell.SidebarTrigger";
import { TooltipProvider } from "./Tooltip";
import { sidebarStyles } from "./AppShell.sidebar.styles";
import { shellStyles } from "./AppShell.shell.styles";
import {
  SidebarContext,
  SidebarLayoutContext,
  SidebarMenuItemContext,
  useOptionalSidebar,
  useOptionalSidebarLayout,
  useSidebar,
  useSidebarOwnsTrigger,
  type SidebarCollapsible,
  type SidebarContextValue,
  type SidebarDensity,
  type SidebarDirection,
  type SidebarLayoutContextValue,
  type SidebarMenuButtonSize,
  type SidebarMenuButtonVariant,
  type SidebarMenuItemContextValue,
  type SidebarMenuSubButtonSize,
} from "./sidebar-context";
import {
  SidebarDisclosurePanel,
  SidebarMenuChevron,
  SidebarMenuSubBase,
  type SidebarMenuChevronProps,
  type SidebarMenuSubProps,
} from "./sidebar-menu-disclosure";
import {
  SidebarMenuInitial,
  type SidebarMenuInitialProps,
} from "./sidebar-menu-initial";
import {
  SidebarMenuAction,
  SidebarMenuBadge,
} from "./AppShell.SidebarMenuSlot";

export {
  SidebarInput,
  SidebarMenuChevron,
  SidebarMenuInitial,
  SidebarRail,
  SidebarSearch,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
export type {
  SidebarDensity,
  SidebarDirection,
  SidebarInputProps,
  SidebarMenuButtonSize,
  SidebarMenuButtonVariant,
  SidebarMenuChevronProps,
  SidebarMenuInitialProps,
  SidebarMenuSubButtonSize,
  SidebarMenuSubProps,
  SidebarRailProps,
  SidebarSearchProps,
  SidebarSeparatorProps,
  SidebarTriggerProps,
};

// `PageHeader` and `Topbar` moved to their own modules so this file stays under
// the source-structure size limit; re-exported here so every existing
// `./AppShell` import keeps resolving.
export { PageHeader, PageHeaderMetaItem } from "./AppShell.PageHeader";
export type { PageHeaderProps } from "./AppShell.PageHeader";
export { Topbar } from "./AppShell.Topbar";
export type { TopbarProps } from "./AppShell.Topbar";
// `SidebarMenuBadge` and `SidebarMenuAction` are one module because they are one
// contract: the action floats over the badge's slot and the badge yields it.
export { SidebarMenuAction, SidebarMenuBadge };
export type {
  SidebarMenuActionProps,
  SidebarMenuBadgeProps,
} from "./AppShell.SidebarMenuSlot";
export { AppShell } from "./AppShell.Root";
export type { AppShellProps } from "./AppShell.Root";

export type SidebarItem = Omit<React.ComponentProps<"a">, "children"> & {
  badge?: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  label: React.ReactNode;
  size?: SidebarMenuButtonSize;
  tooltip?: React.ReactNode;
  variant?: SidebarMenuButtonVariant;
};

const DEFAULT_SIDEBAR_MOBILE_QUERY = "(max-width: 768px)";
const DEFAULT_SIDEBAR_KEYBOARD_SHORTCUT = "b";
const EDITABLE_SHORTCUT_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

function isEditableShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      Boolean(target.closest(EDITABLE_SHORTCUT_TARGET_SELECTOR)))
  );
}

export type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpenMobile?: boolean;
  defaultOpen?: boolean;
  dir?: SidebarDirection;
  keyboardShortcut?: string;
  mobileQuery?: string;
  onOpenMobileChange?: (open: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  openMobile?: boolean;
  open?: boolean;
};

export function SidebarProvider({
  children,
  className,
  defaultOpenMobile = false,
  defaultOpen = true,
  dir = "ltr",
  keyboardShortcut = DEFAULT_SIDEBAR_KEYBOARD_SHORTCUT,
  mobileQuery = DEFAULT_SIDEBAR_MOBILE_QUERY,
  onOpenMobileChange,
  onOpenChange,
  openMobile,
  open,
  ...props
}: SidebarProviderProps) {
  const generatedId = useId();
  const sidebarId = `${generatedId}-sidebar`;
  const [isMobile, setIsMobile] = useState(false);
  const [uncontrolledOpenMobile, setUncontrolledOpenMobile] =
    useState(defaultOpenMobile);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const resolvedOpenMobile = openMobile ?? uncontrolledOpenMobile;
  const resolvedOpen = open ?? uncontrolledOpen;
  const state = resolvedOpen ? "expanded" : "collapsed";

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  const setOpenMobile = useCallback(
    (nextOpen: boolean) => {
      if (openMobile === undefined) {
        setUncontrolledOpenMobile(nextOpen);
      }

      onOpenMobileChange?.(nextOpen);
    },
    [onOpenMobileChange, openMobile],
  );

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(!resolvedOpenMobile);
      return;
    }

    setOpen(!resolvedOpen);
  }, [isMobile, resolvedOpen, resolvedOpenMobile, setOpen, setOpenMobile]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQueryList = window.matchMedia(mobileQuery);
    const updateIsMobile = () => setIsMobile(mediaQueryList.matches);

    updateIsMobile();
    mediaQueryList.addEventListener("change", updateIsMobile);

    return () => {
      mediaQueryList.removeEventListener("change", updateIsMobile);
    };
  }, [mobileQuery]);

  useEffect(() => {
    if (!keyboardShortcut) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === keyboardShortcut.toLowerCase()
      ) {
        if (isEditableShortcutTarget(event.target)) {
          return;
        }

        event.preventDefault();
        toggleSidebar();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [keyboardShortcut, toggleSidebar]);

  const contextValue = useMemo<SidebarContextValue>(
    () => ({
      isMobile,
      open: resolvedOpen,
      openMobile: resolvedOpenMobile,
      dir,
      setOpenMobile,
      setOpen,
      sidebarId,
      state,
      toggleSidebar,
    }),
    [
      isMobile,
      resolvedOpen,
      resolvedOpenMobile,
      dir,
      setOpen,
      setOpenMobile,
      sidebarId,
      state,
      toggleSidebar,
    ],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        {...props}
        className={cx(sx(styles.sidebarProvider), className)}
        dir={dir}
        data-sidebar-mobile={isMobile ? "true" : "false"}
        data-sidebar-mobile-state={
          resolvedOpenMobile ? "expanded" : "collapsed"
        }
        data-sidebar-state={state}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export type SidebarProps = React.ComponentProps<"nav"> & {
  children?: React.ReactNode;
  collapsed?: boolean;
  /** Header action shown below the expand trigger in the collapsed icon rail. */
  collapsedHeader?: React.ReactNode;
  collapsible?: SidebarCollapsible;
  /**
   * Row + padding density. @default "compact"
   *
   * Compact rows are the product default. Hosts that need roomier 36px rows
   * opt into comfortable density explicitly.
   */
  density?: SidebarDensity;
  /** Bottom-pinned navigation and utility actions, outside the scrolling content region. */
  footer?: React.ReactNode;
  header?: React.ReactNode;
  items?: SidebarItem[];
  /**
   * Render the collapse trigger at the trailing edge of the header. @default
   * true, unless an `AppShell` chrome band has claimed the control — see
   * `useSidebarOwnsTrigger`. Pass a boolean to decide it outright.
   */
  showTrigger?: boolean;
  dir?: SidebarDirection;
  label?: string;
  side?: "left" | "right";
  variant?: "floating" | "inset" | "sidebar";
  workspace?: React.ReactNode;
};

export function Sidebar({
  children,
  className,
  collapsed,
  collapsedHeader,
  collapsible = "icon",
  density = "compact",
  dir,
  footer,
  header,
  items,
  label = "Sidebar",
  side = "left",
  showTrigger,
  variant = "sidebar",
  workspace,
  ...props
}: SidebarProps) {
  const sidebarContext = useOptionalSidebar();
  // Below the provider's mobile query, `openMobile` is THE open state for any
  // collapsible sidebar — not just `offcanvas`. It used to be read for
  // `offcanvas` alone, which left `collapsible="icon"` (the default) holding a
  // 220px rail at the package's supported 320px floor (`styles.css` →
  // `html { min-inline-size: 320px }`): the rail is `flex-shrink: 0` and the
  // shell track is `max-content`, so the content column collapsed to ~68px and
  // every work surface below the shell became unusable. Worse, it could not be
  // escaped — `toggleSidebar()` and `SidebarSearch`'s expand both write
  // `setOpenMobile` while mobile, and nothing was reading it, so the trigger
  // was inert. Reading the same state here makes the narrow default the icon
  // rail (`defaultOpenMobile` is false) AND makes the trigger work again.
  // `offcanvas` is unchanged: it read this state already, and its drawer path
  // below is keyed off `collapsible`, not off this value.
  const contextOpen = sidebarContext?.isMobile
    ? sidebarContext.openMobile
    : sidebarContext?.open;
  const resolvedCollapsed =
    collapsible === "none"
      ? false
      : (collapsed ?? (contextOpen === undefined ? false : !contextOpen));
  // No provider, no `collapsed` prop, and `collapsible` still asks for a
  // collapsible rail: nothing in this tree can ever narrow it, so the width
  // cap in `sidebarStaticNarrow` is the only thing standing between a 320px
  // viewport and an unusable work surface.
  const isStaticRail =
    !sidebarContext && collapsed === undefined && collapsible !== "none";
  const isMobileOffcanvas =
    Boolean(sidebarContext?.isMobile) && collapsible === "offcanvas";
  const resolvedDir = dir ?? sidebarContext?.dir ?? "ltr";
  const layoutContext = useMemo<SidebarLayoutContextValue>(
    () => ({
      collapsed: resolvedCollapsed,
      density,
      dir: resolvedDir,
      side,
    }),
    [resolvedCollapsed, density, resolvedDir, side],
  );
  const expandedHeader =
    header ??
    (workspace ? (
      <div className={sx(styles.workspaceSwitcher)}>{workspace}</div>
    ) : null);
  const headerContent = resolvedCollapsed ? collapsedHeader : expandedHeader;
  const trigger = useSidebarOwnsTrigger(collapsible, showTrigger) ? (
    <SidebarTrigger />
  ) : null;
  const shouldRenderHeader = Boolean(headerContent || trigger);
  const sidebarNav = (
    <nav
      {...props}
      id={props.id ?? sidebarContext?.sidebarId}
      aria-label={label}
      data-collapsible={collapsible}
      data-density={density}
      data-dir={resolvedDir}
      data-mobile={isMobileOffcanvas ? "true" : undefined}
      data-side={side}
      data-state={resolvedCollapsed ? "collapsed" : "expanded"}
      data-variant={variant}
      dir={resolvedDir}
      className={cx(
        sx(
          styles.sidebar,
          density === "compact" && styles.sidebarCompact,
          isStaticRail && styles.sidebarStaticNarrow,
          resolvedCollapsed && styles.sidebarCollapsed,
          // Ordered before the offcanvas arms on purpose: `sidebarRight` moves
          // the hairline to the left edge, and the offcanvas arm has to be
          // able to zero it (StyleX keeps the LAST style that sets a property).
          side === "right" && styles.sidebarRight,
          resolvedCollapsed &&
            collapsible === "offcanvas" &&
            styles.sidebarOffcanvasCollapsed,
          resolvedCollapsed &&
            collapsible === "offcanvas" &&
            (side === "left"
              ? styles.sidebarOffcanvasSlideLeft
              : styles.sidebarOffcanvasSlideRight),
          isMobileOffcanvas && styles.sidebarMobileOffcanvas,
          isMobileOffcanvas &&
            side === "right" &&
            styles.sidebarMobileOffcanvasRight,
          variant === "floating" && styles.sidebarFloating,
          variant === "inset" && styles.sidebarInset,
        ),
        // Slide/fade enter-exit driven by Base UI's data-starting-style /
        // data-ending-style (same convention as Drawer).
        isMobileOffcanvas && "atelier-motion-drawer",
        className,
      )}
    >
      {shouldRenderHeader ? (
        <SidebarHeader>
          <div
            className={sx(
              styles.sidebarHeaderRow,
              resolvedCollapsed && styles.sidebarHeaderRowCollapsed,
            )}
          >
            {resolvedCollapsed ? trigger : null}
            {resolvedCollapsed ? (
              headerContent ? (
                <div className={sx(styles.sidebarHeaderContent)}>
                  {headerContent}
                </div>
              ) : null
            ) : (
              <div className={sx(styles.sidebarHeaderContent)}>
                {headerContent}
              </div>
            )}
            {resolvedCollapsed ? null : trigger}
          </div>
        </SidebarHeader>
      ) : null}
      <SidebarContent>
        {children ??
          (items ? (
            <SidebarMenu>
              {items.map(({ label, ...itemProps }, index) => (
                <SidebarMenuItem key={index}>
                  <SidebarMenuButton {...itemProps}>{label}</SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          ) : null)}
      </SidebarContent>
      {footer ? <SidebarFooter>{footer}</SidebarFooter> : null}
    </nav>
  );

  return (
    <SidebarLayoutContext.Provider value={layoutContext}>
      {isMobileOffcanvas && sidebarContext ? (
        // Mobile overlay mode: the sidebar is a modal surface, so it mounts
        // inside the headless Dialog parts — focus trap, scroll lock, Escape,
        // outside-press dismiss, and focus restore all come from Base UI
        // (house rule: never hand-roll focus management).
        <DialogRoot
          open={!resolvedCollapsed}
          onOpenChange={(nextOpen) => sidebarContext.setOpenMobile(nextOpen)}
        >
          <DialogPortal>
            <DialogBackdrop
              className={cx(
                sx(styles.sidebarBackdrop),
                "atelier-motion-backdrop",
              )}
            />
            <DialogPopup render={sidebarNav} />
          </DialogPortal>
        </DialogRoot>
      ) : (
        sidebarNav
      )}
    </SidebarLayoutContext.Provider>
  );
}

export type SidebarInsetProps = React.ComponentProps<"div">;

export function SidebarInset({ className, ...props }: SidebarInsetProps) {
  return (
    <div {...props} className={cx(sx(styles.sidebarInsetSlot), className)} />
  );
}

export type SidebarSlotProps = React.ComponentProps<"div">;

export function SidebarHeader({ className, ...props }: SidebarSlotProps) {
  const sidebarLayout = useOptionalSidebarLayout();

  return (
    <div
      {...props}
      className={cx(
        sx(
          styles.sidebarHeader,
          sidebarLayout?.collapsed && styles.sidebarHeaderCollapsed,
        ),
        className,
      )}
    />
  );
}

export function SidebarContent({ className, ...props }: SidebarSlotProps) {
  const sidebarLayout = useOptionalSidebarLayout();
  return (
    <div
      {...props}
      className={cx(
        sx(
          styles.sidebarContent,
          // The rail's rows and its search field are `inlineSize: 100%` of THIS
          // element, and this is the element that owns `overflow: auto` — so
          // their focus rings had nowhere to paint. The rail's own 8px inset
          // lives on the `sidebar` shell one level up, which does not clip.
          focusRing.gutter,
          sidebarLayout?.density === "compact" && styles.sidebarContentCompact,
        ),
        className,
      )}
    />
  );
}

export function SidebarFooter({ className, ...props }: SidebarSlotProps) {
  return <div {...props} className={cx(sx(styles.sidebarFooter), className)} />;
}

export type SidebarGroupProps = SidebarSlotProps & {
  action?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  label?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

export function SidebarGroup({
  action,
  children,
  className,
  collapsible = false,
  defaultOpen = true,
  label,
  onOpenChange,
  open,
  ...props
}: SidebarGroupProps) {
  const contentId = useId();
  const sidebarLayout = useOptionalSidebarLayout();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? uncontrolledOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  // Collapsible groups open and close through the shared sidebar disclosure
  // (`SidebarDisclosurePanel`) — the same 180ms height/opacity/translate that a
  // nested `SidebarMenuSub` has always used. Before this, a group was a raw
  // `hidden` + `display: none` swap: nested team rows animated while the
  // Projects and Initiatives groups directly above them snapped, one rail, two
  // behaviours. Base UI owns the `hidden` attribute and the panel-height custom
  // property from here on, so `SidebarGroupContent` no longer takes `hidden`
  // for the collapsible path.
  const groupContent = <SidebarGroupContent>{children}</SidebarGroupContent>;

  return (
    <div
      {...props}
      className={cx(sx(styles.sidebarGroup), className)}
      data-state={collapsible ? (resolvedOpen ? "open" : "closed") : undefined}
    >
      {label || action ? (
        <div className={sx(styles.sidebarGroupHeader)}>
          {label ? (
            collapsible ? (
              <button
                aria-controls={contentId}
                aria-expanded={resolvedOpen}
                className={sx(
                  styles.sidebarGroupTrigger,
                  focusRing.ring,
                  sidebarLayout?.collapsed && styles.sidebarGroupTriggerHidden,
                )}
                data-ads-control-icon-button="true"
                onClick={() => setOpen(!resolvedOpen)}
                type="button"
              >
                <span className={sx(styles.sidebarGroupLabel)}>{label}</span>
                {/*
                  The same glyph the nested rows use. This was a hand-written
                  `<ChevronRight size={14}>` on `transition.transform`'s default
                  120ms sitting one row above a `SidebarMenuChevron` on 180ms —
                  two chevrons, two speeds, same gesture.
                */}
                <SidebarMenuChevron open={resolvedOpen} />
              </button>
            ) : (
              <SidebarGroupLabel>{label}</SidebarGroupLabel>
            )
          ) : null}
          {action}
        </div>
      ) : null}
      {collapsible ? (
        <SidebarDisclosurePanel id={contentId} open={resolvedOpen}>
          {groupContent}
        </SidebarDisclosurePanel>
      ) : (
        groupContent
      )}
    </div>
  );
}

export type SidebarGroupLabelProps = React.ComponentProps<"div">;

export function SidebarGroupLabel({
  asChild = false,
  children,
  className,
  ...props
}: SidebarGroupLabelProps & { asChild?: boolean }) {
  const sidebarLayout = useOptionalSidebarLayout();
  const resolvedClassName = cx(
    sx(
      styles.sidebarGroupLabel,
      sidebarLayout?.collapsed && styles.sidebarGroupLabelCollapsed,
    ),
    className,
  );

  if (asChild && isValidElement(children)) {
    type ChildProps = React.HTMLAttributes<HTMLElement> & {
      "data-ads-control-icon-button"?: string;
    };
    const child = children as React.ReactElement<ChildProps>;

    return cloneElement(child, {
      ...props,
      "data-ads-control-icon-button": "true",
      className: cx(resolvedClassName, child.props.className),
    });
  }

  return (
    <div {...props} className={resolvedClassName}>
      {children}
    </div>
  );
}

export type SidebarGroupContentProps = React.ComponentProps<"div">;

export function SidebarGroupContent({
  className,
  hidden,
  ...props
}: SidebarGroupContentProps) {
  // `styles.sidebarGroupContent` sets `display: grid`, which overrides the
  // `hidden` attribute's UA `display: none` — so a collapsed group would keep
  // rendering its children. Apply `display: none` within the SAME sx() call
  // when hidden so it deterministically beats the grid display, and still pass
  // the `hidden` attr through for assistive tech.
  return (
    <div
      {...props}
      hidden={hidden}
      className={cx(
        sx(
          styles.sidebarGroupContent,
          hidden && styles.sidebarGroupContentHidden,
        ),
        className,
      )}
    />
  );
}

export type SidebarGroupActionProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
};

export function SidebarGroupAction({
  asChild = false,
  children,
  className,
  type = "button",
  ...props
}: SidebarGroupActionProps) {
  const sidebarLayout = useOptionalSidebarLayout();
  const resolvedClassName = cx(
    sx(
      styles.sidebarGroupAction,
      // Was three hand-written transition declarations with no reduced-motion
      // arm, next to a `sidebarItem` that had one. The recipe exists so opting
      // in cannot forget it (`recipes/transition.ts`).
      transition.colors,
      focusRing.ring,
      sidebarLayout?.collapsed && styles.sidebarGroupActionCollapsed,
    ),
    className,
  );

  if (asChild && isValidElement(children)) {
    type ChildProps = React.HTMLAttributes<HTMLElement>;
    const child = children as React.ReactElement<ChildProps>;

    return cloneElement(child, {
      ...props,
      className: cx(resolvedClassName, child.props.className),
    });
  }

  return (
    <button
      {...props}
      className={resolvedClassName}
      data-ads-control-icon-button="true"
      type={type}
    >
      {children}
    </button>
  );
}

export type SidebarMenuProps = React.ComponentProps<"ul">;

export function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return <ul {...props} className={cx(sx(styles.sidebarMenu), className)} />;
}

export type SidebarMenuItemProps = React.HTMLAttributes<HTMLElement> & {
  /**
   * Element to render. `"div"` lets the row nest inside another list item —
   * e.g. a `SortableList.Item` wrapping sidebar rows for drag reordering.
   * @default "li"
   */
  as?: "li" | "div";
};

export function SidebarMenuItem({
  as: Element = "li",
  className,
  onBlur,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  ...props
}: SidebarMenuItemProps) {
  const [actionVisible, setActionVisible] = useState(false);
  const [floatingActions, setFloatingActions] = useState(0);
  const registerFloatingAction = useCallback(() => {
    setFloatingActions((count) => count + 1);

    return () => setFloatingActions((count) => count - 1);
  }, []);
  const itemContext = useMemo<SidebarMenuItemContextValue>(
    () => ({
      actionVisible,
      floatingActionActive: actionVisible && floatingActions > 0,
      registerFloatingAction,
    }),
    [actionVisible, floatingActions, registerFloatingAction],
  );

  return (
    <SidebarMenuItemContext.Provider value={itemContext}>
      <Element
        {...props}
        className={cx(sx(styles.sidebarMenuItem), className)}
        onBlur={(event) => {
          onBlur?.(event);

          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setActionVisible(false);
          }
        }}
        onFocus={(event) => {
          setActionVisible(true);
          onFocus?.(event);
        }}
        onMouseEnter={(event) => {
          setActionVisible(true);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          setActionVisible(false);
          onMouseLeave?.(event);
        }}
      />
    </SidebarMenuItemContext.Provider>
  );
}

export type SidebarMenuButtonProps = Omit<
  React.ComponentProps<"a">,
  "children"
> & {
  asChild?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  closeOnSelect?: boolean;
  current?: boolean;
  /**
   * Secondary line under the label — a workspace's plan, an account's email,
   * a team's key. Renders one clamped `fontSizeCaption` subtle line, hidden in the
   * collapsed icon rail.
   *
   * This is the identity row (avatar · name · email) that the docs shell and
   * every product rail were hand-rolling as a two-`<span>` grid inside
   * `children`: without a real slot the copy inherited the row's own font size
   * (15px at `size="lg"`), had no clamp, and pushed a 220px rail into ragged
   * two-line wrapping. Pass the primary name as `children` and the secondary
   * line here.
   */
  description?: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  size?: SidebarMenuButtonSize;
  tooltip?: React.ReactNode;
  variant?: SidebarMenuButtonVariant;
};

export function SidebarMenuButton({
  asChild = false,
  badge,
  children,
  className,
  closeOnSelect = true,
  current,
  description,
  disabled,
  href,
  icon,
  onClick,
  size = "md",
  style,
  tooltip,
  variant = "default",
  ...props
}: SidebarMenuButtonProps) {
  const sidebarLayout = useOptionalSidebarLayout();
  const sidebar = useOptionalSidebar();
  const tooltipContent =
    tooltip ?? (typeof children === "string" ? children : undefined);
  const shouldRenderTooltip = Boolean(
    sidebarLayout?.collapsed && tooltipContent,
  );
  // A plain-string label gets a `title` whenever no tooltip will carry it —
  // not only while collapsed. Expanded rows clamp with an ellipsis, so a long
  // label was unreachable in the one state that hides part of it. Same idiom as
  // `SidebarTrigger` and `SidebarMenuSubButton` below.
  const title =
    props.title ??
    (!shouldRenderTooltip && typeof children === "string"
      ? children
      : undefined);
  const resolvedClassName = cx(
    sx(
      styles.sidebarItem,
      sidebarLayout?.density === "compact" && size === "md"
        ? controlHeights.sm
        : controlHeights[size],
      focusRing.ring,
      variant === "outline" && styles.sidebarItemOutline,
      size === "sm" && styles.sidebarItemSm,
      description != null && styles.sidebarItemStacked,
      current && styles.sidebarItemCurrent,
      disabled && styles.sidebarItemDisabled,
      !asChild && !icon && styles.sidebarItemNoIcon,
      // The icon rail's squares follow the rail's density like every other
      // control in it. Pinned at `md`, a collapsed compact rail rendered 36px
      // nav squares between a 32px collapse trigger and a 32px search button —
      // and 4px taller than the same rows measure when the rail is expanded.
      sidebarLayout?.collapsed &&
        (sidebarLayout.density === "compact"
          ? controlSquares.sm
          : controlSquares.md),
      sidebarLayout?.collapsed && styles.sidebarItemCollapsed,
    ),
    className,
  );
  const closeMobileSidebar = () => {
    if (closeOnSelect && sidebar?.isMobile && sidebar.openMobile) {
      sidebar.setOpenMobile(false);
    }
  };
  const renderWithTooltip = (element: React.ReactElement) => {
    if (!shouldRenderTooltip) {
      return element;
    }

    return (
      <SidebarMenuTooltip
        content={tooltipContent}
        side={sidebarLayout?.side === "right" ? "left" : "right"}
      >
        {element}
      </SidebarMenuTooltip>
    );
  };

  if (asChild && isValidElement(children)) {
    type ChildProps = React.HTMLAttributes<HTMLElement> & {
      "aria-current"?: React.AriaAttributes["aria-current"];
      "aria-disabled"?: React.AriaAttributes["aria-disabled"];
      "data-current"?: string;
      "data-disabled"?: string;
      "data-ads-control"?: string;
      "data-ads-control-size"?: SidebarMenuButtonSize;
      "data-size"?: SidebarMenuButtonSize;
      "data-variant"?: SidebarMenuButtonVariant;
      href?: string;
      style?: React.CSSProperties;
    };
    const child = children as React.ReactElement<ChildProps>;
    const childProps = child.props;

    return renderWithTooltip(
      cloneElement(child, {
        ...props,
        "aria-current": current ? "page" : childProps["aria-current"],
        "aria-disabled": disabled || childProps["aria-disabled"],
        className: cx(resolvedClassName, childProps.className),
        "data-ads-control": "sidebar-menu-button",
        "data-ads-control-size": size,
        "data-current": current ? "true" : childProps["data-current"],
        "data-disabled": disabled ? "true" : childProps["data-disabled"],
        "data-size": size,
        "data-variant": variant,
        href: disabled ? undefined : (href ?? childProps.href),
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          if (disabled) {
            event.preventDefault();
            return;
          }

          childProps.onClick?.(event);

          if (!event.defaultPrevented) {
            onClick?.(event as unknown as React.MouseEvent<HTMLAnchorElement>);
            if (!event.defaultPrevented) {
              closeMobileSidebar();
            }
          }
        },
        style: {
          ...childProps.style,
          ...style,
          "--ads-control-icon-size": controlIconSizes[size],
        } as React.CSSProperties,
        tabIndex: disabled ? -1 : (props.tabIndex ?? childProps.tabIndex),
        title: title ?? childProps.title,
      }),
    );
  }

  const content = (
    <>
      {icon ? (
        <span
          data-ads-control-icon-slot="true"
          className={sx(
            styles.sidebarIcon,
            current && styles.sidebarIconCurrent,
            sidebarLayout?.collapsed && styles.sidebarIconCollapsed,
          )}
        >
          {icon}
        </span>
      ) : null}
      {/*
        Collapsed, this label leaves the LAYOUT but not the ACCESSIBILITY TREE
        (see `sidebarLabelCollapsed`): the icon rail has no other text, so a
        `display: none` label left every primary nav control announcing as an
        unnamed button/link. The tooltip cannot stand in for it — Base UI wires
        it as `aria-describedby`, a description rather than a name, and it only
        exists while open.
      */}
      {description != null && !sidebarLayout?.collapsed ? (
        <span className={sx(styles.sidebarItemCopy)}>
          <span className={sx(styles.sidebarLabel)}>{children}</span>
          <span className={sx(styles.sidebarDescription)}>{description}</span>
        </span>
      ) : (
        <span
          className={sx(
            styles.sidebarLabel,
            sidebarLayout?.collapsed && styles.sidebarLabelCollapsed,
          )}
        >
          {children}
        </span>
      )}
      {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
    </>
  );

  if (href === undefined) {
    return renderWithTooltip(
      <button
        {...(props as React.ComponentProps<"button">)}
        aria-current={current ? "page" : undefined}
        aria-disabled={disabled || undefined}
        className={resolvedClassName}
        data-ads-control="sidebar-menu-button"
        data-ads-control-size={size}
        data-current={current ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        data-size={size}
        data-variant={variant}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event as unknown as React.MouseEvent<HTMLAnchorElement>);

          if (!event.defaultPrevented) {
            closeMobileSidebar();
          }
        }}
        style={
          {
            ...style,
            "--ads-control-icon-size": controlIconSizes[size],
          } as React.CSSProperties
        }
        title={title}
        type="button"
      >
        {content}
      </button>,
    );
  }

  return renderWithTooltip(
    <a
      {...props}
      aria-current={current ? "page" : undefined}
      aria-disabled={disabled || undefined}
      className={resolvedClassName}
      data-ads-control="sidebar-menu-button"
      data-ads-control-size={size}
      data-current={current ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      data-size={size}
      data-variant={variant}
      href={disabled ? undefined : href}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }

        onClick?.(event);

        if (!event.defaultPrevented) {
          closeMobileSidebar();
        }
      }}
      style={
        {
          ...style,
          "--ads-control-icon-size": controlIconSizes[size],
        } as React.CSSProperties
      }
      tabIndex={disabled ? -1 : props.tabIndex}
      title={title}
    >
      {content}
    </a>,
  );
}

type SidebarMenuTooltipProps = {
  children: React.ReactElement;
  content: React.ReactNode;
  side: "left" | "right";
};

function SidebarMenuTooltip({
  children,
  content,
  side,
}: SidebarMenuTooltipProps) {
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger closeOnClick render={children} />
        <TooltipPortal>
          <TooltipPositioner side={side} sideOffset={8}>
            <TooltipPopup
              className={cx(
                sx(styles.sidebarTooltip),
                "atelier-motion-tooltip",
              )}
            >
              <TooltipArrow className={sx(styles.sidebarTooltipArrow)} />
              {content}
            </TooltipPopup>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
  );
}

export function SidebarMenuSub(props: SidebarMenuSubProps) {
  return (
    <SidebarMenuSubBase
      {...props}
      collapsed={Boolean(useOptionalSidebarLayout()?.collapsed)}
    />
  );
}

export type SidebarMenuSubItemProps = React.ComponentProps<"li">;

export function SidebarMenuSubItem({
  className,
  ...props
}: SidebarMenuSubItemProps) {
  return (
    <li {...props} className={cx(sx(styles.sidebarMenuSubItem), className)} />
  );
}

export type SidebarMenuSubButtonProps = Omit<
  React.ComponentProps<"a">,
  "children"
> & {
  asChild?: boolean;
  children: React.ReactNode;
  closeOnSelect?: boolean;
  current?: boolean;
  disabled?: boolean;
  size?: SidebarMenuSubButtonSize;
};

export function SidebarMenuSubButton({
  asChild = false,
  children,
  className,
  closeOnSelect = true,
  current,
  disabled,
  href,
  onClick,
  size = "md",
  ...props
}: SidebarMenuSubButtonProps) {
  const sidebar = useOptionalSidebar();
  const title =
    props.title ?? (typeof children === "string" ? children : undefined);
  const resolvedClassName = cx(
    sx(
      styles.sidebarSubButton,
      size === "sm" ? controlHeights.xs : controlHeights.sm,
      focusRing.ring,
      size === "sm" && styles.sidebarSubButtonSm,
      current && styles.sidebarSubButtonCurrent,
      disabled && styles.sidebarItemDisabled,
    ),
    className,
  );
  const closeMobileSidebar = () => {
    if (closeOnSelect && sidebar?.isMobile && sidebar.openMobile) {
      sidebar.setOpenMobile(false);
    }
  };
  // `text-overflow` needs a BLOCK container, and the row is a flex container:
  // a bare string sits in an anonymous flex item that never inherits the
  // clamp, so a long label used to hard-clip mid-glyph with no ellipsis. Give
  // a plain-string label a real block child to clamp (same shape as
  // `recipes/menu.ts` `itemLabel` and `Button`'s `label`); richer children are
  // left alone because they own their own truncation and their own flex
  // layout. No collapsed arm here: `SidebarMenuSub` is `display: none` in the
  // icon rail, so a sub row never renders without its label.
  const label =
    typeof children === "string" ? (
      <span className={sx(styles.sidebarSubLabel)}>{children}</span>
    ) : (
      children
    );

  if (asChild && isValidElement(children)) {
    type ChildProps = React.HTMLAttributes<HTMLElement> & {
      "aria-current"?: React.AriaAttributes["aria-current"];
      "aria-disabled"?: React.AriaAttributes["aria-disabled"];
      "data-current"?: string;
      "data-disabled"?: string;
      "data-size"?: SidebarMenuSubButtonSize;
      href?: string;
    };
    const child = children as React.ReactElement<ChildProps>;
    const childProps = child.props;

    return cloneElement(child, {
      ...props,
      "aria-current": current ? "page" : childProps["aria-current"],
      "aria-disabled": disabled || childProps["aria-disabled"],
      className: cx(resolvedClassName, childProps.className),
      "data-current": current ? "true" : childProps["data-current"],
      "data-disabled": disabled ? "true" : childProps["data-disabled"],
      "data-size": size,
      href: disabled ? undefined : (href ?? childProps.href),
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (disabled) {
          event.preventDefault();
          return;
        }

        childProps.onClick?.(event);

        if (!event.defaultPrevented) {
          onClick?.(event as unknown as React.MouseEvent<HTMLAnchorElement>);
          if (!event.defaultPrevented) {
            closeMobileSidebar();
          }
        }
      },
      tabIndex: disabled ? -1 : (props.tabIndex ?? childProps.tabIndex),
      title: title ?? childProps.title,
    });
  }

  if (href === undefined) {
    return (
      <button
        {...(props as React.ComponentProps<"button">)}
        aria-current={current ? "page" : undefined}
        aria-disabled={disabled || undefined}
        className={resolvedClassName}
        data-current={current ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        data-size={size}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event as unknown as React.MouseEvent<HTMLAnchorElement>);

          if (!event.defaultPrevented) {
            closeMobileSidebar();
          }
        }}
        title={title}
        type="button"
      >
        {label}
      </button>
    );
  }

  return (
    <a
      {...props}
      aria-current={current ? "page" : undefined}
      aria-disabled={disabled || undefined}
      className={resolvedClassName}
      data-current={current ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      data-size={size}
      href={disabled ? undefined : href}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }

        onClick?.(event);

        if (!event.defaultPrevented) {
          closeMobileSidebar();
        }
      }}
      tabIndex={disabled ? -1 : props.tabIndex}
      title={title}
    >
      {label}
    </a>
  );
}

export type SidebarMenuSkeletonProps = React.ComponentProps<"div"> & {
  showIcon?: boolean;
};

export function SidebarMenuSkeleton({
  className,
  showIcon = true,
  ...props
}: SidebarMenuSkeletonProps) {
  const sidebarLayout = useOptionalSidebarLayout();

  return (
    <div
      {...props}
      aria-hidden
      className={cx(
        sx(
          styles.sidebarSkeleton,
          // The placeholder stands in for a real row, so it takes the real
          // row's height. Hard-coded at 36px it was 4px taller than the rows it
          // was pretending to be in a compact rail — the list visibly settled
          // when the data arrived.
          sidebarLayout?.density === "compact"
            ? controlHeights.sm
            : controlHeights.md,
          sidebarLayout?.collapsed && styles.sidebarSkeletonCollapsed,
        ),
        className,
      )}
    >
      {showIcon ? <span className={sx(styles.sidebarSkeletonIcon)} /> : null}
      <span className={sx(styles.sidebarSkeletonLabel)} />
    </div>
  );
}

// One stylesheet, stored in two files because the source-size guard caps a
// file at 500 lines. `sx()` resolves style values at runtime, so merging the
// two `stylex.create` results here is equivalent to declaring them together.
const styles = { ...shellStyles, ...sidebarStyles };
