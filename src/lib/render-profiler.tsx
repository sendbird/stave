import { Profiler, type ReactNode } from "react";

export interface RenderProfileSample {
  id: string;
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

const STORAGE_KEY = "stave:render-profiler";
const QUERY_PARAM = "staveProfileRenders";
const DEFAULT_THRESHOLD_MS = 8;
const MAX_STORED_SAMPLES = 200;

declare global {
  interface Window {
    __STAVE_RENDER_PROFILE_EVENTS__?: RenderProfileSample[];
  }
}

export function resolveRenderProfilingEnabled(args: {
  search: string;
  localStorageValue?: string | null;
}) {
  const params = new URLSearchParams(args.search.startsWith("?") ? args.search : `?${args.search}`);
  const queryValue = params.get(QUERY_PARAM)?.trim().toLowerCase();
  if (queryValue === "1" || queryValue === "true" || queryValue === "yes") {
    return true;
  }
  if (queryValue === "0" || queryValue === "false" || queryValue === "no") {
    return false;
  }

  const storageValue = args.localStorageValue?.trim().toLowerCase();
  return storageValue === "1" || storageValue === "true" || storageValue === "yes";
}

function isRenderProfilingEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  return resolveRenderProfilingEnabled({
    search: window.location.search,
    localStorageValue: window.localStorage.getItem(STORAGE_KEY),
  });
}

function recordRenderProfileSample(sample: RenderProfileSample) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof performance !== "undefined" && typeof performance.measure === "function") {
    try {
      performance.measure(`stave:render:${sample.id}:${sample.phase}`, {
        start: sample.startTime,
        end: sample.commitTime,
      });
    } catch {
      // Ignore measurement failures in environments with partial Performance API support.
    }
  }

  const existing = window.__STAVE_RENDER_PROFILE_EVENTS__ ?? [];
  const next = existing.length >= MAX_STORED_SAMPLES
    ? [...existing.slice(existing.length - MAX_STORED_SAMPLES + 1), sample]
    : [...existing, sample];
  window.__STAVE_RENDER_PROFILE_EVENTS__ = next;
}

export function RenderProfiler(args: {
  id: string;
  children: ReactNode;
  thresholdMs?: number;
}) {
  if (!isRenderProfilingEnabled()) {
    return <>{args.children}</>;
  }

  return (
    <Profiler
      id={args.id}
      onRender={(id, phase, actualDuration, baseDuration, startTime, commitTime) => {
        if (actualDuration < (args.thresholdMs ?? DEFAULT_THRESHOLD_MS)) {
          return;
        }

        const sample: RenderProfileSample = {
          id,
          phase,
          actualDuration: Number(actualDuration.toFixed(2)),
          baseDuration: Number(baseDuration.toFixed(2)),
          startTime: Number(startTime.toFixed(2)),
          commitTime: Number(commitTime.toFixed(2)),
        };
        recordRenderProfileSample(sample);
        console.info("[stave render profile]", sample);
      }}
    >
      {args.children}
    </Profiler>
  );
}
