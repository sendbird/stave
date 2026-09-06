import { Button as AdsButton } from "@/components/ads/components/Button";
import { Badge } from "@/components/ads/components/Badge";
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
  formatLensNetworkBytes,
  formatLensNetworkStatus,
} from "@/lib/lens/lens-network";
import {
  flattenStackTrace,
  formatDuration,
  formatLogTime,
  formatNetworkHeaders,
  formatNetworkRowStatus,
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
import {
  focusRing,
  transition,
  workbenchStyles as w,
} from "./lens-workbench.styles";

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
    <div {...stylex.props(w.surface)}>
      <div {...stylex.props(w.toolbar)}>
        <div {...stylex.props(w.search, w.networkSearch)}>
          <Search {...stylex.props(w.searchIcon)} />
          <Input
            value={networkSearch}
            onChange={(event) => setNetworkSearch(event.target.value)}
            placeholder="Search network"
            xstyle={w.searchInput}
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
            <Play {...stylex.props(w.icon)} />
          ) : (
            <Pause {...stylex.props(w.icon)} />
          )}
        </Button>
        {networkPaused ? (
          <Badge role="status" tone="warning">
            {networkBufferedCount > 0
              ? `${networkBufferedCount} buffered`
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
        <Button
          type="button"
          size="xs"
          variant={networkDetailsOpen ? "secondary" : "ghost"}
          xstyle={w.toolbarButton}
          disabled={!selectedNetworkEntry}
          onClick={() => setNetworkDetailsOpen((current) => !current)}
          aria-label={
            networkDetailsOpen ? "Hide network details" : "Show network details"
          }
          aria-expanded={networkDetailsOpen}
          aria-controls="lens-network-entry-detail"
        >
          <PanelRightOpen {...stylex.props(w.icon)} />
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
          <Copy {...stylex.props(w.icon)} />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={networkEntries.length === 0 && networkBufferedCount === 0}
          onClick={clearNetworkLog}
          aria-label="Clear network log"
        >
          <Trash2 {...stylex.props(w.icon)} />
        </Button>
      </div>
      <div
        data-testid="lens-network-log-workbench"
        {...stylex.props(w.workbench)}
      >
        <div
          ref={networkLogRef}
          data-testid="lens-network-entry-list"
          {...stylex.props(w.entryList)}
        >
          {filteredNetworkEntries.length > 0 ? (
            <div {...stylex.props(w.networkTable)}>
              <div {...stylex.props(w.networkHeading)}>
                <span>Time</span>
                <span>Method</span>
                <span>Status</span>
                <span>URL</span>
                <span>Type</span>
                <span>Size</span>
                <span>Time</span>
                <span>Waterfall</span>
              </div>
              <div {...stylex.props(w.entryRows)}>
                {filteredNetworkEntries.map((entry) => {
                  const selected = selectedNetworkEntryId === entry.entryId;
                  return (
                    <AdsButton
                      layout="host"
                      key={entry.entryId}
                      type="button"
                      xstyle={[
                        w.networkRow,
                        focusRing.ringInset,
                        transition.control,
                        selected && w.selectedEntryRow,
                      ]}
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
                      <span {...stylex.props(w.monoMuted)}>
                        {formatLogTime(entry.timestamp)}
                      </span>
                      <span {...stylex.props(w.mono, w.medium)}>
                        {entry.method}
                      </span>
                      <span
                        {...stylex.props(
                          w.mono,
                          w.semibold,
                          getNetworkStatusStyle(entry),
                        )}
                      >
                        {formatNetworkRowStatus(entry)}
                      </span>
                      <span {...stylex.props(w.mono, w.truncation)}>
                        {entry.url}
                      </span>
                      <span {...stylex.props(w.time, w.truncation)}>
                        {entry.resourceType ?? entry.mimeType ?? "-"}
                      </span>
                      <span {...stylex.props(w.monoMuted)}>
                        {formatLensNetworkBytes(entry.responseSize)}
                      </span>
                      <span {...stylex.props(w.monoMuted)}>
                        {formatDuration(entry.durationMs)}
                      </span>
                      <NetworkWaterfallCell
                        entry={entry}
                        maxDurationMs={networkWaterfallMaxMs}
                      />
                    </AdsButton>
                  );
                })}
              </div>
            </div>
          ) : (
            <div {...stylex.props(w.empty)}>No network entries.</div>
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
                      <span {...stylex.props(w.breakWords)}>
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
                      <dl {...stylex.props(w.definitionList)}>
                        <dt {...stylex.props(w.definitionTerm)}>State</dt>
                        <dd>{selectedNetworkEntry.state}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>Protocol</dt>
                        <dd>{networkEntryDetail?.protocol ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>
                          Remote address
                        </dt>
                        <dd>{networkEntryDetail?.remoteAddress ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>Priority</dt>
                        <dd>{networkEntryDetail?.priority ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>Cache</dt>
                        <dd>{selectedNetworkEntry.fromCache ? "Yes" : "No"}</dd>
                      </dl>
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label="Request headers">
                      <pre {...stylex.props(w.pre)}>
                        {formatNetworkHeaders(
                          networkEntryDetail?.requestHeaders ??
                            selectedNetworkEntry.requestHeaders,
                        )}
                      </pre>
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label="Response headers">
                      <pre {...stylex.props(w.pre)}>
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
                  <div {...stylex.props(w.stack)}>
                    {networkEntryDetail?.initiator ? (
                      <>
                        <LensLogDetailBlock label="Initiator">
                          <dl {...stylex.props(w.definitionList)}>
                            <dt {...stylex.props(w.definitionTerm)}>Type</dt>
                            <dd>{networkEntryDetail.initiator.type}</dd>
                            <dt {...stylex.props(w.definitionTerm)}>
                              Location
                            </dt>
                            <dd {...stylex.props(w.breakWords)}>
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
                          <div {...stylex.props(w.compactStack)}>
                            {flattenStackTrace(
                              networkEntryDetail.initiator.stack,
                            ).map(({ frame, depth }, index) => (
                              <div
                                key={`${frame.scriptId ?? frame.url}-${frame.lineNumber}-${frame.columnNumber}-${index}`}
                                {...stylex.props(w.stackFrame)}
                                style={{
                                  marginLeft: `${depth * 12}px`,
                                }}
                              >
                                <div {...stylex.props(w.medium)}>
                                  {frame.functionName || "(anonymous)"}
                                </div>
                                <div {...stylex.props(w.stackFrameLocation)}>
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
                        <ol {...stylex.props(w.list)}>
                          {networkEntryDetail.redirects.map(
                            (redirect, index) => (
                              <li
                                key={`${redirect.url}-${redirect.timestamp}-${index}`}
                                {...stylex.props(w.breakWords)}
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
                  <div {...stylex.props(w.stack)}>
                    <LensLogDetailBlock label="Summary">
                      <dl {...stylex.props(w.definitionList)}>
                        <dt {...stylex.props(w.definitionTerm)}>Started</dt>
                        <dd>{selectedNetworkEntry.startedAt ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>Completed</dt>
                        <dd>
                          {selectedNetworkEntry.completedAt ??
                            selectedNetworkEntry.timestamp}
                        </dd>
                        <dt {...stylex.props(w.definitionTerm)}>Duration</dt>
                        <dd>
                          {formatDuration(selectedNetworkEntry.durationMs)}
                        </dd>
                        <dt {...stylex.props(w.definitionTerm)}>Transferred</dt>
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

function getNetworkStatusStyle(entry: { state: string; status?: number }) {
  if (entry.state === "pending" || !entry.status) return w.statusMuted;
  if (entry.state === "failed" || entry.status >= 500) return w.statusDanger;
  if (entry.status >= 400) return w.statusWarning;
  if (entry.status >= 300) return w.statusInfo;
  return w.statusSuccess;
}
