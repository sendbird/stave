import { Button as AdsButton } from "@/components/ads/components/Button";
import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import * as stylex from "@stylexjs/stylex";
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
} from "@/lib/lens/lens-log-format";
import {
  ConsoleInspectableRow,
  DetailLoadState,
  LensDiagnosticsCaptureControls,
  LensLogDetailBlock,
  LensLogEntryDetail,
} from "@/components/panes/surfaces/lens/LensLogDetail";
import type { LensDiagnosticsLog } from "@/components/panes/surfaces/lens/useLensDiagnosticsLog";
import {
  focusRing,
  transition,
  workbenchStyles as w,
} from "./lens-workbench.styles";

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
    <div {...stylex.props(w.surface)}>
      <div {...stylex.props(w.toolbar)}>
        <div {...stylex.props(w.search)}>
          <Search {...stylex.props(w.searchIcon)} />
          <Input
            value={consoleSearch}
            onChange={(event) => setConsoleSearch(event.target.value)}
            placeholder="Search console"
            xstyle={w.searchInput}
          />
        </div>
        <div {...stylex.props(w.filters)}>
          {CONSOLE_LEVEL_FILTERS.map((level) => (
            <Button
              key={level}
              type="button"
              size="xs"
              variant={consoleLevelFilter === level ? "secondary" : "ghost"}
              xstyle={w.toolbarButton}
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
            <Play {...stylex.props(w.icon)} />
          ) : (
            <Pause {...stylex.props(w.icon)} />
          )}
        </Button>
        {consolePaused ? (
          <Badge role="status" tone="warning">
            {consoleBufferedCount > 0
              ? `${consoleBufferedCount} buffered`
              : "Paused"}
          </Badge>
        ) : null}
        <Button
          type="button"
          size="icon-xs"
          variant={autoScrollLogs ? "secondary" : "ghost"}
          onClick={() => setAutoScrollLogs((current) => !current)}
          aria-label="Toggle log autoscroll"
        >
          <ArrowDownToLine {...stylex.props(w.icon)} />
        </Button>
        <AdsButton
          type="button"
          size="xs"
          variant={consoleDetailsOpen ? "secondary" : "quiet"}
          xstyle={w.toolbarButton}
          disabled={!selectedConsoleEntry}
          onClick={() => setConsoleDetailsOpen((current) => !current)}
          aria-label={
            consoleDetailsOpen ? "Hide console details" : "Show console details"
          }
          aria-expanded={consoleDetailsOpen}
          aria-controls="lens-console-entry-detail"
        >
          <PanelRightOpen {...stylex.props(w.icon)} />
          Details
        </AdsButton>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={filteredConsoleEntries.length === 0}
          onClick={copyConsoleLog}
          aria-label="Copy console log"
        >
          <Copy {...stylex.props(w.icon)} />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={consoleEntries.length === 0 && consoleBufferedCount === 0}
          onClick={clearConsoleLog}
          aria-label="Clear console log"
        >
          <Trash2 {...stylex.props(w.icon)} />
        </Button>
      </div>
      <div
        data-testid="lens-console-log-workbench"
        {...stylex.props(w.workbench)}
      >
        <div
          ref={consoleLogRef}
          data-testid="lens-console-entry-list"
          {...stylex.props(w.entryList, w.consoleList)}
        >
          {filteredConsoleEntries.length > 0 ? (
            <div {...stylex.props(w.entryRows)}>
              {filteredConsoleEntries.map((entry, index) => {
                const selected = selectedConsoleEntryId === entry.id;
                return (
                  <AdsButton
                    layout="host"
                    key={entry.id || `${entry.timestamp}-${index}`}
                    type="button"
                    xstyle={[
                      w.entryRow,
                      focusRing.ringInset,
                      transition.control,
                      selected && w.selectedEntryRow,
                    ]}
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
                    <span {...stylex.props(w.time)}>
                      {formatLogTime(entry.timestamp)}
                    </span>
                    <Badge
                      tone={getConsoleLevelTone(entry.level)}
                      variant="outline"
                    >
                      {entry.level}
                    </Badge>
                    <span {...stylex.props(w.entryContent)}>
                      <span {...stylex.props(w.entryText)}>{entry.text}</span>
                      {entry.source ? (
                        <span {...stylex.props(w.entrySource)}>
                          {entry.source}
                          {entry.lineNumber ? `:${entry.lineNumber}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </AdsButton>
                );
              })}
            </div>
          ) : (
            <div {...stylex.props(w.empty)}>No console entries.</div>
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
                    <pre {...stylex.props(w.pre)}>
                      {selectedConsoleEntry.text}
                    </pre>
                  </LensLogDetailBlock>
                ),
              },
              {
                id: "arguments",
                label: "Arguments",
                content: (
                  <div {...stylex.props(w.compactStack)}>
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
                  <div {...stylex.props(w.compactStack)}>
                    {consoleEntryDetail?.stackTrace ? (
                      flattenStackTrace(consoleEntryDetail.stackTrace).map(
                        ({ frame, depth, description }, index) => (
                          <div
                            key={`${frame.scriptId ?? frame.url}-${frame.lineNumber}-${frame.columnNumber}-${index}`}
                            {...stylex.props(w.stackFrame)}
                            style={{ marginLeft: `${depth * 12}px` }}
                          >
                            <div {...stylex.props(w.stackFrameHeader)}>
                              <span {...stylex.props(w.stackFrameName)}>
                                {frame.functionName || "(anonymous)"}
                              </span>
                              {description ? (
                                <span
                                  {...stylex.props(w.stackFrameDescription)}
                                >
                                  {description}
                                </span>
                              ) : null}
                            </div>
                            <div {...stylex.props(w.stackFrameLocation)}>
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
                  <div {...stylex.props(w.detailsGrid)}>
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

function getConsoleLevelTone(
  level: "log" | "debug" | "info" | "warn" | "error",
): BadgeTone {
  switch (level) {
    case "error":
      return "danger";
    case "warn":
      return "warning";
    case "info":
      return "info";
    default:
      return "neutral";
  }
}
