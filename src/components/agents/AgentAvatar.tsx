import type * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../ads/utils/stylex";
import { agentColorToken, agentInitials } from "@/lib/agents/agent-appearance";
import type { AgentConfig } from "@/lib/agents/schema";

/**
 * An agent's avatar: an initials disc tinted with the agent's hue (a named
 * colour mapped to an existing `--ads-chart-*` token, or a stable colour
 * derived from the id). The hue reaches the disc through the
 * `--agent-avatar-color` custom property so no new colour token is added.
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
  /** Overrides the auto label; pass null to keep it decorative. */
  "aria-label"?: string | null;
  className?: string;
}

export function AgentAvatar({
  agent,
  size = "sm",
  status = "idle",
  "aria-label": ariaLabel,
  className,
  xstyle,
}: AgentAvatarProps) {
  const decorative = ariaLabel === null;
  const label = decorative ? undefined : (ariaLabel ?? agent.name);
  return (
    <span
      className={cx(sx(styles.root, sizeStyles[size], xstyle), className)}
      role={decorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={decorative || undefined}
      style={{ "--agent-avatar-color": agentColorToken(agent) } as React.CSSProperties}
    >
      <span aria-hidden className={sx(styles.initials)}>
        {agentInitials(agent.name)}
      </span>
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
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: "var(--agent-avatar-color)",
    color: vars["--ads-color-text-inverted"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: 1,
    userSelect: "none",
    textTransform: "uppercase",
  },
  initials: { display: "block" },
  status: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderRadius: vars["--ads-radius-full"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-surface"],
  },
  statusRunning: { backgroundColor: vars["--ads-color-success"] },
  statusNeedsYou: { backgroundColor: vars["--ads-color-warning"] },
});

const sizeStyles = stylex.create({
  xs: { width: 20, height: 20, fontSize: vars["--ads-font-size-micro"] },
  sm: { width: 28, height: 28, fontSize: vars["--ads-font-size-caption"] },
  md: { width: 40, height: 40, fontSize: vars["--ads-font-size-body"] },
  lg: { width: 56, height: 56, fontSize: vars["--ads-font-size-lead"] },
});

const statusSizeStyles = stylex.create({
  xs: { width: 7, height: 7 },
  sm: { width: 9, height: 9 },
  md: { width: 12, height: 12 },
  lg: { width: 14, height: 14 },
});
