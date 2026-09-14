import type * as React from "react";

import type { XstyleProp } from "../utils/stylex";

/**
 * Command's public data and prop shapes, split into their own module when the
 * `xstyle` host-composition contract pushed `Command.tsx` past the repo's
 * 500-line growth ratchet — the same split `Command.styles.ts` already uses.
 */

export type CommandItem = {
  disabled?: boolean;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  label: React.ReactNode;
  onSelect?: () => void;
  /** Navigate to this page instead of executing a leaf command. */
  pageId?: string;
  shortcut?: React.ReactNode;
  value: string;
};

export type CommandPage = {
  id: string;
  items: CommandItem[];
  label: React.ReactNode;
  placeholder?: string;
};

export type CommandProps = {
  /** Drop the outer border/shadow/radius — for use inside a Dialog/Popover. */
  bare?: boolean;
  className?: string;
  /** Page opened on first render. The root page is used when omitted. */
  defaultPageId?: string;
  /** Initial recent leaf commands for the uncontrolled recent-state path. */
  defaultRecentValues?: string[];
  defaultValue?: string;
  emptyText?: React.ReactNode;
  items: CommandItem[];
  label?: React.ReactNode;
  loading?: boolean;
  loadingText?: React.ReactNode;
  /** Maximum recent leaf commands retained. @default 5 */
  maxRecents?: number;
  /** Called after a leaf command runs. */
  onItemSelect?: (item: CommandItem) => void;
  /** Called when the active page changes; `null` means the root page. */
  onPageChange?: (pageId: string | null) => void;
  onRecentValuesChange?: (values: string[]) => void;
  onValueChange?: (value: string) => void;
  /** Child pages addressed by an item's `pageId`. */
  pages?: CommandPage[];
  placeholder?: string;
  /**
   * Rendered between the input and the list — for sort/filter controls (a
   * `Menu`, a `ToggleGroup`, ...) that must stay outside the list so they
   * never steal its arrow-key roving.
   */
  toolbar?: React.ReactNode;
  /** Controlled recent command values. */
  recentValues?: string[];
  value?: string;
} & XstyleProp;
