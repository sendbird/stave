import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
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
      <DialogContent className={sx(styles.dialog)}>
        <DialogHeader className={sx(styles.header)}>
          <div className={sx(styles.heading)}>
            <div className={sx(styles.content)}>
              <DialogTitle className={sx(styles.title)}>Session IDs</DialogTitle>
              <DialogDescription className={sx(styles.description)}>
                Stave keeps one stable task ID while each provider keeps its own
                native session ID. A task can collect both Claude and Codex IDs
                as it switches providers.
              </DialogDescription>
            </div>
            <span className={sx(styles.current)}>
              Current: {getProviderLabel({ providerId: task.provider })}
            </span>
          </div>
        </DialogHeader>
        <div className={sx(styles.rows)}>
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
            <div className={sx(styles.empty)}>
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
          <p className={sx(styles.note)}>
            Provider-native IDs are used for in-app resume and may not be
            resumable from an external Claude or Codex terminal session.
          </p>
        </div>
        <DialogFooter className={sx(styles.footer)}>
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
    <div className={sx(styles.row)}>
      <div className={sx(styles.rowHeader)}>
        <p className={sx(styles.rowLabel)}>
          {props.label}
        </p>
        {props.providerLabel ? (
          <span className={sx(styles.provider)}>
            {props.providerLabel}
          </span>
        ) : null}
      </div>
      <div className={sx(styles.valueRow)}>
        <p className={sx(styles.value)}>
          {props.value}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={sx(styles.copy)}
          onClick={props.onCopy}
        >
          {props.copied ? (
            <Check className={sx(styles.icon)} />
          ) : (
            <Copy className={sx(styles.icon)} />
          )}
          {props.copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

const styles = stylex.create({
dialog: {maxWidth:512,gap:0,overflow:"hidden",padding:0},
header: {borderBottomWidth:1,borderBottomStyle:"solid",borderBottomColor:vars.colorBorder,padding:20,paddingRight:56},
heading: {display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12},
content: {minWidth:0},
title: {fontSize:16},
description: {marginTop:8,lineHeight:"20px"},
current: {flexShrink:0,borderRadius:6,borderWidth:1,borderStyle:"solid",borderColor:vars.colorBorder,paddingInline:8,paddingBlock:4,fontSize:12,color:vars.colorTextMuted},
rows: {display:"flex",flexDirection:"column",gap:12,paddingInline:20,paddingBlock:16},
empty: {borderRadius:6,borderWidth:1,borderStyle:"dashed",borderColor:vars.colorBorder,backgroundColor:vars.colorCanvasSubtle,padding:12,fontSize:14,color:vars.colorTextMuted},
note: {fontSize:12,lineHeight:"20px",color:vars.colorTextMuted},
footer: {borderTopWidth:1,borderTopStyle:"solid",borderTopColor:vars.colorBorder,paddingInline:20,paddingBlock:16},
row: {borderRadius:6,borderWidth:1,borderStyle:"solid",borderColor:vars.colorBorder,backgroundColor:vars.colorCanvas,paddingInline:12,paddingBlock:8},
rowHeader: {display:"flex",alignItems:"center",justifyContent:"space-between",gap:12},
rowLabel: {fontSize:11,textTransform:"uppercase",letterSpacing:"0.025em",color:vars.colorTextMuted},
provider: {borderRadius:6,borderWidth:1,borderStyle:"solid",borderColor:vars.colorBorder,paddingInline:8,paddingBlock:4,fontSize:12,color:vars.colorTextMuted},
valueRow: {marginTop:4,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12},
value: {minWidth:0,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:vars.fontMono,fontSize:14,color:vars.colorText},
copy: {height:32,flexShrink:0,paddingInline:8},
icon: {width:16,height:16}
});
