import { Button, Input } from "@/components/ui";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type {
  CodexAppServerSnapshot,
  CodexThreadDetailSnapshot,
  CodexThreadSnapshot,
} from "@/lib/providers/provider.types";
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
  return (
    <>
      {!snapshot ? null : (
        <div className={sx(codexStyles.twoColGridThreads)}>
          <DenseSection
            title="Thread list"
            description="Active and archived Codex threads returned for the current workspace."
          >
            <div className={sx(codexStyles.stack4)}>
              {[
                ["Active", snapshot.threads] as const,
                ["Archived", snapshot.archivedThreads] as const,
              ].map(([label, threads]) => (
                <div key={label} className={sx(codexStyles.stack2)}>
                  <div className={sx(codexStyles.rowCenterBetweenGap2)}>
                    <p className={sx(codexStyles.eyebrow)}>{label}</p>
                    <StatusPill label={`${threads.length}`} />
                  </div>
                  {threads.length === 0 ? (
                    <div className={sx(codexStyles.tileDashed)}>
                      No {label.toLowerCase()} threads.
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
                                <StatusPill label="current" tone="success" />
                              ) : null}
                            </div>
                            <p className={sx(codexStyles.truncateXsMuted)}>
                              {thread.preview || thread.id}
                            </p>
                            <p className={sx(codexStyles.truncateMicroMuted)}>
                              Updated {formatDateTime(thread.updatedAt)}
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
              title="Thread inspector"
              description="Inspect the selected thread and run fork, review, rename, compact, archive, or rollback actions."
            >
              {selectedThreadSummary ? (
                <div className={sx(codexStyles.stack4)}>
                  <div className={sx(codexStyles.stack1)}>
                    <div className={sx(codexStyles.rowWrapCenterGap2)}>
                      <p className={sx(codexStyles.inspectorTitle)}>
                        {selectedThreadSummary.name ?? selectedThreadSummary.id}
                      </p>
                      {selectedThreadSummary.id === currentThreadId ? (
                        <StatusPill label="current session" tone="success" />
                      ) : null}
                      {selectedThreadSummary.archived ? (
                        <StatusPill label="archived" />
                      ) : null}
                    </div>
                    <p className={sx(codexStyles.textSmMuted)}>
                      {selectedThreadSummary.preview ||
                        selectedThreadSummary.id}
                    </p>
                  </div>

                  <div className={sx(codexStyles.smTwoCol)}>
                    <DenseMetric
                      label="Turns"
                      value={String(threadDetailState.value?.turnCount ?? "—")}
                    />
                    <DenseMetric
                      label="Model provider"
                      value={selectedThreadSummary.modelProvider}
                    />
                    <DenseMetric
                      label="CLI version"
                      value={selectedThreadSummary.cliVersion}
                    />
                    <DenseMetric
                      label="Updated"
                      value={formatDateTime(selectedThreadSummary.updatedAt)}
                    />
                  </div>

                  <div className={sx(codexStyles.lgTwoColGap3)}>
                    <div className={sx(codexStyles.stack2)}>
                      <p className={sx(codexStyles.eyebrow)}>Rename</p>
                      <div className={sx(codexStyles.rowCenterGap2)}>
                        <Input
                          value={renameDraft}
                          onChange={(event) =>
                            onRenameDraftChange(event.target.value)
                          }
                          placeholder="Thread name"
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
                          Save
                        </Button>
                      </div>
                    </div>

                    <div className={sx(codexStyles.stack2)}>
                      <p className={sx(codexStyles.eyebrow)}>Quick actions</p>
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
                          Fork
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
                          Compact
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
                          {selectedThreadSummary.archived
                            ? "Restore"
                            : "Archive"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className={sx(codexStyles.maxWSm)}>
                    <div className={sx(codexStyles.rollbackTile)}>
                      <p className={sx(codexStyles.eyebrow)}>Rollback</p>
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
                        Roll back turns
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
                  Select a thread to inspect it here.
                </div>
              )}
            </DenseSection>
          </div>
        </div>
      )}
    </>
  );
}
