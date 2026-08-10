import { z } from "zod";

import { CraneConnectorMetadataSchema } from "../crane-connector/types";

const AtelierBaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .url()
  .transform((value) => value.replace(/\/+$/, ""));

export const ATELIER_CONNECTOR_SCOPES = ["crane", "martin"] as const;

export const AtelierConnectorScopeSchema = z.enum(ATELIER_CONNECTOR_SCOPES);

export const AtelierConnectorPairInputSchema = z
  .object({
    baseUrl: AtelierBaseUrlSchema,
    code: z.string().trim().startsWith("stp_").max(128),
    name: z.string().trim().min(1).max(80),
    requestedScopes: z.array(AtelierConnectorScopeSchema).min(1).max(2),
  })
  .strict();

export const AtelierConnectorPairArgsSchema = AtelierConnectorPairInputSchema;

export const AtelierConnectorPublicStatusSchema = z
  .object({
    paired: z.boolean(),
    connector: CraneConnectorMetadataSchema.nullable(),
    scopes: z.array(AtelierConnectorScopeSchema).max(2),
    secureStorageAvailable: z.boolean(),
    lastErrorCode: z.string().trim().min(1).max(64).nullable(),
  })
  .strict();

export type AtelierConnectorScope = z.infer<
  typeof AtelierConnectorScopeSchema
>;
export type AtelierConnectorPairInput = z.infer<
  typeof AtelierConnectorPairInputSchema
>;
export type AtelierConnectorPublicStatus = z.infer<
  typeof AtelierConnectorPublicStatusSchema
>;
