import { useEffect, useMemo, useRef, useState } from "react";
import { parseLongLivedBranchPatterns, type PullRequestStack, type StackErrorCode } from "@/lib/pull-request-stack";
import { useAppStore } from "@/store/app.store";

/** Changes only when the PR's identity, state or base changed. */
export function pullRequestStackRevision(pr: { number: number; state: string; baseRefName?: string } | null | undefined) {
  return pr ? `${pr.number}:${pr.state}:${pr.baseRefName ?? ""}` : "";
}

/** Fleet can show dozens of cards; at most this many stack reads run at once. */
export const MAX_CONCURRENT_STACK_READS = 2;
let activeReads = 0;
const waiting: Array<() => void> = [];

/** Queues a stack read behind the concurrency bound. */
export function limitStackRead<T>(read: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeReads += 1;
      read().then(resolve, reject).finally(() => {
        activeReads -= 1;
        waiting.shift()?.();
      });
    };
    if (activeReads < MAX_CONCURRENT_STACK_READS) start();
    else waiting.push(start);
  });
}

export function useLongLivedBranchPatterns() {
  const text = useAppStore((state) => state.settings.pullRequestLongLivedBranches);
  return useMemo(() => parseLongLivedBranchPatterns(text), [text]);
}

interface StackResult { identity: string; stack: PullRequestStack | null; code: StackErrorCode | null }

/**
 * Reads a visible PR surface's stack. `revision` should change only when the
 * PR itself changed (state, base); a refetch for the same `cwd`/`branch`
 * keeps the previous stack on screen until the new one arrives.
 */
export function usePullRequestStack(args: {
  cwd: string;
  branch?: string;
  prUrl?: string;
  enabled: boolean;
  revision?: string | number;
}) {
  const patterns = useLongLivedBranchPatterns();
  const identity = JSON.stringify([args.cwd, args.prUrl ?? args.branch ?? ""]);
  const [result, setResult] = useState<StackResult>({ identity: "", stack: null, code: null });
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const patternsRef = useRef(patterns);
  patternsRef.current = patterns;
  const patternsKey = patterns.join("\n");
  useEffect(() => {
    const getPrStack = window.api?.sourceControl?.getPrStack;
    if (!args.enabled || !args.cwd || !getPrStack) {
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    void limitStackRead(() => current
      ? getPrStack({ cwd: args.cwd, ...(args.prUrl ? { prUrl: args.prUrl } : args.branch ? { branch: args.branch } : {}), longLivedBranchPatterns: patternsRef.current })
      : Promise.resolve(null))
      .then((read) => {
        if (!current || !read) return;
        // A failed refresh keeps what was shown rather than blanking it.
        setResult((previous) => read.ok
          ? { identity, stack: read.stack, code: null }
          : { identity, stack: previous.identity === identity ? previous.stack : null, code: read.code });
      })
      .catch(() => {
        if (current) setResult((previous) => ({ identity, stack: previous.identity === identity ? previous.stack : null, code: "read-failed" }));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [args.cwd, args.branch, args.prUrl, args.enabled, args.revision, identity, refresh, patternsKey]);
  const same = result.identity === identity && args.enabled;
  return {
    stack: same ? result.stack : null,
    code: same ? result.code : null,
    loading,
    patterns,
    refresh: () => setRefresh((value) => value + 1),
  };
}

/** True while the element is in the viewport; cards off screen read nothing. */
export function useInViewport<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}
