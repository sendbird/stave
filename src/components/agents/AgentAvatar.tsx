import { getAgentDisplayName } from "@/lib/agents/display";
import { useTranslation } from "@/i18n";
import type * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../ads/utils/stylex";
import { agentAvatarTone, agentColor, agentInitials } from "@/lib/agents/agent-appearance";
import { getAgentIcon } from "@/lib/agents/agent-icons";
import type { AgentConfig } from "@/lib/agents/schema";
import type { ProviderId } from "@/lib/providers/provider.types";
import { ProviderMark } from "../system/ProviderMark";
import { useAgentAvatarPalette } from "./use-agent-avatar-palette";

/**
 * An agent's avatar: a rounded square with a soft tint of the agent's hue (a
 * named colour mapped to an existing `--ads-chart-*` token, or a stable colour
 * derived from the id) and ink mixed from the same hue, measured against the
 * fill in the active theme and darkened (or lightened) to 4.5:1 where the
 * theme's own ink falls short. People and models stay round; only agents are
 * squared. The tint reaches the element through custom properties so no new
 * colour token is added.
 *
 * The face is the agent's chosen icon (`appearance.icon`) when the catalog in
 * `agent-icons.ts` knows it, and its initials otherwise, so an agent with no
 * icon, or one the catalog no longer carries, keeps the face it had. The icon
 * is painted with the same ink as the initials.
 *
 * `providerId` adds a 10px provider mark at the bottom-left, for places that
 * show an agent together with the provider it runs on.
 *
 * `status` adds a small dot: `running` reads as success, `needs-you` as
 * warning. Sizes match the reading contexts an agent appears in — `xs` in a
 * sidebar row, `sm` in a list row, `md`/`lg` in a profile header.
 */

export type AgentAvatarSize = "xs" | "sm" | "md" | "lg";
export type AgentAvatarStatus = "idle" | "running" | "needs-you";

export interface AgentAvatarProps extends XstyleProp {
  agent: Pick<AgentConfig, "id" | "name" | "appearance">;
  size?: AgentAvatarSize;
  status?: AgentAvatarStatus;
  /** Shows the provider the agent runs on as a small mark. */
  providerId?: ProviderId;
  /** Overrides the auto label; pass null to keep it decorative. */
  "aria-label"?: string | null;
  className?: string;
}

export function AgentAvatar({
  agent,
  size = "sm",
  status = "idle",
  providerId,
  "aria-label": ariaLabel,
  className,
  xstyle,
}: AgentAvatarProps) {
  useTranslation();
  const decorative = ariaLabel === null;
  const label = decorative ? undefined : (ariaLabel ?? getAgentDisplayName(agent));
  const palette = useAgentAvatarPalette();
  const tone = palette?.[agentColor(agent)] ?? agentAvatarTone(agent);
  const Icon = getAgentIcon(agent.appearance?.icon)?.icon ?? null;
  return (
    <span
      className={cx(sx(styles.root, sizeStyles[size], xstyle), className)}
      role={decorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={decorative || undefined}
      style={{ "--agent-avatar-fill": tone.fill, "--agent-avatar-ink": tone.ink } as React.CSSProperties}
    >
      {Icon ? (
        <Icon aria-hidden className={sx(styles.icon, iconSizeStyles[size])} strokeWidth={ICON_STROKE_WIDTH[size]} />
      ) : (
        <span aria-hidden className={sx(styles.initials)}>
          {agentInitials(getAgentDisplayName(agent))}
        </span>
      )}
      {providerId ? (
        <span aria-hidden className={sx(styles.provider)}>
          <ProviderMark providerId={providerId} size="xs" />
        </span>
      ) : null}
      {status !== "idle" ? (
        <span
          aria-hidden
          className={sx(
            styles.status,
            statusSizeStyles[size],
            status === "running" ? styles.statusRunning : styles.statusNeedsYou,
          )}
        />
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  root: {
    position: "relative",
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--agent-avatar-fill)",
    color: "var(--agent-avatar-ink)",
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: 1,
    userSelect: "none",
    textTransform: "uppercase",
  },
  initials: { display: "block" },
  icon: { display: "block", flexShrink: 0 },
  status: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderRadius: vars["--ads-radius-full"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-surface"],
  },
  provider: {
    position: "absolute",
    left: -2,
    bottom: -2,
    width: 10,
    height: 10,
    overflow: "hidden",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-surface"],
    boxShadow: `0 0 0 1px ${vars["--ads-color-surface"]}`,
  },
  statusRunning: { backgroundColor: vars["--ads-color-success"] },
  statusNeedsYou: { backgroundColor: vars["--ads-color-warning"] },
});

const sizeStyles = stylex.create({
  xs: { width: 20, height: 20, borderRadius: 6, fontSize: vars["--ads-font-size-micro"] },
  sm: { width: 28, height: 28, borderRadius: 8, fontSize: vars["--ads-font-size-caption"] },
  md: { width: 40, height: 40, borderRadius: 11, fontSize: vars["--ads-font-size-body"] },
  lg: { width: 56, height: 56, borderRadius: 15, fontSize: vars["--ads-font-size-lead"] },
});

/**
 * Each icon takes a little over half its square (12 / 16 / 22 / 30 px), the
 * share at which lucide's 24px grid, with its own 2px inset, reads as filling
 * the face about as much as two initials do.
 */
const iconSizeStyles = stylex.create({
  xs: { width: 12, height: 12 },
  sm: { width: 16, height: 16 },
  md: { width: 22, height: 22 },
  lg: { width: 30, height: 30 },
});

/**
 * Stroke in lucide's 24px units, chosen per size so the drawn line lands near
 * 1.1-1.9px: one fixed width would print a hairline at 12px and a heavy line
 * at 30px. `sm` matches the app's 1.75 icon default at the same 16px.
 */
const ICON_STROKE_WIDTH: Readonly<Record<AgentAvatarSize, number>> = { xs: 2.25, sm: 1.75, md: 1.75, lg: 1.5 };

const statusSizeStyles = stylex.create({
  xs: { width: 7, height: 7 },
  sm: { width: 9, height: 9 },
  md: { width: 12, height: 12 },
  lg: { width: 14, height: 14 },
});
