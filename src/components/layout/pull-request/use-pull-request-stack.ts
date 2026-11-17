import { useEffect, useState } from "react";
import type { PullRequestStack } from "@/lib/pull-request-stack";

/** Reads only a visible PR surface, alongside its existing status refresh. */
export function usePullRequestStack(args: {
  cwd: string;
  branch?: string;
  enabled: boolean;
  revision?: number;
}) {
  const identity = JSON.stringify([args.cwd, args.branch ?? ""]);
  const [resultIdentity, setResultIdentity] = useState("");
  const [stack, setStack] = useState<PullRequestStack | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setResultIdentity(identity);
    setStack(null);
    setError("");
    if (!args.enabled || !args.cwd || !window.api?.sourceControl?.getPrStack) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void window.api.sourceControl.getPrStack({ cwd: args.cwd, ...(args.branch ? { branch: args.branch } : {}) })
      .then((result) => {
        if (!current) return;
        setStack(result.ok ? result.stack : null);
        setError(result.ok ? "" : result.stderr);
      })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [args.cwd, args.branch, args.enabled, args.revision, identity, refresh]);
  return { stack: resultIdentity === identity && args.enabled ? stack : null, error, loading, refresh: () => setRefresh((value) => value + 1) };
}
