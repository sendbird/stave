import { promptRequestsProviderBrowser } from "../../../src/lib/provider-browser";

/** Explicit @web consent belongs to one primary Run, including its continuations. */
export function agentRunBrowserRequested(args: {
  assignment: string;
  prompt?: string;
  delegated: boolean;
  events: readonly { detail: Record<string, unknown> }[];
}): boolean {
  return !args.delegated && (
    promptRequestsProviderBrowser(args.assignment) ||
    promptRequestsProviderBrowser(args.prompt ?? "") ||
    args.events.some((event) => event.detail.browserRequested === true)
  );
}
