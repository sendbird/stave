import type { OnElicitation, OnUserDialog } from "@anthropic-ai/claude-agent-sdk";
import type { UserInputQuestion } from "../../src/types/chat";
import {
  markRecommendedUserInputOptions,
  optionLabelHasRecommendedSuffix,
  readQuestionRecommendPointer,
  readRawOptionRecommended,
  recommendedOptionDefaultValue,
} from "../../src/lib/user-input-options";

export function parseClaudeQuestionList(args: {
  input: Record<string, unknown>;
}) {
  const rawQuestions = args.input.questions;
  if (!Array.isArray(rawQuestions)) {
    return [];
  }
  return rawQuestions.flatMap((rawQuestion) => {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      return [];
    }
    const candidate = rawQuestion as Record<string, unknown>;
    const question =
      typeof candidate.question === "string" ? candidate.question : "";
    const header = typeof candidate.header === "string" ? candidate.header : "";
    const options = Array.isArray(candidate.options)
      ? candidate.options.flatMap((rawOption) => {
          // Some AskUserQuestion payloads pass options as bare strings.
          if (typeof rawOption === "string") {
            const value = rawOption.trim();
            return value ? [{ label: value, description: value }] : [];
          }
          if (!rawOption || typeof rawOption !== "object") {
            return [];
          }
          const option = rawOption as Record<string, unknown>;
          // Accept `label` (preferred) or `value` as the option label.
          const label =
            typeof option.label === "string" && option.label.trim()
              ? option.label
              : typeof option.value === "string" && option.value.trim()
                ? option.value
                : "";
          if (!label) {
            return [];
          }
          // `description` is optional — fall back to the label so a question is
          // never silently dropped (and the whole prompt suppressed) just
          // because the model omitted per-option descriptions.
          const description =
            typeof option.description === "string" && option.description.trim()
              ? option.description
              : label;
          return [
            {
              label,
              description,
              ...(readRawOptionRecommended(option) ||
              optionLabelHasRecommendedSuffix(label)
                ? { recommended: true }
                : {}),
            },
          ];
        })
      : [];
    if (!question || !header || options.length === 0) {
      return [];
    }
    const markedOptions = markRecommendedUserInputOptions({
      options,
      recommend: readQuestionRecommendPointer(candidate),
    });
    const multiSelect =
      typeof candidate.multiSelect === "boolean"
        ? candidate.multiSelect
        : undefined;
    const defaultValue = recommendedOptionDefaultValue({
      options: markedOptions,
      multiSelect,
    });
    return [
      {
        question,
        header,
        options: markedOptions,
        ...(multiSelect !== undefined ? { multiSelect } : {}),
        ...(defaultValue ? { defaultValue } : {}),
      },
    ];
  });
}

type ClaudeElicitationFieldDescriptor = {
  key: string;
  kind: "text" | "number" | "integer" | "boolean" | "enum" | "multi_enum";
  optionValueByLabel?: Record<string, string>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseClaudeStringOptions(args: {
  rawOptions: unknown;
  fallbackDescription?: string;
}) {
  if (!Array.isArray(args.rawOptions)) {
    return null;
  }
  const parsed = args.rawOptions.flatMap((option) => {
    if (typeof option === "string" && option.trim()) {
      const value = option.trim();
      return [
        {
          label: value,
          value,
          description: args.fallbackDescription ?? value,
        },
      ];
    }
    if (
      !isPlainRecord(option) ||
      typeof option.const !== "string" ||
      !option.const.trim()
    ) {
      return [];
    }
    const value = option.const.trim();
    return [
      {
        label: toTrimmedString(option.title) ?? value,
        value,
        description: args.fallbackDescription ?? value,
      },
    ];
  });
  return parsed.length > 0 ? parsed : null;
}

function mapDefaultValueToClaudeLabel(args: {
  value: unknown;
  optionValueByLabel: Record<string, string>;
}) {
  if (typeof args.value !== "string") {
    return undefined;
  }
  return Object.entries(args.optionValueByLabel).find(
    ([, optionValue]) => optionValue === args.value,
  )?.[0];
}

function buildClaudeElicitationQuestionFromProperty(args: {
  formMessage: string;
  key: string;
  property: Record<string, unknown>;
  requiredKeys: Set<string>;
}): {
  question: UserInputQuestion;
  field: ClaudeElicitationFieldDescriptor;
} | null {
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
        optionValueByLabel: { Yes: "true", No: "false" },
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
      field: { key: args.key, kind: args.property.type },
    };
  }

  if (args.property.type === "array" && isPlainRecord(args.property.items)) {
    const options = parseClaudeStringOptions({
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
        defaultValue: Array.isArray(args.property.default)
          ? args.property.default
              .map(
                (value) =>
                  mapDefaultValueToClaudeLabel({
                    value,
                    optionValueByLabel,
                  }) ?? (typeof value === "string" ? value : ""),
              )
              .filter(Boolean)
              .join(", ")
          : undefined,
      },
      field: { key: args.key, kind: "multi_enum", optionValueByLabel },
    };
  }

  const scalarOptions = parseClaudeStringOptions({
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
        defaultValue: mapDefaultValueToClaudeLabel({
          value: args.property.default,
          optionValueByLabel,
        }),
      },
      field: { key: args.key, kind: "enum", optionValueByLabel },
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
      field: { key: args.key, kind: "text" },
    };
  }

  return null;
}

/**
 * Permission modes are user-selectable for ordinary chat turns, so only an
 * explicit host-owned unattended automation may auto-accept an elicitation.
 */
export function shouldAutoAcceptClaudeElicitation(args: {
  unattendedAutomation: boolean;
  elicitation: { mode: "url" | "form"; fields: readonly unknown[] };
}): boolean {
  if (!args.unattendedAutomation) {
    return false;
  }
  return (
    args.elicitation.mode === "url" || args.elicitation.fields.length === 0
  );
}

export function mapClaudeElicitationToUserInput(
  request: Parameters<OnElicitation>[0],
): { mode: "url" | "form"; questions: UserInputQuestion[]; fields: ClaudeElicitationFieldDescriptor[] } | null {
  const mode = request.mode === "url" ? "url" : "form";
  const message =
    request.message.trim() || "Additional input is required to continue.";

  if (mode === "url") {
    if (!request.url?.trim()) {
      return null;
    }
    return {
      mode,
      questions: [
        {
          key: "__elicitation_url__",
          header: request.title ?? "Claude MCP Elicitation",
          question: message,
          inputType: "url_notice" as const,
          options: [],
          allowCustom: false,
          required: false,
          linkUrl: request.url,
        },
      ],
      fields: [] as ClaudeElicitationFieldDescriptor[],
    };
  }

  const requestedSchema = isPlainRecord(request.requestedSchema)
    ? request.requestedSchema
    : null;
  const properties =
    requestedSchema && isPlainRecord(requestedSchema.properties)
      ? requestedSchema.properties
      : null;

  if (!properties || Object.keys(properties).length === 0) {
    return {
      mode,
      questions: [
        {
          key: "__elicitation_accept__",
          header: request.title ?? "Claude MCP Elicitation",
          question:
            request.description ??
            request.displayName ??
            "Submit to allow this MCP request, or decline to cancel it.",
          inputType: "text" as const,
          options: [],
          allowCustom: false,
          required: false,
        },
      ],
      fields: [] as ClaudeElicitationFieldDescriptor[],
    };
  }

  const requiredKeys = new Set(
    Array.isArray(requestedSchema?.required)
      ? requestedSchema.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const mapped = Object.entries(properties).flatMap(([key, property]) => {
    if (!isPlainRecord(property)) {
      return [];
    }
    const question = buildClaudeElicitationQuestionFromProperty({
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

export function coerceClaudeElicitationAnswer(args: {
  rawValue: string;
  field: ClaudeElicitationFieldDescriptor;
}) {
  const rawValue = args.rawValue.trim();
  if (args.field.kind === "boolean") {
    const mapped = args.field.optionValueByLabel?.[rawValue] ?? rawValue;
    if (mapped === "true") {
      return true;
    }
    if (mapped === "false") {
      return false;
    }
    return undefined;
  }
  if (args.field.kind === "number" || args.field.kind === "integer") {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return args.field.kind === "integer" ? Math.trunc(parsed) : parsed;
  }
  if (args.field.kind === "enum") {
    return args.field.optionValueByLabel?.[rawValue] ?? rawValue;
  }
  if (args.field.kind === "multi_enum") {
    return rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => args.field.optionValueByLabel?.[entry] ?? entry);
  }
  return rawValue;
}

export function mapClaudeUserDialogToUserInput(request: Parameters<OnUserDialog>[0]) {
  if (request.dialogKind !== "refusal_fallback_prompt") {
    return null;
  }
  const title =
    toTrimmedString(request.payload.title) ?? "Claude Fallback Prompt";
  const message =
    toTrimmedString(request.payload.message) ??
    toTrimmedString(request.payload.description) ??
    "Claude needs a fallback prompt to continue.";
  const defaultValue =
    toTrimmedString(request.payload.prompt) ??
    toTrimmedString(request.payload.defaultPrompt);
  return {
    answerKey: "prompt",
    questions: [
      {
        key: "prompt",
        header: title,
        question: message,
        inputType: "text" as const,
        options: [],
        allowCustom: true,
        required: true,
        placeholder: "Fallback prompt",
        defaultValue: defaultValue ?? undefined,
      },
    ],
  };
}

