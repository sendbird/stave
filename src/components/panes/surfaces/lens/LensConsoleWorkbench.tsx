import {
  ArrowDownToLine,
  Copy,
  PanelRightOpen,
  Pause,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  CONSOLE_LEVEL_FILTERS,
  flattenStackTrace,
  formatLogTime,
  getConsoleLevelClass,
} from "@/lib/lens/lens-log-format";
import {
  ConsoleInspectableRow,
  DetailLoadState,
  LensDiagnosticsCaptureControls,
  LensLogDetailBlock,
  LensLogEntryDetail,
} from "@/components/panes/surfaces/lens/LensLogDetail";
import type { LensDiagnosticsLog } from "@/components/panes/surfaces/lens/useLensDiagnosticsLog";
import { cn } from "@/lib/utils";

/**
 * Console tab of the lens diagnostics workbench: the filter/pause/capture
 * toolbar, the entry list, and the selected entry's detail inspector.
 */
export function LensConsoleWorkbench(props: {
  diagnostics: LensDiagnosticsLog;
  lensPageActionDisabled: boolean;
}) {
  const { lensPageActionDisabled } = props;
  const {
    autoScrollLogs,
    clearConsoleLog,
    consoleBufferedCount,
    consoleDetailError,
    consoleDetailLoading,
    consoleDetailTab,
    consoleDetailsOpen,
    consoleEntries,
    consoleEntryDetail,
    consoleLevelFilter,
    consoleLogRef,
    consolePaused,
    consoleSearch,
    copyConsoleLog,
    copySelectedConsoleEntry,
    diagnosticsCaptureBusy,
    diagnosticsCaptureState,
    filteredConsoleEntries,
    loadConsoleObjectProperties,
    selectedConsoleEntry,
    selectedConsoleEntryId,
    setAutoScrollLogs,
    setConsoleDetailTab,
    setConsoleDetailsOpen,
    setConsoleLevelFilter,
    setConsoleSearch,
    setDiagnosticsCapture,
    setSelectedConsoleEntryId,
    toggleConsolePaused,
  } = props.diagnostics;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 p-2">
        <div className="relative min-w-36 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={consoleSearch}
            onChange={(event) => setConsoleSearch(event.target.value)}
            placeholder="Search console"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {CONSOLE_LEVEL_FILTERS.map((level) => (
            <Button
              key={level}
              type="button"
              size="xs"
              variant={consoleLevelFilter === level ? "secondary" : "ghost"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setConsoleLevelFilter(level)}
            >
              {level}
            </Button>
          ))}
        </div>
        <LensDiagnosticsCaptureControls
          state={diagnosticsCaptureState}
          busy={diagnosticsCaptureBusy}
          disabled={
            lensPageActionDisabled || !window.api?.lens?.setDiagnosticsCapture
          }
          onChange={(enabled) => void setDiagnosticsCapture(enabled)}
        />
        <Button
          type="button"
          size="icon-xs"
          variant={consolePaused ? "secondary" : "ghost"}
          onClick={toggleConsolePaused}
          aria-label={
            consolePaused ? "Resume console log" : "Pause console log"
          }
        >
          {consolePaused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
        </Button>
        {consolePaused ? (
          <span
            role="status"
            className="whitespace-nowrap text-[11px] font-medium text-warning"
          >
            {consoleBufferedCount > 0
              ? `${consoleBufferedCount} buffered`
              : "Paused"}
          </span>
        ) : null}
        <Button
          type="button"
          size="icon-xs"
          variant={autoScrollLogs ? "secondary" : "ghost"}
          onClick={() => setAutoScrollLogs((current) => !current)}
          aria-label="Toggle log autoscroll"
        >
          <ArrowDownToLine className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="xs"
          variant={consoleDetailsOpen ? "secondary" : "ghost"}
          className="h-7 px-2 text-[11px]"
          disabled={!selectedConsoleEntry}
          onClick={() => setConsoleDetailsOpen((current) => !current)}
          aria-label={
            consoleDetailsOpen ? "Hide console details" : "Show console details"
          }
          aria-expanded={consoleDetailsOpen}
          aria-controls="lens-console-entry-detail"
        >
          <PanelRightOpen className="size-3.5" />
          Details
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={filteredConsoleEntries.length === 0}
          onClick={copyConsoleLog}
          aria-label="Copy console log"
        >
          <Copy className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={consoleEntries.length === 0 && consoleBufferedCount === 0}
          onClick={clearConsoleLog}
          aria-label="Clear console log"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div
        data-testid="lens-console-log-workbench"
        className="flex min-h-0 min-w-0 flex-1 flex-row"
      >
        <div
          ref={consoleLogRef}
          data-testid="lens-console-entry-list"
          className="min-h-0 min-w-0 flex-1 overflow-auto font-mono text-xs"
        >
          {filteredConsoleEntries.length > 0 ? (
            <div className="divide-y divide-border">
              {filteredConsoleEntries.map((entry, index) => {
                const selected = selectedConsoleEntryId === entry.id;
                return (
                  <button
                    key={entry.id || `${entry.timestamp}-${index}`}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[4.5rem_4.25rem_minmax(0,1fr)] gap-2 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      selected && "bg-accent text-accent-foreground",
                    )}
                    aria-pressed={selected}
                    aria-expanded={selected ? consoleDetailsOpen : undefined}
                    aria-controls={
                      selected ? "lens-console-entry-detail" : undefined
                    }
                    onClick={() => {
                      setSelectedConsoleEntryId(entry.id);
                      setConsoleDetailsOpen(true);
                    }}
                  >
                    <span className="text-[11px] text-muted-foreground">
                      {formatLogTime(entry.timestamp)}
                    </span>
                    <span
                      className={cn(
                        "h-5 rounded border px-1.5 text-center text-[10px] uppercase leading-5",
                        getConsoleLevelClass(entry.level),
                      )}
                    >
                      {entry.level}
                    </span>
                    <span className="min-w-0">
                      <span className="block whitespace-pre-wrap break-words text-foreground">
                        {entry.text}
                      </span>
                      {entry.source ? (
                        <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                          {entry.source}
                          {entry.lineNumber ? `:${entry.lineNumber}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
              No console entries.
            </div>
          )}
        </div>
        {selectedConsoleEntry && consoleDetailsOpen ? (
          <LensLogEntryDetail
            ariaLabel="Console entry details"
            testId="lens-console-entry-detail"
            fields={[
              {
                label: "Level",
                value: selectedConsoleEntry.level.toUpperCase(),
              },
              {
                label: "Timestamp",
                value: selectedConsoleEntry.timestamp,
              },
              {
                label: "Source",
                value: selectedConsoleEntry.source ?? "Page",
              },
              {
                label: "Line",
                value:
                  selectedConsoleEntry.lineNumber === undefined
                    ? "-"
                    : String(selectedConsoleEntry.lineNumber),
              },
            ]}
            tabs={[
              {
                id: "message",
                label: "Message",
                content: (
                  <LensLogDetailBlock label="Message">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
                      {selectedConsoleEntry.text}
                    </pre>
                  </LensLogDetailBlock>
                ),
              },
              {
                id: "arguments",
                label: "Arguments",
                content: (
                  <div className="space-y-1.5">
                    {consoleEntryDetail?.arguments.length ? (
                      consoleEntryDetail.arguments.map((argument, index) => (
                        <ConsoleInspectableRow
                          key={`${selectedConsoleEntry.id}-${argument.objectHandle ?? index}`}
                          entryId={selectedConsoleEntry.id}
                          label={`[${index}]`}
                          value={argument}
                          loadProperties={loadConsoleObjectProperties}
                        />
                      ))
                    ) : (
                      <DetailLoadState
                        loading={consoleDetailLoading}
                        error={consoleDetailError}
                        empty="This console entry has no captured arguments."
                      />
                    )}
                  </div>
                ),
              },
              {
                id: "stack",
                label: "Stack",
                content: (
                  <div className="space-y-1.5">
                    {consoleEntryDetail?.stackTrace ? (
                      flattenStackTrace(consoleEntryDetail.stackTrace).map(
                        ({ frame, depth, description }, index) => (
                          <div
                            key={`${frame.scriptId ?? frame.url}-${frame.lineNumber}-${frame.columnNumber}-${index}`}
                            className="rounded-md border border-border/70 bg-background/70 px-2 py-1.5 font-mono text-[11px]"
                            style={{ marginLeft: `${depth * 12}px` }}
                          >
                            <div className="flex min-w-0 items-baseline justify-between gap-3">
                              <span className="truncate font-medium text-foreground">
                                {frame.functionName || "(anonymous)"}
                              </span>
                              {description ? (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {description}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 break-all text-[10px] text-muted-foreground">
                              {frame.url || "(inline)"}
                              {`:${frame.lineNumber}:${frame.columnNumber}`}
                            </div>
                          </div>
                        ),
                      )
                    ) : (
                      <DetailLoadState
                        loading={consoleDetailLoading}
                        error={consoleDetailError}
                        empty="No JavaScript stack was captured for this entry."
                      />
                    )}
                  </div>
                ),
              },
              {
                id: "context",
                label: "Context",
                content: (
                  <div className="grid gap-3">
                    <LensLogDetailBlock label="Execution context">
                      {consoleEntryDetail?.executionContext?.name ??
                        consoleEntryDetail?.executionContext?.origin ??
                        (selectedConsoleEntry.executionContextId
                          ? `Context ${selectedConsoleEntry.executionContextId}`
                          : "Page")}
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label="Location">
                      {selectedConsoleEntry.source ?? "Page"}
                      {selectedConsoleEntry.lineNumber === undefined
                        ? ""
                        : `:${selectedConsoleEntry.lineNumber}`}
                      {selectedConsoleEntry.columnNumber === undefined
                        ? ""
                        : `:${selectedConsoleEntry.columnNumber}`}
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label="Captured">
                      {selectedConsoleEntry.timestamp}
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label="Capture source">
                      {selectedConsoleEntry.captureSource ??
                        "Electron fallback"}
                    </LensLogDetailBlock>
                  </div>
                ),
              },
            ]}
            activeTabId={consoleDetailTab}
            onActiveTabChange={setConsoleDetailTab}
            onCopy={copySelectedConsoleEntry}
            onClose={() => setConsoleDetailsOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
