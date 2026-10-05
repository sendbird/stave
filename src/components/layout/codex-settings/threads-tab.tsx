import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Button, Input } from "@/components/ui";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type {
  CodexAppServerSnapshot,
  CodexThreadDetailSnapshot,
  CodexThreadSnapshot,
} from "@/lib/providers/provider.types";
import { formatNumber } from "@/i18n/format";
import { DraftInput } from "../settings-dialog.shared";
import { codexStyles } from "../settings-dialog-codex-section.styles";
import {
  DenseMetric,
  DenseSection,
  ReadOnlyCodeBlock,
  StatusPill,
  formatDateTime,
  type DetailState,
} from "./shared";

type ThreadsTabProps = {
  snapshot: CodexAppServerSnapshot | null;
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
  currentThreadId: string | null;
  selectedThreadSummary: CodexThreadSnapshot | null;
  threadDetailState: DetailState<CodexThreadDetailSnapshot>;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  rollbackTurns: string;
  onRollbackTurnsChange: (value: string) => void;
  busyKey: string | null;
  onRenameThread: () => void;
  onForkThread: () => void;
  onCompactThread: () => void;
  onArchiveThread: (archived: boolean) => void;
  onRollbackThread: () => void;
};

export function ThreadsTab({
  snapshot,
  selectedThreadId,
  onSelectThread,
  currentThreadId,
  selectedThreadSummary,
  threadDetailState,
  renameDraft,
  onRenameDraftChange,
  rollbackTurns,
  onRollbackTurnsChange,
  busyKey,
  onRenameThread,
  onForkThread,
  onCompactThread,
  onArchiveThread,
  onRollbackThread,
}: ThreadsTabProps) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <>
      {!snapshot ? null : (
        <div className={sx(codexStyles.twoColGridThreads)}>
          <DenseSection
            title={t("settingsProviders:codexThreadsTab.list.title")}
            description={t("settingsProviders:codexThreadsTab.list.description")}
          >
            <div className={sx(codexStyles.stack4)}>
              {[
                ["active", snapshot.threads] as const,
                ["archived", snapshot.archivedThreads] as const,
              ].map(([group, threads]) => (
                <div key={group} className={sx(codexStyles.stack2)}>
                  <div className={sx(codexStyles.rowCenterBetweenGap2)}>
                    <p className={sx(codexStyles.eyebrow)}>{t(`settingsProviders:codexThreadsTab.groups.${group}`)}</p>
                    <StatusPill label={formatNumber(threads.length)} />
                  </div>
                  {threads.length === 0 ? (
                    <div className={sx(codexStyles.tileDashed)}>
                      {t(`settingsProviders:codexThreadsTab.empty.${group}`)}
                    </div>
                  ) : (
                    <div className={sx(codexStyles.stack2)}>
                      {threads.map((thread) => (
                        <AdsButton
                          key={thread.id}
                          type="button"
                          layout="host"
                          press="none"
                          onClick={() => onSelectThread(thread.id)}
                          xstyle={[
                            codexStyles.rowButtonThread,
                            selectedThreadId === thread.id
                              ? codexStyles.rowButtonSelected
                              : codexStyles.rowButtonResting,
                          ]}
                        >
                          <div className={sx(codexStyles.minW0Space1)}>
                            <div className={sx(codexStyles.rowWrapCenterGap2)}>
                              <p className={sx(codexStyles.truncateSmMedium)}>
                                {(thread.name ?? thread.preview) || thread.id}
                              </p>
                              {thread.id === currentThreadId ? (
                                <StatusPill label={t("settingsProviders:codexThreadsTab.current")} tone="success" />
                              ) : null}
                            </div>
                            <p className={sx(codexStyles.truncateXsMuted)}>
                              {thread.preview || thread.id}
                            </p>
                            <p className={sx(codexStyles.truncateMicroMuted)}>
                              {t("settingsProviders:codexThreadsTab.updatedAt", { time: formatDateTime(t, thread.updatedAt) })}
                            </p>
                          </div>
                          <div className={sx(codexStyles.threadStatusMeta)}>
                            <span>{thread.modelProvider}</span>
                            <span>{thread.status}</span>
                          </div>
                        </AdsButton>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DenseSection>

          <div className={sx(codexStyles.stack4)}>
            <DenseSection
              title={t("settingsProviders:codexThreadsTab.inspector.title")}
              description={t("settingsProviders:codexThreadsTab.inspector.description")}
            >
              {selectedThreadSummary ? (
                <div className={sx(codexStyles.stack4)}>
                  <div className={sx(codexStyles.stack1)}>
                    <div className={sx(codexStyles.rowWrapCenterGap2)}>
                      <p className={sx(codexStyles.inspectorTitle)}>
                        {selectedThreadSummary.name ?? selectedThreadSummary.id}
                      </p>
                      {selectedThreadSummary.id === currentThreadId ? (
                        <StatusPill label={t("settingsProviders:codexThreadsTab.currentSession")} tone="success" />
                      ) : null}
                      {selectedThreadSummary.archived ? (
                        <StatusPill label={t("settingsProviders:codexThreadsTab.archivedBadge")} />
                      ) : null}
                    </div>
                    <p className={sx(codexStyles.textSmMuted)}>
                      {selectedThreadSummary.preview ||
                        selectedThreadSummary.id}
                    </p>
                  </div>

                  <div className={sx(codexStyles.smTwoCol)}>
                    <DenseMetric
                      label={t("settingsProviders:codexThreadsTab.metrics.turns")}
                      value={threadDetailState.value?.turnCount != null ? formatNumber(threadDetailState.value.turnCount) : "—"}
                    />
                    <DenseMetric
                      label={t("settingsProviders:codexThreadsTab.metrics.modelProvider")}
                      value={selectedThreadSummary.modelProvider}
                    />
                    <DenseMetric
                      label={t("settingsProviders:codexThreadsTab.metrics.cliVersion")}
                      value={selectedThreadSummary.cliVersion}
                    />
                    <DenseMetric
                      label={t("settingsProviders:codexThreadsTab.metrics.updated")}
                      value={formatDateTime(t, selectedThreadSummary.updatedAt)}
                    />
                  </div>

                  <div className={sx(codexStyles.lgTwoColGap3)}>
                    <div className={sx(codexStyles.stack2)}>
                      <p className={sx(codexStyles.eyebrow)}>{t("common:actions.rename")}</p>
                      <div className={sx(codexStyles.rowCenterGap2)}>
                        <Input
                          value={renameDraft}
                          onChange={(event) => onRenameDraftChange(event.target.value)}
                          placeholder={t("settingsProviders:codexThreadsTab.threadNamePlaceholder")}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void onRenameThread();
                          }}
                          disabled={
                            busyKey === `thread-rename:${selectedThreadId}`
                          }
                        >
                          {t("common:actions.save")}
                        </Button>
                      </div>
                    </div>

                    <div className={sx(codexStyles.stack2)}>
                      <p className={sx(codexStyles.eyebrow)}>{t("settingsProviders:codexThreadsTab.quickActions")}</p>
                      <div className={sx(codexStyles.wrapGap2)}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void onForkThread();
                          }}
                          disabled={
                            busyKey === `thread-fork:${selectedThreadId}`
                          }
                        >
                          {t("settingsProviders:codexThreadsTab.fork")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void onCompactThread();
                          }}
                          disabled={
                            busyKey === `thread-compact:${selectedThreadId}`
                          }
                        >
                          {t("settingsProviders:codexThreadsTab.compact")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void onArchiveThread(
                              !selectedThreadSummary.archived,
                            );
                          }}
                          disabled={
                            busyKey === `thread-archive:${selectedThreadId}`
                          }
                        >
                          {t(selectedThreadSummary.archived ? "common:actions.restore" : "settingsProviders:codexThreadsTab.archive")}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className={sx(codexStyles.maxWSm)}>
                    <div className={sx(codexStyles.rollbackTile)}>
                      <p className={sx(codexStyles.eyebrow)}>{t("settingsProviders:codexThreadsTab.rollback")}</p>
                      <DraftInput
                        value={rollbackTurns}
                        onCommit={onRollbackTurnsChange}
                        xstyle={codexStyles.rollbackInput}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void onRollbackThread();
                        }}
                        disabled={
                          busyKey === `thread-rollback:${selectedThreadId}`
                        }
                      >
                        {t("settingsProviders:codexThreadsTab.rollBackTurns")}
                      </Button>
                    </div>
                  </div>

                  {threadDetailState.status === "ready" &&
                  threadDetailState.value ? (
                    <ReadOnlyCodeBlock
                      value={JSON.stringify(
                        threadDetailState.value.raw,
                        null,
                        2,
                      )}
                      minHeight={260}
                    />
                  ) : (
                    <p className={sx(codexStyles.textSmMuted)}>
                      {threadDetailState.detail}
                    </p>
                  )}
                </div>
              ) : (
                <div className={sx(codexStyles.tileDashedCentered)}>
                  {t("settingsProviders:codexThreadsTab.inspector.empty")}
                </div>
              )}
            </DenseSection>
          </div>
        </div>
      )}
    </>
  );
}
