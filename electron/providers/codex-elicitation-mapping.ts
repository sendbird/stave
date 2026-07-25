/**
 * Maps Codex app-server MCP elicitation requests onto Stave's user-input and
 * approval contracts, and coerces the user's answers back into MCP values.
 *
 * Extracted verbatim from `codex-app-server-runtime.ts` to keep that file within
 * the max-lines ratchet; no behavior changed.
 */
import type { UserInputQuestion } from "../../src/types/chat";
import { isRecord, toTrimmedString } from "./codex-app-server-json";

export interface ElicitationFieldDescriptor {
  key: string;
  kind: "text" | "number" | "integer" | "boolean" | "enum" | "multi_enum";
  optionValueByLabel?: Record<string, string>;
}

function parseStringOptions(args: {
  rawOptions: unknown;
  fallbackDescription?: string;
}) {
  if (!Array.isArray(args.rawOptions)) {
    return null;
  }
  const parsed = args.rawOptions.flatMap((option) => {
    if (typeof option === "string" && option.trim()) {
      return [
        {
          label: option.trim(),
          value: option.trim(),
          description: args.fallbackDescription ?? option.trim(),
        },
      ];
    }
    if (
      !isRecord(option) ||
      typeof option.const !== "string" ||
      !option.const.trim()
    ) {
      return [];
    }
    const value = option.const.trim();
    const label =
      typeof option.title === "string" && option.title.trim()
        ? option.title.trim()
        : value;
    return [
      {
        label,
        value,
        description: args.fallbackDescription ?? value,
      },
    ];
  });
  return parsed.length > 0 ? parsed : null;
}

function mapDefaultValueToLabel(args: {
  value: unknown;
  optionValueByLabel: Record<string, string>;
}) {
  if (typeof args.value !== "string") {
    return undefined;
  }
  const matched = Object.entries(args.optionValueByLabel).find(
    ([, optionValue]) => optionValue === args.value,
  );
  return matched?.[0];
}

function buildElicitationQuestionFromProperty(args: {
  formMessage: string;
  key: string;
  property: Record<string, unknown>;
  requiredKeys: Set<string>;
}): { question: UserInputQuestion; field: ElicitationFieldDescriptor } | null {
  const title = toTrimmedString(args.property.title) ?? args.key;
  const description =
    toTrimmedString(args.property.description) ?? `Provide ${title}.`;
  const required = args.requiredKeys.has(args.key);

  if (args.property.type === "boolean") {
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "boolean",
        options: [
          { label: "Yes", description: "true" },
          { label: "No", description: "false" },
        ],
        allowCustom: false,
        required,
        defaultValue:
          typeof args.property.default === "boolean"
            ? args.property.default
              ? "Yes"
              : "No"
            : undefined,
      },
      field: {
        key: args.key,
        kind: "boolean",
        optionValueByLabel: {
          Yes: "true",
          No: "false",
        },
      },
    };
  }

  if (args.property.type === "number" || args.property.type === "integer") {
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: args.property.type,
        options: [],
        allowCustom: true,
        required,
        placeholder: title,
        defaultValue:
          typeof args.property.default === "number"
            ? String(args.property.default)
            : undefined,
      },
      field: {
        key: args.key,
        kind: args.property.type,
      },
    };
  }

  if (args.property.type === "array" && isRecord(args.property.items)) {
    const options = parseStringOptions({
      rawOptions:
        args.property.items.anyOf ??
        args.property.items.oneOf ??
        args.property.items.enum,
      fallbackDescription: description,
    });
    if (!options) {
      return null;
    }
    const optionValueByLabel = Object.fromEntries(
      options.map((option) => [option.label, option.value]),
    );
    const defaultValue = Array.isArray(args.property.default)
      ? args.property.default
          .map(
            (value) =>
              mapDefaultValueToLabel({ value, optionValueByLabel }) ??
              (typeof value === "string" ? value : ""),
          )
          .filter(Boolean)
          .join(", ")
      : undefined;
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "text",
        options: options.map((option) => ({
          label: option.label,
          description: option.description,
        })),
        multiSelect: true,
        allowCustom: false,
        required,
        defaultValue,
      },
      field: {
        key: args.key,
        kind: "multi_enum",
        optionValueByLabel,
      },
    };
  }

  const scalarOptions = parseStringOptions({
    rawOptions:
      args.property.oneOf ?? args.property.anyOf ?? args.property.enum,
    fallbackDescription: description,
  });
  if (scalarOptions) {
    const optionValueByLabel = Object.fromEntries(
      scalarOptions.map((option) => [option.label, option.value]),
    );
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "text",
        options: scalarOptions.map((option) => ({
          label: option.label,
          description: option.description,
        })),
        allowCustom: false,
        required,
        defaultValue: mapDefaultValueToLabel({
          value: args.property.default,
          optionValueByLabel,
        }),
      },
      field: {
        key: args.key,
        kind: "enum",
        optionValueByLabel,
      },
    };
  }

  if (args.property.type === "string" || !("type" in args.property)) {
    return {
      question: {
        key: args.key,
        header: args.formMessage,
        question: description,
        inputType: "text",
        options: [],
        allowCustom: true,
        required,
        placeholder: title,
        defaultValue:
          typeof args.property.default === "string"
            ? args.property.default
            : undefined,
      },
      field: {
        key: args.key,
        kind: "text",
      },
    };
  }

  return null;
}

export function mapCodexElicitationToUserInput(
  params: Record<string, unknown>,
) {
  const mode = params.mode === "url" ? "url" : "form";
  const message =
    toTrimmedString(params.message) ??
    "Additional input is required to continue.";

  if (mode === "url") {
    const linkUrl = toTrimmedString(params.url);
    if (!linkUrl) {
      return null;
    }
    return {
      mode,
      questions: [
        {
          key: "__elicitation_url__",
          header: "MCP URL Elicitation",
          question: message,
          inputType: "url_notice" as const,
          options: [],
          allowCustom: false,
          required: false,
          linkUrl,
        },
      ],
      fields: [] as ElicitationFieldDescriptor[],
    };
  }

  const requestedSchema = isRecord(params.requestedSchema)
    ? params.requestedSchema
    : null;
  const properties =
    requestedSchema && isRecord(requestedSchema.properties)
      ? requestedSchema.properties
      : null;
  if (!properties) {
    return null;
  }
  if (Object.keys(properties).length === 0) {
    const meta = isRecord(params._meta) ? params._meta : null;
    const toolDescription =
      meta && typeof meta.tool_description === "string"
        ? meta.tool_description.trim()
        : "";
    return {
      mode,
      questions: [
        {
          key: "__elicitation_accept__",
          header: message,
          question:
            toolDescription ||
            "Submit to allow this MCP request, or decline to cancel it.",
          inputType: "text" as const,
          options: [],
          allowCustom: false,
          required: false,
        },
      ],
      fields: [] as ElicitationFieldDescriptor[],
    };
  }
  const requiredKeys = new Set(
    Array.isArray(requestedSchema.required)
      ? requestedSchema.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );

  const mapped = Object.entries(properties).flatMap(([key, property]) => {
    if (!isRecord(property)) {
      return [];
    }
    const question = buildElicitationQuestionFromProperty({
      formMessage: message,
      key,
      property,
      requiredKeys,
    });
    return question ? [question] : [];
  });

  if (mapped.length === 0) {
    return null;
  }

  return {
    mode,
    questions: mapped.map((entry) => entry.question),
    fields: mapped.map((entry) => entry.field),
  };
}

function inferCodexMcpToolName(args: {
  message: string;
  meta: Record<string, unknown> | null;
}) {
  const metaToolName =
    toTrimmedString(args.meta?.tool_name) ??
    toTrimmedString(args.meta?.toolName);
  if (metaToolName) {
    return metaToolName;
  }

  const quotedToolName = args.message
    .match(/tool\s+["'“”]([^"'“”]+)["'“”]/i)?.[1]
    ?.trim();
  return quotedToolName && quotedToolName.length > 0
    ? quotedToolName
    : "MCP tool";
}

export function mapCodexElicitationToApproval(params: Record<string, unknown>) {
  if ((params.mode === "url" ? "url" : "form") !== "form") {
    return null;
  }

  const message =
    toTrimmedString(params.message) ??
    "Additional input is required to continue.";
  const meta = isRecord(params._meta) ? params._meta : null;
  const approvalKind = toTrimmedString(meta?.codex_approval_kind);
  if (approvalKind !== "mcp_tool_call") {
    return null;
  }

  const requestedSchema = isRecord(params.requestedSchema)
    ? params.requestedSchema
    : null;
  const properties =
    requestedSchema && isRecord(requestedSchema.properties)
      ? requestedSchema.properties
      : null;
  if (!properties || Object.keys(properties).length !== 0) {
    return null;
  }

  const toolDescription =
    typeof meta?.tool_description === "string"
      ? meta.tool_description.trim()
      : "";

  return {
    toolName: inferCodexMcpToolName({ message, meta }),
    description: toolDescription || message,
  };
}

export function coerceElicitationAnswer(args: {
  rawValue: string;
  field: ElicitationFieldDescriptor;
}) {
  const trimmed = args.rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  if (args.field.kind === "number") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (args.field.kind === "integer") {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  if (args.field.kind === "boolean") {
    const normalized =
      args.field.optionValueByLabel?.[trimmed] ?? trimmed.toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
    return undefined;
  }
  if (args.field.kind === "multi_enum") {
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => args.field.optionValueByLabel?.[part] ?? part);
  }
  if (args.field.kind === "enum") {
    return args.field.optionValueByLabel?.[trimmed] ?? trimmed;
  }
  return trimmed;
}
