import { i18n } from "@/i18n";
import * as stylex from "@stylexjs/stylex";

import {
  overlayMark,
  overlayMarkPlacementStyles,
} from "../recipes/overlay-mark";
import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";

export type AvatarStatus = "online" | "away" | "busy" | "offline";

/**
 * Presence semantics for collaborative surfaces (multiplayer avatar
 * stacks): a lighter three-state model than {@link AvatarStatus}.
 */
export type AvatarPresence = "online" | "idle" | "offline";

// Host modification: the labels come from the host's translations.
export const avatarStatusLabels: Record<AvatarStatus, string> = {
  get away() { return i18n.t("ui:avatar.status.away"); },
  get busy() { return i18n.t("ui:avatar.status.busy"); },
  get offline() { return i18n.t("ui:avatar.status.offline"); },
  get online() { return i18n.t("ui:avatar.status.online"); },
};

export const avatarPresenceLabels: Record<AvatarPresence, string> = {
  get idle() { return i18n.t("ui:avatar.presence.idle"); },
  get offline() { return i18n.t("ui:avatar.presence.offline"); },
  get online() { return i18n.t("ui:avatar.presence.online"); },
};

/**
 * The presence/status dot itself, extracted so the three surfaces that draw one
 * — `Avatar`'s convenience `status`, `AvatarBadge`, and `AvatarGroupItem` —
 * share one implementation instead of three copies of a 28%-of-the-disc circle.
 *
 * It lives in its own module rather than in `Avatar.tsx` because `AvatarGroup`
 * already imports `Avatar`; putting the dot in `Avatar` and importing it back
 * would be the relative-import cycle `check:structure` rejects.
 *
 * The dot is a `role="img"` with a label because presence is information, not
 * decoration: a screen reader that sees only the initials has no way to learn
 * that the person is offline.
 */
export function AvatarStatusDot(
  props:
    | { label: string; model: "status"; value: AvatarStatus }
    | { label: string; model: "presence"; value: AvatarPresence },
) {
  const toneStyle =
    props.model === "presence"
      ? presenceStyles[props.value]
      : statusStyles[props.value];

  return (
    <span
      aria-label={props.label}
      className={sx(
        overlayMark.mark,
        overlayMarkPlacementStyles["block-end-inline-end"],
        styles.dot,
        toneStyle,
      )}
      role="img"
    />
  );
}

const styles = stylex.create({
  // Corner, knockout ring and absolute positioning come from
  // `recipes/overlay-mark`. What stays here is the one thing that is Avatar's
  // own: a dot that scales with the disc (28%, clamped 6–14px) instead of
  // taking a fixed size, so the mark stays proportional across the `xs`–`xl`
  // ramp. The floor was 8px, which is 40% of the 20px `xs` disc: the dot
  // overhung the circle and ran into the initials. The ring used to be a `colorSurfaceRaised` border — wrong by ΔL
  // 0.0825 in dark whenever the avatar sat on `colorCanvas`, and invisible in
  // light because the two surface tokens are identical there.
  dot: {
    blockSize: "28%",
    borderRadius: vars["--ads-radius-full"],
    inlineSize: "28%",
    maxBlockSize: 14,
    maxInlineSize: 14,
    minBlockSize: 6,
    minInlineSize: 6,
  },
  online: {
    backgroundColor: vars["--ads-color-success"],
  },
  away: {
    backgroundColor: vars["--ads-color-warning"],
  },
  busy: {
    backgroundColor: vars["--ads-color-danger"],
  },
  offline: {
    backgroundColor: vars["--ads-color-border-strong"],
  },
  // `AvatarPresence` keeps its own two rows: the collaborative model's "idle"
  // is the same amber as `away`, but its "offline" is quieter than the status
  // model's — a multiplayer stack shows everyone, so absent participants must
  // recede rather than read as a fourth state.
  idle: {
    backgroundColor: vars["--ads-color-warning"],
  },
  presenceOffline: {
    backgroundColor: vars["--ads-color-text-subtle"],
  },
});

const statusStyles = {
  away: styles.away,
  busy: styles.busy,
  offline: styles.offline,
  online: styles.online,
} as const;

/** Presence rows differ from status rows only in how quiet `offline` is. */
const presenceStyles = {
  idle: styles.idle,
  offline: styles.presenceOffline,
  online: styles.online,
} as const;
