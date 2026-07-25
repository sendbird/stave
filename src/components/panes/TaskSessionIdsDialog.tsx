import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, toast } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import {
  getProviderSessionLabel,
  listProviderSessions,
} from "@/lib/providers/provider-sessions";
import { useAppStore } from "@/store/app.store";

interface TaskSessionIdsDialogProps {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function TaskSessionIdsDialog({
  taskId,
  onOpenChange,
}: TaskSessionIdsDialogProps) {
  const [copiedSessionIdKey, setCopiedSessionIdKey] = useState<string | null>(
    null,
  );
  const [task, providerSessions] = useAppStore(
    useShallow((state) => [
      taskId ? (state.tasks.find((item) => item.id === taskId) ?? null) : null,
      taskId ? state.providerSessionByTask[taskId] : undefined,
    ]),
  );
  const sessionRows = useMemo(
    () => listProviderSessions({ sessions: providerSessions }),
    [providerSessions],
  );

  useEffect(() => {
    setCopiedSessionIdKey(null);
  }, [taskId]);

  useEffect(() => {
    if (!copiedSessionIdKey) {
      return;
    }
    const handle = window.setTimeout(() => setCopiedSessionIdKey(null), 1500);
    return () => window.clearTimeout(handle);
  }, [copiedSessionIdKey]);

  async function copySessionIdentifier(args: {
    key: string;
    label: string;
    value: string;
  }) {
    try {
      await copyTextToClipboard(args.value);
      setCopiedSessionIdKey(args.key);
    } catch {
      setCopiedSessionIdKey(null);
      toast.error(`Could not copy ${args.label.toLowerCase()}.`);
    }
  }

  if (!task) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-5 py-5 pr-14">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base">Session IDs</DialogTitle>
              <DialogDescription className="mt-2 leading-5">
                Stave keeps one stable task ID while each provider keeps its own
                native session ID. A task can collect both Claude and Codex IDs
                as it switches providers.
              </DialogDescription>
            </div>
            <span className="shrink-0 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
              Current: {getProviderLabel({ providerId: task.provider })}
            </span>
          </div>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <SessionIdentifierRow
            label="Stave task ID"
            value={task.id}
            copied={copiedSessionIdKey === "task"}
            onCopy={() =>
              void copySessionIdentifier({
                key: "task",
                label: "Stave task ID",
                value: task.id,
              })
            }
          />
          {sessionRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              No provider-native session IDs have been recorded for this task
              yet.
            </div>
          ) : (
            sessionRows.map((row) => {
              const label = getProviderSessionLabel({
                providerId: row.providerId,
              });
              return (
                <SessionIdentifierRow
                  key={row.providerId}
                  label={label}
                  providerLabel={getProviderLabel({
                    providerId: row.providerId,
                  })}
                  value={row.nativeSessionId}
                  copied={copiedSessionIdKey === row.providerId}
                  onCopy={() =>
                    void copySessionIdentifier({
                      key: row.providerId,
                      label,
                      value: row.nativeSessionId,
                    })
                  }
                />
              );
            })
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Provider-native IDs are used for in-app resume and may not be
            resumable from an external Claude or Codex terminal session.
          </p>
        </div>
        <DialogFooter className="border-t border-border/70 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionIdentifierRow(props: {
  label: string;
  providerLabel?: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-md border border-border/80 bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {props.label}
        </p>
        {props.providerLabel ? (
          <span className="rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
            {props.providerLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
          {props.value}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 px-2"
          onClick={props.onCopy}
        >
          {props.copied ? (
            <Check className="size-4" />
          ) : (
            <Copy className="size-4" />
          )}
          {props.copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
