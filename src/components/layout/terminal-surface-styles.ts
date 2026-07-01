export const TERMINAL_SURFACE_PANEL_CLASS_NAME = [
  "relative",
  "min-h-0",
  "flex-1",
  "overflow-hidden",
  "bg-terminal",
].join(" ");

export const TERMINAL_SURFACE_VIEWPORT_CLASS_NAME = [
  "relative",
  "h-full",
  "w-full",
  "overflow-hidden",
  "bg-terminal",
].join(" ");

export const TERMINAL_SURFACE_FRAME_CLASS_NAME = [
  "h-full",
  "w-full",
  "rounded-[inherit]",
].join(" ");

// NOTE: The shell inset padding is intentionally applied to the `.xterm`
// element (see `[data-terminal-surface] > .xterm` in globals.css), NOT to this
// mount container. xterm's fit addon measures the mount container's height and
// only subtracts padding it finds on `.xterm` itself, so padding here would
// size the terminal too tall and clip the bottom rows under `overflow-hidden`.
export const TERMINAL_SURFACE_CLASS_NAME = [
  "h-full",
  "w-full",
  "rounded-[inherit]",
  "outline-none",
  "focus-visible:ring-1",
  "focus-visible:ring-inset",
  "focus-visible:ring-border/70",
].join(" ");
