import { i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui";
import {
  getWorkspaceDocumentTitle,
  listWorkspaceDocumentPaths,
  readWorkspaceDocument,
} from "@/lib/documents/workspace-documents";
import { buildDocumentReviewCriteria } from "@/lib/reviews/review-task";
import { useAppStore } from "@/store/app.store";
import { ReviewSkillSelector, type ReviewSkillOption } from "./review-skill-selector";

/**
 * Picks one of the workspace's documents and loads it as review criteria, so
 * a review checks the work against an agreed plan or spec. The loaded text
 * stays editable in the criteria field. Renders nothing without documents.
 */
export function ReviewDocumentPicker(args: {
  "aria-labelledby"?: string;
  onLoad: (criteria: string) => void;
}) {
  useTranslation();
  const rootPath = useAppStore(
    (state) => state.workspacePathById[state.activeWorkspaceId] ?? "",
  );
  const [filePaths, setFilePaths] = useState<readonly string[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listWorkspaceDocumentPaths(rootPath).then((paths) => {
      if (!cancelled) {
        setFilePaths(paths);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const options = useMemo<ReviewSkillOption[]>(
    () =>
      filePaths.map((filePath) => ({
        value: filePath,
        label: getWorkspaceDocumentTitle({ filePath }),
        description: filePath,
      })),
    [filePaths],
  );

  if (options.length === 0) {
    return null;
  }

  return (
    <ReviewSkillSelector
      aria-labelledby={args["aria-labelledby"]}
      value={selected}
      options={options}
      copy={{
        trigger: i18n.t("composer:reviewDocumentPicker.trigger"),
        triggerAria: i18n.t("composer:reviewDocumentPicker.triggerAria"),
        search: i18n.t("composer:reviewDocumentPicker.search"),
        searchAria: i18n.t("composer:reviewDocumentPicker.searchAria"),
        empty: i18n.t("composer:reviewDocumentPicker.empty"),
      }}
      onValueChange={(filePath) => {
        void readWorkspaceDocument({ rootPath, filePath }).then((content) => {
          if (content === null) {
            toast.error(i18n.t("composer:reviewDocumentPicker.couldNotRead"));
            return;
          }
          setSelected(filePath);
          args.onLoad(buildDocumentReviewCriteria({ filePath, content }));
        });
      }}
    />
  );
}
