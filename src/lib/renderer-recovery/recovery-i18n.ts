import { i18n } from "@/i18n/runtime";
import { setRecoveryTranslator } from "./renderer-recovery";

/*
 * Imported by the renderer entry right after the i18n runtime. From here on
 * the recovery screen is translated; if the runtime failed to load, this
 * module never runs and the screen falls back to English.
 */
setRecoveryTranslator((key, locale) => i18n.t(key, { lng: locale ?? undefined }));
