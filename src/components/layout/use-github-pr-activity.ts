import { i18n, type I18nKey } from "@/i18n";
import type { GitHubPrActivityArgs, GitHubPrActivityFailure, GitHubPrActivityResult } from "@/lib/github-pr-activity";
import { useCallback, useEffect, useRef, useState } from "react";

export type PrActivityTarget = Pick<GitHubPrActivityArgs, "prUrl" | "cwd">;
type Success = Extract<GitHubPrActivityResult, { ok: true }>;
type Kind = Success["kind"];

const failureLabels = {
  "missing-gh": "sourceControl:prActivity.missingGh",
  unauthenticated: "sourceControl:prActivity.unauthenticated",
  failed: "sourceControl:prActivity.failed",
  "invalid-response": "sourceControl:prActivity.invalidResponse",
  "oversized-response": "sourceControl:prActivity.oversizedResponse",
  "wrong-thread": "sourceControl:prActivity.wrongThread",
  "thread-permission": "sourceControl:prActivity.threadPermission",
  "unlinked-run": "sourceControl:prActivity.unlinkedRun",
  "invalid-job": "sourceControl:prActivity.invalidJob",
  "stale-run": "sourceControl:prActivity.staleRun",
  timeout: "sourceControl:prActivity.timeout",
} as const satisfies Record<GitHubPrActivityFailure["reason"], I18nKey>;

export async function requestPrActivity<K extends Kind>(
  args: GitHubPrActivityArgs,
  kind: K,
): Promise<Extract<Success, { kind: K }>> {
  const request = window.api?.sourceControl?.gitHubPrActivity;
  if (!request) throw new Error(i18n.t("sourceControl:sourceControlReviewsPanel.sourceControlReviewBridgeUnavailable"));

  const result = await request(args);
  if (!result.ok) {
    throw new Error(result.detail || i18n.t(failureLabels[result.reason]));
  }
  if (result.kind !== kind) throw new Error(i18n.t("sourceControl:prActivity.failed"));
  return result as Extract<Success, { kind: K }>;
}

export function prActivityError(error: unknown) {
  return error instanceof Error ? error.message : i18n.t("sourceControl:prActivity.failed");
}

export function usePrActivityRead<K extends Exclude<Kind, "written" | "log">>(
  request: () => Promise<Extract<Success, { kind: K }>>,
) {
  const [value, setValue] = useState<Extract<Success, { kind: K }> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const response = await request();
      if (current === generation.current) setValue(response);
    } catch (cause) {
      if (current === generation.current) setError(prActivityError(cause));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  return { value, error, loading, refresh };
}
