import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sx } from "@/components/aui/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, ToolUsePart } from "@/types/chat";
import { TraceOutput } from "./message/turn-event-rows";
import { activityDetailStyles as s } from "./activity-detail.styles";

/**
 * One plain tool call from the turn's activity list. Agents (subagents,
 * delegated tasks, reviews) open in the Agent panel instead.
 */
export interface ActivityDetailSelection {
  title: string;
  toolUseId?: string;
  detail?: string;
}

const EMPTY: ChatMessage[] = [];

/** A tool call's recorded detail, input and result, over the conversation. */
export function ActivityDetailDialog(props: {
  selection: ActivityDetailSelection;
  taskId: string;
  onClose: () => void;
  onShowInConversation?: (toolUseId: string) => void;
}) {
  useTranslation();
  const { selection } = props;
  const toolUseId = selection.toolUseId;
  const messages = useAppStore((state) => state.messagesByTask[props.taskId] ?? EMPTY);
  const tool = useMemo(() => {
    if (!toolUseId) return undefined;
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool_use" && part.toolUseId === toolUseId) return part as ToolUsePart;
      }
    }
    return undefined;
  }, [messages, toolUseId]);
  const live = tool ? tool.state === "input-streaming" || tool.state === "input-available" : false;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent xstyle={s.dialog}>
        <DialogHeader>
          <DialogTitle>{selection.title}</DialogTitle>
          <DialogDescription>{i18n.t("session:activityDetailDialog.toolDescription")}</DialogDescription>
        </DialogHeader>
        {toolUseId && props.onShowInConversation ? (
          <div className={sx(s.actions)}>
            <Button size="sm" variant="ghost" onClick={() => { props.onShowInConversation?.(toolUseId); props.onClose(); }}>
              {i18n.t("session:activityDetailDialog.activityDetailDialog3")}
            </Button>
          </div>
        ) : null}
        <div className={sx(s.body)}>
          <p role="status" className={sx(s.meta)}>
            {live ? i18n.t("session:activityDetailDialog.statusLabel") : i18n.t("session:activityDetailDialog.statusLabel2")}
          </p>
          {selection.detail ? (
            <section className={sx(s.section)}>
              <h3 className={sx(s.subheading)}>{i18n.t("session:activityDetailDialog.activityDetailDialog9")}</h3>
              <TraceOutput text={selection.detail} />
            </section>
          ) : null}
          {tool ? (
            <>
              <section className={sx(s.section)}>
                <h3 className={sx(s.subheading)}>{i18n.t("session:activityDetailDialog.activityDetailDialog11")}</h3>
                <TraceOutput capped text={tool.input} />
              </section>
              <section className={sx(s.section)}>
                <h3 className={sx(s.subheading)}>{i18n.t("session:activityDetailDialog.sentence37", { value1: tool.state })}</h3>
                <TraceOutput capped text={tool.output ?? i18n.t("session:activityDetailDialog.text")} />
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
