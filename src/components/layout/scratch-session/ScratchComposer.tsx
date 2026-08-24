import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { useScratchSessionStore } from "@/store/scratch-session.store";

export function ScratchComposerView(props: {
  folderPath: string | null;
  activeTurnId: string | null;
  isClearing: boolean;
  error: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const sendDisabled =
    !props.folderPath || props.isClearing || props.draft.trim().length === 0;

  return (
    <div className="border-t border-border/80 p-3">
      {props.error ? (
        <p
          role="alert"
          className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
        >
          {props.error}
        </p>
      ) : null}
      <Textarea
        rows={2}
        value={props.draft}
        placeholder={
          props.isClearing
            ? "Clearing session…"
            : props.folderPath
              ? "Ask about this folder…"
              : "Pick a folder first"
        }
        disabled={!props.folderPath || props.isClearing}
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
  const isClearing = useScratchSessionStore((state) => state.isClearing);
  const error = useScratchSessionStore((state) => state.error);
  const send = useScratchSessionStore((state) => state.send);
  const stop = useScratchSessionStore((state) => state.stop);
  const settings = useAppStore((state) => state.settings);

  return (
    <ScratchComposerView
      folderPath={folderPath}
      activeTurnId={activeTurnId}
      isClearing={isClearing}
      error={error}
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
