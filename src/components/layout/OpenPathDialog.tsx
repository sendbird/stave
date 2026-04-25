import { FolderOpen } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, Card, Input } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";

type OpenPathDialogSubmitResult = { ok: boolean; stderr?: string };

type OpenPathDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (inputPath: string) => Promise<OpenPathDialogSubmitResult>;
  onSubmitPath?: (inputPath: string) => Promise<OpenPathDialogSubmitResult>;
  onBrowse: () => Promise<void>;
};

export function OpenPathDialog(args: OpenPathDialogProps) {
  const { open, onOpenChange, onSubmit, onSubmitPath, onBrowse } = args;
  const [inputPath, setInputPath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitPath = onSubmitPath ?? onSubmit;

  if (!open) {
    return null;
  }

  function reset() {
    setInputPath("");
    setError("");
    setBusy(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmitPath() {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      return;
    }
    if (!submitPath) {
      setError("Open action is unavailable.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await submitPath(trimmed);
      if (result.ok) {
        close();
      } else {
        setError(result.stderr || "Failed to open path.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBrowse() {
    setBusy(true);
    setError("");
    try {
      await onBrowse();
      close();
    } catch {
      // User cancelled the native dialog — just stay open.
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    void handleSubmitPath();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      close();
    }
  }

  return (
    <div
      className={cn(UI_LAYER_CLASS.dialog, "fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]")}
      onMouseDown={close}
    >
      <Card
        className="w-full max-w-md rounded-lg border-border/80 bg-card p-4 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleDialogKeyDown}>
          <h3 className="text-base font-semibold text-foreground">Open Project</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a path or browse for a folder.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Input
              autoFocus
              className="flex-1"
              placeholder="~/projects/my-app"
              value={inputPath}
              onChange={(event) => {
                setInputPath(event.target.value);
                setError("");
              }}
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={() => void handleBrowse()}
              disabled={busy}
            >
              <FolderOpen className="size-4" />
              Browse
            </Button>
          </div>
          {error ? (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !inputPath.trim()}>
              {busy ? "Opening..." : "Open"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
