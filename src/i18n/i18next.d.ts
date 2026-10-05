import "i18next";
import type { sourceResources } from "@/i18n/resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof sourceResources;
    returnNull: false;
  }
}
