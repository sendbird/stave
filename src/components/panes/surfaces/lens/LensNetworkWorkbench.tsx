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
  formatLensNetworkBytes,
  formatLensNetworkStatus,
} from "@/lib/lens/lens-network";
import {
  flattenStackTrace,
  formatDuration,
  formatLogTime,
  formatNetworkHeaders,
  formatNetworkRowStatus,
  getNetworkStatusClass,
} from "@/lib/lens/lens-log-format";
import {
  DetailLoadState,
  LensDiagnosticsCaptureControls,
  LensLogDetailBlock,
  LensLogEntryDetail,
  NetworkBodyView,
  NetworkTimingView,
  NetworkWaterfallCell,
} from "@/components/panes/surfaces/lens/LensLogDetail";
import type { LensDiagnosticsLog } from "@/components/panes/surfaces/lens/useLensDiagnosticsLog";
import { cn } from "@/lib/utils";

/**
 * Network tab of the lens diagnostics workbench: the search/pause/capture
 * toolbar, the request waterfall list, and the selected request's detail
 * inspector.
 */
export function LensNetworkWorkbench(props: {
  diagnostics: LensDiagnosticsLog;
  lensPageActionDisabled: boolean;
}) {
  const { lensPageActionDisabled } = props;
  const {
    autoScrollLogs,
    clearNetworkLog,
    copyNetworkLog,
    copySelectedNetworkEntry,
    diagnosticsCaptureBusy,
    diagnosticsCaptureState,
    filteredNetworkEntries,
    networkBufferedCount,
    networkDetailError,
    networkDetailLoading,
    networkDetailTab,
    networkDetailsOpen,
    networkEntries,
    networkEntryDetail,
    networkLogRef,
    networkPaused,
    networkSearch,
    networkWaterfallMaxMs,
    selectedNetworkEntry,
    selectedNetworkEntryId,
    selectedRequestBodyState,
    selectedResponseBodyState,
    setAutoScrollLogs,
    setDiagnosticsCapture,
    setNetworkDetailTab,
    setNetworkDetailsOpen,
    setNetworkSearch,
    setSelectedNetworkEntryId,
    toggleNetworkPaused,
  } = props.diagnostics;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 p-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={networkSearch}
            onChange={(event) => setNetworkSearch(event.target.value)}
            placeholder="Search network"
            className="h-7 pl-7 text-xs"
          />
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
          variant={networkPaused ? "secondary" : "ghost"}
          onClick={toggleNetworkPaused}
          aria-label={
            networkPaused ? "Resume network log" : "Pause network log"
          }
        >
          {networkPaused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
        </Button>
        {networkPaused ? (
          <span
            role="status"
            className="whitespace-nowrap text-[11px] font-medium text-warning"
          >
            {networkBufferedCount > 0
              ? `${networkBufferedCount} buffered`
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
          variant={networkDetailsOpen ? "secondary" : "ghost"}
          className="h-7 px-2 text-[11px]"
          disabled={!selectedNetworkEntry}
          onClick={() => setNetworkDetailsOpen((current) => !current)}
          aria-label={
            networkDetailsOpen ? "Hide network details" : "Show network details"
          }
          aria-expanded={networkDetailsOpen}
          aria-controls="lens-network-entry-detail"
        >
          <PanelRightOpen className="size-3.5" />
          Details
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={filteredNetworkEntries.length === 0}
          onClick={copyNetworkLog}
          aria-label="Copy network log"
        >
          <Copy className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={networkEntries.length === 0 && networkBufferedCount === 0}
          onClick={clearNetworkLog}
          aria-label="Clear network log"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div
        data-testid="lens-network-log-workbench"
        className="flex min-h-0 min-w-0 flex-1 flex-row"
      >
        <div
          ref={networkLogRef}
          data-testid="lens-network-entry-list"
          className="min-h-0 min-w-0 flex-1 overflow-auto text-xs"
        >
          {filteredNetworkEntries.length > 0 ? (
            <div className="min-w-[700px]">
              <div className="grid grid-cols-[4.5rem_4rem_4.5rem_minmax(8rem,1fr)_5.5rem_4.5rem_4.5rem_5rem] gap-2 border-b border-border px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                <span>Time</span>
                <span>Method</span>
                <span>Status</span>
                <span>URL</span>
                <span>Type</span>
                <span>Size</span>
                <span>Time</span>
                <span>Waterfall</span>
              </div>
              <div className="divide-y divide-border">
                {filteredNetworkEntries.map((entry) => {
                  const selected = selectedNetworkEntryId === entry.entryId;
                  return (
                    <button
                      key={entry.entryId}
                      type="button"
                      className={cn(
                        "grid w-full grid-cols-[4.5rem_4rem_4.5rem_minmax(8rem,1fr)_5.5rem_4.5rem_4.5rem_5rem] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        selected && "bg-accent text-accent-foreground",
                      )}
                      aria-pressed={selected}
                      aria-expanded={selected ? networkDetailsOpen : undefined}
                      aria-controls={
                        selected ? "lens-network-entry-detail" : undefined
                      }
                      onClick={() => {
                        setSelectedNetworkEntryId(entry.entryId);
                        setNetworkDetailsOpen(true);
                      }}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatLogTime(entry.timestamp)}
                      </span>
                      <span className="font-mono text-[11px] font-medium">
                        {entry.method}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[11px] font-semibold",
                          getNetworkStatusClass(entry),
                        )}
                      >
                        {formatNetworkRowStatus(entry)}
                      </span>
                      <span className="truncate font-mono text-[11px]">
                        {entry.url}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {entry.resourceType ?? entry.mimeType ?? "-"}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatLensNetworkBytes(entry.responseSize)}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatDuration(entry.durationMs)}
                      </span>
                      <NetworkWaterfallCell
                        entry={entry}
                        maxDurationMs={networkWaterfallMaxMs}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
              No network entries.
            </div>
          )}
        </div>
        {selectedNetworkEntry && networkDetailsOpen ? (
          <LensLogEntryDetail
            ariaLabel="Network entry details"
            testId="lens-network-entry-detail"
            fields={[
              {
                label: "Method",
                value: selectedNetworkEntry.method,
              },
              {
                label: "Status",
                value: formatLensNetworkStatus(selectedNetworkEntry),
              },
              {
                label: "Duration",
                value: formatDuration(selectedNetworkEntry.durationMs),
              },
              {
                label: "Transferred",
                value: formatLensNetworkBytes(
                  selectedNetworkEntry.responseSize,
                ),
              },
              {
                label: "Request ID",
                value: selectedNetworkEntry.requestId,
              },
            ]}
            tabs={[
              {
                id: "headers",
                label: "Headers",
                content: (
                  <>
                    <LensLogDetailBlock label="Request URL">
                      <span className="break-all">
                        {selectedNetworkEntry.url}
                      </span>
                    </LensLogDetailBlock>
                    {networkDetailLoading && !networkEntryDetail ? (
                      <DetailLoadState loading error={null} empty="" />
                    ) : networkDetailError ? (
                      <DetailLoadState
                        loading={false}
                        error={networkDetailError}
                        empty=""
                      />
                    ) : null}
                    <LensLogDetailBlock label="General">
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                        <dt className="text-muted-foreground">State</dt>
                        <dd>{selectedNetworkEntry.state}</dd>
                        <dt className="text-muted-foreground">Protocol</dt>
                        <dd>{networkEntryDetail?.protocol ?? "-"}</dd>
                        <dt className="text-muted-foreground">
                          Remote address
                        </dt>
                        <dd>{networkEntryDetail?.remoteAddress ?? "-"}</dd>
                        <dt className="text-muted-foreground">Priority</dt>
                        <dd>{networkEntryDetail?.priority ?? "-"}</dd>
                        <dt className="text-muted-foreground">Cache</dt>
                        <dd>{selectedNetworkEntry.fromCache ? "Yes" : "No"}</dd>
                      </dl>
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label="Request headers">
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all">
                        {formatNetworkHeaders(
                          networkEntryDetail?.requestHeaders ??
                            selectedNetworkEntry.requestHeaders,
                        )}
                      </pre>
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label="Response headers">
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all">
                        {formatNetworkHeaders(
                          networkEntryDetail?.responseHeaders ??
                            selectedNetworkEntry.responseHeaders,
                        )}
                      </pre>
                    </LensLogDetailBlock>
                  </>
                ),
              },
              {
                id: "payload",
                label: "Payload",
                content: (
                  <NetworkBodyView
                    label="Request payload"
                    loading={selectedRequestBodyState?.loading ?? false}
                    error={selectedRequestBodyState?.error ?? null}
                    body={selectedRequestBodyState?.body ?? null}
                    metadata={networkEntryDetail?.requestBody}
                    available={Boolean(selectedNetworkEntry.hasRequestBody)}
                  />
                ),
              },
              {
                id: "response",
                label: "Response",
                content: (
                  <NetworkBodyView
                    label="Response"
                    loading={selectedResponseBodyState?.loading ?? false}
                    error={selectedResponseBodyState?.error ?? null}
                    body={selectedResponseBodyState?.body ?? null}
                    metadata={networkEntryDetail?.responseBody}
                    available={Boolean(selectedNetworkEntry.hasResponseBody)}
                  />
                ),
              },
              {
                id: "initiator",
                label: "Initiator",
                content: (
                  <div className="space-y-3">
                    {networkEntryDetail?.initiator ? (
                      <>
                        <LensLogDetailBlock label="Initiator">
                          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                            <dt className="text-muted-foreground">Type</dt>
                            <dd>{networkEntryDetail.initiator.type}</dd>
                            <dt className="text-muted-foreground">Location</dt>
                            <dd className="break-all">
                              {networkEntryDetail.initiator.url ?? "-"}
                              {networkEntryDetail.initiator.lineNumber ===
                              undefined
                                ? ""
                                : `:${networkEntryDetail.initiator.lineNumber}`}
                              {networkEntryDetail.initiator.columnNumber ===
                              undefined
                                ? ""
                                : `:${networkEntryDetail.initiator.columnNumber}`}
                            </dd>
                          </dl>
                        </LensLogDetailBlock>
                        {networkEntryDetail.initiator.stack ? (
                          <div className="space-y-1.5">
                            {flattenStackTrace(
                              networkEntryDetail.initiator.stack,
                            ).map(({ frame, depth }, index) => (
                              <div
                                key={`${frame.scriptId ?? frame.url}-${frame.lineNumber}-${frame.columnNumber}-${index}`}
                                className="rounded-md border border-border/70 bg-background/70 px-2 py-1.5 font-mono text-[11px]"
                                style={{
                                  marginLeft: `${depth * 12}px`,
                                }}
                              >
                                <div className="font-medium text-foreground">
                                  {frame.functionName || "(anonymous)"}
                                </div>
                                <div className="mt-0.5 break-all text-[10px] text-muted-foreground">
                                  {frame.url || "(inline)"}
                                  {`:${frame.lineNumber}:${frame.columnNumber}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <DetailLoadState
                        loading={networkDetailLoading}
                        error={networkDetailError}
                        empty="No initiator information was captured."
                      />
                    )}
                    {networkEntryDetail?.redirects?.length ? (
                      <LensLogDetailBlock label="Redirect chain">
                        <ol className="space-y-1">
                          {networkEntryDetail.redirects.map(
                            (redirect, index) => (
                              <li
                                key={`${redirect.url}-${redirect.timestamp}-${index}`}
                                className="break-all"
                              >
                                {redirect.status} {redirect.url}
                              </li>
                            ),
                          )}
                        </ol>
                      </LensLogDetailBlock>
                    ) : null}
                  </div>
                ),
              },
              {
                id: "timing",
                label: "Timing",
                content: (
                  <div className="space-y-3">
                    <LensLogDetailBlock label="Summary">
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                        <dt className="text-muted-foreground">Started</dt>
                        <dd>{selectedNetworkEntry.startedAt ?? "-"}</dd>
                        <dt className="text-muted-foreground">Completed</dt>
                        <dd>
                          {selectedNetworkEntry.completedAt ??
                            selectedNetworkEntry.timestamp}
                        </dd>
                        <dt className="text-muted-foreground">Duration</dt>
                        <dd>
                          {formatDuration(selectedNetworkEntry.durationMs)}
                        </dd>
                        <dt className="text-muted-foreground">Transferred</dt>
                        <dd>
                          {formatLensNetworkBytes(
                            selectedNetworkEntry.responseSize,
                          )}
                        </dd>
                      </dl>
                    </LensLogDetailBlock>
                    {networkDetailLoading && !networkEntryDetail ? (
                      <DetailLoadState loading error={null} empty="" />
                    ) : networkDetailError ? (
                      <DetailLoadState
                        loading={false}
                        error={networkDetailError}
                        empty=""
                      />
                    ) : (
                      <NetworkTimingView
                        timing={networkEntryDetail?.timing}
                        durationMs={selectedNetworkEntry.durationMs}
                      />
                    )}
                  </div>
                ),
              },
            ]}
            activeTabId={networkDetailTab}
            onActiveTabChange={setNetworkDetailTab}
            onCopy={copySelectedNetworkEntry}
            onClose={() => setNetworkDetailsOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
