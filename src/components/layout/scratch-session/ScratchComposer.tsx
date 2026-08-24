import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { useScratchSessionStore } from "@/store/scratch-session.store";

export function ScratchComposerView(props: {
  folderPath: string | null;
  activeTurnId: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const sendDisabled = !props.folderPath || props.draft.trim().length === 0;

  return (
    <div className="border-t border-border/80 p-3">
      <Textarea
        rows={2}
        value={props.draft}
        placeholder={
          props.folderPath ? "Ask about this folder…" : "Pick a folder first"
        }
        disabled={!props.folderPath}
        onChange={(event) => props.onDraftChange(event.target.value)}
      />
      <div className="mt-2 flex justify-end">
        {props.activeTurnId ? (
          <Button size="sm" variant="outline" onClick={props.onStop}>
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={sendDisabled} onClick={props.onSend}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

export function ScratchComposer() {
  const [draft, setDraft] = useState("");
  const folderPath = useScratchSessionStore((state) => state.folderPath);
  const activeTurnId = useScratchSessionStore((state) => state.activeTurnId);
  const send = useScratchSessionStore((state) => state.send);
  const stop = useScratchSessionStore((state) => state.stop);
  const settings = useAppStore((state) => state.settings);

  return (
    <ScratchComposerView
      folderPath={folderPath}
      activeTurnId={activeTurnId}
      draft={draft}
      onDraftChange={setDraft}
      onStop={() => void stop()}
      onSend={() => {
        const prompt = draft;
        setDraft("");
        void send({ prompt, settings });
      }}
    />
  );
}
