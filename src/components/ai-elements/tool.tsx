import type { HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, LoaderCircle, Wrench } from "lucide-react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cn } from "@/lib/utils";

interface ToolProps extends HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  openWhen?: boolean;
}

export type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

interface ToolHeaderProps extends HTMLAttributes<HTMLButtonElement> {
  type?: string;
  state?: ToolState;
  title?: string;
  elapsedSeconds?: number;
}

interface ToolContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

function useToolContext() {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used inside <Tool />.");
  }
  return context;
}

export function Tool({ className, defaultOpen = false, openWhen = false, ...props }: ToolProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (openWhen) {
      setOpen(true);
    }
  }, [openWhen]);

  const contextValue = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <ToolContext.Provider value={contextValue}>
      <section className={cn("rounded-md border bg-card", className)} {...props} />
    </ToolContext.Provider>
  );
}

function displayToolName(args: { type?: string; title?: string }) {
  if (args.title?.trim()) {
    return args.title.trim();
  }
  if (!args.type) {
    return "Tool";
  }
  return args.type.replace(/^tool[-_:]?/i, "").replaceAll(/[_-]+/g, " ");
}

export function getStatusBadge(state?: ToolHeaderProps["state"]): ReactNode {
  switch (state) {
    case "input-streaming":
      return (
        <span aria-label="Running" className="inline-flex items-center text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
        </span>
      );
    case "input-available":
      return (
        <span aria-label="Input available" className="inline-flex items-center text-muted-foreground">
          <Wrench className="size-3.5" />
        </span>
      );
    case "output-available":
      return (
        <span aria-label="Done" className="inline-flex items-center text-success">
          <CircleCheck className="size-3.5" />
        </span>
      );
    case "output-error":
      return (
        <span aria-label="Error" className="inline-flex items-center text-destructive">
          <CircleAlert className="size-3.5" />
        </span>
      );
    default:
      return (
        <span aria-label="Idle" className="inline-flex items-center text-muted-foreground">
          <Wrench className="size-3.5" />
        </span>
      );
  }
}

function formatElapsedTime(seconds: number) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function getToolStatusText(state?: ToolState, elapsedSeconds?: number) {
  switch (state) {
    case "input-streaming":
      return elapsedSeconds != null && elapsedSeconds > 0
        ? `Running (${formatElapsedTime(elapsedSeconds)})`
        : "Running";
    case "input-available":
      return "Ready";
    case "output-available":
      return elapsedSeconds != null && elapsedSeconds > 0
        ? `Done (${formatElapsedTime(elapsedSeconds)})`
        : "Done";
    case "output-error":
      return "Error";
    default:
      return "Idle";
  }
}

function getToolStatusTextClassName(state?: ToolState) {
  switch (state) {
    case "output-available":
      return "text-success";
    case "output-error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function ToolHeader({ className, type, state, title, elapsedSeconds, ...props }: ToolHeaderProps) {
  const { open, setOpen } = useToolContext();
  return (
    <button
      type="button"
      className={cn("flex w-full items-center justify-between px-3 py-2 text-[0.875em] font-semibold", open && "border-b", className)}
      onClick={() => setOpen(!open)}
      {...props}
    >
      <span className="inline-flex items-center gap-1.5">
        <Wrench className="size-3.5" />
        {displayToolName({ type, title })}
      </span>
      <span className="inline-flex items-center gap-2">
        <span className={cn("text-[0.75em] font-medium", getToolStatusTextClassName(state))}>
          {getToolStatusText(state, elapsedSeconds)}
        </span>
        {getStatusBadge(state)}
        <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")} />
      </span>
    </button>
  );
}

export function ToolContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open } = useToolContext();
  if (!open) {
    return null;
  }
  return <div className={cn("space-y-2 px-3 py-2", className)} {...props} />;
}

export function ToolInput(args: { input: unknown; className?: string }) {
  const content = typeof args.input === "string" ? args.input : JSON.stringify(args.input, null, 2);
  return (
    <div className={cn("rounded-sm border border-border/70 bg-muted/20 p-2", args.className)}>
      <p className="mb-1 text-[0.75em] uppercase text-muted-foreground">Input</p>
      <LinkifiedText
        as="pre"
        text={content}
        className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground"
      />
    </div>
  );
}

export function ToolOutput(args: {
  output?: ReactNode;
  outputText?: string;
  errorText?: string;
  className?: string;
  label?: string;
  linkifyOutputText?: boolean;
}) {
  return (
    <div className={cn("rounded-sm border border-border/70 bg-background/40 p-2", args.className)}>
      <p className="mb-1 text-[0.75em] uppercase text-muted-foreground">{args.label ?? "Output"}</p>
      {args.errorText ? (
        <LinkifiedText
          as="p"
          text={args.errorText}
          className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-destructive"
        />
      ) : (
        <div>
          {args.output ?? (
            typeof args.outputText === "string" && args.outputText !== "" ? (
              args.linkifyOutputText === false ? (
                <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[0.875em]">
                  {args.outputText}
                </pre>
              ) : (
                <LinkifiedText
                  as="pre"
                  text={args.outputText}
                  className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[0.875em]"
                />
              )
            ) : (
              <span className="text-muted-foreground">No output.</span>
            )
          )}
        </div>
      )}
    </div>
  );
}

type ToolGroupState = ToolState;

export function ToolGroup(args: {
  states: (ToolGroupState | undefined)[];
  children: ReactNode;
  defaultOpen?: boolean;
  openWhen?: boolean;
}) {
  const { states, children, defaultOpen = false, openWhen = false } = args;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  useEffect(() => {
    if (openWhen) {
      setOpen(true);
    }
  }, [openWhen]);

  const latestState = [...states].reverse().find((state): state is ToolGroupState => state !== undefined);

  const overallState: ToolGroupState = latestState ?? "input-available";

  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        className={cn("flex w-full items-center justify-between px-3 py-2 text-[0.875em] font-semibold", open && "border-b")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="inline-flex items-center gap-1.5">
          <Wrench className="size-3.5" />
          Tools
        </span>
        <span className="inline-flex items-center gap-2">
          <span className={cn("text-[0.75em] font-medium", getToolStatusTextClassName(overallState))}>
            {getToolStatusText(overallState)}
          </span>
          {getStatusBadge(overallState)}
          <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")} />
        </span>
      </button>
      {open && <div className="space-y-1 p-2">{children}</div>}
    </div>
  );
}
