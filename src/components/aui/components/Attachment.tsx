import { Tooltip } from "./Tooltip";
import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { Paperclip, TriangleAlert, X } from "lucide-react";
import type * as React from "react";

import { agentSurface } from "../recipes/agent-surface";
import { focusRing } from "../recipes/focus-ring";
import { surfaceChrome } from "../recipes/surface-chrome";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { AgentRetryButton, type AgentRetryProps } from "./agent-retry";

export type AttachmentStatus = "ready" | "uploading" | "error";

type AttachmentBaseProps = Omit<React.ComponentProps<"div">, "onRemove"> &
  AgentRetryProps;
export type AttachmentProps = AttachmentBaseProps & {
  /** Fallback error announcement when `meta` is omitted. @default "Upload failed" */
  errorLabel?: React.ReactNode;
  icon?: React.ReactNode;
  /** Secondary text (size / type). Error text when `status="error"`. */
  meta?: React.ReactNode;
  name: React.ReactNode;
  onRemove?: () => void;
  /**
   * Upload progress in percent (0–100) while `status="uploading"`; drives the
   * hairline progress bar along the chip's bottom edge (indeterminate pulse
   * when omitted).
   */
  progress?: number;
  removeLabel?: string;
  /**
   * Lifecycle state: `uploading` shows a bottom-edge progress hairline,
   * `error` colors the icon danger (color on the small element — the chip
   * surface stays neutral). @default "ready"
   */
  status?: AttachmentStatus;
  /** Accessible progress label while uploading. @default "Uploading" */
  uploadingLabel?: string;
} & XstyleProp;

/**
 * File attachment chip — icon + name + meta with an
 * optional remove button and upload lifecycle states. Use in prompt composers,
 * comment composers, or uploaded-file lists. While uploading, a
 * `role="progressbar"` hairline runs along the bottom edge (its indeterminate
 * pulse is static under `prefers-reduced-motion`).
 *
 * **Surface decision — this is the `tile` case, and it now says so.**
 * `agentSurface.tile` exists for "a genuinely detachable artifact (a file, a
 * preview) that a user would drag or open elsewhere". An attachment *is* the
 * file; there is no more literal occupant of that role, and `ArtifactTile`
 * already set the precedent. So the perimeter stays — and it now comes from the
 * recipe, which is the part that was actually wrong: the border was re-declared
 * locally, so `grep agentSurface.tile` under-reported the AI set's border count
 * by one.
 *
 * The perimeter also has to stay for a measured reason. Light theme's
 * `colorSurfaceRaised` is `oklch(1 0 0)` against a `colorSurface` of
 * `oklch(0.995 …)` — a 0.005 L step, which is no edge at all. Drop the hairline
 * and a ready attachment on a card becomes white text-on-white with nothing
 * marking where the object ends. §1.3 already made this exact call for
 * `LinkChip`: "an interactive affordance whose `colorSurfaceRaised` fill has no
 * step against `colorSurface` in light or HC, so the ring is its only edge."
 *
 * What the recipe does **not** get to set is the geometry. `tile` is a
 * block-level card (`display: grid`, `inline-size: 100%`, `padding: space3`,
 * `radiusPanel`); an attachment is an inline chip that wraps in a composer
 * row beside three others. Forcing tile's box would make this component
 * *heavier*, which is the opposite of the point — so the four perimeter
 * declarations are shared and the box is local, stated in `styles.root`.
 * There is deliberately no `variant="row"`: a bare row form would need a
 * `rowGroup` owner to draw its separators, and every call site here renders
 * free-floating chips with no list around them.
 */
export function Attachment({
  className,
  errorLabel = i18n.t("ui:fileUpload.uploadFailed"),
  icon,
  meta,
  name,
  onRemove,
  onRetry,
  progress,
  removeLabel = i18n.t("ui:fileUpload.removeAttachment"),
  retryLabel,
  status = "ready",
  uploadingLabel = i18n.t("ui:fileUpload.status.uploading"),
  xstyle,
  ...props
}: AttachmentProps) {
  useTranslation();
  const bounded =
    progress == null ? undefined : Math.min(100, Math.max(0, progress));
  const statusMeta = status === "error" ? (meta ?? errorLabel) : meta;
  const theme = themeProps("attachment");

  return (
    <div
      {...props}
      {...theme}
      className={cx(
        sx(agentSurface.tile, styles.root, xstyle),
        theme.className,
        className,
      )}
      data-status={status}
    >
      <span
        aria-hidden
        {...themeSlotProps("attachment", "icon")}
        className={sx(styles.icon, status === "error" && styles.iconError)}
      >
        {status === "error" ? (
          <TriangleAlert size={14} />
        ) : (
          (icon ?? <Paperclip size={14} />)
        )}
      </span>
      <span className={sx(styles.copy)}>
        <span
          {...themeSlotProps("attachment", "name")}
          className={sx(styles.name)}
        >
          {name}
        </span>
        {statusMeta ? (
          <span
            // `meta` is a byte size and a type ("2.4 MB · PDF") — a measured
            // value, so it takes the machine register, and its tabular figures
            // stop a live "1.2 MB / 2.4 MB" counter from re-flowing the chip on
            // every progress tick. At `status="error"` the same slot carries a
            // written sentence instead, and `agentSurface.meta`'s own docstring
            // forbids mono on prose — so the error text stays proportional and
            // only takes the danger ink.
            {...themeSlotProps("attachment", "meta")}
            className={sx(
              status === "error" ? styles.metaError : agentSurface.meta,
            )}
            role={status === "error" ? "alert" : undefined}
          >
            {statusMeta}
          </span>
        ) : null}
      </span>
      {status === "error" && onRetry ? (
        <AgentRetryButton
          insetFocus
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
      ) : null}
      {onRemove ? (
        <Tooltip content={removeLabel}>
          <button
            aria-label={removeLabel}
            title=""
            {...themeSlotProps("attachment", "remove")}
            className={sx(
              surfaceChrome.quietIconButton,
              styles.remove,
              focusRing.ring,
            )}
            onClick={onRemove}
            type="button"
          >
            <X aria-hidden size={14} />
          </button>
        </Tooltip>
      ) : null}
      {status === "uploading" ? (
        <span
          aria-label={uploadingLabel}
          aria-valuemax={bounded == null ? undefined : 100}
          aria-valuemin={bounded == null ? undefined : 0}
          aria-valuenow={bounded}
          {...themeSlotProps("attachment", "progress")}
          className={sx(styles.progressTrack)}
          role="progressbar"
        >
          <span
            className={sx(
              styles.progressFill,
              bounded == null && styles.progressIndeterminate,
            )}
            style={bounded == null ? undefined : { inlineSize: `${bounded}%` }}
          />
        </span>
      ) : null}
    </div>
  );
}

const indeterminate = stylex.keyframes({
  "0%": { opacity: 0.4 },
  "50%": { opacity: 1 },
  "100%": { opacity: 0.4 },
});

const styles = stylex.create({
  /**
   * Chip geometry ONLY. The fill, border color, border style, and border width
   * are `agentSurface.tile`'s at the call site — see the component docstring
   * for why the perimeter is shared but the box is not.
   *
   * `radiusControl` (6), not tile's `radiusPanel` (10): the chip is the size of
   * a control and holds one, and §7's "container corner ≥ content corner" is
   * satisfied at equal corners. `inlineSize: "auto"` and the padding longhands
   * override tile's `inline-size: 100%` and `padding: space3` — StyleX resolves
   * a longhand over the shorthand regardless of composition order, but these
   * are ordered after the recipe anyway so the intent reads in source order.
   */
  root: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    display: "inline-flex",
    inlineSize: "auto",
    maxInlineSize: "100%",
    minBlockSize: vars["--aui-control-height-md"],
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: vars["--aui-space-4"],
    paddingInlineEnd: vars["--aui-space-8"],
    paddingInlineStart: vars["--aui-space-12"],
    position: "relative",
  },
  icon: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
  },
  // Error reads from the small icon + meta text, never a surface wash.
  iconError: {
    color: vars["--aui-color-danger"],
  },
  // Takes the free space when a list owner stretches the chip into a full-width
  // row, so remove sits at the row end and a stacked list's removes line up. A
  // free-floating chip is shrink-to-fit and has no free space, so this is inert
  // there. `flexGrow` alone, not `flex: 1`: a zero basis would change the
  // chip's max-content contribution and collapse the auto-width form.
  copy: {
    display: "grid",
    flexGrow: 1,
    gap: 0,
    minInlineSize: 0,
  },
  name: {
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-tight"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /**
   * The error arm of the `meta` slot. It is a written sentence, so it does NOT
   * take `agentSurface.meta` — mono on prose is what that recipe's docstring
   * rules out — and it restates only the size/leading the machine register
   * would otherwise have supplied.
   */
  metaError: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  /**
   * Square metric only — the quiet fill/ink/press language and its
   * reduced-motion-safe transition are `surfaceChrome.quietIconButton`'s, the
   * same recipe every other dismiss control in the system uses. The local
   * version had a `:hover` but no `:active` and **no transition at all**, so it
   * snapped.
   *
   * Deliberately NOT `agentSurface.quietActions`. That recipe is for redundant
   * affordances (copy, retry, replay) that a reader can find another way;
   * remove is this chip's only action, it is the whole reason an attachment is
   * interactive, and hiding it until hover would make it unreachable on touch.
   */
  remove: {
    blockSize: 22,
    inlineSize: 22,
  },
  progressTrack: {
    backgroundColor: vars["--aui-color-border-subtle"],
    blockSize: 2,
    display: "block",
    insetBlockEnd: 0,
    insetInline: 0,
    position: "absolute",
  },
  progressFill: {
    backgroundColor: vars["--aui-color-accent"],
    blockSize: "100%",
    display: "block",
    // `inline-size` is outside every `recipes/transition` property key, so the
    // triplet stays local — but it was missing the reduced-motion escape the
    // recipe carries, so the fill animated regardless of the OS setting.
    transitionDuration: {
      default: vars["--aui-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "inline-size",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  progressIndeterminate: {
    // Work-in-progress cadence — the middle loop step, matching `Progress`'s
    // indeterminate sweep instead of a second hand-picked 1.4s.
    animationDuration: vars["--aui-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationName: {
      default: indeterminate,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars["--aui-motion-ease-loop"],
    inlineSize: "100%",
  },
});
