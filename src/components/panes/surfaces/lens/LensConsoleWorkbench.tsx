import { i18n, useTranslation } from "@/i18n";
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
  useTranslation();
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
            placeholder={i18n.t("lens:lensConsoleWorkbench.searchConsole")}
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
            consolePaused ? i18n.t("lens:lensConsoleWorkbench.resumeConsoleLog") : i18n.t("lens:lensConsoleWorkbench.pauseConsoleLog")
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
              ? i18n.t("lens:lensConsoleWorkbench.buffered", { value1: consoleBufferedCount })
              : i18n.t("lens:lensConsoleWorkbench.paused")}
          </Badge>
        ) : null}
        <Button
          type="button"
          size="icon-xs"
          variant={autoScrollLogs ? "secondary" : "ghost"}
          onClick={() => setAutoScrollLogs((current) => !current)}
          aria-label={i18n.t("lens:lensConsoleWorkbench.toggleLogAutoscroll")}
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
            consoleDetailsOpen ? i18n.t("lens:lensConsoleWorkbench.hideConsoleDetails") : i18n.t("lens:lensConsoleWorkbench.showConsoleDetails")
          }
          aria-expanded={consoleDetailsOpen}
          aria-controls="lens-console-entry-detail"
        >
          <PanelRightOpen {...stylex.props(w.icon)} />
          {i18n.t("lens:lensConsoleWorkbench.details")}
        </AdsButton>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={filteredConsoleEntries.length === 0}
          onClick={copyConsoleLog}
          aria-label={i18n.t("lens:lensConsoleWorkbench.copyConsoleLog")}
        >
          <Copy {...stylex.props(w.icon)} />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={consoleEntries.length === 0 && consoleBufferedCount === 0}
          onClick={clearConsoleLog}
          aria-label={i18n.t("lens:lensConsoleWorkbench.clearConsoleLog")}
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
            <div {...stylex.props(w.empty)}>{i18n.t("lens:lensConsoleWorkbench.noConsoleEntries")}</div>
          )}
        </div>
        {selectedConsoleEntry && consoleDetailsOpen ? (
          <LensLogEntryDetail
            ariaLabel={i18n.t("lens:lensConsoleWorkbench.consoleEntryDetails")}
            testId="lens-console-entry-detail"
            fields={[
              {
                label: i18n.t("lens:lensConsoleWorkbench.level"),
                value: selectedConsoleEntry.level.toUpperCase(),
              },
              {
                label: i18n.t("lens:lensConsoleWorkbench.timestamp"),
                value: selectedConsoleEntry.timestamp,
              },
              {
                label: i18n.t("lens:lensConsoleWorkbench.source"),
                value: selectedConsoleEntry.source ?? i18n.t("lens:lensConsoleWorkbench.page"),
              },
              {
                label: i18n.t("lens:lensConsoleWorkbench.line"),
                value:
                  selectedConsoleEntry.lineNumber === undefined
                    ? "-"
                    : String(selectedConsoleEntry.lineNumber),
              },
            ]}
            tabs={[
              {
                id: "message",
                label: i18n.t("lens:lensConsoleWorkbench.message"),
                content: (
                  <LensLogDetailBlock label={i18n.t("lens:lensConsoleWorkbench.message")}>
                    <pre {...stylex.props(w.pre)}>
                      {selectedConsoleEntry.text}
                    </pre>
                  </LensLogDetailBlock>
                ),
              },
              {
                id: "arguments",
                label: i18n.t("lens:lensConsoleWorkbench.arguments"),
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
                        empty={i18n.t("lens:lensConsoleWorkbench.thisConsoleEntryHasNoCapturedArguments")}
                      />
                    )}
                  </div>
                ),
              },
              {
                id: "stack",
                label: i18n.t("lens:lensConsoleWorkbench.stack"),
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
                                {frame.functionName || i18n.t("lens:lensConsoleWorkbench.anonymous")}
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
                              {frame.url || i18n.t("lens:lensConsoleWorkbench.inline")}
                              {`:${frame.lineNumber}:${frame.columnNumber}`}
                            </div>
                          </div>
                        ),
                      )
                    ) : (
                      <DetailLoadState
                        loading={consoleDetailLoading}
                        error={consoleDetailError}
                        empty={i18n.t("lens:lensConsoleWorkbench.noJavaScriptStackWasCapturedForThis")}
                      />
                    )}
                  </div>
                ),
              },
              {
                id: "context",
                label: i18n.t("lens:lensConsoleWorkbench.context"),
                content: (
                  <div {...stylex.props(w.detailsGrid)}>
                    <LensLogDetailBlock label={i18n.t("lens:lensConsoleWorkbench.executionContext")}>
                      {consoleEntryDetail?.executionContext?.name ??
                        consoleEntryDetail?.executionContext?.origin ??
                        (selectedConsoleEntry.executionContextId
                          ? i18n.t("lens:lensConsoleWorkbench.context2", { value1: selectedConsoleEntry.executionContextId })
                          : i18n.t("lens:lensConsoleWorkbench.page"))}
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label={i18n.t("lens:lensConsoleWorkbench.location")}>
                      {selectedConsoleEntry.source ?? i18n.t("lens:lensConsoleWorkbench.page")}
                      {selectedConsoleEntry.lineNumber === undefined
                        ? ""
                        : `:${selectedConsoleEntry.lineNumber}`}
                      {selectedConsoleEntry.columnNumber === undefined
                        ? ""
                        : `:${selectedConsoleEntry.columnNumber}`}
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label={i18n.t("lens:lensConsoleWorkbench.captured")}>
                      {selectedConsoleEntry.timestamp}
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label={i18n.t("lens:lensConsoleWorkbench.captureSource")}>
                      {selectedConsoleEntry.captureSource ??
                        i18n.t("lens:lensConsoleWorkbench.electronFallback")}
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
