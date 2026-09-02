import type { ModelEffort } from "@/lib/providers/model-effort";
import type { ManagedExecutionProviderId } from "@/lib/providers/provider.types";

export const MAX_MACROS = 100;
export const MAX_MACRO_BODY_LENGTH = 20_000;
export const MAX_MACRO_LABEL_LENGTH = 80;
export const MAX_MACRO_SLUG_LENGTH = 48;
export const MAX_MACRO_DESCRIPTION_LENGTH = 160;

export const MACRO_INSERT_MODES = ["replace", "append", "prepend"] as const;

export type MacroInsertMode = (typeof MACRO_INSERT_MODES)[number];

export interface MacroRuntime {
  providerId: ManagedExecutionProviderId;
  model: string;
  /** Absent = the model's default effort. */
  effort?: ModelEffort;
}

export interface Macro {
  id: string;
  label: string;
  slug: string;
  description?: string;
  body: string;
  insertMode: MacroInsertMode;
  runtime?: MacroRuntime;
  createdAt: string;
  updatedAt: string;
}

export interface MacroTokenMatch {
  start: number;
  end: number;
  query: string;
  token: string;
}
