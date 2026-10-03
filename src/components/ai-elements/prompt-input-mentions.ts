import {
  TASK_DRAG_MIME,
  decodeTaskDragPayload,
  filterTaskMentionOptions,
  type TaskMentionOption,
} from "@/lib/task-context/attached-task-context";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";

/**
 * One entry of the `@` palette. Information references insert a token in the
 * prompt; tasks attach as a chip under it.
 */
export type MentionPaletteItem =
  | { kind: "information"; key: string; option: WorkspaceInformationReferenceOption }
  | { kind: "task"; key: string; option: TaskMentionOption };

/**
 * The `@` palette in the order it renders, which is the order the arrow keys
 * walk: Information sections, then tasks, then Information items. Tasks sit
 * above the items so a handful of recent tasks is not buried under a long
 * to-do list.
 */
export function buildMentionPaletteItems(args: {
  query: string;
  informationOptions: readonly WorkspaceInformationReferenceOption[];
  taskOptions: readonly TaskMentionOption[];
}): MentionPaletteItem[] {
  const query = args.query.trim().toLowerCase();
  const information = query
    ? args.informationOptions.filter((option) => option.searchText.includes(query))
    : args.informationOptions;
  const toInformation = (option: WorkspaceInformationReferenceOption): MentionPaletteItem => ({
    kind: "information",
    key: option.reference.token,
    option,
  });
  return [
    ...information.filter((option) => option.kind === "section").map(toInformation),
    ...filterTaskMentionOptions({ options: args.taskOptions, query }).map(
      (option): MentionPaletteItem => ({
        kind: "task",
        key: `@task:${option.taskId}`,
        option,
      }),
    ),
    ...information.filter((option) => option.kind === "item").map(toInformation),
  ];
}

/** The task a drop carries, if it came from a task row. */
export function readDroppedTask(
  dataTransfer: Pick<DataTransfer, "types" | "getData"> | null,
) {
  if (!dataTransfer || !Array.from(dataTransfer.types).includes(TASK_DRAG_MIME)) {
    return null;
  }
  return decodeTaskDragPayload(dataTransfer.getData(TASK_DRAG_MIME));
}
