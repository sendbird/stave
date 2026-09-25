import {
  applyWorkspaceTodoStatus,
  createWorkspaceInfoCustomField,
  createWorkspaceTodoItem,
  extractAmplifyLinkReference,
  extractConfluencePageReference,
  extractCraneIssueReference,
  extractFigmaResourceReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  extractStorybookResourceReference,
  resolveStorybookResourceAccess,
  upsertWorkspaceResourceInState,
  type WorkspaceInfoCustomField,
  type WorkspaceInfoFieldType,
  type WorkspaceInformationState,
  type WorkspaceMartinProjectLink,
  type WorkspaceResourceUpsertResult,
  type WorkspaceTodoStatus,
} from "../../src/lib/workspace-information";

export interface WorkspaceInformationMutationResult {
  workspaceId: string;
  workspaceInformation: WorkspaceInformationState;
}

export interface LocalMcpWorkspaceInformationDependencies {
  getWorkspaceInformation: (args: { workspaceId: string }) => Promise<WorkspaceInformationMutationResult>;
  updateWorkspaceInformationState: (args: {
    workspaceId: string;
    updater: (current: WorkspaceInformationState) => WorkspaceInformationState;
  }) => Promise<WorkspaceInformationMutationResult>;
}

type WorkspaceInformationResourceKind =
  | "jira"
  | "crane"
  | "pull_request"
  | "confluence"
  | "figma"
  | "storybook"
  | "slack"
  | "amplify";

type WorkspaceCustomFieldValueInput = string | number | boolean | null;

function normalizeWorkspaceResourceKind(value: string): WorkspaceInformationResourceKind {
  const normalized = value.trim();
  switch (normalized) {
    case "jira":
    case "crane":
    case "pull_request":
    case "confluence":
    case "figma":
    case "storybook":
    case "slack":
    case "amplify":
      return normalized;
    default:
      throw new Error(`Unsupported workspace resource kind: ${value}`);
  }
}

function normalizeWorkspaceFieldType(value: string): WorkspaceInfoFieldType {
  const normalized = value.trim();
  switch (normalized) {
    case "text":
    case "textarea":
    case "number":
    case "boolean":
    case "date":
    case "url":
    case "single_select":
      return normalized;
    default:
      throw new Error(`Unsupported workspace custom field type: ${value}`);
  }
}

function normalizeStringList(value?: string[]) {
  const seen = new Set<string>();
  return (value ?? []).flatMap((entry) => {
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      return [];
    }
    seen.add(trimmed);
    return [trimmed];
  });
}

function coerceWorkspaceCustomFieldValue(args: {
  field: WorkspaceInfoCustomField;
  value: WorkspaceCustomFieldValueInput;
}) {
  const { field, value } = args;
  switch (field.type) {
    case "number":
      if (value === null || value === "") {
        return { ...field, value: null };
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return { ...field, value };
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return { ...field, value: parsed };
        }
      }
      throw new Error(`Invalid numeric value for custom field ${field.id}.`);
    case "boolean":
      if (typeof value === "boolean") {
        return { ...field, value };
      }
      if (typeof value === "string") {
        if (value === "true") {
          return { ...field, value: true };
        }
        if (value === "false") {
          return { ...field, value: false };
        }
      }
      throw new Error(`Invalid boolean value for custom field ${field.id}.`);
    case "text":
    case "textarea":
    case "date":
    case "url":
      return {
        ...field,
        value: value == null ? "" : String(value).trim(),
      };
    case "single_select": {
      const nextValue = value == null ? "" : String(value).trim();
      if (nextValue && !field.options.includes(nextValue)) {
        throw new Error(
          `Value "${nextValue}" is not a valid option for custom field ${field.id}.`,
        );
      }
      return {
        ...field,
        value: nextValue,
      };
    }
    default:
      field satisfies never;
      throw new Error("Unsupported workspace field type.");
  }
}

function normalizeWorkspaceInfoString(value?: string) {
  return value?.trim() || "";
}

export function createLocalMcpWorkspaceInformation({
  getWorkspaceInformation,
  updateWorkspaceInformationState,
}: LocalMcpWorkspaceInformationDependencies) {
  async function setWorkspaceMartinProject(args: {
    workspaceId: string;
    project: WorkspaceMartinProjectLink | null;
  }) {
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => ({ ...current, martinProject: args.project }),
    });
  }

  async function replaceWorkspaceNotes(args: { workspaceId: string; notes: string }) {
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => ({ ...current, notes: args.notes }),
    });
  }

  async function appendWorkspaceNotes(args: { workspaceId: string; text: string }) {
    const text = args.text.trim();
    if (!text) {
      throw new Error("Workspace notes append text is required.");
    }
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => ({
        ...current,
        notes: current.notes.trim() ? `${current.notes.trim()}\n${text}` : text,
      }),
    });
  }

  async function clearWorkspaceNotes(args: { workspaceId: string }) {
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => ({ ...current, notes: "" }),
    });
  }

  async function addWorkspaceTodo(args: { workspaceId: string; text: string }) {
    const text = args.text.trim();
    if (!text) {
      throw new Error("Workspace todo text is required.");
    }
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        const nextTodo = createWorkspaceTodoItem();
        nextTodo.text = text;
        return {
          ...current,
          todos: [...current.todos, nextTodo],
        };
      },
    });
  }

  async function updateWorkspaceTodo(args: {
    workspaceId: string;
    todoId: string;
    text?: string;
    completed?: boolean;
    status?: WorkspaceTodoStatus;
  }) {
    if (
      args.text === undefined &&
      args.completed === undefined &&
      args.status === undefined
    ) {
      throw new Error(
        "Workspace todo update requires text, status, or completed.",
      );
    }
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        let found = false;
        const todos = current.todos.map((todo) => {
          if (todo.id !== args.todoId) {
            return todo;
          }
          found = true;
          const withText =
            args.text !== undefined ? { ...todo, text: args.text.trim() } : todo;
          // `status` is the source of truth; a legacy `completed` flag maps to
          // true -> "completed", false -> "pending".
          const nextStatus: WorkspaceTodoStatus | undefined =
            args.status ??
            (args.completed !== undefined
              ? args.completed
                ? "completed"
                : "pending"
              : undefined);
          return nextStatus !== undefined
            ? applyWorkspaceTodoStatus(withText, nextStatus)
            : withText;
        });
        if (!found) {
          throw new Error(`Workspace todo not found: ${args.todoId}`);
        }
        return {
          ...current,
          todos,
        };
      },
    });
  }

  async function removeWorkspaceTodo(args: { workspaceId: string; todoId: string }) {
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        const todos = current.todos.filter((todo) => todo.id !== args.todoId);
        if (todos.length === current.todos.length) {
          throw new Error(`Workspace todo not found: ${args.todoId}`);
        }
        return { ...current, todos };
      },
    });
  }

  async function addWorkspaceResource(args: {
    workspaceId: string;
    kind: string;
    url: string;
    title?: string;
    issueKey?: string;
    status?: string;
    note?: string;
    nodeId?: string;
    channelName?: string;
    spaceKey?: string;
    storybookAccessKind?: string;
    storybookExternalRepo?: string;
    storybookReadableVia?: string;
    storybookSourceHint?: string;
  }) {
    const requestedKind = normalizeWorkspaceResourceKind(args.kind);
    const url = args.url.trim();
    if (!url) {
      throw new Error("Workspace resource URL is required.");
    }
    // A Crane task URL carries a Jira-shaped issue key, so `kind: "jira"` on one
    // is always a misclassification. Keep the link, file it under Crane.
    const kind =
      requestedKind === "jira" && extractCraneIssueReference(url)
        ? ("crane" as const)
        : requestedKind;
    // Upsert instead of blind append — duplicate registrations of the same
    // canonical entity (e.g. one Jira issue key across URL variants) merge
    // into the existing Information panel entry.
    let upserted: WorkspaceResourceUpsertResult | null = null;
    const result = await updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        upserted = upsertWorkspaceResourceInState({
          current,
          input: {
            kind,
            url,
            title: args.title,
            issueKey: args.issueKey,
            status: args.status,
            note: args.note,
            nodeId: args.nodeId,
            channelName: args.channelName,
            spaceKey: args.spaceKey,
            storybookAccessKind: args.storybookAccessKind,
            storybookExternalRepo: args.storybookExternalRepo,
            storybookReadableVia: args.storybookReadableVia,
            storybookSourceHint: args.storybookSourceHint,
          },
        });
        return upserted.state;
      },
    });
    if (!upserted) {
      throw new Error("Workspace resource upsert did not run.");
    }
    const resolved = upserted as WorkspaceResourceUpsertResult;
    return {
      ...result,
      kind,
      resource: resolved.resource,
      deduplicated: resolved.deduplicated,
      ...(kind === requestedKind ? {} : { reroutedFrom: requestedKind }),
    };
  }

  async function removeWorkspaceResource(args: {
    workspaceId: string;
    kind: string;
    itemId: string;
  }) {
    const kind = normalizeWorkspaceResourceKind(args.kind);
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        switch (kind) {
          case "jira": {
            const jiraIssues = current.jiraIssues.filter((item) => item.id !== args.itemId);
            if (jiraIssues.length === current.jiraIssues.length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, jiraIssues };
          }
          case "crane": {
            const craneIssues = (current.craneIssues ?? []).filter((item) => item.id !== args.itemId);
            if (craneIssues.length === (current.craneIssues ?? []).length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, craneIssues };
          }
          case "pull_request": {
            const linkedPullRequests = current.linkedPullRequests.filter((item) => item.id !== args.itemId);
            if (linkedPullRequests.length === current.linkedPullRequests.length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, linkedPullRequests };
          }
          case "confluence": {
            const confluencePages = current.confluencePages.filter((item) => item.id !== args.itemId);
            if (confluencePages.length === current.confluencePages.length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, confluencePages };
          }
          case "figma": {
            const figmaResources = current.figmaResources.filter((item) => item.id !== args.itemId);
            if (figmaResources.length === current.figmaResources.length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, figmaResources };
          }
          case "storybook": {
            const storybookResources = (current.storybookResources ?? []).filter((item) => item.id !== args.itemId);
            if (storybookResources.length === (current.storybookResources ?? []).length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, storybookResources };
          }
          case "slack": {
            const slackThreads = current.slackThreads.filter((item) => item.id !== args.itemId);
            if (slackThreads.length === current.slackThreads.length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, slackThreads };
          }
          case "amplify": {
            const amplifyLinks = (current.amplifyLinks ?? []).filter((item) => item.id !== args.itemId);
            if (amplifyLinks.length === (current.amplifyLinks ?? []).length) {
              throw new Error(`Workspace resource not found: ${args.itemId}`);
            }
            return { ...current, amplifyLinks };
          }
        }
      },
    });
  }

  async function addWorkspaceCustomField(args: {
    workspaceId: string;
    fieldType: string;
    label: string;
    value?: WorkspaceCustomFieldValueInput;
    options?: string[];
  }) {
    const fieldType = normalizeWorkspaceFieldType(args.fieldType);
    const label = args.label.trim();
    if (!label) {
      throw new Error("Workspace custom field label is required.");
    }
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        let nextField = createWorkspaceInfoCustomField({
          type: fieldType,
          label,
        });
        if (nextField.type === "single_select") {
          const options = normalizeStringList(args.options);
          nextField = {
            ...nextField,
            options,
            value: options.includes(nextField.value)
              ? nextField.value
              : (options[0] ?? ""),
          };
        }
        if (args.value !== undefined) {
          nextField = coerceWorkspaceCustomFieldValue({
            field: nextField,
            value: args.value,
          });
        }
        return {
          ...current,
          customFields: [...current.customFields, nextField],
        };
      },
    });
  }

  async function setWorkspaceCustomField(args: {
    workspaceId: string;
    fieldId: string;
    value?: WorkspaceCustomFieldValueInput;
    label?: string;
    options?: string[];
  }) {
    if (
      args.value === undefined &&
      args.label === undefined &&
      args.options === undefined
    ) {
      throw new Error(
        "Workspace custom field update requires value, label, or options.",
      );
    }
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        let found = false;
        const customFields = current.customFields.map((field) => {
          if (field.id !== args.fieldId) {
            return field;
          }
          found = true;
          let nextField: WorkspaceInfoCustomField = field;
          if (args.label !== undefined) {
            nextField = {
              ...nextField,
              label: args.label.trim(),
            };
          }
          if (nextField.type === "single_select" && args.options !== undefined) {
            const options = normalizeStringList(args.options);
            nextField = {
              ...nextField,
              options,
              value: options.includes(nextField.value)
                ? nextField.value
                : (options[0] ?? ""),
            };
          }
          if (args.value !== undefined) {
            nextField = coerceWorkspaceCustomFieldValue({
              field: nextField,
              value: args.value,
            });
          }
          return nextField;
        });
        if (!found) {
          throw new Error(`Workspace custom field not found: ${args.fieldId}`);
        }
        return {
          ...current,
          customFields,
        };
      },
    });
  }

  async function removeWorkspaceCustomField(args: { workspaceId: string; fieldId: string }) {
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        const customFields = current.customFields.filter((field) => field.id !== args.fieldId);
        if (customFields.length === current.customFields.length) {
          throw new Error(`Workspace custom field not found: ${args.fieldId}`);
        }
        return { ...current, customFields };
      },
    });
  }

  async function addWorkspaceCraneIssue(args: {
    workspaceId: string; url: string; issueKey?: string; title?: string; status?: string; note?: string;
  }) {
    const parsed = extractCraneIssueReference(args.url);
    const result = await addWorkspaceResource({
      workspaceId: args.workspaceId,
      kind: "crane",
      url: normalizeWorkspaceInfoString(args.url),
      issueKey: normalizeWorkspaceInfoString(args.issueKey) || parsed?.issueKey || "",
      title: normalizeWorkspaceInfoString(args.title) || normalizeWorkspaceInfoString(args.issueKey) || parsed?.issueKey || "Crane issue",
      status: normalizeWorkspaceInfoString(args.status),
      note: normalizeWorkspaceInfoString(args.note),
    });
    return {
      workspaceId: result.workspaceId,
      added: result.resource,
      deduplicated: result.deduplicated,
      workspaceInformation: result.workspaceInformation,
    };
  }

  async function addWorkspaceJiraIssue(args: {
    workspaceId: string; url: string; issueKey?: string; title?: string; status?: string; note?: string;
  }) {
    if (extractCraneIssueReference(args.url)) {
      const rerouted = await addWorkspaceCraneIssue(args);
      return { ...rerouted, reroutedTo: "crane" as const };
    }
    const parsed = extractJiraIssueReference(args.url);
    const result = await addWorkspaceResource({
      workspaceId: args.workspaceId,
      kind: "jira",
      url: normalizeWorkspaceInfoString(args.url),
      issueKey: normalizeWorkspaceInfoString(args.issueKey) || parsed?.issueKey || "",
      title: normalizeWorkspaceInfoString(args.title) || normalizeWorkspaceInfoString(args.issueKey) || parsed?.issueKey || "Jira issue",
      status: normalizeWorkspaceInfoString(args.status),
      note: normalizeWorkspaceInfoString(args.note),
    });
    return {
      workspaceId: result.workspaceId,
      added: result.resource,
      deduplicated: result.deduplicated,
      workspaceInformation: result.workspaceInformation,
    };
  }

  async function addWorkspaceConfluencePage(args: {
    workspaceId: string; url: string; title?: string; spaceKey?: string; note?: string;
  }) {
    const parsed = extractConfluencePageReference(args.url);
    const result = await addWorkspaceResource({
      workspaceId: args.workspaceId,
      kind: "confluence",
      url: normalizeWorkspaceInfoString(args.url),
      title: normalizeWorkspaceInfoString(args.title) || parsed?.title || parsed?.spaceKey || "Confluence page",
      spaceKey: normalizeWorkspaceInfoString(args.spaceKey) || parsed?.spaceKey || "",
      note: normalizeWorkspaceInfoString(args.note),
    });
    return {
      workspaceId: result.workspaceId,
      added: result.resource,
      deduplicated: result.deduplicated,
      workspaceInformation: result.workspaceInformation,
    };
  }

  async function addWorkspaceFigmaResource(args: {
    workspaceId: string; url: string; title?: string; nodeId?: string; note?: string;
  }) {
    const parsed = extractFigmaResourceReference(args.url);
    const result = await addWorkspaceResource({
      workspaceId: args.workspaceId,
      kind: "figma",
      url: normalizeWorkspaceInfoString(args.url),
      title: normalizeWorkspaceInfoString(args.title) || parsed?.title || parsed?.fileKey || "Figma resource",
      nodeId: normalizeWorkspaceInfoString(args.nodeId) || parsed?.nodeId || "",
      note: normalizeWorkspaceInfoString(args.note),
    });
    return {
      workspaceId: result.workspaceId,
      added: result.resource,
      deduplicated: result.deduplicated,
      workspaceInformation: result.workspaceInformation,
    };
  }

  async function addWorkspaceStorybookResource(args: {
    workspaceId: string; url: string; title?: string; note?: string; accessKind?: string;
    externalRepo?: string; readableVia?: string; sourceHint?: string;
  }) {
    const parsed = extractStorybookResourceReference(args.url);
    const result = await addWorkspaceResource({
      workspaceId: args.workspaceId,
      kind: "storybook",
      url: normalizeWorkspaceInfoString(args.url),
      title: normalizeWorkspaceInfoString(args.title) || parsed?.title || parsed?.storyPath || "Storybook resource",
      note: normalizeWorkspaceInfoString(args.note),
      storybookAccessKind: args.accessKind,
      storybookExternalRepo: args.externalRepo,
      storybookReadableVia: args.readableVia,
      storybookSourceHint: args.sourceHint,
    });
    return {
      workspaceId: result.workspaceId,
      added: result.resource,
      deduplicated: result.deduplicated,
      workspaceInformation: result.workspaceInformation,
    };
  }

  async function updateWorkspaceStorybookResourceAccess(args: {
    workspaceId: string; resourceId?: string; url?: string; accessKind?: string;
    externalRepo?: string; readableVia?: string; sourceHint?: string;
  }) {
    return updateWorkspaceInformationState({
      workspaceId: args.workspaceId,
      updater: (current) => {
        const resourceId = normalizeWorkspaceInfoString(args.resourceId);
        const url = normalizeWorkspaceInfoString(args.url);
        let found = false;
        const storybookResources = (current.storybookResources ?? []).map(
          (resource) => {
            const matchesResourceId = resourceId && resource.id === resourceId;
            const matchesUrl = url && resource.url === url;
            if (!matchesResourceId && !matchesUrl) {
              return resource;
            }

            found = true;
            return {
              ...resource,
              access: resolveStorybookResourceAccess({
                url: resource.url,
                accessKind: args.accessKind,
                externalRepo: args.externalRepo,
                readableVia: args.readableVia,
                sourceHint: args.sourceHint,
              }),
            };
          },
        );

        if (!found) {
          throw new Error("Workspace Storybook resource not found.");
        }

        return {
          ...current,
          storybookResources,
        };
      },
    });
  }

  async function addWorkspaceSlackThread(args: {
    workspaceId: string; url: string; channelName?: string; note?: string;
  }) {
    const parsed = extractSlackThreadReference(args.url);
    const result = await addWorkspaceResource({
      workspaceId: args.workspaceId,
      kind: "slack",
      url: normalizeWorkspaceInfoString(args.url),
      channelName: normalizeWorkspaceInfoString(args.channelName) || parsed?.channelId || "",
      note: normalizeWorkspaceInfoString(args.note),
    });
    return {
      workspaceId: result.workspaceId,
      added: result.resource,
      deduplicated: result.deduplicated,
      workspaceInformation: result.workspaceInformation,
    };
  }

  async function addWorkspaceAmplifyLink(args: {
    workspaceId: string; url: string; label?: string; note?: string;
  }) {
    const parsed = extractAmplifyLinkReference(args.url);
    const result = await addWorkspaceResource({
      workspaceId: args.workspaceId,
      kind: "amplify",
      url: normalizeWorkspaceInfoString(args.url),
      title: normalizeWorkspaceInfoString(args.label) || parsed?.branch || "",
      note: normalizeWorkspaceInfoString(args.note),
    });
    return {
      workspaceId: result.workspaceId,
      added: result.resource,
      deduplicated: result.deduplicated,
      workspaceInformation: result.workspaceInformation,
    };
  }

  return {
    getWorkspaceInformation,
    setWorkspaceMartinProject,
    replaceWorkspaceNotes,
    appendWorkspaceNotes,
    clearWorkspaceNotes,
    addWorkspaceTodo,
    updateWorkspaceTodo,
    removeWorkspaceTodo,
    addWorkspaceResource,
    removeWorkspaceResource,
    addWorkspaceCustomField,
    setWorkspaceCustomField,
    removeWorkspaceCustomField,
    addWorkspaceCraneIssue,
    addWorkspaceJiraIssue,
    addWorkspaceConfluencePage,
    addWorkspaceFigmaResource,
    addWorkspaceStorybookResource,
    updateWorkspaceStorybookResourceAccess,
    addWorkspaceSlackThread,
    addWorkspaceAmplifyLink,
  };
}
