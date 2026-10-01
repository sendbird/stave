import type * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../ads/utils/stylex";
import { agentAvatarTone, agentInitials } from "@/lib/agents/agent-appearance";
import type { AgentConfig } from "@/lib/agents/schema";
import { getProviderIconUrl } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * An agent's avatar: a rounded square with a soft tint of the agent's hue (a
 * named colour mapped to an existing `--ads-chart-*` token, or a stable colour
 * derived from the id) and ink mixed from the same hue, so the initials stay
 * readable in every theme. People and models stay round; only agents are
 * squared. The tint reaches the element through custom properties so no new
 * colour token is added.
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
  const decorative = ariaLabel === null;
  const label = decorative ? undefined : (ariaLabel ?? agent.name);
  const tone = agentAvatarTone(agent);
  const providerIcon = providerId ? getProviderIconUrl({ providerId }) : null;
  return (
    <span
      className={cx(sx(styles.root, sizeStyles[size], xstyle), className)}
      role={decorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={decorative || undefined}
      style={{ "--agent-avatar-fill": tone.fill, "--agent-avatar-ink": tone.ink } as React.CSSProperties}
    >
      <span aria-hidden className={sx(styles.initials)}>
        {agentInitials(agent.name)}
      </span>
      {providerIcon ? (
        <span aria-hidden className={sx(styles.provider)}>
          <img src={providerIcon} alt="" className={sx(styles.providerMark)} />
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
  providerMark: { display: "block", width: 10, height: 10, objectFit: "contain" },
  statusRunning: { backgroundColor: vars["--ads-color-success"] },
  statusNeedsYou: { backgroundColor: vars["--ads-color-warning"] },
});

const sizeStyles = stylex.create({
  xs: { width: 20, height: 20, borderRadius: 6, fontSize: vars["--ads-font-size-micro"] },
  sm: { width: 28, height: 28, borderRadius: 8, fontSize: vars["--ads-font-size-caption"] },
  md: { width: 40, height: 40, borderRadius: 11, fontSize: vars["--ads-font-size-body"] },
  lg: { width: 56, height: 56, borderRadius: 15, fontSize: vars["--ads-font-size-lead"] },
});

const statusSizeStyles = stylex.create({
  xs: { width: 7, height: 7 },
  sm: { width: 9, height: 9 },
  md: { width: 12, height: 12 },
  lg: { width: 14, height: 14 },
});
