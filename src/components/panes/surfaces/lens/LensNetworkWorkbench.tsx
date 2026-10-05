import { i18n, useTranslation } from "@/i18n";
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
  useTranslation();
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
            placeholder={i18n.t("lens:lensNetworkWorkbench.searchNetwork")}
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
            networkPaused ? i18n.t("lens:lensNetworkWorkbench.resumeNetworkLog") : i18n.t("lens:lensNetworkWorkbench.pauseNetworkLog")
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
              ? i18n.t("lens:lensNetworkWorkbench.buffered", { value1: networkBufferedCount })
              : i18n.t("lens:lensNetworkWorkbench.paused")}
          </Badge>
        ) : null}
        <Button
          type="button"
          size="icon-xs"
          variant={autoScrollLogs ? "secondary" : "ghost"}
          onClick={() => setAutoScrollLogs((current) => !current)}
          aria-label={i18n.t("lens:lensNetworkWorkbench.toggleLogAutoscroll")}
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
            networkDetailsOpen ? i18n.t("lens:lensNetworkWorkbench.hideNetworkDetails") : i18n.t("lens:lensNetworkWorkbench.showNetworkDetails")
          }
          aria-expanded={networkDetailsOpen}
          aria-controls="lens-network-entry-detail"
        >
          <PanelRightOpen {...stylex.props(w.icon)} />
          {i18n.t("lens:lensNetworkWorkbench.details")}
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={filteredNetworkEntries.length === 0}
          onClick={copyNetworkLog}
          aria-label={i18n.t("lens:lensNetworkWorkbench.copyNetworkLog")}
        >
          <Copy {...stylex.props(w.icon)} />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={networkEntries.length === 0 && networkBufferedCount === 0}
          onClick={clearNetworkLog}
          aria-label={i18n.t("lens:lensNetworkWorkbench.clearNetworkLog")}
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
                <span>{i18n.t("lens:lensNetworkWorkbench.time")}</span>
                <span>{i18n.t("lens:lensNetworkWorkbench.method")}</span>
                <span>{i18n.t("lens:lensNetworkWorkbench.status")}</span>
                <span>{i18n.t("lens:lensNetworkWorkbench.uRL")}</span>
                <span>{i18n.t("lens:lensNetworkWorkbench.type")}</span>
                <span>{i18n.t("lens:lensNetworkWorkbench.size")}</span>
                <span>{i18n.t("lens:lensNetworkWorkbench.time")}</span>
                <span>{i18n.t("lens:lensNetworkWorkbench.waterfall")}</span>
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
            <div {...stylex.props(w.empty)}>{i18n.t("lens:lensNetworkWorkbench.noNetworkEntries")}</div>
          )}
        </div>
        {selectedNetworkEntry && networkDetailsOpen ? (
          <LensLogEntryDetail
            ariaLabel={i18n.t("lens:lensNetworkWorkbench.networkEntryDetails")}
            testId="lens-network-entry-detail"
            fields={[
              {
                label: i18n.t("lens:lensNetworkWorkbench.method"),
                value: selectedNetworkEntry.method,
              },
              {
                label: i18n.t("lens:lensNetworkWorkbench.status"),
                value: formatLensNetworkStatus(selectedNetworkEntry),
              },
              {
                label: i18n.t("lens:lensNetworkWorkbench.duration"),
                value: formatDuration(selectedNetworkEntry.durationMs),
              },
              {
                label: i18n.t("lens:lensNetworkWorkbench.transferred"),
                value: formatLensNetworkBytes(
                  selectedNetworkEntry.responseSize,
                ),
              },
              {
                label: i18n.t("lens:lensNetworkWorkbench.requestID"),
                value: selectedNetworkEntry.requestId,
              },
            ]}
            tabs={[
              {
                id: "headers",
                label: i18n.t("lens:lensNetworkWorkbench.headers"),
                content: (
                  <>
                    <LensLogDetailBlock label={i18n.t("lens:lensNetworkWorkbench.requestURL")}>
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
                    <LensLogDetailBlock label={i18n.t("lens:lensNetworkWorkbench.general")}>
                      <dl {...stylex.props(w.definitionList)}>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.state")}</dt>
                        <dd>{selectedNetworkEntry.state}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.protocol")}</dt>
                        <dd>{networkEntryDetail?.protocol ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>
                          {i18n.t("lens:lensNetworkWorkbench.remoteAddress")}
                        </dt>
                        <dd>{networkEntryDetail?.remoteAddress ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.priority")}</dt>
                        <dd>{networkEntryDetail?.priority ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.cache")}</dt>
                        <dd>{selectedNetworkEntry.fromCache ? i18n.t("lens:lensNetworkWorkbench.yes") : i18n.t("lens:lensNetworkWorkbench.no")}</dd>
                      </dl>
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label={i18n.t("lens:lensNetworkWorkbench.requestHeaders")}>
                      <pre {...stylex.props(w.pre)}>
                        {formatNetworkHeaders(
                          networkEntryDetail?.requestHeaders ??
                            selectedNetworkEntry.requestHeaders,
                        )}
                      </pre>
                    </LensLogDetailBlock>
                    <LensLogDetailBlock label={i18n.t("lens:lensNetworkWorkbench.responseHeaders")}>
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
                label: i18n.t("lens:lensNetworkWorkbench.payload"),
                content: (
                  <NetworkBodyView
                    label={i18n.t("lens:lensNetworkWorkbench.requestPayload")}
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
                label: i18n.t("lens:lensNetworkWorkbench.response"),
                content: (
                  <NetworkBodyView
                    label={i18n.t("lens:lensNetworkWorkbench.response")}
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
                label: i18n.t("lens:lensNetworkWorkbench.initiator"),
                content: (
                  <div {...stylex.props(w.stack)}>
                    {networkEntryDetail?.initiator ? (
                      <>
                        <LensLogDetailBlock label={i18n.t("lens:lensNetworkWorkbench.initiator")}>
                          <dl {...stylex.props(w.definitionList)}>
                            <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.type")}</dt>
                            <dd>{networkEntryDetail.initiator.type}</dd>
                            <dt {...stylex.props(w.definitionTerm)}>
                              {i18n.t("lens:lensNetworkWorkbench.location")}
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
                                  {frame.functionName || i18n.t("lens:lensNetworkWorkbench.anonymous")}
                                </div>
                                <div {...stylex.props(w.stackFrameLocation)}>
                                  {frame.url || i18n.t("lens:lensNetworkWorkbench.inline")}
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
                        empty={i18n.t("lens:lensNetworkWorkbench.noInitiatorInformationWasCaptured")}
                      />
                    )}
                    {networkEntryDetail?.redirects?.length ? (
                      <LensLogDetailBlock label={i18n.t("lens:lensNetworkWorkbench.redirectChain")}>
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
                label: i18n.t("lens:lensNetworkWorkbench.timing"),
                content: (
                  <div {...stylex.props(w.stack)}>
                    <LensLogDetailBlock label={i18n.t("lens:lensNetworkWorkbench.summary")}>
                      <dl {...stylex.props(w.definitionList)}>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.started")}</dt>
                        <dd>{selectedNetworkEntry.startedAt ?? "-"}</dd>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.completed")}</dt>
                        <dd>
                          {selectedNetworkEntry.completedAt ??
                            selectedNetworkEntry.timestamp}
                        </dd>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.duration")}</dt>
                        <dd>
                          {formatDuration(selectedNetworkEntry.durationMs)}
                        </dd>
                        <dt {...stylex.props(w.definitionTerm)}>{i18n.t("lens:lensNetworkWorkbench.transferred")}</dt>
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
