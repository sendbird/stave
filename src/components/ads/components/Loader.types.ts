export type LoaderSize = "xs" | "sm" | "md" | "lg";

export type CoreLoaderVariant =
  | "dots"
  | "matrix"
  | "orbit"
  | "parallel"
  | "pulse"
  | "ripple"
  | "scan"
  | "signal"
  | "spinner"
  | "steps";

export type ExtendedLoaderVariant =
  | "cascade"
  | "compile"
  | "decode"
  | "explore"
  | "handoff"
  | "persist"
  | "route"
  | "sync"
  | "verify"
  | "vision";

export type LoaderVariant = CoreLoaderVariant | ExtendedLoaderVariant;
