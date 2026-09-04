import { cn } from "@/lib/utils";
import type {
  ExtendedLoaderVariant,
  LoaderSize,
  LoaderVariant,
} from "./loader.types";

const THREE_PHASE = [
  "stave-loader-phase-0",
  "stave-loader-phase-2",
  "stave-loader-phase-4",
] as const;
const FOUR_PHASE = [
  "stave-loader-phase-0",
  "stave-loader-phase-2",
  "stave-loader-phase-4",
  "stave-loader-phase-6",
] as const;
const MATRIX_PHASE = [
  "stave-loader-phase-4",
  "stave-loader-phase-2",
  "stave-loader-phase-2",
  "stave-loader-phase-4",
  "stave-loader-phase-2",
  "stave-loader-phase-0",
  "stave-loader-phase-0",
  "stave-loader-phase-2",
  "stave-loader-phase-2",
  "stave-loader-phase-0",
  "stave-loader-phase-0",
  "stave-loader-phase-2",
  "stave-loader-phase-4",
  "stave-loader-phase-2",
  "stave-loader-phase-2",
  "stave-loader-phase-4",
] as const;

function ExtendedLoaderMark({ variant }: { variant: ExtendedLoaderVariant }) {
  switch (variant) {
    case "cascade":
      return (
        <span className="stave-loader-fill">
          {(["1", "2", "3", "4"] as const).map((slot, index) => (
            <span
              className={cn("stave-loader-cascade-dot", FOUR_PHASE[index])}
              data-slot={slot}
              key={slot}
            />
          ))}
        </span>
      );
    case "decode":
      return (
        <span className="stave-loader-fill stave-loader-decode">
          {FOUR_PHASE.map((phase, index) => (
            <span
              className={cn("stave-loader-decode-cell", phase)}
              key={index}
            />
          ))}
        </span>
      );
    case "compile":
      return (
        <span className="stave-loader-fill">
          {(["1", "2", "3"] as const).map((slot, index) => (
            <span
              className={cn("stave-loader-compile-bar", THREE_PHASE[index])}
              data-slot={slot}
              key={slot}
            />
          ))}
        </span>
      );
    case "route":
      return (
        <span className="stave-loader-fill">
          <span className="stave-loader-route-rail" />
          <span className="stave-loader-route-node" data-slot="start" />
          <span className="stave-loader-route-node" data-slot="middle" />
          <span className="stave-loader-route-node" data-slot="end" />
          <span className="stave-loader-route-runner" />
        </span>
      );
    case "handoff":
      return (
        <span className="stave-loader-fill">
          <span className="stave-loader-route-rail" />
          {(["1", "2", "3"] as const).map((slot, index) => (
            <span
              className={cn("stave-loader-handoff-node", THREE_PHASE[index])}
              data-slot={slot}
              key={slot}
            />
          ))}
        </span>
      );
    case "vision":
      return (
        <span className="stave-loader-fill">
          <span className="stave-loader-vision-frame" />
          <span className="stave-loader-vision-iris" />
          <span className="stave-loader-vision-focus" />
        </span>
      );
    case "explore":
      return (
        <span className="stave-loader-fill">
          <span className="stave-loader-explore-center" />
          {(["1", "2", "3"] as const).map((slot) => (
            <span
              className="stave-loader-explore-branch"
              data-slot={slot}
              key={`branch-${slot}`}
            />
          ))}
          {(["1", "2", "3"] as const).map((slot, index) => (
            <span
              className={cn("stave-loader-explore-leaf", THREE_PHASE[index])}
              data-slot={slot}
              key={`leaf-${slot}`}
            />
          ))}
        </span>
      );
    case "sync":
      return (
        <span className="stave-loader-fill">
          <span className="stave-loader-sync-rail" data-slot="top" />
          <span className="stave-loader-sync-rail" data-slot="bottom" />
          <span className="stave-loader-sync-runner" data-slot="top" />
          <span className="stave-loader-sync-runner" data-slot="bottom" />
        </span>
      );
    case "verify":
      return (
        <span className="stave-loader-fill">
          <span className="stave-loader-verify-frame" />
          {(["1", "2", "3", "4"] as const).map((slot, index) => (
            <span
              className={cn("stave-loader-verify-point", FOUR_PHASE[index])}
              data-slot={slot}
              key={slot}
            />
          ))}
        </span>
      );
    case "persist":
      return (
        <span className="stave-loader-fill">
          {(["1", "2", "3"] as const).map((slot, index) => (
            <span
              className={cn("stave-loader-persist-layer", THREE_PHASE[index])}
              data-slot={slot}
              key={slot}
            />
          ))}
        </span>
      );
  }
}

function renderVariant(variant: LoaderVariant) {
  switch (variant) {
    case "spinner":
      return (
        <svg
          className="stave-loader-spinner"
          focusable="false"
          viewBox="0 0 24 24"
        >
          <circle
            className="stave-loader-spinner-arc"
            cx="12"
            cy="12"
            pathLength="1"
            r="10.5"
          />
        </svg>
      );
    case "dots":
      return THREE_PHASE.map((phase, index) => (
        <span className={cn("stave-loader-dot", phase)} key={index} />
      ));
    case "matrix":
      return MATRIX_PHASE.map((phase, index) => (
        <span className={cn("stave-loader-matrix-dot", phase)} key={index} />
      ));
    case "pulse":
      return THREE_PHASE.map((phase, index) => (
        <span className={cn("stave-loader-pulse-bar", phase)} key={index} />
      ));
    case "steps":
      return FOUR_PHASE.map((phase, index) => (
        <span className={cn("stave-loader-step", phase)} key={index} />
      ));
    case "orbit":
      return (
        <>
          <span className="stave-loader-orbit-rail" />
          <span className="stave-loader-orbit-motion">
            <span className="stave-loader-orbit-point" />
            <span className="stave-loader-orbit-point stave-loader-orbit-point-opposite" />
          </span>
          <span className="stave-loader-orbit-core" />
        </>
      );
    case "ripple":
      return (
        <>
          <span className="stave-loader-ripple-ring stave-loader-ripple-inner" />
          <span className="stave-loader-ripple-ring stave-loader-ripple-middle" />
          <span className="stave-loader-ripple-ring stave-loader-ripple-outer" />
        </>
      );
    case "signal":
      return [1, 2, 3, 4].map((level, index) => (
        <span
          className={cn("stave-loader-signal-bar", FOUR_PHASE[index])}
          data-level={level}
          key={level}
        />
      ));
    case "scan":
      return (
        <>
          <span className="stave-loader-scan-frame" />
          <span className="stave-loader-scan-beam" />
        </>
      );
    case "parallel":
      return (["start", "middle", "end"] as const).map((slot, index) => (
        <span className="stave-loader-parallel-lane" key={slot}>
          <span className="stave-loader-parallel-rail" />
          <span
            className={cn(
              "stave-loader-parallel-runner",
              FOUR_PHASE[index * 2],
            )}
            data-direction={index === 1 ? "reverse" : "forward"}
          />
        </span>
      ));
    case "cascade":
    case "compile":
    case "decode":
    case "explore":
    case "handoff":
    case "persist":
    case "route":
    case "sync":
    case "verify":
    case "vision":
      return <ExtendedLoaderMark variant={variant} />;
  }
}

export function LoaderMark(args: { size: LoaderSize; variant: LoaderVariant }) {
  return (
    <span
      aria-hidden
      className="stave-loader-mark"
      data-loader-mark=""
      data-loader-size={args.size}
      data-loader-variant={args.variant}
    >
      {renderVariant(args.variant)}
    </span>
  );
}
