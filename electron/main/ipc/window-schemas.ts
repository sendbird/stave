import { z } from "zod";
import { APP_LOCALES } from "../../../src/i18n/locale";

export const SetAppLocaleArgsSchema = z
  .object({
    locale: z.enum(APP_LOCALES),
  })
  .strict();
