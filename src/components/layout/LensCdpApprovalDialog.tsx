import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button, toast } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeLensHostEntry } from "@/lib/lens/lens-security";
import type { LensCdpApprovalRequestPayload } from "@/lib/lens/lens.types";
import { useAppStore } from "@/store/app.store";

function enqueueRequest(
  requests: LensCdpApprovalRequestPayload[],
  request: LensCdpApprovalRequestPayload,
): LensCdpApprovalRequestPayload[] {
  if (requests.some((entry) => entry.requestId === request.requestId)) {
    return requests;
  }
  return [...requests, request];
}

function removeRequest(
  requests: readonly LensCdpApprovalRequestPayload[],
  requestId: string,
): LensCdpApprovalRequestPayload[] {
  return requests.filter((request) => request.requestId !== requestId);
}

export function LensCdpApprovalDialog() {
  const [requests, setRequests] = useState<LensCdpApprovalRequestPayload[]>([]);
  const [responding, setResponding] = useState(false);
  const denyButtonRef = useRef<HTMLButtonElement>(null);
  const current = requests[0] ?? null;
  const workspaceName = useAppStore(
    (state) =>
      state.workspaces.find(
        (workspace) => workspace.id === current?.workspaceId,
      )?.name ??
      current?.workspaceId ??
      "",
  );

  useEffect(() => {
    return window.api?.lens?.subscribeCdpApprovalRequests?.((request) => {
      setRequests((existing) => enqueueRequest(existing, request));
    });
  }, []);

  useEffect(() => {
    if (!current?.expiresAt) {
      return;
    }
    const delay = Math.max(0, current.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      setRequests((existing) => removeRequest(existing, current.requestId));
      toast.error("CDP approval expired", {
        description:
          "Retry the Lens action to show a new approval request, or add the host in Settings > Lens > Developer Mode > Approved CDP Hosts.",
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [current]);

  useEffect(() => {
    if (!current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      denyButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current]);

  const respond = useCallback(
    async (approved: boolean, remember: boolean) => {
      if (!current || responding) {
        return;
      }
      const respondCdpApproval = window.api?.lens?.respondCdpApproval;
      if (!respondCdpApproval) {
        toast.error("Lens approval controls are unavailable.");
        return;
      }

      setResponding(true);
      try {
        const result = await respondCdpApproval({
          requestId: current.requestId,
          approved,
          remember,
        });
        if (!result.ok) {
          toast.error("CDP approval expired", {
            description:
              "Retry the Lens action to show a new approval request, or add the host in Settings > Lens > Developer Mode > Approved CDP Hosts.",
          });
          setRequests((existing) => removeRequest(existing, current.requestId));
          return;
        }

        if (approved && remember) {
          const host = normalizeLensHostEntry(current.host);
          if (host) {
            const state = useAppStore.getState();
            state.updateSettings({
              patch: {
                lensCdpApprovedHosts: [
                  ...state.settings.lensCdpApprovedHosts,
                  host,
                ],
              },
            });
          }
        }
        setRequests((existing) => removeRequest(existing, current.requestId));
      } catch (error) {
        toast.error("Failed to answer the CDP approval", {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setResponding(false);
      }
    },
    [current, responding],
  );

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) {
          void respond(false, false);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          denyButtonRef.current?.focus();
        }}
      >
        <DialogHeader className="gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
              <ShieldAlert className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <DialogTitle>Allow Lens CDP access?</DialogTitle>
              <DialogDescription className="mt-1">
                An agent wants to inspect and control this site through Lens.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="grid gap-2 text-sm">
          <div className="grid gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Host
            </span>
            <span className="truncate font-mono text-xs">
              {current?.host ?? ""}
            </span>
          </div>
          <div className="grid gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Workspace
            </span>
            <span className="truncate text-xs">{workspaceName}</span>
          </div>
          <div className="grid gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Action
            </span>
            <span className="text-xs">{current?.reason ?? ""}</span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Allow once grants temporary access. Always allow saves only the
            hostname under Settings &gt; Lens &gt; Developer Mode; ports and
            paths are ignored.
          </p>
          <span className="sr-only" aria-live="polite">
            {responding ? "Submitting approval response." : ""}
          </span>
        </div>
        <DialogFooter>
          <Button
            ref={denyButtonRef}
            type="button"
            variant="outline"
            disabled={responding}
            onClick={() => {
              void respond(false, false);
            }}
          >
            Deny
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={responding}
            onClick={() => {
              void respond(true, false);
            }}
          >
            Allow once
          </Button>
          <Button
            type="button"
            disabled={responding}
            onClick={() => {
              void respond(true, true);
            }}
          >
            {responding ? <Loader2 className="size-4 animate-spin" /> : null}
            Always allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
