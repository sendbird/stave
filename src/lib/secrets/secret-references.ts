import {
  ENV_VAR_NAME_MAX_LENGTH,
  ENV_VAR_NAME_PATTERN,
  MAX_BOUND_SECRETS,
  isReservedEnvVarName,
} from "./secrets";

const SECRET_REFERENCE_PATTERN = /@secret:\{([^{}\r\n]*)\}/g;
const MAX_PARSED_SECRET_REFERENCES = MAX_BOUND_SECRETS * 2;

export type PromptSecretReferenceStatus =
  | "candidate"
  | "invalid"
  | "protected"
  | "limit-exceeded";

export interface PromptSecretReference {
  /** A validated environment-variable key, or an empty string when invalid. */
  key: string;
  status: PromptSecretReferenceStatus;
}

export interface ParsedPromptSecretReferences {
  references: PromptSecretReference[];
  /** Valid, non-reserved keys that the main-process vault may resolve. */
  resolutionKeys: string[];
  /** Extra unique reference tokens omitted from the bounded result. */
  overflowCount: number;
}

function normalizeResolvableLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return MAX_BOUND_SECRETS;
  }
  return Math.max(0, Math.min(MAX_BOUND_SECRETS, Math.floor(value)));
}

/**
 * Parse secret references from the current user input without touching the
 * vault. Reference keys are environment-variable names, not secret values.
 *
 * The result is bounded so a prompt cannot cause unbounded vault lookups or
 * prompt guidance. Invalid and protected keys are retained only as safe
 * statuses; an invalid raw key is never copied into generated prompt text.
 */
export function parsePromptSecretReferences(args: {
  prompt: string;
  maxResolvableReferences?: number;
}): ParsedPromptSecretReferences {
  const references: PromptSecretReference[] = [];
  const resolutionKeys: string[] = [];
  const seenKeys = new Set<string>();
  let invalidReferenceSeen = false;
  let overflowCount = 0;
  const resolvableLimit = normalizeResolvableLimit(
    args.maxResolvableReferences,
  );

  for (const match of args.prompt.matchAll(SECRET_REFERENCE_PATTERN)) {
    const rawKey = match[1] ?? "";
    const key = rawKey.trim();
    const validKey =
      key.length > 0 &&
      key.length <= ENV_VAR_NAME_MAX_LENGTH &&
      ENV_VAR_NAME_PATTERN.test(key);

    if (!validKey) {
      // One generic invalid entry is enough to inform the model without
      // reflecting arbitrary prompt text back into generated instructions.
      if (!invalidReferenceSeen) {
        if (references.length >= MAX_PARSED_SECRET_REFERENCES) {
          overflowCount += 1;
        } else {
          references.push({ key: "", status: "invalid" });
          invalidReferenceSeen = true;
        }
      }
      continue;
    }
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    if (references.length >= MAX_PARSED_SECRET_REFERENCES) {
      overflowCount += 1;
      continue;
    }
    if (isReservedEnvVarName(key)) {
      references.push({ key, status: "protected" });
      continue;
    }
    if (resolutionKeys.length >= resolvableLimit) {
      references.push({ key, status: "limit-exceeded" });
      continue;
    }
    references.push({ key, status: "candidate" });
    resolutionKeys.push(key);
  }

  return { references, resolutionKeys, overflowCount };
}

/**
 * Append value-free runtime guidance to the provider prompt. The model sees
 * only reference/env-var names and availability; plaintext values stay in the
 * provider process environment.
 */
export function appendPromptSecretReferenceContext(args: {
  prompt: string;
  parsed: ParsedPromptSecretReferences;
  availableEnvNames: readonly string[];
  disabledForSecondaryReadOnly?: boolean;
}): string {
  if (
    args.parsed.references.length === 0 &&
    args.parsed.overflowCount === 0
  ) {
    return args.prompt;
  }

  const availableEnvNames = new Set(args.availableEnvNames);
  const lines = args.parsed.references.map((reference) => {
    if (reference.status === "invalid") {
      return "- An invalid @secret reference was ignored. Keys must be POSIX environment-variable names.";
    }
    if (reference.status === "protected") {
      return `- @secret:{${reference.key}} was refused because ${reference.key} is a protected runtime variable.`;
    }
    if (reference.status === "limit-exceeded") {
      return `- @secret:{${reference.key}} was not injected because this turn reached the ${MAX_BOUND_SECRETS}-secret limit.`;
    }
    if (args.disabledForSecondaryReadOnly) {
      return `- @secret:{${reference.key}} is unavailable in a secondary read-only turn.`;
    }
    if (!availableEnvNames.has(reference.key)) {
      return `- @secret:{${reference.key}} is unavailable because Settings > Secrets has no injectable secret using ${reference.key}.`;
    }
    return `- @secret:{${reference.key}} is available to shell commands and supported MCP authentication as $${reference.key}.`;
  });

  if (args.parsed.overflowCount > 0) {
    lines.push(
      `- ${args.parsed.overflowCount} additional secret reference(s) were ignored because the prompt reference list is bounded.`,
    );
  }

  return [
    args.prompt,
    "[Stave Secret References]",
    "Secret values are not included in this prompt. Use available variables without printing or echoing their values. Do not fall back to ambient process variables for unavailable or refused references.",
    ...lines,
  ].join("\n\n");
}
