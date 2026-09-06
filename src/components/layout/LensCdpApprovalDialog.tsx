import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import { Button, Loader, toast } from "@/components/ui";
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
import { lensApprovalStyles } from "./lens-cdp-approval-dialog.styles";

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
        xstyle={lensApprovalStyles.content}
        initialFocus={() => denyButtonRef.current}
      >
        <DialogHeader className={sx(lensApprovalStyles.header)}>
          <div className={sx(lensApprovalStyles.headerRow)}>
            <span className={sx(lensApprovalStyles.headerBadge)}>
              <ShieldAlert className={sx(lensApprovalStyles.headerIcon)} />
            </span>
            <div className={sx(lensApprovalStyles.headerText)}>
              <DialogTitle>Allow Lens CDP access?</DialogTitle>
              <DialogDescription className={sx(lensApprovalStyles.description)}>
                An agent wants to inspect and control this site through Lens.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className={sx(lensApprovalStyles.body)}>
          <div className={sx(lensApprovalStyles.fact)}>
            <span className={sx(lensApprovalStyles.factLabel)}>Host</span>
            <span className={sx(lensApprovalStyles.factValueMono)}>
              {current?.host ?? ""}
            </span>
          </div>
          <div className={sx(lensApprovalStyles.fact)}>
            <span className={sx(lensApprovalStyles.factLabel)}>Workspace</span>
            <span className={sx(lensApprovalStyles.factValueTruncated)}>
              {workspaceName}
            </span>
          </div>
          <div className={sx(lensApprovalStyles.fact)}>
            <span className={sx(lensApprovalStyles.factLabel)}>Action</span>
            <span className={sx(lensApprovalStyles.factValue)}>
              {current?.reason ?? ""}
            </span>
          </div>
          <p className={sx(lensApprovalStyles.hint)}>
            Allow once grants temporary access. Always allow saves only the
            hostname under Settings &gt; Lens &gt; Developer Mode; ports and
            paths are ignored.
          </p>
          <VisuallyHidden aria-live="polite">
            {responding ? "Submitting approval response." : ""}
          </VisuallyHidden>
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
            {responding ? (
              <Loader aria-hidden size="xs" variant="spinner" />
            ) : null}
            Always allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
